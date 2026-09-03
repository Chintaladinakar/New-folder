export type Track = {
  id: string;
  title: string;
  artist: string | null;
  album: string | null;
  fileName: string;
  mimeType: string;
  storageKey: string;
  duration: number | null;
  artworkUrl: string | null;
};
