import { Disc } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

export function Albums() {
  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto">
      <h1 className="text-3xl font-bold mb-8">Albums</h1>
      <div className="mt-12">
        <EmptyState 
          icon={<Disc />} 
          title="No albums found" 
          description="Your albums will appear here once you add tracks with album information." 
        />
      </div>
    </div>
  );
}
