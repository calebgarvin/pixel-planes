/**
 * Pure economy formulas. No state mutation here, so it's easy to tweak and test.
 */
import { CONFIG } from '../config';
import { getAirport } from '../data/airports';
import { PlaneTypeDef } from '../data/planes';
import { distanceKm } from './geo';
import type { GameState } from './types';

const distCache = new Map<string, number>();

/** Distance between two airports in km (memoized). */
export function airportDistance(a: string, b: string): number {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  let d = distCache.get(key);
  if (d === undefined) {
    d = distanceKm(getAirport(a), getAirport(b));
    distCache.set(key, d);
  }
  return d;
}

/** Ticket price for one passenger over a given distance. */
export function farePerPassenger(km: number): number {
  return CONFIG.fareBase + CONFIG.farePerKm * km;
}

/** Real-time flight duration in ms. */
export function flightDurationMs(km: number, speedKmh: number): number {
  const gameHours = km / speedKmh;
  const seconds = Math.max(CONFIG.minFlightSeconds, gameHours * CONFIG.realSecondsPerGameHour);
  return Math.round(seconds * 1000);
}

export interface LegPayout {
  fares: number;
  mail: number;
  fuel: number;
  net: number;
}

/**
 * What a completed leg pays. Empty seats carry mail so a plane always
 * makes money, even on a quiet route.
 */
export function legPayout(km: number, passengers: number, type: PlaneTypeDef): LegPayout {
  const fare = farePerPassenger(km);
  const fares = fare * passengers;
  const mail = fare * CONFIG.mailShareOfFare * (type.capacity - passengers);
  const fuel = km * type.capacity * CONFIG.fuelPerKmPerSeat;
  const net = Math.max(0, Math.round(fares + mail - fuel));
  return { fares: Math.round(fares), mail: Math.round(mail), fuel: Math.round(fuel), net };
}

export function unlockedCount(state: GameState): number {
  return Object.values(state.airports).filter((a) => a.unlocked).length;
}

/** Price to unlock an airport; grows gently with network size. */
export function unlockCost(state: GameState, code: string): number {
  const tier = getAirport(code).tier;
  const extra = Math.max(0, unlockedCount(state) - (1 + CONFIG.freeNeighborAirports));
  const raw = CONFIG.unlockBaseCost[tier] * (1 + CONFIG.unlockCostGrowth * extra);
  return Math.round(raw / 500) * 500;
}

export function sellValue(type: PlaneTypeDef): number {
  return Math.round(type.price * CONFIG.sellRefund);
}

/** Passive income per real minute from terminal fees. */
export function passiveIncomePerMinute(state: GameState): number {
  return unlockedCount(state) * CONFIG.passiveIncomePerAirportPerMinute;
}

/** Approximate current income per minute: last 10 minutes of flights plus terminal fees. */
export function incomePerMinute(state: GameState): number {
  const windowMs = 10 * 60_000;
  const since = Math.max(state.createdAt, state.time - windowMs);
  const minutes = Math.max(1, (state.time - since) / 60_000);
  let sum = 0;
  for (const f of state.flightLog) if (f.at >= since) sum += f.net;
  return sum / minutes + passiveIncomePerMinute(state);
}
