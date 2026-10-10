import { ChartBar, Check, Copy, DotsThree, Key, LockSimple, MagnifyingGlass, PencilSimple, Plus, Power, Trash, UsersThree } from '@phosphor-icons/react';
import { useId, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ListeningReport } from '../components/stats/ListeningReport';
import { ListSkeleton } from '../components/tracks/TrackListPage';
import { Avatar } from '../components/ui/Avatar';
import { Segmented, Spinner } from '../components/ui/Controls';
import { ConfirmDialog, Dialog } from '../components/ui/Dialog';
import { EmptyState, ErrorState } from '../components/ui/EmptyState';
import { Menu, type MenuItem } from '../components/ui/Menu';
import { PageHeader } from '../components/ui/PageHeader';
import { useAccounts, useCreateAccount, useDeleteAccount, useResetPin, useUpdateAccount } from '../hooks/useLibrary';
import { usePageTitle } from '../hooks/usePageTitle';
import { formatPin, pinDigits, pinProblem, suggestUsername, usernameProblem } from '../lib/accounts';
import { ApiError } from '../lib/api';
import { formatRelative, pluralize } from '../lib/format';
import { displayNameOf, useAuthStore } from '../stores/authStore';
import { toast } from '../stores/toastStore';
import type { Account } from '../types';

type Panel =
  | { kind: 'create' }
  | { kind: 'pin'; account: Account; pin: string; created: boolean }
  | { kind: 'reset' | 'rename' | 'delete' | 'listening'; account: Account }
  | null;

/** Account, status, last active, plays, menu. Phones fold the middle three onto a second line. */
const columns = 'md:grid-cols-[minmax(0,1fr)_8rem_9rem_7rem_2.5rem]';

export function Admin() {
  usePageTitle('Accounts');
  const role = useAuthStore((state) => state.user?.role);

  if (!role) {
    return (
      <div className="page">
        <ListSkeleton rows={4} />
      </div>
    );
  }
  if (role !== 'admin') {
    return (
      <div className="page">
        <EmptyState
          icon={<LockSimple weight="light" />}
          title="Only the admin can see this"
          description="Accounts and PINs are looked after by the admin. Ask them if you need a new PIN."
          action={
            <Link to="/" className="btn-primary">
              Go home
            </Link>
          }
        />
      </div>
    );
  }
  return <Accounts />;
}

