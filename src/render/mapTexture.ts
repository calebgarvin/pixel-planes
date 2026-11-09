/**
 * Generates the pixel-art world map once at startup.
 *
 * Real coastlines come from Natural Earth (via the `world-atlas` package,
 * public domain data). They are rasterized at 0.25° per pixel, then colored
 * by biome (ice, tundra, grass, forest, desert) with beaches and shallow
 * water around coasts, so it reads as crisp pixel art when scaled up.
 *
 * Output: an offscreen canvas MAP_W x MAP_H in an equirectangular projection.
 * To use painted art instead, load an image with the same projection and
 * return it from `getMapTexture()`; the renderer only needs a drawable.
 */
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { MultiPolygon, Polygon, Feature } from 'geojson';
import landTopo from 'world-atlas/land-110m.json';
import { AIRPORTS } from '../data/airports';

export const PX_PER_DEG = 4;
export const MAP_W = 360 * PX_PER_DEG;
export const MAP_H = 180 * PX_PER_DEG;

export function lonToX(lon: number): number {
  return (lon + 180) * PX_PER_DEG;
}
export function latToY(lat: number): number {
  return (90 - lat) * PX_PER_DEG;
}

// --- deterministic noise --------------------------------------------------
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function valueNoise(x: number, y: number, scale: number, seed: number): number {
  const gx = x / scale, gy = y / scale;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = gx - x0, fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, seed), b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed), d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// --- palette ----------------------------------------------------------------
const C = {
  deep: [38, 84, 128],
  ocean: [46, 98, 145],
  shallow: [70, 128, 172],
  foam: [128, 178, 210],
  grid: [56, 110, 156],
  sand: [233, 214, 160],
  grass: [126, 180, 98],
  grass2: [108, 163, 86],
  forest: [86, 140, 74],
  desert: [219, 186, 124],
  desert2: [205, 168, 108],
  tundra: [164, 182, 150],
  ice: [236, 243, 246],
  ice2: [214, 228, 236],
} as const;

function isDesert(lat: number, lon: number): boolean {
  if (lat > 14 && lat < 33 && lon > -16 && lon < 60) return true; // Sahara + Arabia
  if (lat > 24 && lat < 40 && lon >= 60 && lon < 72) return true; // Iran/Afghanistan
  if (lat > 36 && lat < 46 && lon > 75 && lon < 110) return true; // Gobi/Taklamakan
  if (lat < -19 && lat > -32 && lon > 118 && lon < 145) return true; // Outback
  if (lat > 28 && lat < 37 && lon > -117 && lon < -104) return true; // US Southwest
  if (lat < -18 && lat > -28 && lon > -71 && lon < -68) return true; // Atacama
  return false;
}

let cached: HTMLCanvasElement | null = null;

