import { House, MicrophoneStage, MusicNotes, Playlist, VinylRecord } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { Link, useLocation } from 'react-router-dom';
import { spring } from '../../lib/motion';

type NavItem = {
  name: string;
  path: string;
  icon: Icon;
  /** Other routes that belong to this section, so it stays highlighted on them. */
  also?: string[];
};

export const MAIN_NAV: NavItem[] = [
  { name: 'Home', path: '/', icon: House },
  { name: 'Songs', path: '/library', icon: MusicNotes, also: ['/favorites', '/recently-played', '/recently-added'] },
  { name: 'Albums', path: '/albums', icon: VinylRecord },
  { name: 'Artists', path: '/artists', icon: MicrophoneStage },
  { name: 'Playlists', path: '/playlists', icon: Playlist },
];

function isActive(item: NavItem, pathname: string): boolean {
  if (item.path === '/') return pathname === '/';
  return [item.path, ...(item.also ?? [])].some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Text tabs in the top bar; the current one is underlined along the bar's bottom rule. */
export function PrimaryNav({ className = '' }: { className?: string }) {
  const { pathname } = useLocation();

  return (
    <nav aria-label="Main" className={`self-stretch ${className}`}>
      <ul className="flex h-full">
        {MAIN_NAV.map((item) => {
          const active = isActive(item, pathname);
          return (
            <li key={item.name} className="flex">
              <Link
                to={item.path}
                aria-current={active ? 'page' : undefined}
                className={`relative flex items-center px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                  active ? 'text-fg' : 'text-muted hover:text-fg'
                }`}
              >
                {item.name}
                {active && (
                  <motion.span layoutId="nav-underline" transition={spring} className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-fg" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Phones: a tab bar along the bottom edge. */
export function MobileNav() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-nav border-t border-edge bg-base/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="grid h-14 grid-cols-5">
        {MAIN_NAV.map((item) => {
          const active = isActive(item, pathname);
          return (
            <li key={item.name}>
              <Link
                to={item.path}
                aria-current={active ? 'page' : undefined}
                className={`pressable relative flex h-full flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors duration-150 ${
                  active ? 'text-fg' : 'text-faint'
                }`}
              >
                {active && <motion.span layoutId="tab-indicator" transition={spring} className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-fg" />}
                <item.icon weight={active ? 'fill' : 'regular'} className="h-[22px] w-[22px]" />
                {item.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
