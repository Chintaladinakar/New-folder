import { useEffect, useState } from 'react';
import { EmptyState } from '../components/ui/EmptyState';
import { Clock, Heart, PlusSquare, Play } from 'lucide-react';
import { usePlayerStore } from '../stores/playerStore';
import type { Track } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export function Home() {
  const [recentTracks, setRecentTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const { setCurrentTrack, setQueue, currentTrack, isPlaying, setIsPlaying } = usePlayerStore();

  useEffect(() => {
    const fetchTracks = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/tracks`);
        if (response.ok) {
          const data = await response.json();
          setRecentTracks(data.tracks?.slice(0, 6) ?? []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    void fetchTracks();
  }, []);

  const handlePlayTrack = (track: Track) => {
    if (currentTrack?.id === track.id) {
      setIsPlaying(!isPlaying);
    } else {
      setQueue(recentTracks);
      setCurrentTrack(track);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-10">
      <section>
        <h2 className="text-2xl font-bold mb-6">Good evening</h2>
        
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-20 rounded-md bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : recentTracks.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentTracks.map((track) => (
              <div 
                key={track.id} 
                className="group flex items-center h-20 bg-slate-800/50 hover:bg-slate-700/50 rounded-md overflow-hidden transition-colors cursor-pointer pr-4"
                onClick={() => handlePlayTrack(track)}
              >
                <div className="w-20 h-20 bg-slate-700 flex-shrink-0 flex items-center justify-center">
                  {track.artworkUrl ? (
                    <img src={track.artworkUrl} alt={track.title} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl font-bold text-slate-500">{track.title.slice(0, 1)}</span>
                  )}
                </div>
                <div className="ml-4 font-semibold text-sm truncate flex-1">{track.title}</div>
                <button 
                  className={`w-10 h-10 rounded-full bg-violet-500 flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 transition-all translate-y-1 group-hover:translate-y-0 ${currentTrack?.id === track.id && isPlaying ? 'opacity-100' : ''}`}
                >
                  <Play className="w-5 h-5 fill-black text-black ml-1" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState 
            icon={<Clock />} 
            title="No recently played tracks" 
            description="Tracks you play will appear here." 
          />
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold hover:underline cursor-pointer">Recently Added</h2>
          <span className="text-sm font-semibold text-slate-400 hover:text-white cursor-pointer uppercase tracking-wider">Show all</span>
        </div>
        
        {loading ? (
          <div className="flex gap-6 overflow-hidden">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="w-40 flex flex-col gap-3">
                <div className="w-40 h-40 rounded-md bg-slate-800 animate-pulse" />
                <div className="h-4 w-24 bg-slate-800 rounded animate-pulse" />
                <div className="h-3 w-16 bg-slate-800 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : recentTracks.length > 0 ? (
          <div className="flex flex-wrap gap-6">
            {recentTracks.slice(0, 5).map(track => (
              <div key={track.id} className="w-40 group cursor-pointer" onClick={() => handlePlayTrack(track)}>
                <div className="w-40 h-40 bg-slate-800 rounded-md mb-3 relative overflow-hidden flex items-center justify-center">
                   {track.artworkUrl ? (
                    <img src={track.artworkUrl} alt={track.title} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-4xl font-bold text-slate-600">{track.title.slice(0, 1)}</span>
                  )}
                  <button className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-violet-500 flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                    <Play className="w-5 h-5 fill-black text-black ml-1" />
                  </button>
                </div>
                <div className="font-semibold text-sm truncate">{track.title}</div>
                <div className="text-xs text-slate-400 mt-1 truncate">{track.artist || 'Unknown Artist'}</div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState 
            icon={<PlusSquare />} 
            title="No recently added tracks" 
            description="New tracks added to your library will appear here." 
          />
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold hover:underline cursor-pointer">Favorites</h2>
          <span className="text-sm font-semibold text-slate-400 hover:text-white cursor-pointer uppercase tracking-wider">Show all</span>
        </div>
        
        <EmptyState 
          icon={<Heart />} 
          title="No favorites yet" 
          description="Like tracks to add them to your favorites." 
        />
      </section>
    </div>
  );
}
