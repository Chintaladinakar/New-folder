import { create } from 'zustand';

export type Toast = { id: number; message: string; tone: 'info' | 'error' };

type ToastState = { toasts: Toast[]; dismiss: (id: number) => void };

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

let nextId = 1;

export function toast(message: string, tone: Toast['tone'] = 'info') {
  const id = nextId++;
  useToastStore.setState((state) => ({ toasts: [...state.toasts.slice(-3), { id, message, tone }] }));
  setTimeout(() => useToastStore.getState().dismiss(id), tone === 'error' ? 6000 : 3500);
}
