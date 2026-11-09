/**
 * The simulation clock.
 *
 * `simulateTo(state, now)` is the ONLY way time moves forward, both during
 * live play (called every animation frame) and when catching up after the
 * tab was closed. Live play takes one small step; catch-up takes many larger
 * steps. Plane landings are always processed at their exact timestamps, so
 * coarse steps only affect passenger-spawn granularity, not earnings timing.
 */
import { CONFIG } from '../config';
import { events } from './events';
import { emptySummary, SimSummary, updatePlane } from './flights';
import { generatePassengers } from './passengers';
import { passiveIncomePerMinute } from './economy';
import type { GameState } from './types';

/** Longest single step during live play; bigger gaps count as catch-up. */
const LIVE_STEP_MAX_MS = 1_000;
/** Target number of steps used to cover a long offline gap. */
const CATCHUP_STEPS = 4_000;
const CATCHUP_MIN_STEP_MS = 2_000;

function advance(state: GameState, t1: number, summary: SimSummary): void {
  const t0 = state.time;
  const dt = t1 - t0;
  if (dt <= 0) return;

  // Passive terminal fees: a steady safety net.
  state.passiveAcc += (passiveIncomePerMinute(state) * dt) / 60_000;
  const whole = Math.floor(state.passiveAcc);
  if (whole > 0) {
    state.passiveAcc -= whole;
    state.cash += whole;
    state.stats.passiveEarned += whole;
    summary.passive += whole;
  }

  generatePassengers(state, dt);
  for (const plane of state.planes) updatePlane(state, plane, t0, t1, summary);
  state.time = t1;
}

/**
 * Bring the state up to `target` (epoch ms). Returns a summary of what
 * happened, which the UI shows as "While you were away..." for long gaps.
 */
export function simulateTo(state: GameState, target: number): SimSummary & { elapsedMs: number } {
  const summary = emptySummary();
  let elapsedMs = Math.max(0, target - state.time);
  if (elapsedMs > CONFIG.maxOfflineMs) {
    // Skip the part beyond the cap. Flights in progress simply resume.
    const skip = elapsedMs - CONFIG.maxOfflineMs;
    shiftFlights(state, skip);
    state.time += skip;
    elapsedMs = CONFIG.maxOfflineMs;
  }

  const catchingUp = elapsedMs > LIVE_STEP_MAX_MS * 2;
  const step = catchingUp ? Math.max(CATCHUP_MIN_STEP_MS, elapsedMs / CATCHUP_STEPS) : LIVE_STEP_MAX_MS;
  const wasMuted = events.muted;
  if (catchingUp) events.muted = true; // no toast storm on return
  try {
    while (state.time < target) {
      advance(state, Math.min(target, state.time + step), summary);
    }
  } finally {
    events.muted = wasMuted;
  }
  return { ...summary, elapsedMs };
}

/** Move all flight timestamps forward (used when skipping time beyond the offline cap). */
function shiftFlights(state: GameState, ms: number): void {
  for (const p of state.planes) {
    if (p.flight) {
      p.flight.departAt += ms;
      p.flight.arriveAt += ms;
    }
  }
}
