import { useEffect, useState } from 'react';
import { EmptyState } from '../components/ui/EmptyState';
import { Library as LibraryIcon, Play, Pause, MoreHorizontal, Upload, Heart } from 'lucide-react';
import { usePlayerStore } from '../stores/playerStore';
import type { Track } from '../types';

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '');
const API_BASE_URL = configuredApiBaseUrl?.endsWith('/api') ? configuredApiBaseUrl : `${configuredApiBaseUrl ?? ''}/api`;

export function Library() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  
  const { currentTrack, isPlaying, setIsPlaying, setCurrentTrack, setQueue } = usePlayerStore();

  const loadTracks = async () => {
    try {
      setLoading(true);
      setError(null);
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

  useEffect(() => {
    void loadTracks();
  }, []);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingFile(file.name);
      setUploadProgress(0);
      setError(null);

      const uploadResponse = await fetch(`${API_BASE_URL}/tracks/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type }),
      });

      if (!uploadResponse.ok) {
        const payload = await uploadResponse.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(payload.message ?? 'Upload failed');
      }

      const upload = await uploadResponse.json();
      
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', upload.uploadUrl);
        xhr.setRequestHeader('Content-Type', upload.mimeType);
        
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr);
          } else {
            reject(new Error('Failed to upload file to storage'));
          }
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
      });

      setUploadProgress(100);

      const completeResponse = await fetch(`${API_BASE_URL}/tracks/complete-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          storageKey: upload.storageKey,
          mimeType: upload.mimeType,
          fileSize: file.size,
        }),
      });
      if (!completeResponse.ok) {
        const payload = await completeResponse.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(payload.message ?? 'Upload failed');
      }

      const data = await completeResponse.json();
      const nextTrack = data.track;
      setTracks((current) => [nextTrack, ...current]);
      event.target.value = '';
    } catch (uploadError) {
      setError((uploadError as Error).message);
    } finally {
      setUploadingFile(null);
      setUploadProgress(0);
    }
  };

  const handlePlayTrack = (track: Track) => {
    if (currentTrack?.id === track.id) {
      setIsPlaying(!isPlaying);
    } else {
      setQueue(tracks);
      setCurrentTrack(track);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  };

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Library</h1>
          <p className="text-slate-400 text-sm">{tracks.length} tracks</p>
        </div>
        
        <label className="flex items-center gap-2 cursor-pointer rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold hover:bg-violet-500 transition-colors shadow-lg shadow-violet-500/20">
          <Upload className="w-4 h-4" />
          Upload Music
          <input
            type="file"
            accept=".aac,.flac,.m4a,.mp3,.oga,.ogg,.opus,.wav,.webm,audio/*"
            className="hidden"
            onChange={handleUpload}
          />
        </label>
      </div>

      {uploadingFile && (
        <div className="mb-6 rounded-md border border-violet-500/30 bg-violet-500/10 p-4">
          <div className="flex justify-between text-sm mb-2 text-violet-200">
            <span>Uploading: <span className="font-medium text-white">{uploadingFile}</span></span>
            <span className="font-mono">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-violet-500 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex h-14 bg-slate-800/50 rounded-md animate-pulse" />
          ))}
        </div>
      ) : tracks.length === 0 ? (
        <div className="mt-12">
          <EmptyState 
            icon={<LibraryIcon />} 
            title="Your library is empty" 
            description="Upload some music to get started." 
          />
        </div>
      ) : (
        <div className="w-full text-left text-sm">
          <div className="grid grid-cols-[40px_minmax(200px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_80px_40px_40px] gap-4 px-4 py-2 text-slate-400 font-medium border-b border-slate-800 mb-2 uppercase tracking-wider text-xs">
            <div className="text-center">#</div>
            <div>Title</div>
            <div>Artist</div>
            <div>Album</div>
            <div className="text-right">Duration</div>
            <div></div>
            <div></div>
          </div>
          
          <div className="space-y-1">
            {tracks.map((track, index) => {
              const isCurrentTrack = currentTrack?.id === track.id;
              return (
                <div 
                  key={track.id} 
                  className={`group grid grid-cols-[40px_minmax(200px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_80px_40px_40px] gap-4 items-center px-4 py-2 rounded-md hover:bg-slate-800/80 transition-colors ${isCurrentTrack ? 'bg-slate-800/50' : ''}`}
                >
                  <div className="text-center text-slate-500 relative flex items-center justify-center">
                    <span className="group-hover:hidden">{index + 1}</span>
                    <button 
                      onClick={() => handlePlayTrack(track)}
                      className="hidden group-hover:flex text-slate-300 hover:text-white"
                    >
                      {isCurrentTrack && isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-3 truncate">
                    <div className="w-10 h-10 rounded bg-slate-800 flex-shrink-0 flex items-center justify-center overflow-hidden">
                      {track.artworkUrl ? (
                        <img src={track.artworkUrl} alt={track.title} className="w-full h-full object-cover" />
                      ) : (
                        <LibraryIcon className="w-4 h-4 text-slate-500" />
                      )}
                    </div>
                    <span className={`truncate font-medium ${isCurrentTrack ? 'text-violet-400' : 'text-slate-200'}`}>
                      {track.title}
                    </span>
                  </div>
                  
                  <div className="truncate text-slate-400">{track.artist ?? 'Unknown artist'}</div>
                  <div className="truncate text-slate-400">{track.album ?? 'Unknown album'}</div>
                  <div className="text-right text-slate-400 font-mono text-xs">{formatDuration(track.duration)}</div>
                  
                  <div className="flex justify-center">
                    <button className="text-slate-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      <Heart className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex justify-center">
                    <button className="text-slate-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
