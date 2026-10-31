import express from 'express';

const PORT = 3000;
const DEFAULT_LOCATION = { lat: 52.23, lon: 21.01, place: 'Warszawa' };
const CURRENCIES = ['EUR', 'USD', 'CHF', 'GBP'];
const WEATHER_CACHE_LIMIT = 100;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// The shell has no remotes hardcoded: it reads this manifest at startup.
// Removing an entry here (and restarting the API) removes a widget without rebuilding the shell.
export const FEDERATION_MANIFEST = {
  'mfe-weather': 'http://localhost:4201/remoteEntry.json',
  'mfe-rates': 'http://localhost:4202/remoteEntry.json',
  'mfe-dog': 'http://localhost:4203/remoteEntry.json',
};

const ALLOWED_ORIGIN = /^http:\/\/localhost:420[0-3]$/;

const USER_AGENT = `poranny-pulpit/1.0 (kontakt: ${process.env.NOMINATIM_CONTACT ?? 'brak'})`;

const DOG_CAPTIONS = [
  'Dzisiejszy patron spokojnych poranków',
  'Oficjalny degustator pierwszej kawy',
  'Dyżurny od dobrego humoru',
  'Główny specjalista ds. drzemek',
  'Kierownik działu merdania',
  'Ambasador niespiesznych spacerów',
  'Strażnik ciepłego koca',
  'Rzecznik prasowy śniadania',
  'Konsultant ds. przytulania',
  'Mistrz porannego przeciągania się',
];

// WMO weather interpretation codes -> Polish description.
const WMO_DESCRIPTIONS = {
  0: 'Bezchmurnie',
  1: 'Przeważnie słonecznie',
  2: 'Częściowe zachmurzenie',
  3: 'Pochmurno',
  45: 'Mgła',
  48: 'Mgła osadzająca szadź',
  51: 'Lekka mżawka',
  53: 'Mżawka',
  55: 'Gęsta mżawka',
  56: 'Marznąca mżawka',
  57: 'Gęsta marznąca mżawka',
  61: 'Słaby deszcz',
  63: 'Deszcz',
  65: 'Ulewny deszcz',
  66: 'Marznący deszcz',
  67: 'Silny marznący deszcz',
  71: 'Słabe opady śniegu',
  73: 'Opady śniegu',
  75: 'Intensywne opady śniegu',
  77: 'Ziarnisty śnieg',
  80: 'Przelotny deszcz',
  81: 'Przelotne opady deszczu',
  82: 'Gwałtowne ulewy',
  85: 'Przelotny śnieg',
  86: 'Intensywny przelotny śnieg',
  95: 'Burza',
  96: 'Burza z gradem',
  99: 'Silna burza z gradem',
};

// ---------- pure helpers ----------

export function roundCoord(value) {
  return Math.round(value * 100) / 100;
}

export function parseCoords(query) {
  const lat = toNumber(query.lat);
  const lon = toNumber(query.lon);
  const valid = lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  if (!valid) return { ...DEFAULT_LOCATION, isDefault: true };
  return { lat: roundCoord(lat), lon: roundCoord(lon), isDefault: false };
}

function toNumber(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function describeWeather(code) {
  return WMO_DESCRIPTIONS[code] ?? 'Brak opisu';
}

export function normalizeWeather(raw) {
  const currentHour = raw.current.time.slice(0, 13); // "2026-10-31T08"
  const start = Math.max(
    0,
    raw.hourly.time.findIndex((time) => time.slice(0, 13) >= currentHour),
  );
  return {
    temperature: Math.round(raw.current.temperature_2m),
    feelsLike: Math.round(raw.current.apparent_temperature),
    description: describeWeather(raw.current.weather_code),
    min: Math.round(raw.daily.temperature_2m_min[0]),
    max: Math.round(raw.daily.temperature_2m_max[0]),
    hourly: raw.hourly.time.slice(start, start + 12).map((time, i) => ({
      time: time.slice(11, 16),
      temperature: raw.hourly.temperature_2m[start + i],
    })),
  };
}

export function pickPlace(raw) {
  const address = raw?.address ?? {};
  return address.city ?? address.town ?? address.village ?? address.municipality ?? null;
}

export function normalizeCurrency(raw) {
  const history = raw.rates.map((rate) => rate.mid);
  const last = raw.rates.at(-1);
  const previous = raw.rates.at(-2) ?? last;
  const change = last.mid - previous.mid;
  return {
    code: raw.code,
    name: raw.currency,
    rate: last.mid,
    date: last.effectiveDate,
    change: Number(change.toFixed(4)),
    changePercent: Number(((change / previous.mid) * 100).toFixed(2)),
    history,
  };
}

export function breedFromUrl(url) {
  const slug = new URL(url).pathname.split('/')[2] ?? '';
  const [main, sub] = slug.split('-');
  const name = capitalize(main ?? '');
  return sub ? `${name} (${sub})` : name;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function endOfDay(now = new Date()) {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime();
}

// ---------- cache ----------

// Tiny in-memory cache: Map of { data, expiresAt }, the oldest entry is evicted past the limit.
// When the upstream API fails, stale data is better than nothing.
export async function cached(store, key, ttl, load, limit = Infinity) {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  try {
    const data = await load();
    store.delete(key);
    store.set(key, { data, expiresAt: typeof ttl === 'function' ? ttl() : Date.now() + ttl });
    if (store.size > limit) store.delete(store.keys().next().value);
    return data;
  } catch (err) {
    if (hit) return hit.data;
    throw err;
  }
}

// Nominatim policy: max 1 request per second. Every call waits for the previous one + 1 s.
let nominatimQueue = Promise.resolve();
export function throttle(task, gapMs = 1000) {
  const run = nominatimQueue.then(task);
  nominatimQueue = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, gapMs)));
  return run;
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`${response.status} ${url.split('?')[0]}`);
  return response.json();
}

