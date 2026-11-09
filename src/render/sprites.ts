/**
 * Sprite registry.
 *
 * Placeholder sprites are drawn procedurally at low resolution, then
 * "pixelized" (alpha thresholded + 1px outline) so they look like crisp pixel
 * art when scaled up with smoothing off.
 *
 * To use real art, call `registerImageSprite('jet', '/sprites/jet.png')`
 * (facing right / east, centered) before the game starts. Every draw call
 * goes through `getSprite(key)`, so nothing else needs to change.
 */

export interface Sprite {
  image: CanvasImageSource;
  w: number;
  h: number;
}

const registry = new Map<string, Sprite>();

export function getSprite(key: string): Sprite | undefined {
  return registry.get(key);
}

export function registerImageSprite(key: string, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      registry.set(key, { image: img, w: img.width, h: img.height });
      resolve();
    };
    img.onerror = reject;
    img.src = url;
  });
}

const OUTLINE = '#2a2238';

/** Draw with vector shapes at tiny size, then snap to hard pixels and outline. */
function pixelize(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, outline = OUTLINE): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] >= 110) {
      d[i * 4 + 3] = 255;
      solid[i] = 1;
    } else d[i * 4 + 3] = 0;
  }
  const [or, og, ob] = hexToRgb(outline);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (solid[i]) continue;
      const near =
        (x > 0 && solid[i - 1]) || (x < w - 1 && solid[i + 1]) || (y > 0 && solid[i - w]) || (y < h - 1 && solid[i + w]);
      if (near) {
        d[i * 4] = or;
        d[i * 4 + 1] = og;
        d[i * 4 + 2] = ob;
        d[i * 4 + 3] = 255;
      }
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Solid dark silhouette of a sprite, used as a ground shadow. */
function silhouette(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = 'rgba(16, 24, 40, 0.35)';
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function poly(ctx: CanvasRenderingContext2D, pts: number[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fill();
}

// --- plane shapes (all face +x / east) -------------------------------------
type Shape = (ctx: CanvasRenderingContext2D, accent: string) => void;

const BODY = '#f7f3ea';
const WINDOW = '#7fb6e0';

const SHAPES: Record<string, { w: number; h: number; draw: Shape }> = {
  prop: {
    w: 18,
    h: 18,
    draw(ctx, accent) {
      ctx.fillStyle = accent;
      ctx.fillRect(8, 2, 3, 14); // wing
      ctx.fillRect(2, 6, 2, 6); // tail plane
      ctx.fillStyle = BODY;
      ctx.fillRect(2, 8, 12, 2); // fuselage
      poly(ctx, [14, 8, 16, 9, 14, 10]); // nose
      ctx.fillStyle = WINDOW;
      ctx.fillRect(12, 8, 2, 1);
      ctx.fillStyle = '#5b5568';
      ctx.fillRect(16, 6, 1, 6); // propeller
    },
  },
  jet: {
    w: 22,
    h: 22,
    draw(ctx, accent) {
      ctx.fillStyle = accent;
      poly(ctx, [9, 10, 13, 10, 8, 2, 6, 2]); // top wing (swept)
      poly(ctx, [9, 12, 13, 12, 8, 20, 6, 20]); // bottom wing
      poly(ctx, [2, 10, 5, 10, 2, 6]); // tail fins
      poly(ctx, [2, 12, 5, 12, 2, 16]);
      ctx.fillStyle = BODY;
      ctx.fillRect(2, 10, 15, 2);
      poly(ctx, [17, 10, 20, 11, 17, 12]);
      ctx.fillStyle = WINDOW;
      ctx.fillRect(16, 10, 2, 1);
    },
  },
  jumbo: {
    w: 28,
    h: 28,
    draw(ctx, accent) {
      ctx.fillStyle = accent;
      poly(ctx, [11, 12, 16, 12, 9, 2, 7, 2]);
      poly(ctx, [11, 15, 16, 15, 9, 25, 7, 25]);
      poly(ctx, [2, 12, 6, 12, 2, 7]);
      poly(ctx, [2, 15, 6, 15, 2, 20]);
      ctx.fillStyle = '#c9c3d4';
      ctx.fillRect(10, 6, 3, 2); // engines
      ctx.fillRect(12, 9, 3, 2);
      ctx.fillRect(12, 16, 3, 2);
      ctx.fillRect(10, 19, 3, 2);
      ctx.fillStyle = BODY;
      ctx.fillRect(2, 12, 20, 3);
      poly(ctx, [22, 12, 26, 13.5, 22, 15]);
      ctx.fillStyle = WINDOW;
      ctx.fillRect(20, 12, 3, 1);
    },
  },
};

/** Get (and lazily build) the sprite for a plane shape + livery color. */
export function getPlaneSprite(shape: string, accent: string): { body: Sprite; shadow: Sprite } {
  const key = `plane:${shape}:${accent}`;
  let body = registry.get(key);
  let shadow = registry.get(key + ':shadow');
  if (!body || !shadow) {
    const custom = registry.get(shape); // a registered image overrides the placeholder
    if (custom) {
      body = custom;
      shadow = custom;
    } else {
      const def = SHAPES[shape] ?? SHAPES.jet;
      const canvas = pixelize(def.w, def.h, (ctx) => def.draw(ctx, accent));
      body = { image: canvas, w: def.w, h: def.h };
      shadow = { image: silhouette(canvas), w: def.w, h: def.h };
    }
    registry.set(key, body);
    registry.set(key + ':shadow', shadow);
  }
  return { body, shadow };
}

/** Airport marker: a little pixel "pad" with a colored light. */
export function getAirportSprite(kind: 'home' | 'open' | 'locked', tier: number): Sprite {
  const key = `airport:${kind}:${tier}`;
  const existing = registry.get(key);
  if (existing) return existing;
  const size = 6 + tier * 2;
  const canvas = pixelize(size + 2, size + 2, (ctx) => {
    const base = kind === 'locked' ? '#8d8a99' : kind === 'home' ? '#f2c14e' : '#f7f3ea';
    const light = kind === 'locked' ? '#6c6979' : kind === 'home' ? '#e0663d' : '#3aa7a3';
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(size / 2 + 1, size / 2 + 1, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = light;
    const s = Math.max(2, Math.round(size / 3));
    ctx.fillRect(Math.round(size / 2 + 1 - s / 2), Math.round(size / 2 + 1 - s / 2), s, s);
  });
  const sprite = { image: canvas, w: canvas.width, h: canvas.height };
  registry.set(key, sprite);
  return sprite;
}

/** Soft pixel cloud for ambience. */
export function getCloudSprite(variant: number): Sprite {
  const key = `cloud:${variant}`;
  const existing = registry.get(key);
  if (existing) return existing;
  const w = 26 + (variant % 3) * 6, h = 12;
  const canvas = pixelize(
    w,
    h,
    (ctx) => {
      ctx.fillStyle = '#ffffff';
      const puffs = 3 + (variant % 3);
      for (let i = 0; i < puffs; i++) {
        const cx = 5 + (i * (w - 10)) / (puffs - 1);
        const r = 3 + ((i + variant) % 2) * 1.5;
        ctx.beginPath();
        ctx.arc(cx, h - 5 - ((i + variant) % 2), r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillRect(4, h - 5, w - 8, 3);
    },
    '#dfe9f1',
  );
  const sprite = { image: canvas, w, h };
  registry.set(key, sprite);
  return sprite;
}
