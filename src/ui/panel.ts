/**
 * The side panel: tabs for Airports, Fleet, Shop and Log, plus detail views
 * for a selected airport or plane.
 *
 * Views are functions that return HTML strings. The panel re-renders about
 * once a second, but only touches the DOM when the HTML actually changed,
 * and never while you're pressing a button or using a dropdown.
 */
import { CONFIG } from '../config';
import { AIRPORTS, getAirport } from '../data/airports';
import { PLANE_TYPES, getPlaneType } from '../data/planes';
import { airportDistance, farePerPassenger, incomePerMinute, passiveIncomePerMinute, sellValue, unlockCost } from '../core/economy';
import { planeBase, totalWaiting, unlockedCodes } from '../core/state';
import type { GameState, PlaneState } from '../core/types';
import { duration, escapeHtml, km, money, moneyShort, stars } from './format';
import { Tab, ui } from './uiState';

export interface PanelActions {
  unlock(code: string): void;
  buy(typeId: string): void;
  openRoute(planeId: string): void;
  park(planeId: string): void;
  sell(planeId: string): void;
  focusAirport(code: string): void;
  focusPlane(planeId: string): void;
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'airports', label: 'Airports', icon: '🛬' },
  { id: 'fleet', label: 'Fleet', icon: '✈' },
  { id: 'shop', label: 'Shop', icon: '🛒' },
  { id: 'log', label: 'Log', icon: '📒' },
];

export class Panel {
  private tabsEl: HTMLElement;
  private bodyEl: HTMLElement;
  private lastHtml = '';
  private lastTabsHtml = '';
  private pointerDown = false;

  constructor(private root: HTMLElement, private actions: PanelActions) {
    root.innerHTML = `<nav class="tabs"></nav><div class="panel-body"></div>`;
    this.tabsEl = root.querySelector('.tabs')!;
    this.bodyEl = root.querySelector('.panel-body')!;

    root.addEventListener('pointerdown', () => (this.pointerDown = true));
    window.addEventListener('pointerup', () => setTimeout(() => (this.pointerDown = false), 0));
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('change', (e) => {
      const t = e.target as HTMLSelectElement;
      if (t.dataset.bind === 'delivery') {
        ui.deliveryAirport = t.value;
        ui.dirty = true;
      }
    });
  }

  private onClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!el || (el as HTMLButtonElement).disabled) return;
    const { action, id = '' } = el.dataset;
    const a = this.actions;
    switch (action) {
      case 'tab':
        ui.tab = id as Tab;
        ui.selectedAirport = null;
        ui.selectedPlane = null;
        break;
      case 'back':
        ui.selectedAirport = null;
        ui.selectedPlane = null;
        break;
      case 'airport': a.focusAirport(id); break;
      case 'plane': a.focusPlane(id); break;
      case 'unlock': a.unlock(id); break;
      case 'buy': a.buy(id); break;
      case 'route': a.openRoute(id); break;
      case 'park': a.park(id); break;
      case 'sell': a.sell(id); break;
    }
    ui.dirty = true;
  }

  /** Call often; it decides whether the DOM needs updating. */
  render(state: GameState, now: number, force = false): void {
    const active = document.activeElement;
    const editing = active instanceof HTMLSelectElement && this.root.contains(active);
    if (!force && (this.pointerDown || editing)) return;

    const tabsHtml = TABS.map(
      (t) => `<button class="tab ${ui.tab === t.id ? 'active' : ''}" data-action="tab" data-id="${t.id}">
        <span class="tab-icon">${t.icon}</span>${t.label}</button>`,
    ).join('');
    if (tabsHtml !== this.lastTabsHtml) {
      this.tabsEl.innerHTML = tabsHtml;
      this.lastTabsHtml = tabsHtml;
    }

    let html: string;
    if (ui.selectedAirport) html = airportDetail(state, ui.selectedAirport, now);
    else if (ui.selectedPlane && state.planes.some((p) => p.id === ui.selectedPlane)) html = planeDetail(state, ui.selectedPlane, now);
    else if (ui.tab === 'airports') html = airportsList(state);
    else if (ui.tab === 'fleet') html = fleetList(state, now);
    else if (ui.tab === 'shop') html = shop(state);
    else html = logView(state);

    if (html !== this.lastHtml) {
      const scroll = this.bodyEl.scrollTop;
      this.bodyEl.innerHTML = html;
      this.bodyEl.scrollTop = scroll;
      this.lastHtml = html;
    }
    ui.dirty = false;
  }
}

