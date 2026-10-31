import { test, describe, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  app,
  breedFromUrl,
  cached,
  describeWeather,
  endOfDay,
  FEDERATION_MANIFEST,
  normalizeCurrency,
  normalizeWeather,
  parseCoords,
  pickPlace,
  roundCoord,
  throttle,
} from './server.js';

describe('parseCoords', () => {
  test('rounds valid coordinates to 2 decimals', () => {
    assert.deepEqual(parseCoords({ lat: '50.06143', lon: '19.93658' }), {
      lat: 50.06,
      lon: 19.94,
      isDefault: false,
    });
  });

  test('falls back to Warsaw when coordinates are missing', () => {
    assert.deepEqual(parseCoords({}), { lat: 52.23, lon: 21.01, place: 'Warszawa', isDefault: true });
  });

  test('falls back to Warsaw for invalid or out-of-range values', () => {
    for (const query of [
      { lat: 'abc', lon: '21' },
      { lat: '', lon: '' },
      { lat: '91', lon: '21' },
      { lat: '52', lon: '181' },
      { lat: '52' },
    ]) {
      assert.equal(parseCoords(query).isDefault, true, JSON.stringify(query));
    }
  });
});

test('roundCoord keeps ~1 km precision', () => {
  assert.equal(roundCoord(52.229676), 52.23);
  assert.equal(roundCoord(-0.005), -0);
});

test('describeWeather maps WMO codes to Polish', () => {
  assert.equal(describeWeather(0), 'Bezchmurnie');
  assert.equal(describeWeather(95), 'Burza');
  assert.equal(describeWeather(1234), 'Brak opisu');
});

describe('normalizeWeather', () => {
  const hours = Array.from({ length: 48 }, (_, i) => {
    const day = i < 24 ? '31' : '01';
    const month = i < 24 ? '10' : '11';
    return `2026-${month}-${day}T${String(i % 24).padStart(2, '0')}:00`;
  });
  const raw = {
    current: { time: '2026-10-31T08:45', temperature_2m: 7.6, apparent_temperature: 4.4, weather_code: 3 },
    hourly: { time: hours, temperature_2m: hours.map((_, i) => i) },
    daily: { temperature_2m_min: [3.4, 1], temperature_2m_max: [11.5, 9] },
  };

  test('rounds headline numbers and translates the description', () => {
    const weather = normalizeWeather(raw);
    assert.equal(weather.temperature, 8);
    assert.equal(weather.feelsLike, 4);
    assert.equal(weather.description, 'Pochmurno');
    assert.equal(weather.min, 3);
    assert.equal(weather.max, 12);
  });

  test('returns 12 hours starting from the current hour', () => {
    const { hourly } = normalizeWeather(raw);
    assert.equal(hourly.length, 12);
    assert.deepEqual(hourly[0], { time: '08:00', temperature: 8 });
    assert.deepEqual(hourly[11], { time: '19:00', temperature: 19 });
  });
});

test('pickPlace takes the first available address field', () => {
  assert.equal(pickPlace({ address: { city: 'Kraków', village: 'X' } }), 'Kraków');
  assert.equal(pickPlace({ address: { town: 'Wieliczka' } }), 'Wieliczka');
  assert.equal(pickPlace({ address: { village: 'Zakrzów' } }), 'Zakrzów');
  assert.equal(pickPlace({ address: { municipality: 'Gmina Kłaj' } }), 'Gmina Kłaj');
  assert.equal(pickPlace({ address: {} }), null);
  assert.equal(pickPlace(null), null);
});

test('normalizeCurrency computes change vs previous quote', () => {
  const result = normalizeCurrency({
    code: 'EUR',
    currency: 'euro',
    rates: [
      { effectiveDate: '2026-10-29', mid: 4.25 },
      { effectiveDate: '2026-10-30', mid: 4.3 },
    ],
  });
  assert.equal(result.rate, 4.3);
  assert.equal(result.date, '2026-10-30');
  assert.equal(result.change, 0.05);
  assert.equal(result.changePercent, 1.18);
  assert.deepEqual(result.history, [4.25, 4.3]);
});

