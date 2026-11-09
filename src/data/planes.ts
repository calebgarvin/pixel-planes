/**
 * Plane type catalog. Names are original "bird" models.
 *
 * - capacity: passenger seats
 * - speedKmh: cruise speed (game time; see config.TIME_SCALE)
 * - rangeKm: max distance of a single leg
 * - price: purchase price
 * - sprite: key into the sprite registry (render/sprites.ts)
 *
 * Add a new plane by appending an entry; the shop picks it up automatically.
 */
export interface PlaneTypeDef {
  id: string;
  name: string;
  description: string;
  capacity: number;
  speedKmh: number;
  rangeKm: number;
  price: number;
  sprite: string;
  color: string; // livery accent used by placeholder sprites and UI
}

export const PLANE_TYPES: PlaneTypeDef[] = [
  {
    id: 'sparrow',
    name: 'Sparrow',
    description: 'A trusty little prop. Perfect for short hops.',
    capacity: 4,
    speedKmh: 450,
    rangeKm: 3000,
    price: 15_000,
    sprite: 'prop',
    color: '#e8833a',
  },
  {
    id: 'puffin',
    name: 'Puffin',
    description: 'Twin turboprop with room for a small crowd.',
    capacity: 8,
    speedKmh: 550,
    rangeKm: 3500,
    price: 45_000,
    sprite: 'prop',
    color: '#3aa7a3',
  },
  {
    id: 'heron',
    name: 'Heron',
    description: 'Regional jet. Quick, comfy, and goes farther.',
    capacity: 16,
    speedKmh: 780,
    rangeKm: 5500,
    price: 120_000,
    sprite: 'jet',
    color: '#5b7fd6',
  },
  {
    id: 'albatross',
    name: 'Albatross',
    description: 'Narrow-body workhorse that can cross an ocean.',
    capacity: 30,
    speedKmh: 850,
    rangeKm: 8500,
    price: 300_000,
    sprite: 'jet',
    color: '#c45ab3',
  },
  {
    id: 'condor',
    name: 'Condor',
    description: 'Wide-body flagship. Anywhere, with everyone.',
    capacity: 50,
    speedKmh: 900,
    rangeKm: 15_000,
    price: 750_000,
    sprite: 'jumbo',
    color: '#d9b23a',
  },
];

export const PLANE_TYPES_BY_ID: Record<string, PlaneTypeDef> = Object.fromEntries(
  PLANE_TYPES.map((p) => [p.id, p]),
);

export function getPlaneType(id: string): PlaneTypeDef {
  const t = PLANE_TYPES_BY_ID[id];
  if (!t) throw new Error(`Unknown plane type ${id}`);
  return t;
}
