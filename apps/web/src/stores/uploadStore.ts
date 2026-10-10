import { create } from 'zustand';
import { ApiError, api } from '../lib/api';
import { sha256Hex } from '../lib/browser';
import { isSupportedAudioFile } from '../lib/constants';
import { queryClient } from '../lib/queryClient';

export type UploadStatus = 'queued' | 'hashing' | 'uploading' | 'processing' | 'done' | 'duplicate' | 'failed' | 'cancelled';

export type UploadItem = {
  id: string;
  name: string;
  size: number;
  status: UploadStatus;
  progress: number;
  message?: string;
};

export const ACTIVE_STATUSES: UploadStatus[] = ['queued', 'hashing', 'uploading', 'processing'];

type UploadState = {
  items: UploadItem[];
  addFiles: (files: File[]) => void;
  cancel: (id: string) => void;
  retry: (id: string) => void;
  clearFinished: () => void;
};

// Files and requests stay outside the store: they aren't serialisable state.
const files = new Map<string, File>();
const requests = new Map<string, XMLHttpRequest>();
const cancelled = new Set<string>();
let running = false;
let nextId = 1;

class CancelledError extends Error {}

function update(id: string, patch: Partial<UploadItem>) {
  useUploadStore.setState((state) => ({
    items: state.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  }));
}

function checkCancelled(id: string) {
  if (cancelled.has(id)) throw new CancelledError();
}

function putFile(id: string, url: string, contentType: string, file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    requests.set(id, xhr);
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) update(id, { progress: Math.round((event.loaded / event.total) * 100) });
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage rejected the upload (HTTP ${xhr.status}). Check the bucket's CORS settings.`));
    xhr.onerror = () => reject(new Error('Network error while uploading. Check your connection and the bucket CORS settings.'));
    xhr.onabort = () => reject(new CancelledError());
    xhr.onloadend = () => requests.delete(id);
    xhr.send(file);
  });
}

async function uploadOne(id: string) {
  const file = files.get(id);
  if (!file) return;

  try {
    update(id, { status: 'hashing', progress: 0, message: undefined });
    // Hashing lets the server spot a duplicate before any bytes are uploaded.
    const contentHash = await sha256Hex(file).catch(() => undefined);
    checkCancelled(id);

    const target = await api.createUploadUrl({ fileName: file.name, fileSize: file.size, contentHash });
    checkCancelled(id);
    update(id, { status: 'uploading' });
    await putFile(id, target.uploadUrl, target.mimeType, file);

    update(id, { status: 'processing', progress: 100 });
    const track = await api.completeUpload({ fileName: file.name, storageKey: target.storageKey, contentHash });
    update(id, { status: 'done', message: track.title });
    files.delete(id);

    for (const key of ['tracks', 'albums', 'artists', 'stats', 'facets']) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  } catch (error) {
    if (error instanceof CancelledError || cancelled.has(id)) {
      update(id, { status: 'cancelled', message: undefined });
      files.delete(id);
    } else if (error instanceof ApiError && error.body?.code === 'duplicate') {
      update(id, { status: 'duplicate', message: error.message });
      files.delete(id);
    } else {
      update(id, { status: 'failed', message: (error as Error).message });
    }
  }
}

async function processQueue() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const next = useUploadStore.getState().items.find((item) => item.status === 'queued');
      if (!next) break;
      await uploadOne(next.id);
    }
  } finally {
    running = false;
  }
}

export const useUploadStore = create<UploadState>((set) => ({
  items: [],

  addFiles: (incoming) => {
    const added: UploadItem[] = incoming.map((file) => {
      const id = `upload-${nextId++}`;
      if (!isSupportedAudioFile(file.name)) {
        return { id, name: file.name, size: file.size, status: 'failed', progress: 0, message: 'Not a supported audio file' };
      }
      files.set(id, file);
      return { id, name: file.name, size: file.size, status: 'queued', progress: 0 };
    });
    set((state) => ({ items: [...state.items, ...added] }));
    void processQueue();
  },

  cancel: (id) => {
    cancelled.add(id);
    requests.get(id)?.abort();
    const item = useUploadStore.getState().items.find((entry) => entry.id === id);
    if (item?.status === 'queued') {
      update(id, { status: 'cancelled' });
      files.delete(id);
    }
  },

  retry: (id) => {
    if (!files.has(id)) return;
    cancelled.delete(id);
    update(id, { status: 'queued', progress: 0, message: undefined });
    void processQueue();
  },

  clearFinished: () => {
    set((state) => {
      const finished = state.items.filter((item) => !ACTIVE_STATUSES.includes(item.status));
      for (const item of finished) {
        files.delete(item.id);
        cancelled.delete(item.id);
      }
      return { items: state.items.filter((item) => ACTIVE_STATUSES.includes(item.status)) };
    });
  },
}));
