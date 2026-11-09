/**
 * Passenger generation and boarding.
 *
 * Passengers are stored as counts per (origin, destination) rather than as
 * individual objects, which keeps saves tiny and the simulation fast. They
 * never expire: no pressure, they'll wait for you.
 */
import { CONFIG } from '../config';
import { getAirport } from '../data/airports';
import type { GameState } from './types';
import { totalWaiting, unlockedCodes } from './state';

/** Pick a destination weighted by airport tier (bigger airports are more popular). */
function pickDestination(origin: string, candidates: string[]): string | null {
  let total = 0;
  for (const c of candidates) if (c !== origin) total += getAirport(c).tier;
  if (total === 0) return null;
  let r = Math.random() * total;
  for (const c of candidates) {
    if (c === origin) continue;
    r -= getAirport(c).tier;
    if (r <= 0) return c;
  }
  return null;
}

/** Spawn passengers at every unlocked airport for dtMs of elapsed time. */
export function generatePassengers(state: GameState, dtMs: number): void {
  const open = unlockedCodes(state);
  if (open.length < 2) return;
  for (const code of open) {
    const ap = state.airports[code];
    const tier = getAirport(code).tier;
    const cap = CONFIG.waitingCap[tier];
    ap.spawnAcc += (CONFIG.passengersPerMinute[tier] * dtMs) / 60_000;
    let waiting = totalWaiting(ap);
    while (ap.spawnAcc >= 1) {
      ap.spawnAcc -= 1;
      const dest = pickDestination(code, open);
      if (!dest) break;
      if (waiting >= cap) {
        // Terminal is full: refresh the mix instead of freezing it, so an
        // unserved destination can never crowd out the routes you do fly.
        const crowded = mostWaitingDestination(ap.waiting);
        if (!crowded || crowded === dest) continue;
        if (--ap.waiting[crowded] <= 0) delete ap.waiting[crowded];
      } else {
        waiting++;
      }
      ap.waiting[dest] = (ap.waiting[dest] ?? 0) + 1;
    }
  }
}

function mostWaitingDestination(waiting: Record<string, number>): string | null {
  let best: string | null = null;
  for (const k in waiting) if (best === null || waiting[k] > waiting[best]) best = k;
  return best;
}

/** Remove up to `max` passengers waiting at `from` for `to`; returns how many boarded. */
export function boardPassengers(state: GameState, from: string, to: string, max: number): number {
  const ap = state.airports[from];
  const n = Math.min(max, ap.waiting[to] ?? 0);
  if (n > 0) {
    ap.waiting[to] -= n;
    if (ap.waiting[to] <= 0) delete ap.waiting[to];
  }
  return n;
}
