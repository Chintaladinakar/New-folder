import { Routes, Route } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { Albums } from './pages/Albums';
import { Artists } from './pages/Artists';
import { Playlists } from './pages/Playlists';
import { NowPlaying } from './pages/NowPlaying';
import { Settings } from './pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Home />} />
        <Route path="library" element={<Library />} />
        <Route path="albums" element={<Albums />} />
        <Route path="artists" element={<Artists />} />
        <Route path="playlists" element={<Playlists />} />
        <Route path="now-playing" element={<NowPlaying />} />
        <Route path="settings" element={<Settings />} />
        <Route path="favorites" element={<Home />} />
        <Route path="recently-played" element={<Home />} />
        <Route path="recently-added" element={<Home />} />
      </Route>
    </Routes>
  );
}
