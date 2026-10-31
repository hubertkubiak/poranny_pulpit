import { TestBed } from '@angular/core/testing';
import { App, formatDate, greeting } from './app';
import { LOAD_REMOTE, REMOTE_NAMES } from './remotes';

describe('greeting', () => {
  it('says "Dzień dobry" during the day', () => {
    expect(greeting(new Date(2026, 9, 30, 5))).toBe('Dzień dobry');
    expect(greeting(new Date(2026, 9, 30, 17, 59))).toBe('Dzień dobry');
  });

  it('says "Dobry wieczór" in the evening and at night', () => {
    expect(greeting(new Date(2026, 9, 30, 18))).toBe('Dobry wieczór');
    expect(greeting(new Date(2026, 9, 30, 2))).toBe('Dobry wieczór');
  });
});

describe('formatDate', () => {
  it('formats a full Polish date', () => {
    expect(formatDate(new Date(2026, 9, 30))).toBe('piątek, 30 października');
  });
});

describe('App', () => {
  function setup(names: string[]) {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: REMOTE_NAMES, useValue: names },
        { provide: LOAD_REMOTE, useValue: () => new Promise(() => {}) },
      ],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders one slot per remote from the manifest', () => {
    const slots = setup(['mfe-weather', 'mfe-rates', 'mfe-dog']).querySelectorAll('app-remote-widget');
    expect(slots.length).toBe(3);
  });

  it('shows a hint when the manifest is empty', () => {
    expect(setup([]).querySelector('.empty')?.textContent).toContain('Brak widgetów');
  });

  it('renders a greeting header', () => {
    expect(setup([]).querySelector('h1')?.textContent).toMatch(/Dzień dobry|Dobry wieczór/);
  });
});