// --- helpers -------------------------------------------------------------------

function planeStatus(p: PlaneState, now: number): { text: string; kind: 'flying' | 'boarding' | 'parked' } {
  const f = p.flight;
  if (f && now < f.departAt) return { text: `Boarding at ${f.from} → ${f.to}`, kind: 'boarding' };
  if (f) return { text: `${f.from} → ${f.to} · lands in ${duration(f.arriveAt - now)}`, kind: 'flying' };
  return { text: `Parked at ${p.location}`, kind: 'parked' };
}

function routeText(p: PlaneState): string {
  if (!p.route) return 'No orders';
  if (p.route.loop) return p.route.stops.join(' ⇄ ');
  return `One way to ${p.route.stops[p.route.stops.length - 1]}`;
}

function afford(state: GameState, cost: number): string {
  return state.cash >= cost ? '' : 'disabled';
}

// --- views ---------------------------------------------------------------------

function airportsList(state: GameState): string {
  const home = state.homeAirport;
  const open = AIRPORTS.filter((a) => state.airports[a.code].unlocked).sort(
    (a, b) => Number(b.code === home) - Number(a.code === home) || a.city.localeCompare(b.city),
  );
  const locked = AIRPORTS.filter((a) => !state.airports[a.code].unlocked)
    .map((a) => ({ a, d: airportDistance(home, a.code), cost: unlockCost(state, a.code) }))
    .sort((x, y) => x.d - y.d);

  const openRows = open
    .map((a) => {
      const n = totalWaiting(state.airports[a.code]);
      return `<button class="row" data-action="airport" data-id="${a.code}">
        <span class="code-chip ${a.code === home ? 'home' : ''}">${a.code}</span>
        <span class="row-main"><b>${escapeHtml(a.city)}</b><span class="muted small">${escapeHtml(a.name)}</span></span>
        <span class="row-side"><span class="pax">${n}</span><span class="muted small">waiting</span></span>
      </button>`;
    })
    .join('');

  const lockedRows = locked
    .map(
      ({ a, d, cost }) => `<div class="row">
        <button class="row-link" data-action="airport" data-id="${a.code}">
          <span class="code-chip locked">${a.code}</span>
          <span class="row-main"><b>${escapeHtml(a.city)}</b><span class="muted small">${stars(a.tier)} · ${km(d)} from home</span></span>
        </button>
        <button class="btn btn-sm btn-primary" data-action="unlock" data-id="${a.code}" ${afford(state, cost)}>${moneyShort(cost)}</button>
      </div>`,
    )
    .join('');

  return `
    <section><h3>Your airports <span class="count">${open.length}</span></h3>${openRows}</section>
    <section><h3>Expand your network</h3>
      <p class="muted small">Each airport adds passengers and ${money(CONFIG.passiveIncomePerAirportPerMinute)}/min in terminal fees.</p>
      ${lockedRows || '<p class="muted">You own every airport. Incredible!</p>'}
    </section>`;
}

