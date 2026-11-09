/** Geographic helpers: distances and great-circle paths. */

const R_EARTH_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export interface LatLon {
  lat: number;
  lon: number;
}

/** Haversine great-circle distance in km. */
export function distanceKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Point a fraction t (0..1) of the way along the great circle from a to b. */
export function greatCirclePoint(a: LatLon, b: LatLon, t: number): LatLon {
  const lat1 = toRad(a.lat), lon1 = toRad(a.lon);
  const lat2 = toRad(b.lat), lon2 = toRad(b.lon);
  const d = distanceKm(a, b) / R_EARTH_KM;
  if (d < 1e-9) return { ...a };
  const A = Math.sin((1 - t) * d) / Math.sin(d);
  const B = Math.sin(t * d) / Math.sin(d);
  const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
  const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);
  return { lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), lon: toDeg(Math.atan2(y, x)) };
}

/** Wrap a longitude difference into [-180, 180). */
export function wrapLonDelta(d: number): number {
  return ((((d + 180) % 360) + 360) % 360) - 180;
}

/**
 * Sample a great-circle path as a list of points whose longitudes are
 * "unwrapped" (may go past ±180) so the path draws as one continuous line
 * across the date line.
 */
export function greatCirclePath(a: LatLon, b: LatLon, segments = 48): LatLon[] {
  const pts: LatLon[] = [];
  let prevLon = a.lon;
  for (let i = 0; i <= segments; i++) {
    const p = greatCirclePoint(a, b, i / segments);
    const lon = prevLon + wrapLonDelta(p.lon - prevLon);
    pts.push({ lat: p.lat, lon });
    prevLon = lon;
  }
  return pts;
}