// ---------- data sources ----------

const weatherCache = new Map();
const placeCache = new Map();
const ratesCache = new Map();
const dogCache = new Map();

function loadWeather({ lat, lon }) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,apparent_temperature,weather_code' +
    '&hourly=temperature_2m&daily=temperature_2m_min,temperature_2m_max' +
    '&forecast_days=2&timezone=auto';
  return cached(weatherCache, `${lat},${lon}`, 15 * MINUTE, async () =>
    normalizeWeather(await fetchJson(url)), WEATHER_CACHE_LIMIT);
}

function loadPlace({ lat, lon, isDefault }) {
  if (isDefault) return Promise.resolve(DEFAULT_LOCATION.place);
  const url =
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}` +
    '&format=jsonv2&zoom=10&accept-language=pl';
  return cached(placeCache, `${lat},${lon}`, 7 * DAY, async () =>
    pickPlace(await throttle(() => fetchJson(url, { 'User-Agent': USER_AGENT }))), WEATHER_CACHE_LIMIT);
}

function loadRates() {
  return cached(ratesCache, 'rates', () => endOfDay(), async () => {
    const currencies = await Promise.all(
      CURRENCIES.map(async (code) =>
        normalizeCurrency(
          await fetchJson(`https://api.nbp.pl/api/exchangerates/rates/a/${code}/last/10/?format=json`),
        ),
      ),
    );
    return { date: currencies[0].date, currencies };
  });
}

function loadDog() {
  return cached(dogCache, 'dog', () => endOfDay(), async () => {
    const raw = await fetchJson('https://dog.ceo/api/breeds/image/random');
    return {
      imageUrl: raw.message,
      breed: breedFromUrl(raw.message),
      caption: DOG_CAPTIONS[Math.floor(Math.random() * DOG_CAPTIONS.length)],
    };
  });
}

// ---------- HTTP ----------

export const app = express();

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGIN.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  next();
});

app.get('/api/federation-manifest', (req, res) => {
  res.json(FEDERATION_MANIFEST);
});

app.get('/api/weather', async (req, res) => {
  const coords = parseCoords(req.query);
  const [weather, place] = await Promise.allSettled([loadWeather(coords), loadPlace(coords)]);
  if (weather.status === 'rejected') {
    // fetchJson strips the query string from errors, so coordinates never reach the logs.
    console.error('weather:', weather.reason.message);
    return res.status(502).json({ error: 'Nie udało się pobrać pogody' });
  }
  res.json({
    place: place.status === 'fulfilled' ? place.value : null,
    defaultLocation: coords.isDefault,
    ...weather.value,
  });
});

app.get('/api/rates', async (req, res) => {
  try {
    res.json(await loadRates());
  } catch (err) {
    console.error('rates:', err.message);
    res.status(502).json({ error: 'Nie udało się pobrać kursów walut' });
  }
});

app.get('/api/dog', async (req, res) => {
  try {
    res.json(await loadDog());
  } catch (err) {
    console.error('dog:', err.message);
    res.status(502).json({ error: 'Nie udało się pobrać psa dnia' });
  }
});

if (import.meta.main) {
  if (!process.env.NOMINATIM_CONTACT) {
    console.warn('Brak NOMINATIM_CONTACT w api/.env, Nominatim może odrzucać zapytania (403).');
  }
  app.listen(PORT, () => console.log(`API: http://localhost:${PORT}`));
}
