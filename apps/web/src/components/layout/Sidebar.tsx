import { NavLink } from 'react-router-dom';
import { Home, Library, Disc, Mic2, ListMusic, Heart, Clock, PlusSquare, Settings } from 'lucide-react';

export function Sidebar() {
  const navItems = [
    { name: 'Home', path: '/', icon: Home },
    { name: 'Library', path: '/library', icon: Library },
    { name: 'Albums', path: '/albums', icon: Disc },
    { name: 'Artists', path: '/artists', icon: Mic2 },
    { name: 'Playlists', path: '/playlists', icon: ListMusic },
  ];

  const libraryItems = [
    { name: 'Favorites', path: '/favorites', icon: Heart },
    { name: 'Recently Played', path: '/recently-played', icon: Clock },
    { name: 'Recently Added', path: '/recently-added', icon: PlusSquare },
  ];

  return (
    <div className="w-64 bg-slate-950 flex flex-col h-full border-r border-slate-900 hidden md:flex">
      <div className="p-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Disc className="w-6 h-6 text-violet-500" />
          <span>Antigravity</span>
        </h1>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-6">
        <div>
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.name}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4" />
                  {item.name}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Your Library
          </h2>
          <ul className="space-y-1">
            {libraryItems.map((item) => (
              <li key={item.name}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4" />
                  {item.name}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="p-4 mt-auto">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`
          }
        >
          <Settings className="w-4 h-4" />
          Settings
        </NavLink>
      </div>
    </div>
  );
}
