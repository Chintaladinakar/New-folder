import { Clock, Heart, ListPlus } from '@phosphor-icons/react';
import { TrackListPage } from '../components/tracks/TrackListPage';

export function Favorites() {
  return (
    <TrackListPage
      title="Favorites"
      tabs
      filters={{ favorite: true, sort: 'recent' }}
      empty={{ icon: <Heart weight="light" />, title: 'No favorites yet', description: 'Tap the heart on any track to add it here.' }}
    />
  );
}

export function RecentlyPlayed() {
  return (
    <TrackListPage
      title="Recently played"
      tabs
      filters={{ played: true, sort: 'played' }}
      empty={{ icon: <Clock weight="light" />, title: 'Nothing played yet', description: 'Tracks you play will appear here.' }}
    />
  );
}

export function RecentlyAdded() {
  return (
    <TrackListPage
      title="Recently added"
      tabs
      filters={{ sort: 'recent' }}
      empty={{ icon: <ListPlus weight="light" />, title: 'No tracks yet', description: 'New music shows up here as it is added.' }}
    />
  );
}
