/**
 * Canvas renderer. Reads game state each frame and draws the world:
 * map -> clouds -> routes -> airports -> planes -> floating text.
 *
 * The renderer never mutates game state. Input handling (pan/zoom/click)
 * lives here too because it needs the camera for hit-testing.
 */
import { AIRPORTS, getAirport } from '../data/airports';
import { getPlaneType } from '../data/planes';
import { events } from '../core/events';
import { greatCirclePath, greatCirclePoint, wrapLonDelta, LatLon } from '../core/geo';
import { totalWaiting } from '../core/state';
import type { GameState, PlaneState } from '../core/types';
import { ui } from '../ui/uiState';
import { Camera } from './camera';
import { getMapTexture, latToY, lonToX, MAP_H, MAP_W } from './mapTexture';
import { getAirportSprite, getCloudSprite, getPlaneSprite, Sprite } from './sprites';

const FONT = '"Nunito", system-ui, sans-serif';

export type Hit = { kind: 'airport'; code: string } | { kind: 'plane'; id: string } | null;

interface FloatText {
  text: string;
  wx: number;
  wy: number;
  born: number;
}

interface Cloud {
  wx: number;
  wy: number;
  variant: number;
  speed: number; // world px per second
}

export class Renderer {
  readonly camera = new Camera();
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private floats: FloatText[] = [];
  private clouds: Cloud[] = [];
  private pathCache = new Map<string, LatLon[]>();
  /** Screen positions from the last frame, used for click hit-testing. */
  private hitTargets: { hit: Exclude<Hit, null>; x: number; y: number; r: number }[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    for (let i = 0; i < 14; i++) {
      this.clouds.push({
        wx: Math.random() * MAP_W,
        wy: MAP_H * 0.12 + Math.random() * MAP_H * 0.7,
        variant: i,
        speed: 1.2 + Math.random() * 1.6,
      });
    }
    events.on('flightLanded', (e) => {
      const a = getAirport(e.to);
      this.floats.push({ text: `+$${e.net.toLocaleString()}`, wx: lonToX(a.lon), wy: latToY(a.lat), born: performance.now() });
    });
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.camera.resize(w, h);
  }

  /** Center the camera on an airport, nudged left so the side panel doesn't cover it. */
  focusAirport(code: string, zoom?: number): void {
    const a = getAirport(code);
    if (zoom) this.camera.zoom = zoom;
    this.camera.setZoom(this.camera.zoom);
    const panel = document.getElementById('panel');
    const covered = panel && this.camera.viewW > 760 ? panel.offsetWidth + 12 : 0;
    this.camera.centerOn(lonToX(a.lon) + covered / 2 / this.camera.zoom, latToY(a.lat));
  }

  /** Scale used for sprites and pixel UI; grows a bit as you zoom in. */
  private get px(): number {
    return this.camera.zoom >= 3.5 ? 3 : 2;
  }

  draw(state: GameState, now: number): void {
    const { ctx, camera: cam } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#26547f';
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);
    this.hitTargets = [];

    // Map (repeated for east-west wrap).
    const map = getMapTexture();
    for (const off of cam.copiesForRange(0, MAP_W, 0)) {
      const p = cam.worldToScreen(off, 0);
      ctx.drawImage(map, Math.round(p.x), Math.round(p.y), Math.ceil(MAP_W * cam.zoom) + 1, Math.ceil(MAP_H * cam.zoom));
    }

