/**
 * Modal dialogs. Each modal is static HTML with `data-action` buttons;
 * clicks are delegated to a handler. Modals don't live-update, which keeps
 * them calm and avoids buttons moving under the cursor.
 */
import { AIRPORTS_BY_CODE, HOME_CHOICES, getAirport } from '../data/airports';
import { getPlaneType } from '../data/planes';
import { airportDistance, flightDurationMs, legPayout } from '../core/economy';
import { planeBase } from '../core/state';
import type { SimSummary } from '../core/flights';
import type { GameState, PlaneState } from '../core/types';
import { duration, escapeHtml, humanDuration, km, money } from './format';

type Handler = (action: string, el: HTMLElement) => void;

let root: HTMLElement | null = null;
let onKey: ((e: KeyboardEvent) => void) | null = null;

export function openModal(title: string, body: string, handler: Handler, opts: { dismissable?: boolean; wide?: boolean } = {}): void {
  closeModal();
  const dismissable = opts.dismissable ?? true;
  root = document.createElement('div');
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="modal ${opts.wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <header class="modal-head">
        <h2>${escapeHtml(title)}</h2>
        ${dismissable ? '<button class="icon-btn" data-action="close" aria-label="Close">✕</button>' : ''}
      </header>
      <div class="modal-body">${body}</div>
    </div>`;
  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target === root && dismissable) return closeModal();
    const btn = target.closest<HTMLElement>('[data-action]');
    if (!btn || (btn as HTMLButtonElement).disabled) return;
    if (btn.dataset.action === 'close') return closeModal();
    handler(btn.dataset.action!, btn);
  });
  onKey = (e) => {
    if (e.key === 'Escape' && dismissable) closeModal();
  };
  window.addEventListener('keydown', onKey);
  document.body.appendChild(root);
}

export function closeModal(): void {
  root?.remove();
  root = null;
  if (onKey) window.removeEventListener('keydown', onKey);
  onKey = null;
}

export function isModalOpen(): boolean {
  return root !== null;
}

// --- specific dialogs --------------------------------------------------------

export function showStartModal(onPick: (code: string) => void): void {
  const buttons = HOME_CHOICES.map((code) => {
    const a = AIRPORTS_BY_CODE[code];
    return `<button class="home-choice" data-action="pick" data-code="${code}">
      <span class="code">${code}</span><span class="city">${escapeHtml(a.city)}</span></button>`;
  }).join('');
  openModal(
    'Welcome to Pixel Planes',
    `<p class="lead">Every great airline starts with one little plane. Pick your home airport.
     You'll get a free <b>Sparrow</b>, two nearby airports, and some cash to grow with.</p>
     <div class="home-grid">${buttons}</div>
     <p class="muted small">No rush, no rivals. Your airline keeps flying even when this tab is closed.</p>`,
    (action, el) => {
      if (action === 'pick') {
        closeModal();
        onPick(el.dataset.code!);
      }
    },
    { dismissable: false, wide: true },
  );
}

export function showWelcomeBack(summary: SimSummary & { elapsedMs: number }): void {
  const total = summary.earned + summary.passive;
  openModal(
    'Welcome back, captain!',
    `<p class="lead">You were away for <b>${humanDuration(summary.elapsedMs)}</b>. Your airline kept busy:</p>
     <div class="summary-grid">
       <div><span class="big">${money(total)}</span><span class="muted">earned</span></div>
       <div><span class="big">${summary.flights.toLocaleString()}</span><span class="muted">flights</span></div>
       <div><span class="big">${summary.passengers.toLocaleString()}</span><span class="muted">passengers</span></div>
     </div>
     <div class="modal-actions"><button class="btn btn-primary" data-action="close">Lovely</button></div>`,
    () => {},
  );
}

/** Pick a destination for a plane: loop between two airports, or fly one way. */
export function showRoutePicker(state: GameState, plane: PlaneState, onPick: (dest: string, loop: boolean) => void): void {
  const type = getPlaneType(plane.typeId);
  const base = planeBase(plane);
  const rows = Object.values(state.airports)
    .filter((a) => a.unlocked && a.code !== base)
    .map((a) => ({ code: a.code, d: airportDistance(base, a.code), waiting: state.airports[base].waiting[a.code] ?? 0 }))
    .sort((x, y) => Number(x.d > type.rangeKm) - Number(y.d > type.rangeKm) || y.waiting - x.waiting || x.d - y.d);

  const list = rows.length
    ? rows
        .map((r) => {
          const a = getAirport(r.code);
          const inRange = r.d <= type.rangeKm;
          const pax = Math.min(r.waiting, type.capacity);
          const est = legPayout(r.d, pax, type).net;
          const current = plane.route?.loop && plane.route.stops.includes(r.code);
          return `<div class="route-row ${inRange ? '' : 'disabled'}">
            <div class="route-info">
              <div><b>${r.code}</b> ${escapeHtml(a.city)} ${current ? '<span class="tag">current</span>' : ''}</div>
              <div class="muted small">${km(r.d)} · ${duration(flightDurationMs(r.d, type.speedKmh))} · ${r.waiting} waiting
              ${inRange ? `· ~${money(est)} next leg` : `· out of range (${km(type.rangeKm)})`}</div>
            </div>
            ${
              inRange
                ? `<div class="route-btns">
                     <button class="btn btn-primary btn-sm" data-action="loop" data-code="${r.code}" title="Shuttle back and forth">⇄ Loop</button>
                     <button class="btn btn-sm" data-action="once" data-code="${r.code}" title="Fly there once, then park">→ Once</button>
                   </div>`
                : ''
            }
          </div>`;
        })
        .join('')
    : `<p class="muted">Unlock another airport to give this plane somewhere to go.</p>`;

  openModal(
    `Where to, ${plane.name}?`,
    `<p class="muted small">From <b>${base}</b>${plane.flight ? ' (after it lands)' : ''}. Loops carry passengers both ways forever; empty seats carry mail, so every leg turns a profit.</p>
     <div class="route-list">${list}</div>`,
    (action, el) => {
      if (action === 'loop' || action === 'once') {
        closeModal();
        onPick(el.dataset.code!, action === 'loop');
      }
    },
    { wide: true },
  );
}

export function showSettings(onReset: () => void): void {
  openModal(
    'Settings',
    `<p class="muted">Pixel Planes saves automatically to this browser. Flights keep going while you're away (up to 3 days).</p>
     <div class="modal-actions">
       <button class="btn btn-danger" data-action="reset">Start a new airline…</button>
       <button class="btn" data-action="close">Done</button>
     </div>`,
    (action) => {
      if (action === 'reset') {
        openModal(
          'Start over?',
          `<p>This erases your current airline. This can't be undone.</p>
           <div class="modal-actions">
             <button class="btn btn-danger" data-action="confirm">Yes, start fresh</button>
             <button class="btn" data-action="close">Keep flying</button>
           </div>`,
          (a) => {
            if (a === 'confirm') {
              closeModal();
              onReset();
            }
          },
        );
      }
    },
  );
}
