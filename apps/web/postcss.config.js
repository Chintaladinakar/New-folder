import { fileURLToPath } from 'node:url';

export default {
  plugins: {
    // Point at the config explicitly: Tailwind otherwise looks in the current working directory,
    // and silently falls back to its defaults (no theme colours) when started from elsewhere.
    tailwindcss: { config: fileURLToPath(new URL('./tailwind.config.js', import.meta.url)) },
    autoprefixer: {},
  },
};
