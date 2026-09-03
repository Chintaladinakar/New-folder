import { ChevronLeft, ChevronRight, Search, User } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

export function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-full bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => navigate(1)}
            className="p-1.5 rounded-full bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Go forward"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="relative hidden sm:block w-64 md:w-80">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-slate-800 rounded-full leading-5 bg-slate-950 text-slate-300 placeholder-slate-500 focus:outline-none focus:bg-slate-900 focus:border-slate-700 sm:text-sm transition-colors"
            placeholder="Search for songs, artists..."
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors" aria-label="User profile">
          <User className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