function Accounts() {
  const accounts = useAccounts();
  const update = useUpdateAccount();
  const remove = useDeleteAccount();
  const [panel, setPanel] = useState<Panel>(null);
  const [query, setQuery] = useState('');
  const close = () => setPanel(null);

  const all = accounts.data;
  const listeners = (all ?? []).filter((account) => account.role === 'listener');
  const listenedThisMonth = listeners.filter((account) => account.plays30d > 0).length;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (all ?? []).filter(
      (account) => !needle || account.username.includes(needle) || (account.displayName ?? '').toLowerCase().includes(needle),
    );
  }, [all, query]);

  const setDisabled = (account: Account, disabled: boolean) =>
    update.mutate(
      { id: account.id, patch: { disabled } },
      {
        onSuccess: () =>
          toast(disabled ? `${displayNameOf(account)} is signed out and can't sign in` : `${displayNameOf(account)} can sign in again`),
      },
    );

  const menuFor = (account: Account): MenuItem[] => {
    const common: MenuItem[] = [
      { label: 'Listening', icon: ChartBar, onSelect: () => setPanel({ kind: 'listening', account }) },
      { label: 'Rename', icon: PencilSimple, onSelect: () => setPanel({ kind: 'rename', account }) },
    ];
    // The admin signs in with the server password and can't be turned off or deleted.
    if (account.role === 'admin') return common;
    return [
      ...common,
      { label: account.locked ? 'Reset PIN and unlock' : 'Reset PIN', icon: Key, onSelect: () => setPanel({ kind: 'reset', account }) },
      { separator: true },
      account.disabled
        ? { label: 'Turn account on', icon: Power, onSelect: () => setDisabled(account, false) }
        : { label: 'Turn account off', icon: Power, onSelect: () => setDisabled(account, true) },
      { label: 'Delete account', icon: Trash, danger: true, onSelect: () => setPanel({ kind: 'delete', account }) },
    ];
  };

  const newAccount = (
    <button type="button" onClick={() => setPanel({ kind: 'create' })} className="btn-primary">
      <Plus weight="bold" className="h-4 w-4" />
      New account
    </button>
  );
  const deleting = panel?.kind === 'delete' ? panel.account : null;

  return (
    <div className="page max-w-[1200px]">
      <PageHeader
        eyebrow="Admin"
        title="Accounts"
        meta={
          all && (
            <p className="font-mono text-xs">
              {pluralize(listeners.length, 'listener')} · {listenedThisMonth} listened this month
            </p>
          )
        }
        actions={newAccount}
      />
      <p className="-mt-2 mb-10 max-w-2xl text-[15px] leading-relaxed text-muted">
        Listeners sign in with a username and a 6-digit PIN. They can play the whole library and get their own favorites, playlists,
        history and mixes. Only you can upload, edit or delete music.
      </p>

      {(all?.length ?? 0) > 8 && (
        <div className="relative mb-6 sm:w-72">
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find an account"
            aria-label="Find an account"
            className="input h-9 py-0 pl-9"
          />
        </div>
      )}

      {accounts.isLoading ? (
        <ListSkeleton rows={4} />
      ) : accounts.error ? (
        <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />
      ) : (
        <>
          <div aria-hidden="true" className={`hidden gap-x-4 border-b border-edge pb-2 text-xs font-medium text-faint md:grid ${columns}`}>
            <span>Account</span>
            <span>Status</span>
            <span>Last active</span>
            <span className="text-right">Plays · 30 days</span>
            <span />
          </div>
          <ul className="stagger">
            {visible.map((account, index) => (
              <AccountRow key={account.id} account={account} menu={menuFor(account)} style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }} />
            ))}
          </ul>
          {visible.length === 0 && query && (
            <EmptyState compact icon={<MagnifyingGlass weight="light" />} title="No matches" description="No account has that name or username." />
          )}
          {listeners.length === 0 && (
            <EmptyState
              compact
              icon={<UsersThree weight="light" />}
              title="No listeners yet"
              description="Make an account for each person you share the library with. Everyone gets their own favorites, playlists and mixes."
              action={newAccount}
            />
          )}
        </>
      )}

      {panel?.kind === 'create' && (
        <CreateAccountDialog onClose={close} onCreated={(account, pin) => setPanel({ kind: 'pin', account, pin, created: true })} />
      )}
      {panel?.kind === 'reset' && (
        <ResetPinDialog account={panel.account} onClose={close} onReset={(account, pin) => setPanel({ kind: 'pin', account, pin, created: false })} />
      )}
      {panel?.kind === 'pin' && <PinDialog account={panel.account} pin={panel.pin} created={panel.created} onClose={close} />}
      {panel?.kind === 'rename' && <RenameDialog account={panel.account} onClose={close} />}
      {panel?.kind === 'listening' && <ListeningDialog account={panel.account} onClose={close} />}
      <ConfirmDialog
        open={deleting !== null}
        onClose={close}
        title="Delete this account?"
        message={
          deleting && (
            <>
              <strong className="font-medium text-fg">{displayNameOf(deleting)}</strong> (@{deleting.username}) is signed out, and their
              favorites, playlists and listening history are deleted. The music stays in the library. This can't be undone.
            </>
          )
        }
        confirmLabel="Delete account"
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.id);
          toast(`Deleted ${displayNameOf(deleting)}'s account`);
        }}
      />
    </div>
  );
}

