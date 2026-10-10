import { useEffect } from 'react';
import { APP_NAME, APP_SHORT_NAME } from '../lib/constants';

/**
 * Puts the current page's name in the browser tab and the history list, e.g. "Songs · Sangeetham".
 * Screen readers announce it on navigation, and it is how you tell your tabs apart.
 */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_SHORT_NAME}` : APP_NAME;
  }, [title]);
}
