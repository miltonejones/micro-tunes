import { initFederation } from '@angular-architects/native-federation';
import { federationManifest } from './federation.manifest';

initFederation(federationManifest)
  .catch(err => console.error(err))
  .then(_ => import('./bootstrap'))
  .catch(err => console.error(err));
