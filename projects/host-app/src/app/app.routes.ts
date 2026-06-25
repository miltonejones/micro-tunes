import { Routes } from '@angular/router';
import { loadRemoteModule } from '@angular-architects/native-federation';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => loadRemoteModule('home', './Component').then((m) => m.App),
  },
  {
    path: 'list/:pageNum',
    loadComponent: () => loadRemoteModule('list', './Component').then((m) => m.App),
  },
  {
    path: 'list/:listType/:listId/:pageNum',
    loadComponent: () => loadRemoteModule('list', './Component').then((m) => m.App),
  },
  {
    path: 'grid/:gridType/:pageNum',
    loadComponent: () => loadRemoteModule('grid', './Component').then((m) => m.App),
  },
  {
    path: 'search/:query',
    loadComponent: () => loadRemoteModule('search', './Component').then((m) => m.App),
  },
];
