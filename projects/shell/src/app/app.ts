import { Component, inject } from '@angular/core';
import { RemoteWidget } from './remote-widget';
import { REMOTE_NAMES } from './remotes';

export function greeting(date: Date): string {
  const hour = date.getHours();
  return hour >= 5 && hour < 18 ? 'Dzień dobry' : 'Dobry wieczór';
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

@Component({
  selector: 'app-root',
  imports: [RemoteWidget],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly now = new Date();
  protected readonly greeting = greeting(this.now);
  protected readonly date = formatDate(this.now);
  protected readonly remotes = inject(REMOTE_NAMES);
}