function airportDetail(state: GameState, code: string, now: number): string {
  const def = getAirport(code);
  const ap = state.airports[code];
  const isHome = code === state.homeAirport;
  const header = `
    <button class="back" data-action="back">‹ Back</button>
    <div class="detail-head">
      <span class="code-chip big ${isHome ? 'home' : ap.unlocked ? '' : 'locked'}">${code}</span>
      <div><h2>${escapeHtml(def.city)}</h2><div class="muted small">${escapeHtml(def.name)} · ${escapeHtml(def.country)}</div>
      <div class="small">${stars(def.tier)} ${isHome ? '<span class="tag">Home</span>' : ''}</div></div>
    </div>`;

  if (!ap.unlocked) {
    const cost = unlockCost(state, code);
    const near = unlockedCodes(state)
      .map((c) => ({ c, d: airportDistance(c, code) }))
      .sort((a, b) => a.d - b.d)[0];
    return `${header}
      <section class="card">
        <p>Open a gate here to start flying to ${escapeHtml(def.city)}.</p>
        <p class="muted small">Nearest of your airports: <b>${near.c}</b>, ${km(near.d)} away.</p>
        <button class="btn btn-primary btn-block" data-action="unlock" data-id="${code}" ${afford(state, cost)}>
          Unlock for ${money(cost)}</button>
        ${state.cash < cost ? `<p class="muted small center">${money(cost - state.cash)} to go. Your planes are on it.</p>` : ''}
      </section>`;
  }

  const waiting = Object.entries(ap.waiting)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const waitingRows = waiting.length
    ? waiting
        .map(([dest, n]) => {
          const d = airportDistance(code, dest);
          return `<button class="row" data-action="airport" data-id="${dest}">
            <span class="code-chip">${dest}</span>
            <span class="row-main"><b>${escapeHtml(getAirport(dest).city)}</b><span class="muted small">${km(d)} · ${money(farePerPassenger(d))} each</span></span>
            <span class="row-side"><span class="pax">${n}</span></span>
          </button>`;
        })
        .join('')
    : '<p class="muted small">Nobody waiting right now. More travelers are on their way.</p>';

  const planesHere = state.planes.filter((p) => planeBase(p) === code);
  const planeRows = planesHere.length
    ? planesHere.map((p) => planeRow(p, now)).join('')
    : '<p class="muted small">No planes based here.</p>';

  return `${header}
    <section><h3>Passengers waiting <span class="count">${totalWaiting(ap)}</span></h3>${waitingRows}</section>
    <section><h3>Planes here</h3>${planeRows}</section>`;
}

function planeRow(p: PlaneState, now: number): string {
  const type = getPlaneType(p.typeId);
  const st = planeStatus(p, now);
  return `<button class="row" data-action="plane" data-id="${p.id}">
    <span class="plane-dot" style="--c:${type.color}"></span>
    <span class="row-main"><b>${escapeHtml(p.name)}</b><span class="muted small status-${st.kind}">${st.text}</span>
      <span class="muted small">${routeText(p)}</span></span>
    <span class="row-side muted small">${p.flight ? `${p.flight.passengers}/${type.capacity}` : ''}</span>
  </button>`;
}

function fleetList(state: GameState, now: number): string {
  const idle = state.planes.filter((p) => !p.route && !p.flight).length;
  return `<section><h3>Your fleet <span class="count">${state.planes.length}</span></h3>
    ${idle ? `<p class="hint">💤 ${idle} plane${idle > 1 ? 's are' : ' is'} parked. Tap one and give it a route!</p>` : ''}
    ${state.planes.map((p) => planeRow(p, now)).join('')}
  </section>`;
}

