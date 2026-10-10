import { create } from 'zustand';
import { safeStorage } from '../lib/browser';
import type { SessionUser } from '../types';

const SESSION_KEY = 'mp3-player:session';
const LAST_SIGN_IN_KEY = 'mp3-player:last-sign-in';

/** Sessions saved before accounts existed have no user; it is fetched on load. */
type Session = { token: string; expiresAt: string; user?: SessionUser };

function loadSession(): Session | null {
  try {
    const session = JSON.parse(safeStorage.getItem(SESSION_KEY) ?? 'null') as Session | null;
    return session && typeof session.token === 'string' && Date.parse(session.expiresAt) > Date.now() ? session : null;
  } catch {
    return null;
  }
}

/** The listener who last signed in on this device, so the sign-in screen can fill in their username. */
export type LastSignIn = { username?: string };

export function lastSignIn(): LastSignIn {
  try {
    const saved = JSON.parse(safeStorage.getItem(LAST_SIGN_IN_KEY) ?? 'null') as LastSignIn | null;
    return typeof saved?.username === 'string' ? { username: saved.username } : {};
  } catch {
    return {};
  }
}

// Listeners only: the admin's sign-in is a page of its own, /admin, with nothing to fill in.
const rememberSignIn = (user: SessionUser) => {
  if (user.role === 'listener') safeStorage.setItem(LAST_SIGN_IN_KEY, JSON.stringify({ username: user.username }));
};

type AuthState = {
  token: string | null;
  /** Null until known: right after sign-in it is, for an older saved session it loads. */
  user: SessionUser | null;
  signIn: (session: Session) => void;
  /** The account's latest details from the server (names and roles can change). */
  setUser: (user: SessionUser) => void;
  signOut: () => void;
};

const initial = loadSession();
if (initial?.user) rememberSignIn(initial.user);

export const useAuthStore = create<AuthState>((set) => ({
  token: initial?.token ?? null,
  user: initial?.user ?? null,
  signIn: (session) => {
    safeStorage.setItem(SESSION_KEY, JSON.stringify(session));
    if (session.user) rememberSignIn(session.user);
    set({ token: session.token, user: session.user ?? null });
  },
  setUser: (user) => {
    const stored = loadSession();
    if (stored) safeStorage.setItem(SESSION_KEY, JSON.stringify({ ...stored, user }));
    rememberSignIn(user);
    set({ user });
  },
  signOut: () => {
    safeStorage.removeItem(SESSION_KEY);
    set({ token: null, user: null });
  },
}));

/** Whether the signed-in account is the admin. False while the account is still loading. */
export const useIsAdmin = () => useAuthStore((state) => state.user?.role === 'admin');

/** What to call the signed-in account. */
export const displayNameOf = (user: SessionUser | null) => user?.displayName || user?.username || '';
