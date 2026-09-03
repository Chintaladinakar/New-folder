import { usePlayerStore } from '../stores/playerStore';
import { 
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, 
  Heart, ListMusic, Volume2, VolumeX, Maximize2 
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export function NowPlaying() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    shuffle,
    repeat,
    setIsPlaying,
    setCurrentTime,
    toggleShuffle,
    toggleRepeat,
    setVolume,
    setIsMuted,
    playNext,
    playPrevious,
  } = usePlayerStore();

  const navigate = useNavigate();

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(e.target.value);
    setCurrentTime(newTime);
  };

  if (!currentTrack) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh]">
        <div className="text-slate-400 mb-4">No track is currently playing</div>
        <button 
          onClick={() => navigate('/library')}
          className="rounded-full bg-violet-600 px-6 py-2.5 text-sm font-semibold hover:bg-violet-500 transition-colors"
        >
          Go to Library
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-12 max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
      <div className="w-full max-w-md aspect-square rounded-xl overflow-hidden bg-slate-800 shadow-2xl shadow-black/50 mb-10 flex items-center justify-center">
        {currentTrack.artworkUrl ? (
          <img src={currentTrack.artworkUrl} alt={currentTrack.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-violet-900 to-slate-900 flex items-center justify-center">
            <span className="text-6xl font-bold text-slate-500">{currentTrack.title.slice(0, 1).toUpperCase()}</span>
          </div>
        )}
      </div>

      <div className="w-full max-w-md flex flex-col items-center text-center mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">{currentTrack.title}</h1>
        <p className="text-lg text-slate-400">{currentTrack.artist ?? 'Unknown artist'}</p>
        <p className="text-sm text-slate-500 mt-1">{currentTrack.album ?? 'Unknown album'}</p>
      </div>

      <div className="w-full max-w-2xl px-6">
        <div className="flex items-center gap-4 mb-8">
          <span className="text-xs font-medium text-slate-400 w-12 text-right">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
          />
          <span className="text-xs font-medium text-slate-400 w-12 text-left">{formatTime(duration)}</span>
        </div>

        <div className="flex items-center justify-between max-w-sm mx-auto">
          <button 
            onClick={toggleShuffle}
            className={`p-2 rounded-full transition-colors ${shuffle ? 'text-violet-500' : 'text-slate-400 hover:text-white'}`}
          >
            <Shuffle className="w-5 h-5" />
          </button>
          
          <button 
            onClick={playPrevious}
            className="p-2 rounded-full text-slate-300 hover:text-white transition-colors"
          >
            <SkipBack className="w-8 h-8 fill-current" />
          </button>
          
          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-4 rounded-full bg-white text-slate-900 hover:scale-105 transition-transform shadow-lg shadow-white/10"
          >
            {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current translate-x-1" />}
          </button>
          
          <button 
            onClick={playNext}
            className="p-2 rounded-full text-slate-300 hover:text-white transition-colors"
          >
            <SkipForward className="w-8 h-8 fill-current" />
          </button>
          
          <button 
            onClick={toggleRepeat}
            className={`p-2 rounded-full transition-colors relative ${repeat !== 'off' ? 'text-violet-500' : 'text-slate-400 hover:text-white'}`}
          >
            <Repeat className="w-5 h-5" />
            {repeat === 'one' && (
              <span className="absolute -top-1 -right-1 text-[10px] font-bold bg-violet-500 text-white rounded-full w-4 h-4 flex items-center justify-center">1</span>
            )}
          </button>
        </div>
        
        <div className="flex justify-between items-center mt-12 px-8">
           <button className="text-slate-400 hover:text-white p-2">
            <Heart className="w-6 h-6" />
           </button>
           <button className="text-slate-400 hover:text-white p-2">
            <ListMusic className="w-6 h-6" />
           </button>
        </div>
      </div>
    </div>
  );
}
