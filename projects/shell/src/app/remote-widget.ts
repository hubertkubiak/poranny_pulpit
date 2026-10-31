import { Component, Type, inject, input, resource } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { LOAD_REMOTE } from './remotes';

// Renders the component exposed by one remote. Each slot loads independently,
// so a remote that is down only breaks its own slot.
@Component({
  selector: 'app-remote-widget',
  imports: [NgComponentOutlet],
  template: `
    @if (widget.hasValue()) {
      <ng-container *ngComponentOutlet="widget.value()" />
    } @else if (widget.error()) {
      <div class="card fallback">
        <p class="title">Ten widget jest chwilowo niedostępny</p>
        <p class="hint">Spróbuj odświeżyć stronę za chwilę.</p>
      </div>
    } @else {
      <div class="card skeleton" aria-label="Ładowanie widgetu">
        <span></span><span></span><span></span>
      </div>
    }
  `,
  styleUrl: './remote-widget.css',
})
export class RemoteWidget {
  readonly name = input.required<string>();
  private readonly loadRemote = inject(LOAD_REMOTE);

  protected readonly widget = resource({
    params: () => this.name(),
    // Contract: every remote exposes './Widget' with a standalone component class named Widget.
    loader: async ({ params }) => {
      const module = (await this.loadRemote(params)) as { Widget: Type<unknown> };
      return module.Widget;
    },
  });
}
