import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

/**
 * Signs out. The admin is taken to /admin, the only place their sign-in is offered; anyone else
 * stays where they were, on the listeners' sign-in.
 */
export function useSignOut() {
  const navigate = useNavigate();
  return () => {
    const wasAdmin = useAuthStore.getState().user?.role === 'admin';
    useAuthStore.getState().signOut();
    if (wasAdmin) navigate('/admin', { replace: true });
  };
}
