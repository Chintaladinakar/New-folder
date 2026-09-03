import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { PlayerBar } from './PlayerBar';

export function MainLayout() {
  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden font-sans">
      <Sidebar />
      
      <div className="flex-1 flex flex-col min-w-0 relative">
        <TopBar />
        
        <main className="flex-1 overflow-y-auto pb-24">
          <Outlet />
        </main>
      </div>

      <PlayerBar />
    </div>
  );
}