function AccountRow({ account, menu, style }: { account: Account; menu: MenuItem[]; style?: CSSProperties }) {
  const name = displayNameOf(account);
  const lastActive = account.lastSeenAt ?? account.lastLoginAt;

  return (
    <li className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-edge/70 py-4 ${columns}`} style={style}>
      <div className="flex min-w-0 items-center gap-3.5">
        <Avatar name={name} />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-medium">{name}</span>
            {account.role === 'admin' && (
              <span className="shrink-0 rounded border border-edge px-1.5 py-px text-[11px] font-medium text-muted">Admin</span>
            )}
          </div>
          <div className="truncate font-mono text-xs text-faint">@{account.username}</div>
        </div>
      </div>
      {/* One line under the name on phones; three columns of their own from md up. */}
      <div className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-1 pl-[3.375rem] text-xs text-muted md:contents md:text-sm">
        <Status account={account} />
        <span>
          <span className="sr-only">Last active: </span>
          {lastActive ? formatRelative(lastActive) : 'Never signed in'}
        </span>
        <span className="font-mono tabular-nums md:text-right">
          {account.plays30d.toLocaleString()}
          <span className="md:sr-only"> {account.plays30d === 1 ? 'play' : 'plays'} this month</span>
        </span>
      </div>
      <div className="col-start-2 row-start-1 md:col-start-auto md:row-start-auto md:justify-self-end">
        <Menu label={`Options for ${name}`} items={menu} className="icon-btn aria-expanded:bg-surface-2 aria-expanded:text-fg">
          <DotsThree weight="bold" className="h-5 w-5" />
        </Menu>
      </div>
    </li>
  );
}

function Status({ account }: { account: Account }) {
  const [label, dot, hint] = account.disabled
    ? ['Turned off', 'bg-faint', "Can't sign in until you turn the account back on"]
    : account.locked
      ? ['Locked', 'bg-warning', 'Too many wrong PINs. It unlocks by itself after 15 minutes, or when you reset the PIN.']
      : ['Active', 'bg-success', undefined];
  return (
    <span className="inline-flex items-center gap-2" title={hint}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

type FieldProps = { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean };

/** A labelled input with a hint under it, replaced by the error when there is one. */
function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: (props: FieldProps) => ReactNode }) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error || hint;
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children({ id, 'aria-describedby': note ? noteId : undefined, 'aria-invalid': error ? true : undefined })}
      {note && (
        <p id={noteId} role={error ? 'alert' : undefined} className={`mt-1.5 text-xs ${error ? 'text-danger' : 'text-faint'}`}>
          {note}
        </p>
      )}
    </div>
  );
}

type PinChoiceValue = { mode: 'generate' | 'choose'; pin: string };

/** A random PIN, or one the admin types: shown in the clear, since they have to pass it on. */
function PinChoice({ value, onChange, error }: { value: PinChoiceValue; onChange: (value: PinChoiceValue) => void; error: string | null }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted">PIN</span>
        <Segmented
          value={value.mode}
          onChange={(mode) => onChange({ ...value, mode })}
          label="How to set the PIN"
          options={[
            { value: 'generate', label: 'Make one up' },
            { value: 'choose', label: "I'll choose" },
          ]}
        />
      </div>
      {value.mode === 'generate' ? (
        <p className="text-xs text-faint">A random 6-digit PIN, shown once the account is saved.</p>
      ) : (
        <Field label="Their PIN" hint="6 digits. Not one digit repeated, and not a run like 123456." error={error}>
          {(props) => (
            <input
              {...props}
              className="input h-11 font-mono text-lg tracking-[0.4em]"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={value.pin}
              onChange={(event) => onChange({ ...value, pin: pinDigits(event.target.value) })}
              autoFocus
            />
          )}
        </Field>
      )}
    </div>
  );
}

function FormButtons({ pending, label, onCancel }: { pending: boolean; label: string; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="btn-secondary">
        Cancel
      </button>
      <button type="submit" disabled={pending} className="btn-primary">
        {pending && <Spinner />}
        {label}
      </button>
    </div>
  );
}

function CreateAccountDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (account: Account, pin: string) => void }) {
  const create = useCreateAccount();
  const [displayName, setDisplayName] = useState('');
  // The username follows the name until it is edited by hand.
  const [typedUsername, setTypedUsername] = useState<string | null>(null);
  const [pin, setPin] = useState<PinChoiceValue>({ mode: 'generate', pin: '' });
  const [submitted, setSubmitted] = useState(false);

  const username = typedUsername ?? suggestUsername(displayName);
  const usernameError = usernameProblem(username);
  const pinError = pin.mode === 'choose' ? pinProblem(pin.pin) : null;
  const taken = create.error instanceof ApiError && create.error.status === 409;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (usernameError || pinError) return;
    create.mutate(
      { username: username.trim().toLowerCase(), displayName: displayName.trim() || null, ...(pin.mode === 'choose' ? { pin: pin.pin } : {}) },
      { onSuccess: (result) => onCreated(result.user, result.pin) },
    );
  };

  return (
    <Dialog open onClose={onClose} title="New account" description="For someone to listen with. They can play everything but can't change the library.">
      <form onSubmit={submit} noValidate className="space-y-5">
        <Field label="Name" hint="What the app calls them. Optional.">
          {(props) => (
            <input {...props} className="input h-10" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={60} autoComplete="off" />
          )}
        </Field>
        <Field
          label="Username"
          hint="What they type to sign in"
          error={(taken && create.error?.message) || (submitted ? usernameError : null)}
        >
          {(props) => (
            <input
              {...props}
              className="input h-10 font-mono"
              value={username}
              onChange={(event) => {
                setTypedUsername(event.target.value.toLowerCase());
                if (create.error) create.reset();
              }}
              maxLength={32}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
            />
          )}
        </Field>
        <PinChoice value={pin} onChange={setPin} error={submitted ? pinError : null} />
        {create.error && !taken && (
          <p role="alert" className="text-sm text-danger">
            {create.error.message}
          </p>
        )}
        <FormButtons pending={create.isPending} label="Create account" onCancel={onClose} />
      </form>
    </Dialog>
  );
}

function ResetPinDialog({ account, onClose, onReset }: { account: Account; onClose: () => void; onReset: (account: Account, pin: string) => void }) {
  const reset = useResetPin();
  const [pin, setPin] = useState<PinChoiceValue>({ mode: 'generate', pin: '' });
  const [submitted, setSubmitted] = useState(false);
  const pinError = pin.mode === 'choose' ? pinProblem(pin.pin) : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (pinError) return;
    reset.mutate({ id: account.id, pin: pin.mode === 'choose' ? pin.pin : undefined }, { onSuccess: (result) => onReset(result.user, result.pin) });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Reset ${displayNameOf(account)}'s PIN?`}
      description={`Their current PIN stops working and they're signed out on every device.${account.locked ? ' This unlocks the account too.' : ''}`}
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <PinChoice value={pin} onChange={setPin} error={submitted ? pinError : null} />
        {reset.error && (
          <p role="alert" className="text-sm text-danger">
            {reset.error.message}
          </p>
        )}
        <FormButtons pending={reset.isPending} label="Reset PIN" onCancel={onClose} />
      </form>
    </Dialog>
  );
}

