import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { NativeFederationResult } from '@angular-architects/native-federation';
import { App } from './app/app';
import { LOAD_REMOTE, REMOTE_NAMES } from './app/remotes';

export function bootstrap(remoteNames: string[], federation: NativeFederationResult | null) {
  bootstrapApplication(App, {
    providers: [
      provideBrowserGlobalErrorListeners(),
      { provide: REMOTE_NAMES, useValue: remoteNames },
      {
        provide: LOAD_REMOTE,
        useValue: (name: string) =>
          federation
            ? federation.loadRemoteModule(name, './Widget')
            : Promise.reject(new Error('Federacja nie została zainicjalizowana')),
      },
    ],
  }).catch((err) => console.error(err));
}
