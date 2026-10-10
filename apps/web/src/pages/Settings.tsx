import { useQuery } from '@tanstack/react-query';
import { ArrowsClockwise, Check, CheckCircle, DeviceMobile, DownloadSimple, SignOut, UsersThree, XCircle } from '@phosphor-icons/react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ListeningReport } from '../components/stats/ListeningReport';
import { SORT_OPTIONS } from '../components/tracks/FilterBar';
import { Avatar } from '../components/ui/Avatar';
import { Segmented, SettingRow, Spinner, Switch } from '../components/ui/Controls';
import { ConfirmDialog } from '../components/ui/Dialog';
import { PageHeader } from '../components/ui/PageHeader';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { useStats } from '../hooks/useLibrary';
import { PLAYER_SHORTCUTS } from '../hooks/usePlayerShortcuts';
import { useSignOut } from '../hooks/useSignOut';
import { pinDigits, pinProblem } from '../lib/accounts';
import { ApiError, api } from '../lib/api';
import { formatBytes, formatLongDuration } from '../lib/format';
import { displayNameOf, useAuthStore, useIsAdmin } from '../stores/authStore';
import { usePlayerStore } from '../stores/playerStore';
import { ACCENTS, useSettingsStore, type Settings as SettingsShape } from '../stores/settingsStore';
import { toast } from '../stores/toastStore';
import type { HealthStatus, StorageHealth, TrackSort } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';

/** A settings group: its title on the left, its rows on the right, like a spec sheet. */
function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-x-12 gap-y-4 border-t border-edge py-10 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <div>
        <h2 className="font-display text-[2rem] leading-tight">{title}</h2>
        {description && <p className="mt-2 max-w-xs text-sm text-muted">{description}</p>}
      </div>
      <div className="min-w-0 divide-y divide-edge/70">{children}</div>
    </section>
  );
}

function Status({ ok, label, detail }: { ok: boolean | undefined; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3 py-3.5">
      {ok === undefined ? (
        <Spinner className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
      ) : ok ? (
        <CheckCircle weight="fill" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      ) : (
        <XCircle weight="fill" className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
      )}
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="break-words text-xs text-muted">{detail}</div>
      </div>
    </li>
  );
}

// Fixed preview colours: each tile shows its own theme, whatever the current one is.
const PAPER = { base: '#f4f1ea', ink: '#1c1915' };
const DARK = { base: '#11100e', ink: '#f0ebe3' };

const THEMES: { value: SettingsShape['theme']; label: string; halves: (typeof PAPER)[] }[] = [
  { value: 'dark', label: 'Dark', halves: [DARK] },
  { value: 'oled', label: 'Black', halves: [{ base: '#000000', ink: '#f2eee8' }] },
  { value: 'light', label: 'Paper', halves: [PAPER] },
  { value: 'system', label: 'Match device', halves: [DARK, PAPER] },
];

