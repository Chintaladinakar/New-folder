import { CaretLeft, CaretRight, DownloadSimple, Gear, MagnifyingGlass, SignOut, UserCircle, UsersThree, X } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import { useSignOut } from '../../hooks/useSignOut';
import { APP_SHORT_NAME } from '../../lib/constants';
import { displayNameOf, useAuthStore } from '../../stores/authStore';
import { Avatar } from '../ui/Avatar';
import { LogoMark } from '../ui/LogoMark';
import { Menu, type MenuItem } from '../ui/Menu';
import { UploadButton } from '../upload/Upload';
import { PrimaryNav } from './Navigation';

function SearchBox() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const onLibrary = location.pathname === '/library';
  const urlQuery = onLibrary ? (params.get('q') ?? '') : '';
  const [value, setValue] = useState(urlQuery);

  // Follow the URL when it changes elsewhere (back button, clearing a filter chip).
  useEffect(() => setValue(urlQuery), [urlQuery]);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === urlQuery || (!trimmed && !onLibrary)) return;
    const timer = setTimeout(() => {
      navigate(trimmed ? `/library?q=${encodeURIComponent(trimmed)}` : '/library', { replace: onLibrary });
    }, 300);
    return () => clearTimeout(timer);
  }, [value, urlQuery, onLibrary, navigate]);

  return (
    <form role="search" className="relative min-w-0 flex-1 md:w-44 md:flex-none lg:w-56 xl:w-72" onSubmit={(event) => event.preventDefault()}>
      <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <input
        id="global-search"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && (event.currentTarget as HTMLInputElement).blur()}
        placeholder="Search"
        aria-label="Search your library"
        className="block h-9 w-full rounded-lg border border-transparent bg-surface-2/70 pl-9 pr-9 text-sm text-fg placeholder:text-faint transition-[border-color,background-color,box-shadow] duration-150 hover:bg-surface-2 focus:border-edge focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button type="button" onClick={() => setValue('')} aria-label="Clear search" className="icon-btn absolute right-1 top-1/2 -translate-y-1/2 p-1.5">
          <X className="h-4 w-4" />
        </button>
      ) : (
        <kbd className="kbd pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 md:inline-flex [form:focus-within_&]:hidden">/</kbd>
      )}
    </form>
  );
}

export function TopBar({ className = '' }: { className?: string }) {
  const navigate = useNavigate();
  const signOut = useSignOut();
  const user = useAuthStore((state) => state.user);
  const { canPrompt, installed, install } = useInstallPrompt();
  const isAdmin = user?.role === 'admin';
  const name = displayNameOf(user);

  const accountItems: MenuItem[] = [
    ...(user ? [{ heading: isAdmin ? `${name} · Admin` : name }] : []),
    ...(isAdmin ? [{ label: 'Accounts', icon: UsersThree, onSelect: () => navigate('/admin') }] : []),
    { label: 'Settings', icon: Gear, onSelect: () => navigate('/settings') },
    ...(canPrompt && !installed ? [{ label: 'Install app', icon: DownloadSimple, onSelect: () => void install() }] : []),
    { separator: true },
    { label: 'Sign out', icon: SignOut, onSelect: signOut },
  ];

  return (
    <header
      className={`titlebar box-content flex h-14 shrink-0 items-center gap-3 border-b border-edge bg-base px-4 pt-[env(safe-area-inset-top)] md:h-16 md:gap-5 md:px-6 lg:gap-8 ${className}`}
    >
      <Link
        to="/"
        aria-label={`${APP_SHORT_NAME}, home`}
        className="flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <LogoMark className="h-7 w-7 text-accent" />
        <span className="hidden font-display text-2xl leading-none lg:block">{APP_SHORT_NAME}</span>
      </Link>

      {/* An installed app has no browser buttons, so it gets its own. */}
      {installed && (
        <div className="-mx-2 hidden items-center md:flex">
          <button type="button" onClick={() => navigate(-1)} className="icon-btn" aria-label="Go back">
            <CaretLeft weight="bold" className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => navigate(1)} className="icon-btn" aria-label="Go forward">
            <CaretRight weight="bold" className="h-4 w-4" />
          </button>
        </div>
      )}

      <PrimaryNav className="hidden md:flex" />

      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 md:flex-none">
        <SearchBox />
        <UploadButton label="Upload" className="btn-secondary hidden h-9 px-2.5 md:inline-flex xl:px-3.5" labelClassName="sr-only xl:not-sr-only" />
        <Menu
          label="Account"
          items={accountItems}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent aria-expanded:bg-surface-2 aria-expanded:text-fg"
        >
          {name ? (
            <Avatar name={name} className="h-8 w-8 text-lg" />
          ) : (
            <UserCircle className="h-[22px] w-[22px]" />
          )}
        </Menu>
      </div>
    </header>
  );
}
