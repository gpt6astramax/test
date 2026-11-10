import HomePage from '../pages/home.jsx';
import SearchPage from '../pages/search.jsx';
import LibraryPage from '../pages/library.jsx';
import SettingsPage from '../pages/settings.jsx';
import TrackPage from '../pages/track.jsx';
import ArtistPage from '../pages/artist.jsx';
import CollectionPage from '../pages/collection.jsx';
import NotFoundPage from '../pages/404.jsx';

var routes = [
  { path: '/', component: HomePage },
  { path: '/search/', component: SearchPage },
  { path: '/library/', component: LibraryPage },
  { path: '/settings/', component: SettingsPage },
  { path: '/track/:id/', component: TrackPage },
  { path: '/artist/:id/', component: ArtistPage },
  { path: '/collection/:kind/:id/', component: CollectionPage },
  { path: '(.*)', component: NotFoundPage },
];

export default routes;
