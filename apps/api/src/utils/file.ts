export function sanitizeFilename(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() ?? '' : '';
}

export function formatDuration(seconds: number | null): number {
  if (!seconds || Number.isNaN(seconds)) return 0;
  return Math.max(0, Math.round(seconds));
}
