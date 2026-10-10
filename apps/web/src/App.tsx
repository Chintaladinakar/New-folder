import { Compass } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { EmptyState } from './components/ui/EmptyState';
import { api } from './lib/api';
import { queryClient } from './lib/queryClient';
import { Admin } from './pages/Admin';
import { Albums, Artists } from './pages/Albums';
import { Favorites, RecentlyAdded, RecentlyPlayed } from './pages/Collections';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { Login } from './pages/Login';
import { Mix } from './pages/Mix';
import { NowPlaying } from './pages/NowPlaying';
import { PlaylistDetail, Playlists } from './pages/Playlists';
import { Settings } from './pages/Settings';
import { useAuthStore } from './stores/authStore';
import { usePlayerStore } from './stores/playerStore';
import { useSettingsStore } from './stores/settingsStore';
import { usePageTitle } from './hooks/usePageTitle';

function NotFound() {
  usePageTitle('Page not found');
  return (
    <div className="page">
      <EmptyState
        icon={<Compass weight="light" />}
        title="Page not found"
        description="That page doesn't exist, or it moved."
        action={
          <Link to="/" className="btn-primary">
            Go home
          </Link>
        }
      />
    </div>
  );
}

export default function App() {
  const token = useAuthStore((state) => state.token);

  // Who is signed in, fresh from the server: names and roles can change, and sessions saved
  // before accounts existed don't say. A revoked session answers 401, which signs out.
  const session = useQuery({ queryKey: ['session', token], queryFn: api.session, enabled: Boolean(token), staleTime: 5 * 60_000 });
  useEffect(() => {
    if (session.data) useAuthStore.getState().setUser(session.data);
  }, [session.data]);

  useEffect(() => {
    // "Resume where you left off" is off: start every session with an empty player.
    if (!useSettingsStore.getState().resumePlayback) usePlayerStore.getState().stop();
  }, []);

  useEffect(() => {
    if (!token) {
      // Signed out or session expired: drop everything that belongs to the library.
      queryClient.clear();
      usePlayerStore.getState().stop();
    }
  }, [token]);

  if (!token) return <Login />;

  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Home />} />
        <Route path="library" element={<Library />} />
        <Route path="albums" element={<Albums />} />
        <Route path="artists" element={<Artists />} />
        <Route path="playlists" element={<Playlists />} />
        <Route path="playlists/:id" element={<PlaylistDetail />} />
        <Route path="now-playing" element={<NowPlaying />} />
        <Route path="settings" element={<Settings />} />
        <Route path="favorites" element={<Favorites />} />
        <Route path="recently-played" element={<RecentlyPlayed />} />
        <Route path="recently-added" element={<RecentlyAdded />} />
        <Route path="mix/:id" element={<Mix />} />
        <Route path="admin" element={<Admin />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