function planeDetail(state: GameState, id: string, now: number): string {
  const p = state.planes.find((x) => x.id === id)!;
  const type = getPlaneType(p.typeId);
  const st = planeStatus(p, now);
  let progress = '';
  if (p.flight && now >= p.flight.departAt) {
    const t = Math.min(1, (now - p.flight.departAt) / (p.flight.arriveAt - p.flight.departAt));
    progress = `<div class="progress"><div style="width:${(t * 100).toFixed(1)}%"></div></div>`;
  }
  return `
    <button class="back" data-action="back">‹ Back</button>
    <div class="detail-head">
      <span class="plane-dot big" style="--c:${type.color}"></span>
      <div><h2>${escapeHtml(p.name)}</h2><div class="muted small">${type.name} · ${escapeHtml(type.description)}</div></div>
    </div>
    <section class="card">
      <div class="status-${st.kind}"><b>${st.text}</b></div>
      ${p.flight ? `<div class="muted small">${p.flight.passengers}/${type.capacity} passengers aboard</div>` : ''}
      ${progress}
      <div class="small">Orders: <b>${routeText(p)}</b></div>
      <div class="btn-row">
        <button class="btn btn-primary" data-action="route" data-id="${p.id}">${p.route ? 'Change route' : 'Set route'}</button>
        ${p.route ? `<button class="btn" data-action="park" data-id="${p.id}">Park</button>` : ''}
      </div>
    </section>
    <section class="stats-grid">
      <div><span class="muted small">Seats</span><b>${type.capacity}</b></div>
      <div><span class="muted small">Speed</span><b>${type.speedKmh} km/h</b></div>
      <div><span class="muted small">Range</span><b>${km(type.rangeKm)}</b></div>
      <div><span class="muted small">Flights</span><b>${p.lifetimeFlights.toLocaleString()}</b></div>
      <div class="wide"><span class="muted small">Lifetime earnings</span><b>${money(p.lifetimeEarnings)}</b></div>
    </section>
    <section>
      <button class="btn btn-ghost btn-block" data-action="sell" data-id="${p.id}" ${p.flight || state.planes.length <= 1 ? 'disabled' : ''}>
        Sell for ${money(sellValue(type))}</button>
      ${p.flight ? '<p class="muted small center">Planes can be sold once they land.</p>' : ''}
    </section>`;
}

function shop(state: GameState): string {
  const open = unlockedCodes(state);
  const delivery = ui.deliveryAirport && open.includes(ui.deliveryAirport) ? ui.deliveryAirport : state.homeAirport;
  const options = open
    .map((c) => `<option value="${c}" ${c === delivery ? 'selected' : ''}>${c} · ${escapeHtml(getAirport(c).city)}</option>`)
    .join('');
  const cards = PLANE_TYPES.map((t) => {
    const owned = state.planes.filter((p) => p.typeId === t.id).length;
    return `<div class="shop-card">
      <div class="shop-head"><span class="plane-dot" style="--c:${t.color}"></span><b>${t.name}</b>
        ${owned ? `<span class="tag">${owned} owned</span>` : ''}</div>
      <div class="muted small">${escapeHtml(t.description)}</div>
      <div class="shop-stats"><span>👥 ${t.capacity}</span><span>⚡ ${t.speedKmh} km/h</span><span>📏 ${km(t.rangeKm)}</span></div>
      <button class="btn btn-primary btn-block" data-action="buy" data-id="${t.id}" ${afford(state, t.price)}>Buy for ${money(t.price)}</button>
    </div>`;
  }).join('');
  return `<section><h3>Plane shop</h3>
    <label class="field">Deliver to <select data-bind="delivery">${options}</select></label>
    ${cards}</section>`;
}

function logView(state: GameState): string {
  const s = state.stats;
  const perMin = incomePerMinute(state);
  const rows = state.flightLog
    .slice(0, 20)
    .map(
      (f) => `<div class="log-row"><span>${f.from} → ${f.to}</span><span class="muted small">${f.passengers} pax</span>
        <span class="good">+${money(f.net)}</span></div>`,
    )
    .join('');
  return `<section><h3>Airline stats</h3>
    <div class="stats-grid">
      <div><span class="muted small">Earning now</span><b>~${money(perMin)}/min</b></div>
      <div><span class="muted small">Total earned</span><b>${moneyShort(s.totalEarned + s.passiveEarned)}</b></div>
      <div><span class="muted small">Flights</span><b>${s.flightsCompleted.toLocaleString()}</b></div>
      <div><span class="muted small">Passengers</span><b>${s.passengersDelivered.toLocaleString()}</b></div>
      <div class="wide"><span class="muted small">Terminal fees</span><b>${money(passiveIncomePerMinute(state))}/min from ${unlockedCodes(state).length} airports</b></div>
    </div></section>
    <section><h3>Recent flights</h3>${rows || '<p class="muted small">No flights yet. Give a plane a route!</p>'}</section>`;
}
