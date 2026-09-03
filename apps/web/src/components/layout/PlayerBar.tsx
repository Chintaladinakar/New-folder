import { useEffect, useRef, useState, useMemo } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, 
  Volume2, VolumeX, ListMusic, Maximize2, Heart 
} from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { Link } from 'react-router-dom';

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '');
const API_BASE_URL = configuredApiBaseUrl?.endsWith('/api') ? configuredApiBaseUrl : `${configuredApiBaseUrl ?? ''}/api`;

export function PlayerBar() {
  const audioRef = useRef<HTMLAudioElement>(null);
  
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
    setDuration,
    toggleShuffle,
    toggleRepeat,
    setVolume,
    setIsMuted,
    playNext,
    playPrevious,
  } = usePlayerStore();

  const [isFavorite, setIsFavorite] = useState(false);

  const selectedAudioUrl = useMemo(() => {
    if (!currentTrack) return null;
    return `${API_BASE_URL}/tracks/${currentTrack.id}/stream`;
  }, [currentTrack]);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying && audioRef.current.paused) {
        audioRef.current.play().catch(() => setIsPlaying(false));
      } else if (!isPlaying && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentTrack]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    if (repeat === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
    } else {
      playNext();
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = Number(e.target.value);
    setVolume(newVolume);
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  if (!currentTrack) {
    return (
      <div className="fixed inset-x-0 bottom-0 h-24 border-t border-slate-800 bg-slate-900/95 p-4 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="text-sm text-slate-500">Select a track to start listening</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 h-24 border-t border-slate-800 bg-slate-900/95 backdrop-blur-sm z-50">
      <audio
        ref={audioRef}
        src={selectedAudioUrl || undefined}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        autoPlay={isPlaying}
      />
      
      <div className="flex h-full items-center justify-between px-4 max-w-[1600px] mx-auto">
        <div className="flex items-center gap-4 w-1/3 min-w-[200px]">
          <div className="relative group w-14 h-14 rounded-md overflow-hidden bg-slate-800 flex-shrink-0 flex items-center justify-center">
            {currentTrack.artworkUrl ? (
              <img src={currentTrack.artworkUrl} alt={currentTrack.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-violet-600 to-indigo-800 flex items-center justify-center text-xl font-bold">
                {currentTrack.title.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex flex-col truncate">
            <Link to="/now-playing" className="font-medium text-sm text-slate-100 hover:underline truncate">
              {currentTrack.title}
            </Link>
            <span className="text-xs text-slate-400 truncate">
              {currentTrack.artist ?? 'Unknown artist'}
            </span>
          </div>
          <button 
            onClick={() => setIsFavorite(!isFavorite)}
            className={`ml-2 p-1 rounded-full transition-colors ${isFavorite ? 'text-violet-500' : 'text-slate-400 hover:text-white'}`}
          >
            <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
          </button>
        </div>

        <div className="flex flex-col items-center justify-center w-1/3 max-w-[500px]">
          <div className="flex items-center gap-4 mb-2">
            <button 
              onClick={toggleShuffle}
              className={`p-1.5 rounded-full transition-colors ${shuffle ? 'text-violet-500' : 'text-slate-400 hover:text-white'}`}
            >
              <Shuffle className="w-4 h-4" />
            </button>
            <button 
              onClick={playPrevious}
              className="p-1.5 rounded-full text-slate-400 hover:text-white transition-colors"
            >
              <SkipBack className="w-5 h-5 fill-current" />
            </button>
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-2 rounded-full bg-white text-slate-900 hover:scale-105 transition-transform"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current translate-x-0.5" />}
            </button>
            <button 
              onClick={playNext}
              className="p-1.5 rounded-full text-slate-400 hover:text-white transition-colors"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>
            <button 
              onClick={toggleRepeat}
              className={`p-1.5 rounded-full transition-colors relative ${repeat !== 'off' ? 'text-violet-500' : 'text-slate-400 hover:text-white'}`}
            >
              <Repeat className="w-4 h-4" />
              {repeat === 'one' && (
                <span className="absolute -top-1 -right-1 text-[8px] font-bold bg-violet-500 text-white rounded-full w-3 h-3 flex items-center justify-center">1</span>
              )}
            </button>
          </div>
          
          <div className="flex items-center w-full gap-2 text-xs text-slate-400 font-medium">
            <span className="w-10 text-right">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
            />
            <span className="w-10 text-left">{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 w-1/3 min-w-[200px]">
          <button className="p-1.5 text-slate-400 hover:text-white transition-colors">
            <ListMusic className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-2 group w-24">
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className="p-1.5 text-slate-400 hover:text-white transition-colors"
            >
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-full h-1 bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </div>

          <Link to="/now-playing" className="p-1.5 text-slate-400 hover:text-white transition-colors ml-2">
            <Maximize2 className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
