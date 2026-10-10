import { prefersReducedMotion } from './motion';

let finish: (() => void) | null = null;

/**
 * Runs a route change as a view transition: the browser snapshots the page, the new route renders,
 * and elements sharing a view-transition-name (the cover, see index.css) move from their old place
 * to their new one while the rest cross-fades. Without the API, it's a plain navigation.
 */
export function navigateWithTransition(go: () => void) {
  if (!('startViewTransition' in document) || prefersReducedMotion()) return go();
  const transition = document.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        // The router renders asynchronously; MainLayout calls routeRendered() once it has. The timer
        // is a backstop, so a navigation that changes nothing can't leave the page frozen.
        const timer = window.setTimeout(done, 400);
        function done() {
          window.clearTimeout(timer);
          finish = null;
          resolve();
        }
        finish = done;
        go();
      }),
  );
  // A skipped transition (a second click mid-way) still navigates; it just rejects these.
  transition.ready.catch(() => {});
  transition.finished.catch(() => {});

  // The browser takes no input while the transition plays, so a tap would just be swallowed.
  // Instead it finishes the transition at once, and the page is ready for the next one.
  const skip = () => transition.skipTransition();
  document.addEventListener('pointerdown', skip, { capture: true, once: true });
  transition.finished.finally(() => document.removeEventListener('pointerdown', skip, { capture: true })).catch(() => {});
}

/** True while a transition waits for its route to render, so pages can skip their own entrance. */
export const isTransitioning = () => finish !== null;

/** Called by MainLayout after a new route has rendered: the browser can take the "after" snapshot. */
export function routeRendered() {
  finish?.();
}
