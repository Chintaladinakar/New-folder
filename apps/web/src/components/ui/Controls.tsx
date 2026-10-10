import { motion } from 'motion/react';
import { useId, type ReactNode } from 'react';
import { spring } from '../../lib/motion';

type Option<T extends string> = { value: T; label: ReactNode };

/** A row of options; the ink highlight slides between them. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  label: string;
}) {
  const id = useId();
  return (
    <div role="group" aria-label={label} className="segmented">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button key={option.value} type="button" aria-pressed={active} onClick={() => onChange(option.value)}>
            {active && <motion.span layoutId={`segmented-${id}`} transition={spring} className="absolute inset-0 rounded-md bg-fg" />}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base ${
        checked ? 'bg-accent' : 'bg-surface-3'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm shadow-shade/40 transition-transform duration-200 ease-out ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export function SettingRow({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-fg">{title}</div>
        {description && <p className="mt-0.5 max-w-md text-[13px] leading-snug text-muted">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}
