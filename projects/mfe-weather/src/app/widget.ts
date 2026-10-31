import { Component, resource } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { toPoints } from './chart';

const API_URL = 'http://localhost:3000/api/weather';
const GEO_TIMEOUT_MS = 5000;

export interface Weather {
  place: string | null;
  defaultLocation: boolean;
  temperature: number;
  feelsLike: number;
  description: string;
  min: number;
  max: number;
  hourly: { time: string; temperature: number }[];
}

type Coords = { lat: number; lon: number };

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Resolves with rounded coordinates, or null on denial / timeout / no support.
// The own timer also covers the time the user spends looking at the permission prompt,
// which the Geolocation API's `timeout` option does not count.
export function getPosition(timeoutMs = GEO_TIMEOUT_MS): Promise<Coords | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    const done = (coords: Coords | null) => {
      clearTimeout(timer);
      resolve(coords);
    };
    navigator.geolocation.getCurrentPosition(
      (pos) => done({ lat: round2(pos.coords.latitude), lon: round2(pos.coords.longitude) }),
      () => done(null),
      { enableHighAccuracy: false, maximumAge: 30 * 60 * 1000, timeout: timeoutMs },
    );
  });
}

export function weatherUrl(coords: Coords | null): string {
  return coords ? `${API_URL}?lat=${coords.lat}&lon=${coords.lon}` : API_URL;
}

@Component({
  selector: 'app-widget',
  imports: [DecimalPipe],
  templateUrl: './widget.html',
  styleUrl: './widget.css',
})
export class Widget {
  protected readonly chart = { width: 300, height: 64 };

  protected readonly weather = resource({
    loader: async ({ abortSignal }) => {
      const res = await fetch(weatherUrl(await getPosition()), { signal: abortSignal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as Weather;
    },
  });

  protected points(weather: Weather): string {
    return toPoints(
      weather.hourly.map((h) => h.temperature),
      this.chart.width,
      this.chart.height,
    );
  }

  protected labels(weather: Weather) {
    return [0, 4, 8, 11].map((i) => weather.hourly[i]).filter(Boolean);
  }
}
