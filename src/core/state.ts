/** Creating a new game and small state helpers. */
import { CONFIG } from '../config';
import { AIRPORTS } from '../data/airports';
import { getPlaneType } from '../data/planes';
import { airportDistance } from './economy';
import type { AirportState, GameState, PlaneState } from './types';

export function createNewGame(homeCode: string, now = Date.now()): GameState {
  const airports: Record<string, AirportState> = {};
  for (const a of AIRPORTS) {
    airports[a.code] = { code: a.code, unlocked: false, waiting: {}, spawnAcc: 0 };
  }

  // Home plus its nearest neighbors that the starter plane can reach.
  const starterRange = getPlaneType(CONFIG.startingPlane).rangeKm;
  const neighbors = AIRPORTS.filter((a) => a.code !== homeCode)
    .map((a) => ({ code: a.code, d: airportDistance(homeCode, a.code) }))
    .filter((n) => n.d <= starterRange)
    .sort((x, y) => x.d - y.d)
    .slice(0, CONFIG.freeNeighborAirports);
  airports[homeCode].unlocked = true;
  for (const n of neighbors) airports[n.code].unlocked = true;

  const state: GameState = {
    version: 1,
    createdAt: now,
    time: now,
    cash: CONFIG.startingCash,
    homeAirport: homeCode,
    airports,
    planes: [],
    nextPlaneNumber: 101,
    stats: { totalEarned: 0, flightsCompleted: 0, passengersDelivered: 0, passiveEarned: 0 },
    flightLog: [],
    passiveAcc: 0,
  };

  addPlane(state, CONFIG.startingPlane, homeCode);
  // Seed a few passengers so the very first flight has someone to carry.
  for (const code of [homeCode, ...neighbors.map((n) => n.code)]) {
    const others = [homeCode, ...neighbors.map((n) => n.code)].filter((c) => c !== code);
    for (const dest of others) airports[code].waiting[dest] = 3;
  }
  return state;
}

/** Creates a plane at an airport and returns it. Does not charge money. */
export function addPlane(state: GameState, typeId: string, location: string): PlaneState {
  const type = getPlaneType(typeId);
  const plane: PlaneState = {
    id: `p${state.nextPlaneNumber}`,
    typeId,
    name: `${type.name} PP-${state.nextPlaneNumber}`,
    location,
    flight: null,
    route: null,
    nextStopIndex: 0,
    lifetimeEarnings: 0,
    lifetimeFlights: 0,
  };
  state.nextPlaneNumber++;
  state.planes.push(plane);
  return plane;
}

export function unlockedCodes(state: GameState): string[] {
  return Object.values(state.airports)
    .filter((a) => a.unlocked)
    .map((a) => a.code);
}

export function totalWaiting(a: AirportState): number {
  let n = 0;
  for (const k in a.waiting) n += a.waiting[k];
  return n;
}

export function findPlane(state: GameState, id: string): PlaneState | undefined {
  return state.planes.find((p) => p.id === id);
}

/** Where a plane is, or will be once its current leg lands. */
export function planeBase(plane: PlaneState): string {
  return plane.flight ? plane.flight.to : plane.location;
}