test('breedFromUrl formats breed and sub-breed', () => {
  assert.equal(breedFromUrl('https://images.dog.ceo/breeds/hound-afghan/n02088094_1003.jpg'), 'Hound (afghan)');
  assert.equal(breedFromUrl('https://images.dog.ceo/breeds/pug/n02110958_1975.jpg'), 'Pug');
});

test('endOfDay returns the next local midnight', () => {
  const midnight = new Date(endOfDay(new Date(2026, 9, 31, 8, 30)));
  assert.deepEqual(
    [midnight.getFullYear(), midnight.getMonth(), midnight.getDate(), midnight.getHours()],
    [2026, 10, 1, 0],
  );
});

describe('cached', () => {
  afterEach(() => mock.timers.reset());

  test('returns fresh data from cache without calling the loader', async () => {
    const store = new Map();
    const load = mock.fn(async () => 'data');
    await cached(store, 'k', 60_000, load);
    assert.equal(await cached(store, 'k', 60_000, load), 'data');
    assert.equal(load.mock.callCount(), 1);
  });

  test('serves stale data when the loader fails after expiry', async () => {
    mock.timers.enable({ apis: ['Date'], now: 0 });
    const store = new Map();
    await cached(store, 'k', 1000, async () => 'old');
    mock.timers.tick(2000);
    assert.equal(await cached(store, 'k', 1000, async () => { throw new Error('down'); }), 'old');
  });

  test('rethrows when there is nothing in cache', async () => {
    await assert.rejects(cached(new Map(), 'k', 1000, async () => { throw new Error('down'); }), /down/);
  });

  test('evicts the oldest entry past the limit', async () => {
    const store = new Map();
    for (const key of ['a', 'b', 'c']) await cached(store, key, 60_000, async () => key, 2);
    assert.deepEqual([...store.keys()], ['b', 'c']);
  });
});

test('throttle spaces out consecutive calls', async () => {
  const starts = [];
  await Promise.all([1, 2].map(() => throttle(async () => starts.push(Date.now()), 50)));
  assert.ok(starts[1] - starts[0] >= 45, `gap was ${starts[1] - starts[0]} ms`);
});

describe('HTTP', () => {
  let server;
  let base;

  test('setup', async () => {
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://localhost:${server.address().port}`;
  });

  test('GET /api/federation-manifest returns the manifest', async () => {
    const res = await fetch(`${base}/api/federation-manifest`);
    assert.deepEqual(await res.json(), FEDERATION_MANIFEST);
  });

  test('CORS allows only localhost:4200-4203', async () => {
    const allowed = await fetch(`${base}/api/federation-manifest`, { headers: { Origin: 'http://localhost:4202' } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:4202');
    const denied = await fetch(`${base}/api/federation-manifest`, { headers: { Origin: 'http://evil.test' } });
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
  });

  test('GET /api/dog returns 502 when Dog CEO is down and there is no cache', async () => {
    const realFetch = globalThis.fetch;
    mock.method(globalThis, 'fetch', (url, init) =>
      String(url).includes('dog.ceo') ? Promise.reject(new Error('offline')) : realFetch(url, init));
    const res = await fetch(`${base}/api/dog`);
    assert.equal(res.status, 502);
    mock.restoreAll();
  });

  test('GET /api/dog returns breed parsed from the image URL', async () => {
    const realFetch = globalThis.fetch;
    mock.method(globalThis, 'fetch', (url, init) =>
      String(url).includes('dog.ceo')
        ? Promise.resolve(Response.json({ message: 'https://images.dog.ceo/breeds/hound-afghan/a.jpg' }))
        : realFetch(url, init));
    const body = await (await fetch(`${base}/api/dog`)).json();
    assert.equal(body.breed, 'Hound (afghan)');
    assert.equal(typeof body.caption, 'string');
    mock.restoreAll();
  });

  test('teardown', () => server.close());
});