export function getMapTexture(): HTMLCanvasElement {
  if (cached) return cached;

  // 1. Rasterize real land polygons into a hard-edged mask.
  const land = rasterizeLand();

  // 2. Nudge the coastline with a little noise for a hand-drawn feel.
  // (Only flips pixels right at the edge, so geography stays accurate.)
  const edged = land.slice();
  for (let y = 1; y < MAP_H - 1; y++)
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      const r = land[y * MAP_W + ((x + 1) % MAP_W)], l = land[y * MAP_W + ((x - 1 + MAP_W) % MAP_W)];
      if ((r !== land[i] || l !== land[i] || land[i - MAP_W] !== land[i] || land[i + MAP_W] !== land[i]) && valueNoise(x, y, 3, 5) > 0.72) {
        edged[i] = land[i] ? 0 : 1;
      }
    }
  land.set(edged);

  // 3. Make sure every airport sits on land.
  for (const a of AIRPORTS) {
    const ax = Math.round(lonToX(a.lon)), ay = Math.round(latToY(a.lat));
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++)
        if (dx * dx + dy * dy <= 16) {
          const x = (ax + dx + MAP_W) % MAP_W, y = ay + dy;
          if (y >= 0 && y < MAP_H) land[y * MAP_W + x] = 1;
        }
  }

  // 4. Distance-to-coast (in px, capped) via BFS, for beaches & shallows.
  const MAXD = 8;
  const dist = new Uint8Array(MAP_W * MAP_H).fill(MAXD);
  let frontier: number[] = [];
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      const l = land[i];
      const nb = [
        land[y * MAP_W + ((x + 1) % MAP_W)],
        land[y * MAP_W + ((x - 1 + MAP_W) % MAP_W)],
        y > 0 ? land[i - MAP_W] : l,
        y < MAP_H - 1 ? land[i + MAP_W] : l,
      ];
      if (nb.some((n) => n !== l)) {
        dist[i] = 0;
        frontier.push(i);
      }
    }
  for (let d = 1; d < MAXD && frontier.length; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % MAP_W, y = (i / MAP_W) | 0;
      const ns = [y * MAP_W + ((x + 1) % MAP_W), y * MAP_W + ((x - 1 + MAP_W) % MAP_W), y > 0 ? i - MAP_W : -1, y < MAP_H - 1 ? i + MAP_W : -1];
      for (const j of ns) if (j >= 0 && land[j] === land[i] && dist[j] > d) {
        dist[j] = d;
        next.push(j);
      }
    }
    frontier = next;
  }

  // 5. Paint.
  const canvas = document.createElement('canvas');
  canvas.width = MAP_W;
  canvas.height = MAP_H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(MAP_W, MAP_H);
  const px = img.data;
  for (let y = 0; y < MAP_H; y++) {
    const lat = 90 - y / PX_PER_DEG;
    for (let x = 0; x < MAP_W; x++) {
      const lon = x / PX_PER_DEG - 180;
      const i = y * MAP_W + x;
      const d = dist[i];
      const n = valueNoise(x, y, 10, 7) * 0.7 + valueNoise(x, y, 3, 8) * 0.3;
      let c: readonly number[];
      if (land[i]) {
        const wob = (valueNoise(x, y, 12, 9) - 0.5) * 6; // wobble biome borders
        const blat = lat + wob;
        const polar = Math.abs(blat) > 70 || (lat > 60 && lon > -55 && lon < -20); // incl. Greenland
        if (polar) c = n > 0.6 ? C.ice2 : C.ice;
        else if (d === 0 && !(lat > 55)) c = C.sand;
        else if (blat > 61) c = C.tundra;
        else if (isDesert(lat + (valueNoise(x, y, 14, 3) - 0.5) * 5, lon + (valueNoise(x, y, 14, 4) - 0.5) * 7)) c = n > 0.6 ? C.desert2 : C.desert;
        else c = n > 0.66 ? C.forest : n > 0.4 ? C.grass2 : C.grass;
      } else {
        if (d === 0) c = C.foam;
        else if (d <= 3) c = C.shallow;
        else if (d <= 6) c = C.ocean;
        else c = C.deep;
        // Faint 15° graticule on open water, drawn as dotted pixels.
        const g = 15 * PX_PER_DEG;
        const onGrid = (x % g === 0 && y % 3 === 0) || (y % g === 0 && x % 3 === 0);
        if (onGrid && d > 3) c = C.grid;
        // Sparse wave glints.
        if (d > 5 && hash(x, y, 11) > 0.997) c = C.shallow;
      }
      px[i * 4] = c[0];
      px[i * 4 + 1] = c[1];
      px[i * 4 + 2] = c[2];
      px[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  cached = canvas;
  return canvas;
}

/** Fill Natural Earth land polygons onto a canvas and read back a 0/1 mask. */
function rasterizeLand(): Uint8Array {
  const c = document.createElement('canvas');
  c.width = MAP_W;
  c.height = MAP_H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const topo = landTopo as unknown as Topology<{ land: GeometryCollection }>;
  const geo = feature(topo, topo.objects.land) as unknown as { features: Feature<Polygon | MultiPolygon>[] };
  ctx.fillStyle = '#000';
  for (const f of geo.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const rings of polys) {
      const unwrapped = rings.map(unwrapRing);
      // Draw at -360°, 0° and +360° so shapes crossing the date line appear on both edges.
      for (const off of [-MAP_W, 0, MAP_W]) {
        ctx.beginPath();
        for (const ring of unwrapped) {
          ring.forEach(([lon, lat], i) => {
            const x = lonToX(lon) + off, y = latToY(lat);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.closePath();
        }
        ctx.fill('evenodd');
      }
    }
  }
  const data = ctx.getImageData(0, 0, MAP_W, MAP_H).data;
  const mask = new Uint8Array(MAP_W * MAP_H);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
  return mask;
}

/**
 * Make a ring's longitudes continuous (no ±180° jumps). A ring that wraps the
 * whole globe (Antarctica) is closed off along the nearest pole.
 */
function unwrapRing(ring: number[][]): [number, number][] {
  const out: [number, number][] = [];
  let prev = ring[0][0];
  let latSum = 0;
  for (const [lon, lat] of ring) {
    let d = lon - prev;
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
    prev += d;
    out.push([prev, lat]);
    latSum += lat;
  }
  const span = out[out.length - 1][0] - out[0][0];
  if (Math.abs(span) > 180) {
    const pole = latSum / out.length < 0 ? -90 : 90;
    out.push([out[out.length - 1][0], pole], [out[0][0], pole]);
  }
  return out;
}
