import { InjectionToken } from '@angular/core';

// Names of remotes, in manifest order. Provided at bootstrap from the API manifest.
export const REMOTE_NAMES = new InjectionToken<string[]>('REMOTE_NAMES');

// Loads the './Widget' module exposed by a remote. Wrapped in a token so the
// components never touch the federation runtime directly (and tests can fake it).
export const LOAD_REMOTE = new InjectionToken<(name: string) => Promise<unknown>>('LOAD_REMOTE');