    this.drawClouds(now);
    this.drawRoutes(state, now);
    this.drawAirports(state);
    this.drawPlanes(state, now);
    this.drawFloats();
  }

  // --- clouds ---------------------------------------------------------------
  private drawClouds(now: number): void {
    const { ctx, camera: cam } = this;
    ctx.globalAlpha = 0.55;
    const s = this.px;
    for (const c of this.clouds) {
      const wx = (c.wx + (now / 1000) * c.speed) % MAP_W;
      const sprite = getCloudSprite(c.variant);
      for (const off of cam.copiesFor(wx)) {
        const p = cam.worldToScreen(wx + off, c.wy);
        ctx.drawImage(sprite.image, Math.round(p.x), Math.round(p.y), sprite.w * s, sprite.h * s);
      }
    }
    ctx.globalAlpha = 1;
  }

  // --- routes ---------------------------------------------------------------
  private path(from: string, to: string): LatLon[] {
    const key = `${from}>${to}`;
    let p = this.pathCache.get(key);
    if (!p) {
      p = greatCirclePath(getAirport(from), getAirport(to));
      this.pathCache.set(key, p);
    }
    return p;
  }

  /** Dotted pixel line along a lat/lon path, optionally only part of it. */
  private dottedPath(pts: LatLon[], color: string, size: number, gap: number, t0 = 0, t1 = 1): void {
    const { ctx, camera: cam } = this;
    const wpts = pts.map((p) => ({ x: lonToX(p.lon), y: latToY(p.lat) }));
    let minX = Infinity, maxX = -Infinity;
    for (const p of wpts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
    }
    ctx.fillStyle = color;
    const n = wpts.length - 1;
    for (const off of cam.copiesForRange(minX, maxX, 20)) {
      const spts = wpts.map((p) => cam.worldToScreen(p.x + off, p.y));
      let carry = 0;
      for (let i = 0; i < n; i++) {
        const segT0 = i / n, segT1 = (i + 1) / n;
        if (segT1 < t0 || segT0 > t1) continue;
        const a = spts[i], b = spts[i + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        for (let d = carry; d < len; d += gap) {
          const t = segT0 + (d / len) * (segT1 - segT0);
          if (t < t0 || t > t1) continue;
          const x = a.x + ((b.x - a.x) * d) / len, y = a.y + ((b.y - a.y) * d) / len;
          ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
        }
        carry = (carry - len) % gap;
        if (carry < 0) carry += gap;
      }
    }
  }

  private drawRoutes(state: GameState, now: number): void {
    const drawn = new Set<string>();
    const s = this.px;
    // Standing routes: faint.
    for (const plane of state.planes) {
      if (!plane.route || !plane.route.loop) continue;
      const stops = plane.route.stops;
      const selected = ui.selectedPlane === plane.id;
      for (let i = 0; i < stops.length; i++) {
        const a = stops[i], b = stops[(i + 1) % stops.length];
        if (a === b) continue;
        const key = a < b ? `${a}${b}` : `${b}${a}`;
        if (drawn.has(key) && !selected) continue;
        drawn.add(key);
        this.dottedPath(this.path(a, b), selected ? 'rgba(255, 236, 170, 0.9)' : 'rgba(255, 255, 255, 0.28)', s, s * 3.5);
      }
    }
    // Active legs: remaining part brighter.
    for (const plane of state.planes) {
      const f = plane.flight;
      if (!f) continue;
      const t = Math.max(0, Math.min(1, (now - f.departAt) / (f.arriveAt - f.departAt)));
      const color = getPlaneType(plane.typeId).color;
      this.dottedPath(this.path(f.from, f.to), color, s, s * 3, t, 1);
    }
  }

  // --- airports -------------------------------------------------------------
  private drawAirports(state: GameState): void {
    const { ctx, camera: cam } = this;
    const s = this.px;
    const showLockedLabels = cam.zoom >= 1.6;
    const order = [...AIRPORTS].sort((a, b) => Number(state.airports[a.code].unlocked) - Number(state.airports[b.code].unlocked));
    for (const def of order) {
      const ap = state.airports[def.code];
      const kind = def.code === state.homeAirport ? 'home' : ap.unlocked ? 'open' : 'locked';
      const sprite = getAirportSprite(kind, def.tier);
      const wx = lonToX(def.lon), wy = latToY(def.lat);
      const scale = ap.unlocked ? 2 : 1;
      for (const off of cam.copiesFor(wx)) {
        const p = cam.worldToScreen(wx + off, wy);
        const w = sprite.w * scale, h = sprite.h * scale;
        ctx.globalAlpha = ap.unlocked ? 1 : 0.8;
        ctx.drawImage(sprite.image, Math.round(p.x - w / 2), Math.round(p.y - h / 2), w, h);
        ctx.globalAlpha = 1;

        if (ui.selectedAirport === def.code) this.selectionRing(p.x, p.y, w / 2 + 4 * s);
        this.hitTargets.push({ hit: { kind: 'airport', code: def.code }, x: p.x, y: p.y, r: Math.max(12, w / 2 + 4) });

        if (ap.unlocked || showLockedLabels || ui.selectedAirport === def.code) {
          this.label(def.code, p.x, p.y + h / 2 + 3, ap.unlocked ? '#fffaf0' : '#d8d4e2', ap.unlocked ? 12 : 10);
        }
        if (ap.unlocked) {
          const n = totalWaiting(ap);
          if (n > 0) this.badge(String(n), p.x + w / 2 + 1, p.y - h / 2 - 2);
        }
      }
    }
  }

  private label(text: string, x: number, y: number, color: string, size: number): void {
    const { ctx } = this;
    ctx.font = `800 ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(30, 26, 46, 0.85)';
    ctx.lineJoin = 'round';
    ctx.strokeText(text, Math.round(x), Math.round(y));
    ctx.fillStyle = color;
    ctx.fillText(text, Math.round(x), Math.round(y));
  }

  /** Small passenger-count pill. */
  private badge(text: string, x: number, y: number): void {
    const { ctx } = this;
    ctx.font = `800 10px ${FONT}`;
    const w = Math.ceil(ctx.measureText(text).width) + 8, h = 13;
    const bx = Math.round(x - 2), by = Math.round(y - h / 2);
    ctx.fillStyle = '#2a2238';
    ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
    ctx.fillStyle = '#ffd36b';
    ctx.fillRect(bx, by, w, h);
    ctx.fillStyle = '#2a2238';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + 4, by + h / 2 + 1);
  }

  private selectionRing(x: number, y: number, r: number): void {
    const { ctx } = this;
    const t = performance.now() / 300;
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -t * 4;
    ctx.beginPath();
    ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // --- planes ---------------------------------------------------------------
  /** Where a plane is drawn right now (world px) and which way it faces. */
  private planePose(plane: PlaneState, now: number): { wx: number; wy: number; heading: number; airborne: boolean } {
    const f = plane.flight;
    if (!f || now < f.departAt) {
      const a = getAirport(plane.location);
      return { wx: lonToX(a.lon), wy: latToY(a.lat), heading: -Math.PI / 4, airborne: false };
    }
    const a = getAirport(f.from), b = getAirport(f.to);
    const t = Math.max(0, Math.min(1, (now - f.departAt) / (f.arriveAt - f.departAt)));
    const p = greatCirclePoint(a, b, t);
    const q = greatCirclePoint(a, b, Math.min(1, t + 0.01));
    const p2 = t >= 0.99 ? greatCirclePoint(a, b, 0.98) : p;
    const dx = t >= 0.99 ? wrapLonDelta(p.lon - p2.lon) : wrapLonDelta(q.lon - p.lon);
    const dy = t >= 0.99 ? -(p.lat - p2.lat) : -(q.lat - p.lat);
    return { wx: lonToX(p.lon), wy: latToY(p.lat), heading: Math.atan2(dy, dx), airborne: true };
  }

  private drawPlanes(state: GameState, now: number): void {
    const { camera: cam } = this;
    const s = this.px;
    const parkedIndex = new Map<string, number>();
    // Draw grounded planes first so airborne ones sit on top.
    const sorted = [...state.planes].sort((a, b) => Number(!!a.flight && now >= a.flight.departAt) - Number(!!b.flight && now >= b.flight.departAt));
    for (const plane of sorted) {
      const type = getPlaneType(plane.typeId);
      const { body, shadow } = getPlaneSprite(type.sprite, type.color);
      const pose = this.planePose(plane, now);
      let ox = 0, oy = 0;
      if (!pose.airborne) {
        // Fan grounded planes out beside their airport.
        const i = parkedIndex.get(plane.location) ?? 0;
        parkedIndex.set(plane.location, i + 1);
        ox = (10 + i * 9) * (s / 2) + 4;
        oy = (8 + (i % 2) * 4) * (s / 2);
      }
      for (const off of cam.copiesFor(pose.wx)) {
        const p = cam.worldToScreen(pose.wx + off, pose.wy);
        const x = p.x + ox, y = p.y + oy;
        const gs = pose.airborne ? s : Math.max(1, s - 1);
        if (pose.airborne) this.blitRotated(shadow, x + 5 * s, y + 6 * s, pose.heading, gs);
        this.blitRotated(body, x, y, pose.heading, gs);
        if (ui.selectedPlane === plane.id) this.selectionRing(x, y, (body.w * gs) / 2 + 3);
        this.hitTargets.push({ hit: { kind: 'plane', id: plane.id }, x, y, r: Math.max(12, (body.w * gs) / 2) });
      }
    }
  }

  private blitRotated(sprite: Sprite, x: number, y: number, angle: number, scale: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(angle);
    ctx.drawImage(sprite.image, (-sprite.w * scale) / 2, (-sprite.h * scale) / 2, sprite.w * scale, sprite.h * scale);
    ctx.restore();
  }

  // --- floating "+$" text ----------------------------------------------------
  private drawFloats(): void {
    const { ctx, camera: cam } = this;
    const now = performance.now();
    const LIFE = 1800;
    this.floats = this.floats.filter((f) => now - f.born < LIFE);
    for (const f of this.floats) {
      const t = (now - f.born) / LIFE;
      ctx.globalAlpha = 1 - t * t;
      for (const off of cam.copiesFor(f.wx)) {
        const p = cam.worldToScreen(f.wx + off, f.wy);
        this.label(f.text, p.x, p.y - 26 - t * 26, '#ffe27a', 14);
      }
    }
    ctx.globalAlpha = 1;
  }

  // --- input ----------------------------------------------------------------
  hitTest(sx: number, sy: number): Hit {
    let best: Hit = null;
    let bestD = Infinity;
    // Later targets are drawn on top (planes after airports), so prefer them on ties.
    for (let i = this.hitTargets.length - 1; i >= 0; i--) {
      const t = this.hitTargets[i];
      const d = Math.hypot(t.x - sx, t.y - sy);
      const bias = t.hit.kind === 'plane' ? 0.8 : 1; // planes are small; be generous
      if (d <= t.r && d * bias < bestD) {
        best = t.hit;
        bestD = d * bias;
      }
    }
    return best;
  }

  /** Wire up drag-to-pan, wheel/pinch zoom and click selection. */
  attachInput(onHit: (hit: Hit) => void): void {
    const el = this.canvas;
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinchDist = 0;

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      moved = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    el.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        const hit = this.hitTest(e.offsetX, e.offsetY);
        el.style.cursor = hit ? 'pointer' : 'grab';
        return;
      }
      const cur = { x: e.offsetX, y: e.offsetY };
      pointers.set(e.pointerId, cur);
      if (pointers.size === 1) {
        this.camera.panBy(cur.x - prev.x, cur.y - prev.y);
        moved += Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
        el.style.cursor = 'grabbing';
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) this.camera.setZoom(this.camera.zoom * (d / pinchDist), (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinchDist = d;
        moved += 100;
      }
    });
    const end = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size === 0 && moved < 6) onHit(this.hitTest(e.offsetX, e.offsetY));
      el.style.cursor = 'grab';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.camera.setZoom(this.camera.zoom * Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY);
      },
      { passive: false },
    );
  }
}
