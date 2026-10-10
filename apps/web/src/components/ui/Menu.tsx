import { Check, type Icon } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { popover } from '../../lib/motion';

export type MenuItem =
  | { label: string; icon?: Icon; onSelect: () => void; danger?: boolean; disabled?: boolean; checked?: boolean }
  | { separator: true }
  | { heading: string };

type MenuProps = {
  items: MenuItem[];
  label: string;
  className?: string;
  align?: 'right' | 'left';
  children: ReactNode;
};

type Position = { top?: number; bottom?: number; left?: number; right?: number; origin: string };

export function Menu({ items, label, className = '', align = 'right', children }: MenuProps) {
  const [position, setPosition] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const open = position !== null;

  /** Where the menu goes, from where its button is right now. */
  const measure = useCallback((): Position | null => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    // Open upwards near the bottom of the screen, where the player bar would cover it.
    const upwards = window.innerHeight - rect.bottom < 340;
    const horizontal =
      align === 'right' ? { right: Math.max(8, window.innerWidth - rect.right) } : { left: Math.max(8, rect.left) };
    const vertical = upwards ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 };
    // Scale from the trigger's corner, not the centre.
    const origin = `${upwards ? 'bottom' : 'top'} ${align}`;
    return { ...horizontal, ...vertical, origin };
  }, [align]);

  const openMenu = () => {
    const next = measure();
    if (next) setPosition(next);
  };

  useEffect(() => {
    if (!open) return;
    const menuItems = () => Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? []);
    menuItems()[0]?.focus();

    const close = () => setPosition(null);
    // Scrolling or resizing anywhere moves the button, so the menu follows it. Closing on every scroll
    // (the old behaviour) made a menu vanish when momentum scrolling settled, when the page nudged
    // itself, or whenever the synced lyrics scrolled to the next line.
    const reposition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
        close();
        return;
      }
      const next = measure();
      if (!next) return;
      setPosition((current) =>
        current && current.top === next.top && current.bottom === next.bottom && current.left === next.left && current.right === next.right && current.origin === next.origin
          ? current
          : next,
      );
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        triggerRef.current?.focus();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const list = menuItems();
        const current = list.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
        list[(next + list.length) % list.length]?.focus();
      } else if (event.key === 'Tab') {
        close();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, measure]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          if (open) setPosition(null);
          else openMenu();
        }}
        className={className}
      >
        {children}
      </button>
      {createPortal(
        <AnimatePresence>
          {position && (
            <motion.div
              ref={panelRef}
              variants={popover}
              initial="hidden"
              animate="visible"
              exit="exit"
              role="menu"
              aria-label={label}
              style={{
                position: 'fixed',
                top: position.top,
                bottom: position.bottom,
                left: position.left,
                right: position.right,
                transformOrigin: position.origin,
              }}
              className="z-menu min-w-[224px] max-w-[calc(100vw-16px)] rounded-xl border border-edge bg-surface p-1 shadow-float"
              // Portals bubble React events to the parent row; don't let a menu click also play the track.
              onClick={(event) => event.stopPropagation()}
            >
              {items.map((item, index) =>
                'separator' in item ? (
                  <div key={`separator-${index}`} className="mx-2 my-1 h-px bg-edge" role="separator" />
                ) : 'heading' in item ? (
                  <div key={`heading-${index}`} className="px-2.5 pb-1 pt-2 text-xs font-medium text-faint">
                    {item.heading}
                  </div>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                    aria-checked={item.checked}
                    disabled={item.disabled}
                    onClick={() => {
                      setPosition(null);
                      // The menu is about to disappear, taking focus with it. Hand focus back to the button
                      // that opened it first, so a dialog opened by this item knows where to return to.
                      triggerRef.current?.focus({ preventScroll: true });
                      item.onSelect();
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors focus:bg-surface-2 enabled:hover:bg-surface-2 disabled:opacity-40 ${
                      item.danger ? 'text-danger' : 'text-fg'
                    }`}
                  >
                    {item.icon && <item.icon className={`h-4 w-4 shrink-0 ${item.danger ? '' : 'text-muted'}`} />}
                    <span className="flex-1">{item.label}</span>
                    {item.checked && <Check weight="bold" className="h-3.5 w-3.5 shrink-0 text-accent" />}
                  </button>
                ),
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
