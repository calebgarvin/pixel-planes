/**
 * Persisted game state. Everything here is plain JSON so it can be saved
 * straight to localStorage. Static catalog data (airport names, plane stats)
 * is NOT stored; we store ids and look them up.
 *
 * When changing this shape, bump SAVE_VERSION in persistence/save.ts and add
 * a migration step there.
 */

export interface AirportState {
  code: string;
  unlocked: boolean;
  /** Waiting passengers, keyed by destination airport code. */
  waiting: Record<string, number>;
  /** Fractional passenger accumulator so generation is smooth at any tick rate. */
  spawnAcc: number;
}

/**
 * A route is an ordered list of stops. With loop=true the plane cycles
 * forever (A -> B -> A -> ...). With loop=false it flies through the stops
 * once and then parks. Multi-stop routes already work in the simulation;
 * the UI currently only creates 1- and 2-stop routes.
 */
export interface Route {
  stops: string[];
  loop: boolean;
}

export interface Flight {
  from: string;
  to: string;
  departAt: number; // epoch ms
  arriveAt: number; // epoch ms
  distanceKm: number;
  passengers: number;
}

export interface PlaneState {
  id: string;
  typeId: string;
  name: string;
  /** Airport the plane is at, or departed from while flying. */
  location: string;
  flight: Flight | null;
  route: Route | null;
  /** Index into route.stops of the stop the plane will fly to next. */
  nextStopIndex: number;
  lifetimeEarnings: number;
  lifetimeFlights: number;
}

export interface FlightLogEntry {
  at: number;
  planeId: string;
  from: string;
  to: string;
  passengers: number;
  net: number;
}

export interface Stats {
  totalEarned: number;
  flightsCompleted: number;
  passengersDelivered: number;
  passiveEarned: number;
}

export interface GameState {
  version: number;
  createdAt: number;
  /** Simulation clock: the timestamp the state has been simulated up to. */
  time: number;
  cash: number;
  homeAirport: string;
  airports: Record<string, AirportState>;
  planes: PlaneState[];
  nextPlaneNumber: number;
  stats: Stats;
  flightLog: FlightLogEntry[];
  /** Fractional passive-income accumulator (keeps cash a whole number). */
  passiveAcc: number;
}
