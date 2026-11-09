/**
 * Pixel Planes entry point: wires state, simulation, renderer and UI together.
 *
 * Frame loop:
 *   1. simulateTo(state, Date.now())   advance the world
 *   2. renderer.draw(state)            draw the map
 *   3. hud + panel refresh (throttled)
 *   4. autosave every few seconds (and when the tab is hidden/closed)
 */
import './style.css';
import { CONFIG } from './config';
import { getAirport } from './data/airports';
import { getPlaneType } from './data/planes';
import { assignRoute, buyPlane, parkPlane, sellPlane, unlockAirport, ActionResult } from './core/actions';
import { incomePerMinute } from './core/economy';
import { events } from './core/events';
import { simulateTo } from './core/simulation';
import { createNewGame, findPlane } from './core/state';
import type { GameState } from './core/types';
import { clearSave, loadGame, saveGame } from './persistence/save';
import { Renderer } from './render/renderer';
import { latToY, lonToX } from './render/mapTexture';
import { money } from './ui/format';
import { isModalOpen, showRoutePicker, showSettings, showStartModal, showWelcomeBack } from './ui/modals';
import { Panel } from './ui/panel';
import { toast } from './ui/toasts';
import { selectAirport, selectPlane, ui } from './ui/uiState';

const canvas = document.getElementById('map') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
let state: GameState | null = null;

// --- actions (UI -> core) ----------------------------------------------------
function report(r: ActionResult): void {
  if (r.message) toast(r.message, r.ok ? 'good' : 'warn');
  if (r.ok && state) saveGame(state);
  ui.dirty = true;
}

const panel = new Panel(document.getElementById('panel')!, {
  unlock: (code) => state && report(unlockAirport(state, code)),
  buy: (typeId) => {
    if (!state) return;
    const at = ui.deliveryAirport && state.airports[ui.deliveryAirport]?.unlocked ? ui.deliveryAirport : state.homeAirport;
    report(buyPlane(state, typeId, at));
  },
  openRoute: (planeId) => {
    const plane = state && findPlane(state, planeId);
    if (!state || !plane) return;
    showRoutePicker(state, plane, (dest, loop) => state && report(assignRoute(state, planeId, dest, loop)));
  },
  park: (planeId) => state && report(parkPlane(state, planeId)),
  sell: (planeId) => {
    if (!state) return;
    const r = sellPlane(state, planeId);
    if (r.ok) selectPlane(null);
    report(r);
  },
  focusAirport: (code) => {
    selectAirport(code);
    renderer.focusAirport(code);
  },
  focusPlane: (id) => selectPlane(id),
});

renderer.attachInput((hit) => {
  if (!hit) {
    if (ui.selectedAirport || ui.selectedPlane) {
      ui.selectedAirport = null;
      ui.selectedPlane = null;
      ui.dirty = true;
    }
  } else if (hit.kind === 'airport') selectAirport(hit.code);
  else selectPlane(hit.id);
});

events.on('flightLanded', () => (ui.dirty = true));
events.on('planeBought', () => (ui.tab = 'fleet'));

// --- HUD -----------------------------------------------------------------------
const cashEl = document.getElementById('cash')!;
const rateEl = document.getElementById('rate')!;
let shownCash = 0;

function updateHud(dtMs: number): void {
  if (!state) return;
  // Ease the displayed number toward the real one for a satisfying tick-up.
  const diff = state.cash - shownCash;
  shownCash = Math.abs(diff) < 1 ? state.cash : shownCash + diff * Math.min(1, dtMs / 250);
  cashEl.textContent = money(shownCash);
  rateEl.textContent = `+${money(incomePerMinute(state))}/min`;
}

document.getElementById('btn-settings')!.addEventListener('click', () =>
  showSettings(() => {
    clearSave();
    state = null;
    document.body.classList.add('no-game');
    startNewGameFlow();
  }),
);
document.getElementById('btn-zoom-in')!.addEventListener('click', () => renderer.camera.setZoom(renderer.camera.zoom * 1.4));
document.getElementById('btn-zoom-out')!.addEventListener('click', () => renderer.camera.setZoom(renderer.camera.zoom / 1.4));
document.getElementById('btn-home')!.addEventListener('click', () => state && renderer.focusAirport(state.homeAirport, 3));

// --- game lifecycle ------------------------------------------------------------
function startNewGameFlow(): void {
  showStartModal((code) => {
    state = createNewGame(code);
    document.body.classList.remove('no-game');
    shownCash = state.cash;
    saveGame(state);
    renderer.focusAirport(code, 3);
    selectPlane(state.planes[0].id);
    toast(`Welcome to ${getAirport(code).city}! Tap “Set route” to send your first flight.`, 'good');
  });
}

function boot(): void {
  const loaded = loadGame();
  if (loaded) {
    state = loaded;
    const summary = simulateTo(state, Date.now()); // offline progress
    if (import.meta.env.DEV) console.info('[pixel-planes] offline catch-up', summary);
    shownCash = state.cash - summary.earned - summary.passive;
    saveGame(state);
    renderer.focusAirport(state.homeAirport, 3);
    if (summary.elapsedMs > 60_000 && summary.earned + summary.passive > 0) showWelcomeBack(summary);
  } else {
    document.body.classList.add('no-game');
    // Show the world behind the welcome dialog.
    const c = renderer.camera;
    c.centerOn(lonToX(10), latToY(25));
    c.setZoom(c.minZoom);
    startNewGameFlow();
  }
  requestAnimationFrame(frame);
}

let lastFrame = performance.now();
let lastPanel = 0;
let lastSave = Date.now();

function frame(t: number): void {
  const dt = t - lastFrame;
  lastFrame = t;
  const now = Date.now();
  if (state) {
    const summary = simulateTo(state, now);
    // A long gap mid-session (tab in background) gets a gentle summary too.
    if (summary.elapsedMs > 5 * 60_000 && summary.earned > 0 && !isModalOpen()) showWelcomeBack(summary);
    renderer.draw(state, now);
    updateHud(dt);
    if (ui.dirty || t - lastPanel > 1000) {
      panel.render(state, now);
      lastPanel = t;
    }
    if (now - lastSave > CONFIG.autosaveMs) {
      saveGame(state);
      lastSave = now;
    }
  } else {
    renderer.draw(previewState, now);
  }
  requestAnimationFrame(frame);
}

// Before a game exists, draw an empty world (no airports unlocked, no planes).
const previewState: GameState = (() => {
  const s = createNewGame('LHR');
  for (const a of Object.values(s.airports)) a.unlocked = false;
  s.planes = [];
  s.homeAirport = '';
  return s;
})();

const saveNow = () => state && saveGame(state);
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveNow());
window.addEventListener('pagehide', saveNow);

// Fonts affect canvas labels; start once they're ready (or after a short wait).
Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(boot);

// Expose a tiny debug handle in development.
if (import.meta.env.DEV) {
  (window as unknown as { pixelPlanes: unknown }).pixelPlanes = {
    get state() {
      return state;
    },
    getPlaneType,
    renderer,
    /** Pretend the tab was closed for `minutes` (rewinds the clock, then catches up). */
    timeTravel(minutes: number) {
      if (!state) return;
      const ms = minutes * 60_000;
      state.time -= ms;
      for (const p of state.planes)
        if (p.flight) {
          p.flight.departAt -= ms;
          p.flight.arriveAt -= ms;
        }
      saveGame(state);
      state = null; // stop this page from simulating/saving before the reload
      location.reload();
    },
  };
}
