/**
 * Plane movement. Each plane is a small state machine:
 *
 *   parked (no route)  --assign route-->  boarding -> flying -> landed -> (next leg | parked)
 *
 * Flights are timestamp-based (departAt / arriveAt), so a plane's position
 * at any moment is derived from the clock. That is what makes offline
 * progress exact: we just replay landings in order.
 */
import { CONFIG } from '../config';
import { getPlaneType } from '../data/planes';
import { airportDistance, flightDurationMs, legPayout } from './economy';
import { events } from './events';
import { boardPassengers } from './passengers';
import type { GameState, PlaneState } from './types';

export interface SimSummary {
  earned: number;
  flights: number;
  passengers: number;
  passive: number;
}

export function emptySummary(): SimSummary {
  return { earned: 0, flights: 0, passengers: 0, passive: 0 };
}

/** Board passengers at the plane's location and start a leg to `to` at time `at`. */
export function startLeg(state: GameState, plane: PlaneState, to: string, at: number): void {
  const type = getPlaneType(plane.typeId);
  const from = plane.location;
  const km = airportDistance(from, to);
  const passengers = boardPassengers(state, from, to, type.capacity);
  const departAt = at + CONFIG.turnaroundMs;
  plane.flight = {
    from,
    to,
    departAt,
    arriveAt: departAt + flightDurationMs(km, type.speedKmh),
    distanceKm: km,
    passengers,
  };
}

/** Complete the current leg: pay out, log, and move the plane to its destination. */
function land(state: GameState, plane: PlaneState, summary: SimSummary): void {
  const f = plane.flight!;
  const type = getPlaneType(plane.typeId);
  const pay = legPayout(f.distanceKm, f.passengers, type);

  state.cash += pay.net;
  state.stats.totalEarned += pay.net;
  state.stats.flightsCompleted++;
  state.stats.passengersDelivered += f.passengers;
  plane.lifetimeEarnings += pay.net;
  plane.lifetimeFlights++;
  state.flightLog.unshift({ at: f.arriveAt, planeId: plane.id, from: f.from, to: f.to, passengers: f.passengers, net: pay.net });
  if (state.flightLog.length > CONFIG.flightLogSize) state.flightLog.length = CONFIG.flightLogSize;

  summary.earned += pay.net;
  summary.flights++;
  summary.passengers += f.passengers;

  plane.location = f.to;
  plane.flight = null;
  events.emit('flightLanded', { planeId: plane.id, from: f.from, to: f.to, passengers: f.passengers, net: pay.net });

  // Advance along the route.
  if (plane.route) {
    plane.nextStopIndex++;
    if (plane.nextStopIndex >= plane.route.stops.length) {
      if (plane.route.loop) plane.nextStopIndex = 0;
      else plane.route = null;
    }
  }
}

/**
 * If the plane is parked on a route, pick its next stop (skipping the stop
 * it's already at) and depart. Returns true if a leg was started.
 */
function departIfRouted(state: GameState, plane: PlaneState, at: number): boolean {
  const route = plane.route;
  if (!route || plane.flight || route.stops.length === 0) return false;
  for (let tries = 0; tries < route.stops.length; tries++) {
    const target = route.stops[plane.nextStopIndex];
    if (target !== plane.location) {
      startLeg(state, plane, target, at);
      return true;
    }
    // Already here: move on to the following stop.
    plane.nextStopIndex++;
    if (plane.nextStopIndex >= route.stops.length) {
      if (!route.loop) {
        plane.route = null;
        return false;
      }
      plane.nextStopIndex = 0;
    }
  }
  return false;
}

/**
 * Advance one plane to time t: replay every landing that happened before t
 * (at its exact timestamp) and immediately start the next routed leg.
 * `stepStart` is used as the departure time for planes that were waiting.
 */
export function updatePlane(state: GameState, plane: PlaneState, stepStart: number, t: number, summary: SimSummary): void {
  if (!plane.flight) departIfRouted(state, plane, stepStart);
  // Each leg takes at least minFlightSeconds, so this loop is always bounded.
  while (plane.flight && plane.flight.arriveAt <= t) {
    const landedAt = plane.flight.arriveAt;
    land(state, plane, summary);
    departIfRouted(state, plane, landedAt);
  }
}
