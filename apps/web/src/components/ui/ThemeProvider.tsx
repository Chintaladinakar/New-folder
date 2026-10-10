import { MotionConfig } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { resolveReducedMotion, resolveTheme, useSettingsStore } from '../../stores/settingsStore';

const THEME_COLORS: Record<string, string> = { dark: '#11100e', oled: '#000000', light: '#f4f1ea' };

/** Applies the appearance settings to <html> and tells Motion about reduced-motion. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSettingsStore((state) => state.theme);
  const accent = useSettingsStore((state) => state.accent);
  const motion = useSettingsStore((state) => state.motion);
  const density = useSettingsStore((state) => state.density);
  const [reduced, setReduced] = useState(() => resolveReducedMotion(motion));

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const resolved = resolveTheme(theme);
      root.dataset.theme = resolved;
      root.dataset.accent = accent;
      root.dataset.density = density;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[resolved]);
      const reduce = resolveReducedMotion(motion);
      root.dataset.reduceMotion = String(reduce);
      setReduced(reduce);
    };
    apply();

    // Follow the OS when a setting is "system".
    const queries = [window.matchMedia('(prefers-color-scheme: light)'), window.matchMedia('(prefers-reduced-motion: reduce)')];
    queries.forEach((query) => query.addEventListener('change', apply));
    return () => queries.forEach((query) => query.removeEventListener('change', apply));
  }, [theme, accent, motion, density]);

  return <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>{children}</MotionConfig>;
}
