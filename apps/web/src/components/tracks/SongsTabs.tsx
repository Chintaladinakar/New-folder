import { motion } from 'motion/react';
import { Link, useLocation } from 'react-router-dom';
import { spring } from '../../lib/motion';

const TABS: [path: string, label: string][] = [
  ['/library', 'All songs'],
  ['/favorites', 'Favorites'],
  ['/recently-added', 'Recently added'],
  ['/recently-played', 'Recently played'],
];

/** The views of the song library, as a row of tabs under the page title. */
export function SongsTabs() {
  const { pathname } = useLocation();

  return (
    <nav aria-label="Songs" className="no-scrollbar -mx-5 mb-5 overflow-x-auto border-b border-edge px-5 sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0">
      <ul className="flex gap-6">
        {TABS.map(([path, label]) => {
          const active = pathname === path;
          return (
            <li key={path}>
              <Link to={path} aria-current={active ? 'page' : undefined} className="tab">
                {label}
                {active && <motion.span layoutId="songs-tab" transition={spring} className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-fg" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