/** The new PIN, once. Read out as two groups of three. */
function PinDialog({ account, pin, created, onClose }: { account: Account; pin: string; created: boolean; onClose: () => void }) {
  const name = displayNameOf(account);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Username: ${account.username}\nPIN: ${pin}`);
      setCopied(true);
    } catch {
      toast("Couldn't copy. Select the PIN and copy it instead.", 'error');
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={created ? `${name} can sign in now` : `${name}'s new PIN`}
      description={
        created
          ? 'Pass these on. The PIN is shown only this once; you can reset it at any time.'
          : 'Their old PIN no longer works. The new one is shown only this once.'
      }
    >
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-6 gap-y-4 rounded-xl border border-edge bg-surface-2/40 px-5 py-4">
        <dt className="text-xs text-muted">Username</dt>
        <dd className="truncate font-mono text-lg">{account.username}</dd>
        <dt className="text-xs text-muted">PIN</dt>
        <dd aria-label={pin.split('').join(' ')} className="select-all font-mono text-[2.5rem] leading-none tracking-[0.18em] tabular-nums">
          {formatPin(pin)}
        </dd>
      </dl>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={() => void copy()} className="btn-secondary">
          {copied ? <Check weight="bold" className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy both'}
        </button>
        <button type="button" onClick={onClose} className="btn-primary">
          Done
        </button>
      </div>
    </Dialog>
  );
}

function RenameDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const update = useUpdateAccount();
  const [name, setName] = useState(account.displayName ?? '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    update.mutate({ id: account.id, patch: { displayName: name.trim() || null } }, { onSuccess: onClose });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Rename ${displayNameOf(account)}`}
      description={`Left empty, the app uses the username, @${account.username}. Signing in stays the same.`}
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <Field label="Name">
          {(props) => <input {...props} className="input h-10" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoComplete="off" />}
        </Field>
        <FormButtons pending={update.isPending} label="Save" onCancel={onClose} />
      </form>
    </Dialog>
  );
}

function ListeningDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const name = displayNameOf(account);
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${name}'s listening`}
      description={`${pluralize(account.favoriteCount, 'favorite')} · ${pluralize(account.playlistCount, 'playlist')}`}
      size="lg"
    >
      <ListeningReport accountId={account.id} compact empty={`${name} hasn't played anything in this period.`} />
      <div className="mt-7 flex justify-end">
        <button type="button" onClick={onClose} className="btn-secondary">
          Close
        </button>
      </div>
    </Dialog>
  );
}
