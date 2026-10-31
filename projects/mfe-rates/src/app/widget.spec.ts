import { TestBed } from '@angular/core/testing';
import { formatChange, formatQuoteDate, formatRate, Rates, trend, Widget } from './widget';

const RATES: Rates = {
  date: '2026-10-30',
  currencies: [
    { code: 'EUR', name: 'euro', rate: 4.3955, change: 0.0004, changePercent: 0.01, history: [4.37, 4.39, 4.3955] },
    { code: 'USD', name: 'dolar amerykański', rate: 3.9251, change: -0.0222, changePercent: -0.56, history: [3.9, 3.95, 3.9251] },
    { code: 'CHF', name: 'frank szwajcarski', rate: 4.7795, change: 0, changePercent: 0, history: [4.7795, 4.7795] },
    { code: 'GBP', name: 'funt szterling', rate: 5.2701, change: 0.0158, changePercent: 0.3, history: [5.2, 5.27] },
  ],
};

// Intl in pl-PL uses non-breaking spaces; normalise them for readable assertions.
const plain = (text: string | null | undefined) => text?.replace(/\s/g, ' ').trim();

describe('formatting', () => {
  it('formats rates with 4 decimals and a Polish comma', () => {
    expect(plain(formatRate(4.3955))).toBe('4,3955 zł');
  });

  it('formats change with an explicit sign', () => {
    expect(plain(formatChange(0.3))).toBe('+0,30%');
    expect(plain(formatChange(-0.56))).toBe('-0,56%');
    expect(plain(formatChange(0))).toBe('0,00%');
  });

  it('formats the quote date in Polish', () => {
    expect(plain(formatQuoteDate('2026-10-30'))).toBe('30 października 2026');
  });

  it('classifies the trend', () => {
    expect(trend(0.01)).toBe('up');
    expect(trend(-0.01)).toBe('down');
    expect(trend(0)).toBe('flat');
  });
});

describe('Widget', () => {
  async function render(response: Response) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const fixture = TestBed.createComponent(Widget);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('renders a row with code, rate and sparkline for each currency', async () => {
    const rows = (await render(Response.json(RATES))).querySelectorAll('li');

    expect(rows.length).toBe(4);
    expect(rows[0].querySelector('.code')?.textContent).toBe('EUR');
    expect(plain(rows[0].querySelector('.rate')?.textContent)).toBe('4,3955 zł');
    expect(rows[0].querySelector('polyline')?.getAttribute('points')?.split(' ').length).toBe(3);
  });

  it('colours rows by trend', async () => {
    const rows = (await render(Response.json(RATES))).querySelectorAll('li');
    expect([...rows].map((row) => row.className)).toEqual(['up', 'down', 'flat', 'up']);
  });

  it('shows the quote date and source', async () => {
    const el = await render(Response.json(RATES));
    expect(plain(el.querySelector('.meta')?.textContent)).toBe(
      'Notowanie z 30 października 2026 · Źródło: NBP',
    );
  });

  it('shows an error message when the API fails', async () => {
    const el = await render(new Response(null, { status: 502 }));
    expect(el.querySelector('.error')).not.toBeNull();
  });
});
