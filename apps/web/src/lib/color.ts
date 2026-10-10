const cache = new Map<string, Promise<string | null>>();

/**
 * The average colour of an image as an "r g b" triplet, boosted so it works as a tint.
 * Needs the image host to allow cross-origin reads (B2 CORS); returns null when it can't.
 */
export function dominantColor(url: string): Promise<string | null> {
  let pending = cache.get(url);
  if (!pending) {
    pending = load(url).catch(() => null);
    cache.set(url, pending);
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  }
  return pending;
}

async function load(url: string): Promise<string | null> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  image.src = url;
  await image.decode();

  const size = 24;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, size, size);
  const { data } = context.getImageData(0, 0, size, size);

  // Weight saturated pixels more, so a dark cover with one bright colour tints that colour.
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [pr, pg, pb] = [data[i], data[i + 1], data[i + 2]];
    const max = Math.max(pr, pg, pb);
    const min = Math.min(pr, pg, pb);
    const weight = 1 + (max - min) / 64;
    r += pr * weight;
    g += pg * weight;
    b += pb * weight;
    total += weight;
  }
  if (total === 0) return null;

  const [hr, hg, hb] = [r / total, g / total, b / total];
  // Lift very dark averages so the tint is visible against the page background.
  const luminance = 0.2126 * hr + 0.7152 * hg + 0.0722 * hb;
  const lift = luminance < 60 ? 60 / Math.max(luminance, 1) : 1;
  const clamp = (value: number) => Math.round(Math.min(255, value * lift));
  return `${clamp(hr)} ${clamp(hg)} ${clamp(hb)}`;
}