function AppearanceSection() {
  const settings = useSettingsStore();
  const accentLabel = ACCENTS.find((accent) => accent.name === settings.accent)?.label;

  return (
    <Section title="Appearance" description="Changes apply instantly and are saved on this device.">
      <div className="py-4">
        <div className="mb-3 text-sm font-medium">Theme</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {THEMES.map((theme) => {
            const active = settings.theme === theme.value;
            return (
              <button key={theme.value} type="button" aria-pressed={active} onClick={() => settings.update({ theme: theme.value })} className="pressable group text-left">
                <span
                  className={`flex aspect-[4/3] overflow-hidden rounded-lg border transition-[border-color,box-shadow] duration-150 ${
                    active ? 'border-fg ring-1 ring-fg' : 'border-edge group-hover:border-faint'
                  }`}
                >
                  {theme.halves.map((half, index) => (
                    <span key={index} className="flex flex-1 items-end p-3" style={{ background: half.base, color: half.ink }}>
                      <span className="font-display text-3xl leading-none">{theme.halves.length > 1 ? (index ? 'a' : 'A') : 'Aa'}</span>
                    </span>
                  ))}
                </span>
                <span className={`mt-2 block text-xs font-medium ${active ? 'text-fg' : 'text-muted'}`}>{theme.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="py-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium">Accent colour</span>
          <span className="text-xs text-muted">{accentLabel}</span>
        </div>
        <div className="flex flex-wrap gap-3">
          {ACCENTS.map((accent) => (
            <button
              key={accent.name}
              type="button"
              data-accent={accent.name}
              aria-label={accent.label}
              title={accent.label}
              aria-pressed={settings.accent === accent.name}
              onClick={() => settings.update({ accent: accent.name })}
              className="swatch"
            >
              {settings.accent === accent.name && <Check weight="bold" className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </div>

      <SettingRow title="Side panel" description="On wide screens, keep the player, queue and lyrics in a column beside the page">
        <Switch checked={settings.nowPlayingPanel} onChange={(nowPlayingPanel) => settings.update({ nowPlayingPanel })} label="Side panel" />
      </SettingRow>
      <SettingRow title="Motion" description="Animations throughout the app">
        <Segmented
          value={settings.motion}
          onChange={(motion) => settings.update({ motion })}
          label="Motion"
          options={[
            { value: 'system', label: 'Auto' },
            { value: 'full', label: 'On' },
            { value: 'reduced', label: 'Reduced' },
          ]}
        />
      </SettingRow>
      <SettingRow title="List density">
        <Segmented
          value={settings.density}
          onChange={(density) => settings.update({ density })}
          label="List density"
          options={[
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' },
          ]}
        />
      </SettingRow>
      <SettingRow title="Artwork in track lists">
        <Switch checked={settings.rowArtwork} onChange={(rowArtwork) => settings.update({ rowArtwork })} label="Artwork in track lists" />
      </SettingRow>
      <SettingRow title="Library stats on Home">
        <Switch checked={settings.homeShowStats} onChange={(homeShowStats) => settings.update({ homeShowStats })} label="Library stats on Home" />
      </SettingRow>
    </Section>
  );
}

function PlaybackSection() {
  const settings = useSettingsStore();

  return (
    <Section title="Playback" description="How the player looks and behaves.">
      <SettingRow title="Playing indicator" description="Shown next to the track that's playing">
        <Segmented
          value={settings.playingAnimation}
          onChange={(playingAnimation) => settings.update({ playingAnimation })}
          label="Playing indicator"
          options={[
            { value: 'bars', label: 'Bars' },
            { value: 'pulse', label: 'Pulse' },
            { value: 'none', label: 'Dot' },
          ]}
        />
      </SettingRow>
      <SettingRow title="Colour from artwork" description="Fill Now Playing with the cover's colours, drifting slowly while music plays">
        <Switch checked={settings.dynamicBackground} onChange={(dynamicBackground) => settings.update({ dynamicBackground })} label="Colour from artwork" />
      </SettingRow>
      <SettingRow title="Open lyrics automatically" description="Show lyrics whenever Now Playing opens">
        <Switch checked={settings.lyricsAutoShow} onChange={(lyricsAutoShow) => settings.update({ lyricsAutoShow })} label="Open lyrics automatically" />
      </SettingRow>
      <SettingRow title="Look up missing lyrics" description="Search LRCLIB, a free lyrics service, for tracks without embedded lyrics">
        <Switch checked={settings.lyricsAutoFetch} onChange={(lyricsAutoFetch) => settings.update({ lyricsAutoFetch })} label="Look up missing lyrics" />
      </SettingRow>
      <SettingRow title="Resume where you left off" description="Restore the queue and position when the app opens">
        <Switch checked={settings.resumePlayback} onChange={(resumePlayback) => settings.update({ resumePlayback })} label="Resume where you left off" />
      </SettingRow>
      <SettingRow title="Default song order">
        <select
          value={settings.defaultSort}
          onChange={(event) => settings.update({ defaultSort: event.target.value as TrackSort })}
          aria-label="Default song order"
          className="input h-8 w-auto py-0 pr-8 text-xs"
        >
          {SORT_OPTIONS.filter(([value]) => value !== 'album-order').map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </SettingRow>
    </Section>
  );
}

function ListeningSection() {
  return (
    <Section
      title="Listening"
      description="What you play, by genre. Each play is recorded with the track's genre at that moment; skips aren't counted."
    >
      <div className="py-4">
        <ListeningReport empty="No plays recorded in this period yet. History starts from the first track you play." />
      </div>
    </Section>
  );
}

/** A listener changes their own PIN. Their other devices stay signed in. */
function ChangePinForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem =
      current.length !== 6
        ? 'Enter your current PIN'
        : (pinProblem(next) ?? (next !== again ? "The new PINs don't match" : next === current ? "That's the PIN you have now" : null));
    setError(problem);
    if (problem) return;
    setPending(true);
    try {
      await api.changePin(current, next);
      setCurrent('');
      setNext('');
      setAgain('');
      toast('PIN changed. Use the new one next time you sign in.');
    } catch (changeError) {
      setError((changeError as Error).message);
    } finally {
      setPending(false);
    }
  };

  const field = (label: string, value: string, set: (value: string) => void, autoComplete: string) => (
    <label className="block">
      <span className="label">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => set(pinDigits(event.target.value))}
        className="input h-10 font-mono tracking-[0.4em]"
        {...(error ? { 'aria-invalid': true, 'aria-describedby': 'pin-change-error' } : {})}
      />
    </label>
  );

  return (
    <form onSubmit={submit} noValidate className="py-4">
      <div className="text-sm font-medium text-fg">Change PIN</div>
      <p className="mt-0.5 max-w-md text-[13px] leading-snug text-muted">6 digits. Not one digit repeated, and not a run like 123456.</p>
      <div className="mt-4 grid max-w-xl gap-3 sm:grid-cols-3">
        {field('Current PIN', current, setCurrent, 'current-password')}
        {field('New PIN', next, setNext, 'new-password')}
        {field('New PIN again', again, setAgain, 'new-password')}
      </div>
      {error && (
        <p id="pin-change-error" role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending || !current || !next || !again} className="btn-secondary btn-sm mt-4">
        {pending && <Spinner className="h-3.5 w-3.5" />}
        {pending ? 'Changing…' : 'Change PIN'}
      </button>
    </form>
  );
}

function AccountSection() {
  const user = useAuthStore((state) => state.user);
  if (!user) return null;
  const isAdmin = user.role === 'admin';
  const name = displayNameOf(user);

  return (
    <Section
      title="Account"
      description={
        isAdmin
          ? 'You look after the library and the people who listen to it.'
          : 'Your favorites, playlists, history and mixes belong to this account.'
      }
    >
      <div className="flex items-center gap-4 py-4">
        <Avatar name={name} className="h-12 w-12 text-2xl" />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium">{name}</div>
          <div className="truncate font-mono text-xs text-faint">
            @{user.username} · {isAdmin ? 'Admin' : 'Listener'}
          </div>
        </div>
      </div>
      {isAdmin ? (
        <>
          <SettingRow title="Accounts" description="Make listener accounts, reset PINs, and see what people play">
            <Link to="/admin" className="btn-secondary btn-sm">
              <UsersThree className="h-3.5 w-3.5" />
              Manage
            </Link>
          </SettingRow>
          <p className="py-4 text-[13px] leading-snug text-muted">
            You sign in at <code className="font-mono text-xs text-fg">/admin</code> with the server's password,{' '}
            <code className="font-mono text-xs text-fg">AUTH_PASSWORD</code>. The sign-in page everywhere else is for listeners. Changing the
            password signs everyone out; listeners sign back in with their PINs.
          </p>
        </>
      ) : (
        <ChangePinForm />
      )}
    </Section>
  );
}

function InstallSection() {
  const { canPrompt, installed, install } = useInstallPrompt();
  const isApple = /iphone|ipad|macintosh/i.test(navigator.userAgent);

  return (
    <Section title="App" description="Install for a window of its own, an icon on your desktop or home screen, and faster launches.">
      <div className="py-4">
        {installed ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <CheckCircle weight="fill" className="h-4 w-4 text-success" /> Installed. You're using the app version.
          </p>
        ) : canPrompt ? (
          <button type="button" onClick={() => void install()} className="btn-primary">
            <DownloadSimple weight="bold" className="h-4 w-4" />
            Install app
          </button>
        ) : (
          <div className="text-sm text-muted">
            <p className="mb-3 flex items-center gap-2">
              <DeviceMobile className="h-4 w-4" /> Install from your browser's menu:
            </p>
            <ul className="space-y-2 text-[13px]">
              <li>
                <strong className="font-medium text-fg">Chrome / Edge:</strong> click the install icon in the address bar, or ⋮ → “Install app”.
              </li>
              {isApple && (
                <li>
                  <strong className="font-medium text-fg">Safari:</strong> Share → “Add to Home Screen” on iPhone, or File → “Add to Dock” on Mac.
                </li>
              )}
              <li>
                <strong className="font-medium text-fg">Firefox:</strong> use the “Progressive Web Apps” add-on, or Chrome/Edge.
              </li>
            </ul>
          </div>
        )}
      </div>
    </Section>
  );
}

export function Settings() {
  usePageTitle('Settings');
  const stats = useStats();
  const isAdmin = useIsAdmin();
  const signOut = useSignOut();
  const resetSettings = useSettingsStore((state) => state.reset);
  const [confirmingReset, setConfirmingReset] = useState(false);

  // /health answers 503 with a useful body when something is down, so read the body either way.
  // The server checks are the admin's business; listeners don't see them.
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.health().catch((error) => (error instanceof ApiError && error.body ? (error.body as HealthStatus) : Promise.reject(error))),
    staleTime: 0,
    enabled: isAdmin,
  });
  const storage = useQuery({
    queryKey: ['storage-health'],
    queryFn: () =>
      api.storageHealth().catch((error) => (error instanceof ApiError && error.body ? (error.body as StorageHealth) : Promise.reject(error))),
    staleTime: 0,
    enabled: isAdmin,
  });

  const storageDetail = storage.data
    ? storage.data.ok
      ? `Bucket ${storage.data.bucket} (${storage.data.region}) is reachable`
      : storage.data.missing?.length
        ? `Missing settings: ${storage.data.missing.join(', ')}`
        : `Bucket ${storage.data.bucket ?? ''} is not reachable — check the B2 credentials`
    : storage.error
      ? storage.error.message
      : 'Checking…';

  const s = stats.data?.stats;
  const counts: [string, string][] = s
    ? [
        ['Tracks', s.trackCount.toLocaleString()],
        ['Albums', s.albumCount.toLocaleString()],
        ['Artists', s.artistCount.toLocaleString()],
        ['Favorites', s.favoriteCount.toLocaleString()],
      ]
    : [];
  const details: [string, string][] = s
    ? [
        ['Total listening time', formatLongDuration(s.totalDuration)],
        ...(isAdmin
          ? ([
              ['Storage used', formatBytes(s.totalBytes)],
              ['Upload size limit', formatBytes(stats.data!.uploadMaxSizeBytes)],
            ] as [string, string][])
          : []),
      ]
    : [];

  return (
    <div className="page max-w-[1200px]">
      <PageHeader title="Settings" />

      <div>
        <AccountSection />
        <AppearanceSection />
        <PlaybackSection />
        <ListeningSection />

        <Section title="Library">
          {stats.isLoading ? (
            <p className="py-4 text-sm text-muted">Loading…</p>
          ) : stats.error ? (
            <p className="py-4 text-sm text-danger">{stats.error.message}</p>
          ) : (
            <div className="py-4">
              <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                {counts.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="mt-1 font-display text-4xl leading-none tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              <dl className="mt-6 divide-y divide-edge/70 border-t border-edge/70">
                {details.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 py-3 text-sm">
                    <dt className="text-muted">{label}</dt>
                    <dd className="font-mono text-xs tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </Section>

        <InstallSection />

        {isAdmin && (
          <Section title="Server" description="The services the library depends on.">
            <ul className="divide-y divide-edge/70">
              <Status
                ok={health.data ? health.data.database === 'ok' : health.error ? false : undefined}
                label="Database"
                detail={health.data ? (health.data.database === 'ok' ? 'Connected' : 'Unreachable') : (health.error?.message ?? 'Checking…')}
              />
              <Status ok={storage.data ? storage.data.ok : storage.error ? false : undefined} label="File storage (Backblaze B2)" detail={storageDetail} />
            </ul>
            <div className="py-4">
              <button
                type="button"
                onClick={() => {
                  void health.refetch();
                  void storage.refetch();
                }}
                className="btn-secondary btn-sm"
              >
                <ArrowsClockwise className="h-3.5 w-3.5" />
                Check again
              </button>
            </div>
          </Section>
        )}

        <Section title="Shortcuts" description="Work anywhere except while typing.">
          <dl className="divide-y divide-edge/70">
            {PLAYER_SHORTCUTS.map(([keys, action]) => (
              <div key={keys} className="flex items-center justify-between gap-4 py-3 text-sm">
                <dt className="text-muted">{action}</dt>
                <dd>
                  <kbd className="kbd h-6 text-[11px]">{keys}</kbd>
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="This device" description="Your queue, settings and playback position are stored in this browser. Clearing them doesn't touch your library.">
          <div className="flex flex-wrap gap-2 py-4">
            <button type="button" onClick={() => setConfirmingReset(true)} className="btn-secondary">
              Clear queue and history
            </button>
            <button
              type="button"
              onClick={() => {
                resetSettings();
                toast('Settings reset to defaults');
              }}
              className="btn-secondary"
            >
              Reset settings
            </button>
            <button type="button" onClick={signOut} className="btn-danger">
              <SignOut weight="bold" className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </Section>
      </div>

      <ConfirmDialog
        open={confirmingReset}
        onClose={() => setConfirmingReset(false)}
        title="Clear the player?"
        message="This stops playback and empties the queue on this device."
        confirmLabel="Clear"
        onConfirm={() => {
          usePlayerStore.getState().stop();
          toast('Player cleared');
        }}
      />
    </div>
  );
}
