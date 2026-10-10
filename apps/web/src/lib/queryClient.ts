import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The default ('online') quietly pauses a request while the browser thinks it is offline: a list then
      // shows its loading placeholder forever. 'always' tries anyway, fails fast, and shows the error and a retry.
      networkMode: 'always',
      staleTime: 30_000,
      // Client errors (401, 404, validation) won't fix themselves on retry.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2,
    },
    // Same for actions: a click while offline must say so now, not silently fire whenever the network returns.
    mutations: { retry: false, networkMode: 'always' },
  },
});
