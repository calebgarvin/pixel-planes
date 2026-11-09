/**
 * Save / load to localStorage, with a version number and migration hook.
 */
import { AIRPORTS } from '../data/airports';
import { PLANE_TYPES_BY_ID } from '../data/planes';
import type { GameState } from '../core/types';

const SAVE_KEY = 'pixel-planes:save';
export const SAVE_VERSION = 1;

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (err) {
    // Private mode / storage full: the game still runs, it just won't persist.
    console.warn('Pixel Planes: could not save', err);
  }
}

export function loadGame(): GameState | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return migrate(JSON.parse(raw));
  } catch (err) {
    console.warn('Pixel Planes: save was unreadable, starting fresh', err);
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Upgrade older saves. Add a `if (s.version === N) { ...; s.version = N+1 }`
 * block for every schema change. Also reconciles catalog changes: airports
 * added to the catalog appear (locked), and removed plane types are dropped.
 */
function migrate(s: GameState): GameState {
  if (typeof s !== 'object' || !s || typeof s.version !== 'number') throw new Error('bad save');
  if (s.version > SAVE_VERSION) throw new Error('save is from a newer version');

  for (const a of AIRPORTS) {
    s.airports[a.code] ??= { code: a.code, unlocked: false, waiting: {}, spawnAcc: 0 };
  }
  s.planes = s.planes.filter((p) => PLANE_TYPES_BY_ID[p.typeId] && s.airports[p.location]);
  s.version = SAVE_VERSION;
  return s;
}
