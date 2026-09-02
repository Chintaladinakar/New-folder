import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

type Track = {
  id: string;
  title: string;
  artist: string | null;
  album: string | null;
  fileName: string;
  mimeType: string;
  storageKey: string;
  duration: number | null;
  artworkUrl: string | null;
};

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTracks = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE_URL}/tracks`);
        if (!response.ok) {
          throw new Error('Failed to load library');
        }
        const data = await response.json();
        setTracks(data.tracks ?? []);
      } catch (loadError) {
        setError((loadError as Error).message);
      } finally {
        setLoading(false);
      }
    };

    void loadTracks();
  }, []);

  const selectedAudioUrl = useMemo(() => {
    if (!selectedTrack) return null;
    return `${API_BASE_URL}/tracks/${selectedTrack.id}/stream`;
  }, [selectedTrack]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE_URL}/tracks/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(payload.message ?? 'Upload failed');
      }

      const data = await response.json();
      const nextTrack = data.track;
      setTracks((current) => [nextTrack, ...current]);
      setSelectedTrack(nextTrack);
      event.target.value = '';
    } catch (uploadError) {
      setError((uploadError as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold">Personal MP3 Player</h1>
            <p className="text-sm text-slate-400">Phase 1 library and playback</p>
          </div>
          <label className="cursor-pointer rounded bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500">
            Upload MP3
            <input type="file" accept="audio/mpeg,.mp3" className="hidden" onChange={handleUpload} />
          </label>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Library</p>
              <h2 className="mt-2 text-xl font-semibold">Uploaded tracks</h2>
            </div>
            <Link to="#" className="text-sm text-violet-400 hover:text-violet-300">Browse</Link>
          </div>

          {loading ? (
            <div className="mt-6 text-slate-400">Loading tracks...</div>
          ) : error ? (
            <div className="mt-6 rounded border border-red-500/30 bg-red-500/10 p-4 text-red-300">{error}</div>
          ) : tracks.length === 0 ? (
            <div className="mt-6 rounded border border-dashed border-slate-700 p-8 text-center text-slate-400">
              No MP3 files uploaded yet.
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-lg border border-slate-800">
              <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
                <thead className="bg-slate-800/80 text-slate-300">
                  <tr>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Artist</th>
                    <th className="px-4 py-3 font-medium">Album</th>
                    <th className="px-4 py-3 font-medium">Duration</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/40">
                  {tracks.map((track) => (
                    <tr key={track.id} className="hover:bg-slate-900/80">
                      <td className="px-4 py-3 text-slate-200">{track.title}</td>
                      <td className="px-4 py-3 text-slate-300">{track.artist ?? 'Unknown artist'}</td>
                      <td className="px-4 py-3 text-slate-300">{track.album ?? 'Unknown album'}</td>
                      <td className="px-4 py-3 text-slate-300">
                        {track.duration ? `${Math.floor(track.duration / 60)}:${String(track.duration % 60).padStart(2, '0')}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          className="rounded bg-violet-600 px-3 py-1.5 text-xs font-medium transition hover:bg-violet-500"
                          onClick={() => setSelectedTrack(track)}
                        >
                          Play
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-800 bg-slate-900/95 p-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded bg-gradient-to-br from-violet-500 to-indigo-500 text-lg font-bold">
              {selectedTrack ? selectedTrack.title.slice(0, 1).toUpperCase() : '♪'}
            </div>
            <div>
              <div className="font-medium text-slate-200">{selectedTrack?.title ?? 'No track selected'}</div>
              <div className="text-sm text-slate-400">{selectedTrack?.artist ?? 'Select a track'}</div>
            </div>
          </div>

          {selectedTrack && selectedAudioUrl ? (
            <audio controls className="w-full max-w-xl" src={selectedAudioUrl} />
          ) : (
            <div className="text-sm text-slate-400">Upload and select a track to start listening.</div>
          )}
        </div>
      </div>
    </div>
  );
}
