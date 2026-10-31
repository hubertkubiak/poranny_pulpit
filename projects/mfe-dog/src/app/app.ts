import { Component } from '@angular/core';
import { Widget } from './widget';

// Root component used only when this remote runs standalone.
// The shell never sees it: it loads ./Widget directly (see federation.config.mjs).
@Component({
  selector: 'app-root',
  imports: [Widget],
  template: '<app-widget />',
  styles: ':host { display: block; width: min(100%, 360px); }',
})
export class App {}
