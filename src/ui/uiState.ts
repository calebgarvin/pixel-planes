/**
 * Transient UI state (not saved): what's selected and which tab is open.
 * The renderer reads it for highlights; the panel reads and writes it.
 */
export type Tab = 'airports' | 'fleet' | 'shop' | 'log';

export const ui = {
  tab: 'airports' as Tab,
  selectedAirport: null as string | null,
  selectedPlane: null as string | null,
  /** Airport new planes are delivered to (defaults to home). */
  deliveryAirport: null as string | null,
  /** Bumped whenever something should force a panel refresh. */
  dirty: true,
};

export function selectAirport(code: string | null): void {
  ui.selectedAirport = code;
  ui.selectedPlane = null;
  if (code) ui.tab = 'airports';
  ui.dirty = true;
}

export function selectPlane(id: string | null): void {
  ui.selectedPlane = id;
  ui.selectedAirport = null;
  if (id) ui.tab = 'fleet';
  ui.dirty = true;
}
