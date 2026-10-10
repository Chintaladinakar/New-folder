import { Link, useNavigate, type LinkProps } from 'react-router-dom';
import { navigateWithTransition } from '../../lib/viewTransition';

/** A link to the full player that grows the cover out of the mini player on the way there. */
export function NowPlayingLink({ onClick, ...props }: Omit<LinkProps, 'to'>) {
  const navigate = useNavigate();
  return (
    <Link
      {...props}
      to="/now-playing"
      onClick={(event) => {
        onClick?.(event);
        // New tabs and windows go the normal way.
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigateWithTransition(() => navigate('/now-playing'));
      }}
    />
  );
}
