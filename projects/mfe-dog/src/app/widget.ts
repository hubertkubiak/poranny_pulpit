import { Component, resource } from '@angular/core';

const API_URL = 'http://localhost:3000/api/dog';

export interface Dog {
  imageUrl: string;
  breed: string;
  caption: string;
}

@Component({
  selector: 'app-widget',
  templateUrl: './widget.html',
  styleUrl: './widget.css',
})
export class Widget {
  protected readonly dog = resource({
    loader: async ({ abortSignal }) => {
      const res = await fetch(API_URL, { signal: abortSignal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as Dog;
    },
  });
}
