/**
 * Player actions. Every UI button goes through one of these functions, which
 * validate, mutate state, and return a friendly result message. Keeping them
 * here (not in UI code) means rules live in one place.
 */
import { getPlaneType } from '../data/planes';
import { airportDistance, sellValue, unlockCost } from './economy';
import { events } from './events';
import { addPlane, findPlane, planeBase } from './state';
import type { GameState } from './types';

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

const fail = (message: string): ActionResult => ({ ok: false, message });

export function unlockAirport(state: GameState, code: string): ActionResult {
  const ap = state.airports[code];
  if (!ap) return fail('Unknown airport.');
  if (ap.unlocked) return fail('Already unlocked.');
  const cost = unlockCost(state, code);
  if (state.cash < cost) return fail('Not enough cash yet. Your planes will get you there!');
  state.cash -= cost;
  ap.unlocked = true;
  ap.spawnAcc = 0;
  events.emit('airportUnlocked', { code });
  return { ok: true, message: `${code} is open for business!` };
}

export function buyPlane(state: GameState, typeId: string, airport: string): ActionResult {
  const type = getPlaneType(typeId);
  if (!state.airports[airport]?.unlocked) return fail('Planes can only be delivered to your airports.');
  if (state.cash < type.price) return fail('Not enough cash yet.');
  state.cash -= type.price;
  const plane = addPlane(state, typeId, airport);
  events.emit('planeBought', { planeId: plane.id });
  return { ok: true, message: `${plane.name} delivered to ${airport}.` };
}

/** Destinations a plane can be sent to from where it is (or is heading). */
export function reachableFrom(state: GameState, planeId: string): string[] {
  const plane = findPlane(state, planeId);
  if (!plane) return [];
  const base = planeBase(plane);
  const range = getPlaneType(plane.typeId).rangeKm;
  return Object.values(state.airports)
    .filter((a) => a.unlocked && a.code !== base && airportDistance(base, a.code) <= range)
    .map((a) => a.code);
}

/**
 * Send a plane flying. With loop=true it shuttles between its base and
 * `dest` forever; otherwise it makes one trip and parks. If the plane is
 * mid-flight the new orders start when it lands.
 */
export function assignRoute(state: GameState, planeId: string, dest: string, loop: boolean): ActionResult {
  const plane = findPlane(state, planeId);
  if (!plane) return fail('Unknown plane.');
  const base = planeBase(plane);
  if (dest === base) return fail('Pick a different airport.');
  if (!state.airports[dest]?.unlocked) return fail('Unlock that airport first.');
  const range = getPlaneType(plane.typeId).rangeKm;
  if (airportDistance(base, dest) > range) return fail('That is beyond this plane’s range.');

  if (loop) {
    plane.route = { stops: [base, dest], loop: true };
    plane.nextStopIndex = 1;
  } else {
    plane.route = { stops: [dest], loop: false };
    plane.nextStopIndex = 0;
  }
  return { ok: true, message: loop ? `${plane.name}: ${base} ⇄ ${dest}` : `${plane.name} heading to ${dest}` };
}

/** Clear orders. A flying plane finishes its leg, then parks. */
export function parkPlane(state: GameState, planeId: string): ActionResult {
  const plane = findPlane(state, planeId);
  if (!plane) return fail('Unknown plane.');
  plane.route = null;
  return { ok: true, message: plane.flight ? `${plane.name} will park after landing.` : `${plane.name} parked.` };
}

export function sellPlane(state: GameState, planeId: string): ActionResult {
  const plane = findPlane(state, planeId);
  if (!plane) return fail('Unknown plane.');
  if (plane.flight) return fail('Wait until it lands.');
  if (state.planes.length <= 1) return fail('Keep at least one plane.');
  const refund = sellValue(getPlaneType(plane.typeId));
  state.cash += refund;
  state.planes = state.planes.filter((p) => p.id !== planeId);
  return { ok: true, message: `Sold ${plane.name}.` };
}
