import { initFederation } from '@angular-architects/native-federation';

// Used only when this remote runs standalone. It has no remotes of its own ({}), but it
// still initialises federation so its shared deps resolve through the same import map
// mechanism as inside the shell. Inside the shell this file never runs: the shell
// imports ./Widget directly from remoteEntry.json.
initFederation({}, { hostRemoteEntry: { url: './remoteEntry.json' } })
  .catch((err) => console.error(err))
  .then(() => import('./bootstrap'))
  .catch((err) => console.error(err));
