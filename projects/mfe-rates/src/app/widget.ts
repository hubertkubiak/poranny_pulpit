import { Component, resource } from '@angular/core';
import { toPoints } from './chart';

const API_URL = 'http://localhost:3000/api/rates';

export interface Currency {
  code: string;
  name: string;
  rate: number;
  change: number;
  changePercent: number;
  history: number[];
}

export interface Rates {
  date: string;
  currencies: Currency[];
}

const rateFormat = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const percentFormat = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});
const dateFormat = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });

export function formatRate(rate: number): string {
  return `${rateFormat.format(rate)} zł`;
}

export function formatChange(percent: number): string {
  return `${percentFormat.format(percent)}%`;
}

export function formatQuoteDate(isoDate: string): string {
  return dateFormat.format(new Date(`${isoDate}T12:00:00`));
}

export function trend(change: number): 'up' | 'down' | 'flat' {
  return change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
}

@Component({
  selector: 'app-widget',
  templateUrl: './widget.html',
  styleUrl: './widget.css',
})
export class Widget {
  protected readonly formatRate = formatRate;
  protected readonly formatChange = formatChange;
  protected readonly formatQuoteDate = formatQuoteDate;
  protected readonly trend = trend;

  protected readonly rates = resource({
    loader: async ({ abortSignal }) => {
      const res = await fetch(API_URL, { signal: abortSignal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as Rates;
    },
  });

  protected sparkline(currency: Currency): string {
    return toPoints(currency.history, 72, 28, 3);
  }
}
