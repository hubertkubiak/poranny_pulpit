import { TestBed } from '@angular/core/testing';
import { getPosition, round2, weatherUrl, Weather, Widget } from './widget';

const WEATHER: Weather = {
  place: 'Mokotów',
  defaultLocation: false,
  temperature: 9,
  feelsLike: 7,
  description: 'Lekka mżawka',
  min: 6,
  max: 11,
  hourly: Array.from({ length: 12 }, (_, i) => ({
    time: `${String(8 + i).padStart(2, '0')}:00`,
    temperature: 6 + i / 2,
  })),
};

type GetPosition = Geolocation['getCurrentPosition'];

function mockGeolocation(getCurrentPosition?: GetPosition) {
  vi.stubGlobal('navigator', getCurrentPosition ? { geolocation: { getCurrentPosition } } : {});
}

const grant =
  (lat: number, lon: number): GetPosition =>
  (success) =>
    success({ coords: { latitude: lat, longitude: lon } } as GeolocationPosition);
const deny: GetPosition = (_, error) => error?.({} as GeolocationPositionError);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('round2', () => {
  it('rounds to 2 decimal places before coordinates leave the browser', () => {
    expect(round2(52.229676)).toBe(52.23);
    expect(round2(21.0122287)).toBe(21.01);
  });
});

describe('weatherUrl', () => {
  it('adds coordinates when known', () => {
    expect(weatherUrl({ lat: 50.06, lon: 19.94 })).toBe(
      'http://localhost:3000/api/weather?lat=50.06&lon=19.94',
    );
  });

  it('omits coordinates so the API falls back to Warsaw', () => {
    expect(weatherUrl(null)).toBe('http://localhost:3000/api/weather');
  });
});

describe('getPosition', () => {
  it('resolves with rounded coordinates when permission is granted', async () => {
    mockGeolocation(grant(52.229676, 21.0122287));
    await expect(getPosition()).resolves.toEqual({ lat: 52.23, lon: 21.01 });
  });

  it('asks for a low-accuracy, cached position', async () => {
    const getCurrentPosition = vi.fn(grant(1, 2));
    mockGeolocation(getCurrentPosition);
    await getPosition();
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({
      enableHighAccuracy: false,
      maximumAge: 30 * 60 * 1000,
      timeout: 5000,
    });
  });

  it('resolves with null when permission is denied', async () => {
    mockGeolocation(deny);
    await expect(getPosition()).resolves.toBeNull();
  });

  it('resolves with null when geolocation is not supported', async () => {
    mockGeolocation();
    await expect(getPosition()).resolves.toBeNull();
  });

  it('gives up after the timeout even if the user never answers the prompt', async () => {
    vi.useFakeTimers();
    mockGeolocation(() => {});
    const position = getPosition(5000);
    vi.advanceTimersByTime(5000);
    await expect(position).resolves.toBeNull();
  });
});

describe('Widget', () => {
  async function render(response: Response, geolocation: GetPosition = deny) {
    mockGeolocation(geolocation);
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);
    const fixture = TestBed.createComponent(Widget);
    await fixture.whenStable();
    return { el: fixture.nativeElement as HTMLElement, fetchMock };
  }

  it('renders place, temperature, description and a 12h chart', async () => {
    const { el, fetchMock } = await render(Response.json(WEATHER), grant(52.18, 21.02));

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/api/weather?lat=52.18&lon=21.02');
    expect(el.querySelector('.place')?.textContent).toContain('Mokotów');
    expect(el.querySelector('.temp')?.textContent).toBe('9°');
    expect(el.querySelector('.desc')?.textContent).toBe('Lekka mżawka');
    expect(el.querySelector('.feels')?.textContent).toBe('odczuwalna 7°');
    expect(el.querySelector('polyline')?.getAttribute('points')?.split(' ').length).toBe(12);
    expect(el.querySelector('.attribution')?.textContent).toContain('OpenStreetMap contributors');
  });

  it('marks the default location', async () => {
    const { el } = await render(Response.json({ ...WEATHER, place: 'Warszawa', defaultLocation: true }));
    expect(el.querySelector('.place')?.textContent).toContain('Warszawa');
    expect(el.querySelector('.place small')?.textContent).toBe('lokalizacja domyślna');
  });

  it('says "Twoja okolica" when geocoding failed', async () => {
    const { el } = await render(Response.json({ ...WEATHER, place: null }));
    expect(el.querySelector('.place')?.textContent).toContain('Twoja okolica');
  });

  it('shows an error message when the API fails', async () => {
    const { el } = await render(new Response(null, { status: 502 }));
    expect(el.querySelector('.error')).not.toBeNull();
  });
});
