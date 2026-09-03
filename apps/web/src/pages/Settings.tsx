import { Settings as SettingsIcon } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

export function Settings() {
  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>
      <div className="mt-12">
        <EmptyState 
          icon={<SettingsIcon />} 
          title="Settings" 
          description="Configuration options will be available here." 
        />
      </div>
    </div>
  );
}
