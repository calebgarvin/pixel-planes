/**
 * All tunable numbers live here so balancing never means hunting through code.
 * The economy is deliberately forgiving: every flight nets a profit, money
 * never goes negative, and airports pay a trickle of passive income.
 */
export const CONFIG = {
  // --- Start of game ---
  startingCash: 40_000,
  startingPlane: 'sparrow',
  /** Airports unlocked for free next to home (nearest ones within starter range). */
  freeNeighborAirports: 2,

  // --- Time ---
  /** Real seconds per game hour of flying. 60 => 1 real minute per game hour. */
  realSecondsPerGameHour: 60,
  /** Shortest a leg can ever take, in real seconds. */
  minFlightSeconds: 15,
  /** Time spent boarding at the gate before each departure (ms). */
  turnaroundMs: 4_000,
  /** Offline progress is simulated for at most this long. */
  maxOfflineMs: 3 * 24 * 60 * 60 * 1000,

  // --- Passengers ---
  /** Passengers generated per real minute at an airport, by tier. */
  passengersPerMinute: { 1: 4, 2: 6, 3: 9 } as Record<number, number>,
  /** Max passengers waiting at an airport, by tier. Keeps things calm, never punishing. */
  waitingCap: { 1: 20, 2: 28, 3: 36 } as Record<number, number>,

  // --- Money ---
  fareBase: 25,
  farePerKm: 0.14,
  /** Empty seats are filled with mail/cargo paying this share of a fare. Guarantees profit. */
  mailShareOfFare: 0.3,
  /** Fuel & handling per km per seat. Always lower than mail income per seat. */
  fuelPerKmPerSeat: 0.015,
  /** Terminal fees: passive income per unlocked airport per real minute. */
  passiveIncomePerAirportPerMinute: 15,
  /** Unlock price by tier, multiplied by (1 + growth * extra airports owned). */
  unlockBaseCost: { 1: 8_000, 2: 16_000, 3: 30_000 } as Record<number, number>,
  unlockCostGrowth: 0.1,
  /** Share of purchase price refunded when selling a plane. */
  sellRefund: 0.6,

  // --- Misc ---
  autosaveMs: 5_000,
  flightLogSize: 30,
} as const;
