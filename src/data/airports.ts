/**
 * Airport catalog: real-world major airports with approximate coordinates.
 *
 * `tier` is a rough "size" used for passenger generation, unlock cost and
 * map marker size (1 = regional, 2 = major, 3 = mega hub).
 *
 * To add an airport, append an entry here. Nothing else needs to change.
 */
export interface AirportDef {
  code: string; // IATA code, also the unique id
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  tier: 1 | 2 | 3;
}

export const AIRPORTS: AirportDef[] = [
  // North America
  { code: 'ATL', name: 'Hartsfield–Jackson Atlanta Intl', city: 'Atlanta', country: 'USA', lat: 33.64, lon: -84.43, tier: 3 },
  { code: 'LAX', name: 'Los Angeles Intl', city: 'Los Angeles', country: 'USA', lat: 33.94, lon: -118.41, tier: 3 },
  { code: 'ORD', name: "Chicago O'Hare Intl", city: 'Chicago', country: 'USA', lat: 41.98, lon: -87.9, tier: 3 },
  { code: 'JFK', name: 'John F. Kennedy Intl', city: 'New York', country: 'USA', lat: 40.64, lon: -73.78, tier: 3 },
  { code: 'DFW', name: 'Dallas/Fort Worth Intl', city: 'Dallas', country: 'USA', lat: 32.9, lon: -97.04, tier: 3 },
  { code: 'DEN', name: 'Denver Intl', city: 'Denver', country: 'USA', lat: 39.86, lon: -104.67, tier: 2 },
  { code: 'SFO', name: 'San Francisco Intl', city: 'San Francisco', country: 'USA', lat: 37.62, lon: -122.38, tier: 2 },
  { code: 'SEA', name: 'Seattle–Tacoma Intl', city: 'Seattle', country: 'USA', lat: 47.45, lon: -122.31, tier: 2 },
  { code: 'MIA', name: 'Miami Intl', city: 'Miami', country: 'USA', lat: 25.79, lon: -80.29, tier: 2 },
  { code: 'ANC', name: 'Ted Stevens Anchorage Intl', city: 'Anchorage', country: 'USA', lat: 61.17, lon: -149.99, tier: 1 },
  { code: 'HNL', name: 'Daniel K. Inouye Intl', city: 'Honolulu', country: 'USA', lat: 21.32, lon: -157.92, tier: 1 },
  { code: 'YYZ', name: 'Toronto Pearson Intl', city: 'Toronto', country: 'Canada', lat: 43.68, lon: -79.63, tier: 2 },
  { code: 'YVR', name: 'Vancouver Intl', city: 'Vancouver', country: 'Canada', lat: 49.19, lon: -123.18, tier: 1 },
  { code: 'MEX', name: 'Mexico City Intl', city: 'Mexico City', country: 'Mexico', lat: 19.44, lon: -99.07, tier: 2 },

  // South America
  { code: 'BOG', name: 'El Dorado Intl', city: 'Bogotá', country: 'Colombia', lat: 4.7, lon: -74.15, tier: 1 },
  { code: 'GRU', name: 'São Paulo–Guarulhos Intl', city: 'São Paulo', country: 'Brazil', lat: -23.43, lon: -46.47, tier: 2 },
  { code: 'EZE', name: 'Ministro Pistarini (Ezeiza)', city: 'Buenos Aires', country: 'Argentina', lat: -34.82, lon: -58.54, tier: 1 },

  // Europe
  { code: 'LHR', name: 'London Heathrow', city: 'London', country: 'UK', lat: 51.47, lon: -0.45, tier: 3 },
  { code: 'CDG', name: 'Paris Charles de Gaulle', city: 'Paris', country: 'France', lat: 49.01, lon: 2.55, tier: 3 },
  { code: 'AMS', name: 'Amsterdam Schiphol', city: 'Amsterdam', country: 'Netherlands', lat: 52.31, lon: 4.76, tier: 2 },
  { code: 'FRA', name: 'Frankfurt am Main', city: 'Frankfurt', country: 'Germany', lat: 50.04, lon: 8.56, tier: 2 },
  { code: 'MAD', name: 'Adolfo Suárez Madrid–Barajas', city: 'Madrid', country: 'Spain', lat: 40.49, lon: -3.57, tier: 2 },
  { code: 'FCO', name: 'Rome Fiumicino', city: 'Rome', country: 'Italy', lat: 41.8, lon: 12.25, tier: 1 },
  { code: 'IST', name: 'Istanbul Airport', city: 'Istanbul', country: 'Türkiye', lat: 41.26, lon: 28.74, tier: 2 },

  // Middle East & Africa
  { code: 'DXB', name: 'Dubai Intl', city: 'Dubai', country: 'UAE', lat: 25.25, lon: 55.36, tier: 3 },
  { code: 'DOH', name: 'Hamad Intl', city: 'Doha', country: 'Qatar', lat: 25.27, lon: 51.61, tier: 1 },
  { code: 'CAI', name: 'Cairo Intl', city: 'Cairo', country: 'Egypt', lat: 30.12, lon: 31.41, tier: 1 },
  { code: 'NBO', name: 'Jomo Kenyatta Intl', city: 'Nairobi', country: 'Kenya', lat: -1.32, lon: 36.93, tier: 1 },
  { code: 'JNB', name: 'O. R. Tambo Intl', city: 'Johannesburg', country: 'South Africa', lat: -26.14, lon: 28.24, tier: 1 },

  // Asia
  { code: 'DEL', name: 'Indira Gandhi Intl', city: 'Delhi', country: 'India', lat: 28.56, lon: 77.1, tier: 2 },
  { code: 'BOM', name: 'Chhatrapati Shivaji Maharaj Intl', city: 'Mumbai', country: 'India', lat: 19.09, lon: 72.87, tier: 2 },
  { code: 'BKK', name: 'Suvarnabhumi', city: 'Bangkok', country: 'Thailand', lat: 13.69, lon: 100.75, tier: 2 },
  { code: 'SIN', name: 'Singapore Changi', city: 'Singapore', country: 'Singapore', lat: 1.36, lon: 103.99, tier: 3 },
  { code: 'HKG', name: 'Hong Kong Intl', city: 'Hong Kong', country: 'China', lat: 22.31, lon: 113.91, tier: 3 },
  { code: 'PVG', name: 'Shanghai Pudong Intl', city: 'Shanghai', country: 'China', lat: 31.14, lon: 121.81, tier: 2 },
  { code: 'PEK', name: 'Beijing Capital Intl', city: 'Beijing', country: 'China', lat: 40.08, lon: 116.58, tier: 3 },
  { code: 'ICN', name: 'Incheon Intl', city: 'Seoul', country: 'South Korea', lat: 37.46, lon: 126.44, tier: 2 },
  { code: 'HND', name: 'Tokyo Haneda', city: 'Tokyo', country: 'Japan', lat: 35.55, lon: 139.78, tier: 3 },

  // Oceania
  { code: 'SYD', name: 'Sydney Kingsford Smith', city: 'Sydney', country: 'Australia', lat: -33.95, lon: 151.18, tier: 2 },
  { code: 'MEL', name: 'Melbourne Tullamarine', city: 'Melbourne', country: 'Australia', lat: -37.67, lon: 144.84, tier: 1 },
  { code: 'AKL', name: 'Auckland Airport', city: 'Auckland', country: 'New Zealand', lat: -37.01, lon: 174.79, tier: 1 },
];

export const AIRPORTS_BY_CODE: Record<string, AirportDef> = Object.fromEntries(
  AIRPORTS.map((a) => [a.code, a]),
);

/** Well-connected hubs offered as a starting home (all have neighbors in starter-plane range). */
export const HOME_CHOICES = ['ATL', 'ORD', 'JFK', 'LAX', 'LHR', 'CDG', 'FRA', 'DXB', 'SIN', 'HKG', 'HND', 'SYD'];

export function getAirport(code: string): AirportDef {
  const a = AIRPORTS_BY_CODE[code];
  if (!a) throw new Error(`Unknown airport ${code}`);
  return a;
}
