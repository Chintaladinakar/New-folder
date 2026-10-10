import { motion } from 'motion/react';
import { useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Spinner } from '../components/ui/Controls';
import { LogoMark } from '../components/ui/LogoMark';
import { usePageTitle } from '../hooks/usePageTitle';
import { api, type SignedIn } from '../lib/api';
import { pinDigits } from '../lib/accounts';
import { APP_SHORT_NAME } from '../lib/constants';
import { fadeUp } from '../lib/motion';
import { lastSignIn, useAuthStore } from '../stores/authStore';

/** The admin signs in at /admin, and only there. Every other address gets the listeners' sign-in. */
const isAdminSignInPath = (pathname: string) => pathname.replace(/\/+$/, '').toLowerCase() === '/admin';

function Brand() {
  return (
    <p className="flex items-center gap-2.5">
      <LogoMark className="h-7 w-7 text-accent" />
      <span className="font-display text-2xl leading-none">{APP_SHORT_NAME}</span>
    </p>
  );
}

/** Sends a sign-in attempt; on failure, shows why, clears the secret and puts the cursor back in it. */
function useSignIn(secretRef: RefObject<HTMLInputElement>, clearSecret: () => void) {
  const signIn = useAuthStore((state) => state.signIn);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const attempt = async (send: () => Promise<SignedIn>) => {
    setPending(true);
    setError(null);
    try {
      signIn(await send());
    } catch (signInError) {
      setError((signInError as Error).message);
      clearSecret();
      secretRef.current?.focus();
    } finally {
      setPending(false);
    }
  };

  const errorProps = error ? { 'aria-invalid': true, 'aria-describedby': 'login-error' } : {};
  return { error, pending, attempt, errorProps };
}

type FormShellProps = {
  eyebrow?: string;
  description: string;
  error: string | null;
  pending: boolean;
  ready: boolean;
  onSubmit: () => void;
  footer?: ReactNode;
  children: ReactNode;
};

function FormShell({ eyebrow, description, error, pending, ready, onSubmit, footer, children }: FormShellProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (ready) onSubmit();
  };

  return (
    <motion.form variants={fadeUp} initial="hidden" animate="visible" onSubmit={submit} className="w-full max-w-sm" noValidate>
      <div className="mb-12 lg:hidden">
        <Brand />
      </div>
      {eyebrow && <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-accent">{eyebrow}</p>}
      <h1 className="font-display text-5xl leading-none">Welcome back</h1>
      <p className="mt-3 text-sm text-muted">{description}</p>

      <div className="mt-8 space-y-4">{children}</div>

      {error && (
        <p id="login-error" role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      <button type="submit" disabled={pending || !ready} className="btn-primary mt-6 h-11 w-full">
        {pending && <Spinner />}
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
      {footer && <div className="mt-4 text-center text-xs text-faint">{footer}</div>}
    </motion.form>
  );
}

/** Username and 6-digit PIN, with the username of the last listener on this device filled in. */
function ListenerSignIn() {
  const [username, setUsername] = useState(() => lastSignIn().username ?? '');
  const [pin, setPin] = useState('');
  const pinRef = useRef<HTMLInputElement>(null);
  const { error, pending, attempt, errorProps } = useSignIn(pinRef, () => setPin(''));

  return (
    <FormShell
      description="Sign in with the username and 6-digit PIN you were given."
      error={error}
      pending={pending}
      ready={username.trim().length > 0 && pin.length === 6}
      onSubmit={() => void attempt(() => api.pinLogin(username.trim(), pin))}
      footer="Forgot your PIN? Ask whoever set up your account for a new one."
    >
      <label className="block">
        <span className="label">Username</span>
        <input
          className="input h-11"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={64}
          autoFocus={!username}
        />
      </label>
      <label className="block">
        <span className="label">PIN</span>
        <input
          ref={pinRef}
          className="input h-11 font-mono tracking-[0.5em]"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={pin}
          // Digits only, so a stray letter can't make an "incorrect PIN".
          onChange={(event) => setPin(pinDigits(event.target.value))}
          autoComplete="current-password"
          autoFocus={Boolean(username)}
          {...errorProps}
        />
      </label>
    </FormShell>
  );
}

/** The server password, for the admin. */
function AdminSignIn() {
  const [password, setPassword] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);
  const { error, pending, attempt, errorProps } = useSignIn(passwordRef, () => setPassword(''));

  return (
    <FormShell
      eyebrow="Admin"
      description="Sign in with the server password to look after the library and its accounts."
      error={error}
      pending={pending}
      ready={password.length > 0}
      onSubmit={() => void attempt(() => api.login(password))}
      footer={
        <Link to="/" className="underline-offset-4 transition-colors hover:text-fg hover:underline">
          Sign in with a username and PIN instead
        </Link>
      }
    >
      <label className="block">
        <span className="label">Password</span>
        <input
          ref={passwordRef}
          type="password"
          className="input h-11"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          autoFocus
          {...errorProps}
        />
      </label>
    </FormShell>
  );
}

export function Login() {
  const admin = isAdminSignInPath(useLocation().pathname);
  usePageTitle(admin ? 'Admin sign-in' : 'Sign in');

  return (
    <main className="grid min-h-[100dvh] bg-base lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* Wide screens: the statement side, with a record half out of frame. */}
      <section aria-hidden="true" className="relative hidden flex-col justify-between overflow-hidden border-r border-edge bg-surface/40 p-12 lg:flex xl:p-16">
        <Brand />
        <p className="relative z-10 max-w-xl font-display text-[length:clamp(4rem,6.5vw,6.5rem)] leading-[0.92] tracking-[-0.015em]">
          A private library for the music <em className="text-accent">you own.</em>
        </p>
        <p className="relative z-10 font-mono text-[11px] uppercase tracking-[0.16em] text-faint">Listen · Discover · Keep</p>
        <div className="pointer-events-none absolute -bottom-[22vmin] -right-[18vmin] h-[68vmin] w-[68vmin] rounded-full bg-[repeating-radial-gradient(circle,rgb(var(--c-fg)/0.05)_0_1px,transparent_1px_6px)] bg-shade/30 shadow-cover">
          <div className="absolute inset-[34%] rounded-full bg-accent" />
          <div className="absolute inset-[48.5%] rounded-full bg-base" />
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-10">{admin ? <AdminSignIn /> : <ListenerSignIn />}</section>
    </main>
  );
}
