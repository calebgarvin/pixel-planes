/**
 * 2D camera over the world map. World units are map pixels (MAP_W x MAP_H).
 * The map wraps east-west, so camera.x is kept in [0, MAP_W).
 */
import { MAP_H, MAP_W } from './mapTexture';

export class Camera {
  x = MAP_W / 2;
  y = MAP_H / 2;
  zoom = 2;
  viewW = 1;
  viewH = 1;

  get minZoom(): number {
    // Show ~150° of latitude at most; never smaller than the screen width allows.
    return Math.max(this.viewH / (MAP_H * 0.83), this.viewW / (MAP_W * 1.2));
  }
  readonly maxZoom = 4.5;

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.setZoom(this.zoom);
  }

  setZoom(z: number, anchorSX = this.viewW / 2, anchorSY = this.viewH / 2): void {
    const before = this.screenToWorld(anchorSX, anchorSY);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, z));
    const after = this.screenToWorld(anchorSX, anchorSY);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  panBy(dsx: number, dsy: number): void {
    this.x -= dsx / this.zoom;
    this.y -= dsy / this.zoom;
    this.clamp();
  }

  centerOn(wx: number, wy: number): void {
    this.x = wx;
    this.y = wy;
    this.clamp();
  }

  clamp(): void {
    this.x = ((this.x % MAP_W) + MAP_W) % MAP_W;
    const halfH = this.viewH / 2 / this.zoom;
    const top = MAP_H * 0.06, bottom = MAP_H * 0.9; // hide the empty poles a bit
    if (bottom - top <= halfH * 2) this.y = (top + bottom) / 2;
    else this.y = Math.min(bottom - halfH, Math.max(top + halfH, this.y));
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: (wx - this.x) * this.zoom + this.viewW / 2, y: (wy - this.y) * this.zoom + this.viewH / 2 };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.viewW / 2) / this.zoom + this.x, y: (sy - this.viewH / 2) / this.zoom + this.y };
  }

  /** World x offsets (multiples of MAP_W) at which content at wx is visible. */
  copiesFor(wx: number, margin = 60): number[] {
    return this.copiesForRange(wx, wx, margin);
  }

  /** Same as copiesFor, for something spanning world x from minX to maxX. */
  copiesForRange(minX: number, maxX: number, margin = 60): number[] {
    const out: number[] = [];
    const leftW = this.x - (this.viewW / 2 + margin) / this.zoom;
    const rightW = this.x + (this.viewW / 2 + margin) / this.zoom;
    const kMin = Math.ceil((leftW - maxX) / MAP_W);
    const kMax = Math.floor((rightW - minX) / MAP_W);
    for (let k = kMin; k <= kMax; k++) out.push(k * MAP_W);
    return out;
  }
}
