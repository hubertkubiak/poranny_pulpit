import { initFederation, NativeFederationResult } from '@angular-architects/native-federation';

// The shell knows nothing about its remotes at build time. It asks the API at startup
// which remotes exist and where their remoteEntry.json files live.
const MANIFEST_URL = 'http://localhost:3000/api/federation-manifest';

async function start() {
  const manifest: Record<string, string> = await fetch(MANIFEST_URL)
    .then((res) => res.json())
    .catch((err) => {
      console.error('Nie udało się pobrać manifestu federacji', err);
      return {};
    });

  // initFederation registers every remote in the import map and negotiates shared deps.
  // An unreachable remote does not reject here (it is only logged), so one dead remote
  // never blocks the shell. The error surfaces later, per widget, in loadRemoteModule.
  const federation: NativeFederationResult | null = await initFederation(manifest, {
    hostRemoteEntry: { url: './remoteEntry.json' },
  }).catch((err) => {
    console.error(err);
    return null;
  });

  // Angular is imported only now, after federation is ready, so the shared Angular
  // packages resolve through the import map and are loaded once for shell + remotes.
  const { bootstrap } = await import('./bootstrap');
  bootstrap(Object.keys(manifest), federation);
}

start();
