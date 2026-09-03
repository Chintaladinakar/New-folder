import { Mic2 } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

export function Artists() {
  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto">
      <h1 className="text-3xl font-bold mb-8">Artists</h1>
      <div className="mt-12">
        <EmptyState 
          icon={<Mic2 />} 
          title="No artists found" 
          description="Artists will appear here once you add tracks with artist information." 
        />
      </div>
    </div>
  );
}
