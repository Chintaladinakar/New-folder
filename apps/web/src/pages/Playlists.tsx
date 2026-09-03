import { ListMusic, Plus } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

export function Playlists() {
  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto">
      <div className="flex items-end justify-between mb-8">
        <h1 className="text-3xl font-bold">Playlists</h1>
        <button className="flex items-center gap-2 rounded-full bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" />
          Create Playlist
        </button>
      </div>

      <div className="mt-12">
        <EmptyState 
          icon={<ListMusic />} 
          title="No playlists yet" 
          description="Create a playlist to start organizing your music." 
          action={
            <button className="mt-4 flex items-center gap-2 rounded-full bg-violet-600 px-6 py-2.5 text-sm font-semibold hover:bg-violet-500 transition-colors">
              <Plus className="w-4 h-4" />
              Create your first playlist
            </button>
          }
        />
      </div>
    </div>
  );
}
