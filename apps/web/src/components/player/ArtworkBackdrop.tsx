import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../lib/motion';

/** Longest side of the canvas the scene is drawn on. Two smoothing steps and the stretch to fill the page blur it. */
const SCENE = 32;
/** Covers are shrunk once to this size first, so drawing them small each frame doesn't shimmer. */
const THUMB = 64;
const FADE_MS = 1400;

/** Copies of the cover, each turning and drifting at its own slow pace (turns per second). */
const COPIES = [
  { size: 1.55, x: 0.5, y: 0.5, orbit: 0, spin: 1 / 70, alpha: 1 },
  { size: 1.05, x: 0.28, y: 0.3, orbit: 0.14, spin: -1 / 48, alpha: 0.85 },
  { size: 0.95, x: 0.75, y: 0.72, orbit: 0.12, spin: 1 / 40, alpha: 0.85 },
  { size: 0.7, x: 0.62, y: 0.32, orbit: 0.16, spin: -1 / 30, alpha: 0.7 },
];

type Layer = { thumb: HTMLCanvasElement; shownAt: number };

const canvas = (width: number, height: number) => {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return element;
};

/** Halves the image until it is near THUMB: one big downscale would alias. */
function shrink(image: HTMLImageElement): HTMLCanvasElement {
  let source: CanvasImageSource = image;
  let size = Math.max(image.naturalWidth, image.naturalHeight);
  while (size / 2 >= THUMB) {
    size = Math.round(size / 2);
    const step = canvas(size, size);
    step.getContext('2d')!.drawImage(source, 0, 0, size, size);
    source = step;
  }
  const thumb = canvas(THUMB, THUMB);
  thumb.getContext('2d')!.drawImage(source, 0, 0, THUMB, THUMB);
  return thumb;
}

/**
 * The Apple Music background: the cover, blurred past recognition, slowly turning and drifting,
 * so the screen takes on the album's colours and feels alive. It moves only while music plays.
 *
 * It's drawn on a tiny canvas and stretched to fill the page, so the blur is free: no CSS filter
 * re-runs over the full screen on every frame. Loading the image without CORS is fine; the canvas
 * is only shown, never read.
 */
export function ArtworkBackdrop({ src, playing }: { src: string | null; playing: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const layers = useRef<Layer[]>([]);
  const playingRef = useRef(playing);
  const wake = useRef<() => void>(() => {});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const output = ref.current!;
    const outputContext = output.getContext('2d')!;
    const scene = canvas(1, 1);
    const sceneContext = scene.getContext('2d')!;
    const middle = canvas(1, 1);
    const middleContext = middle.getContext('2d')!;
    let frame = 0;
    let last = performance.now();
    // Seconds of motion so far: it only advances while playing, so pausing freezes the scene.
    let clock = Math.random() * 600;

    const resize = () => {
      const { width, height } = output.getBoundingClientRect();
      if (!width || !height) return;
      const [w, h] = width >= height ? [SCENE, Math.max(1, Math.round((SCENE * height) / width))] : [Math.max(1, Math.round((SCENE * width) / height)), SCENE];
      scene.width = w;
      scene.height = h;
      middle.width = w * 2;
      middle.height = h * 2;
      output.width = w * 4;
      output.height = h * 4;
      draw(performance.now());
    };

    const draw = (now: number) => {
      const { width: w, height: h } = scene;
      const longest = Math.max(w, h);
      sceneContext.clearRect(0, 0, w, h);
      for (const layer of layers.current) {
        const fade = prefersReducedMotion() ? 1 : Math.min(1, (now - layer.shownAt) / FADE_MS);
        for (const [index, copy] of COPIES.entries()) {
          const size = copy.size * longest;
          const drift = clock / 55 + index * 1.7;
          sceneContext.save();
          sceneContext.globalAlpha = copy.alpha * fade;
          sceneContext.translate(w * copy.x + Math.cos(drift) * copy.orbit * w, h * copy.y + Math.sin(drift * 1.3) * copy.orbit * h);
          sceneContext.rotate(clock * copy.spin * Math.PI * 2 + index);
          sceneContext.drawImage(layer.thumb, -size / 2, -size / 2, size, size);
          sceneContext.restore();
        }
      }
      middleContext.clearRect(0, 0, middle.width, middle.height);
      middleContext.drawImage(scene, 0, 0, middle.width, middle.height);
      outputContext.clearRect(0, 0, output.width, output.height);
      outputContext.drawImage(middle, 0, 0, output.width, output.height);
    };

    const tick = (now: number) => {
      const reduced = prefersReducedMotion();
      if (playingRef.current && !reduced) clock += Math.min(0.1, (now - last) / 1000);
      last = now;
      // Once the newest cover has faded in, the ones under it can go.
      const newest = layers.current[layers.current.length - 1];
      const fading = !!newest && !reduced && now - newest.shownAt < FADE_MS;
      if (newest && !fading && layers.current.length > 1) layers.current = [newest];
      draw(now);
      frame = (playingRef.current && !reduced) || fading ? requestAnimationFrame(tick) : 0;
    };

    wake.current = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(output);
    resize();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      wake.current = () => {};
    };
  }, []);

  useEffect(() => {
    playingRef.current = playing;
    wake.current();
  }, [playing]);

  useEffect(() => {
    // No cover, or one that won't load (an expired link): fade out to the plain tint underneath,
    // rather than leave the previous track's colours behind.
    const clear = () => {
      layers.current = [];
      setReady(false);
    };
    if (!src) return clear();
    let cancelled = false;
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
    image
      .decode()
      .then(() => {
        if (cancelled) return;
        layers.current = [...layers.current, { thumb: shrink(image), shownAt: performance.now() }];
        setReady(true);
        wake.current();
      })
      .catch(() => !cancelled && clear());
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div aria-hidden="true" className={`absolute inset-0 transition-opacity duration-1000 ease-out ${ready ? 'opacity-100' : 'opacity-0'}`}>
      <canvas ref={ref} className="absolute inset-0 h-full w-full saturate-[1.6]" />
      <div className="backdrop-veil absolute inset-0" />
    </div>
  );
}
