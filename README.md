# ✈ Pixel Planes

A cozy, browser-based airline sim. Start with one little plane at a real-world airport,
fly passengers between cities, unlock new airports and grow a fleet. No rivals, no
bankruptcy, no rush. Your airline keeps flying while the tab is closed.

Inspired by the loop of *Pocket Planes*, simplified for a low-stress foundation.

**▶ Play it:** https://calebgarvin.github.io/pixel-planes/

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173), pick a home airport, and tap
**Set route** on your first plane.

| Script              | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Dev server with hot reload                    |
| `npm run build`     | Type-check, then build static files to `dist/` |
| `npm run preview`   | Serve the production build locally            |
| `npm run typecheck` | TypeScript only                               |
| `npm run deploy`    | Build and publish to GitHub Pages             |

There's no backend. `npm run deploy` builds the game and publishes it to the `gh-pages`
branch, which GitHub Pages serves. `dist/` also works on any other static host.

## How to play

1. **Pick a home.** You get a free *Sparrow*, your home airport, the two nearest
   airports, and $40,000.
2. **Set a route.** Select a plane → *Set route* → pick a destination. **Loop** shuttles
   back and forth forever; **Once** flies there and parks.
3. **Passengers** appear at your airports with destinations (the yellow badges on the map).
   A plane boards everyone headed for its next stop, up to its seat count.
4. **Get paid on landing.** Fares scale with distance. Empty seats carry mail, so
   **every flight makes money**.
5. **Grow.** Unlock airports (Airports tab) and buy bigger, faster, longer-range planes (Shop tab).
6. **Close the tab.** When you come back, the game replays everything that happened
   (up to 3 days) and shows a "Welcome back" summary.

Controls: drag to pan (the map wraps around the globe), scroll or pinch to zoom, click
airports and planes to inspect them.

## Design choices

Wherever the design was ambiguous, the calmer option won:

- **Money can't go negative.** Mail fills empty seats and always covers fuel, and every
  unlocked airport pays a trickle of terminal fees ($15/min). You can always recover.
- **Passengers never expire.** When a terminal is full, travelers for the most crowded
  destination slowly give way to new ones, so an unflown destination can't block your real routes.
- **Planes are only sold once landed**, and you always keep at least one.
- **No staff, fuel prices, rivals, events or maintenance.** See *Next steps*.

## Architecture

```
src/
├── main.ts               Entry: wires state, simulation, renderer and UI; frame loop; autosave
├── config.ts             Every tunable number (economy, timing, caps) in one place
├── data/
│   ├── airports.ts       Airport catalog: 41 real airports (IATA code, name, lat/lon, tier)
│   └── planes.ts         Plane catalog: 5 types (seats, speed, range, price, sprite)
├── core/                 Pure game logic. No DOM here.
│   ├── types.ts          Saved GameState shape (plain JSON)
│   ├── state.ts          New-game setup and small helpers
│   ├── geo.ts            Haversine distance and great-circle paths
│   ├── economy.ts        Fares, payouts, unlock costs, flight durations
│   ├── passengers.ts     Passenger spawning and boarding
│   ├── flights.ts        Plane state machine: board → fly → land → next leg
│   ├── simulation.ts     simulateTo(state, time): the only way time moves
│   ├── actions.ts        Player actions (buy, unlock, route, park, sell) with validation
│   └── events.ts         Tiny typed event bus (flightLanded, planeBought, ...)
├── persistence/
│   └── save.ts           localStorage save/load with versioned migrations
├── render/               Canvas drawing. Reads state, never writes it.
│   ├── mapTexture.ts     Builds the pixel world map from Natural Earth coastlines
│   ├── sprites.ts        Sprite registry: procedural placeholders, swappable for PNGs
│   ├── camera.ts         Pan/zoom with east-west wraparound
│   └── renderer.ts       Draws map, clouds, routes, airports, planes; hit-testing
└── ui/                   DOM UI (plain TypeScript, no framework)
    ├── panel.ts          Side panel tabs: Airports, Fleet, Shop, Log + detail views
    ├── modals.ts         Start, welcome-back, route picker, settings dialogs
    ├── uiState.ts        Selection and current tab (not saved)
    ├── toasts.ts         Small notifications
    └── format.ts         Money and time formatting
```

### Key ideas

- **Timestamp-based simulation.** Each flight stores `departAt` and `arriveAt` as real
  epoch milliseconds. `simulateTo(state, Date.now())` replays every landing in order at
  its exact time, then starts the plane's next leg. Live play and offline catch-up use
  the same code path; catch-up just takes bigger steps and mutes UI events. Offline
  time is capped at `CONFIG.maxOfflineMs` (3 days).
- **Core vs. presentation.** `core/` has no DOM access and can run headless (tests,
  a server, or a web worker later). The renderer and UI only *read* state. All changes
  go through `core/actions.ts`, so the rules live in one place.
- **Passengers as counts.** Airports store `waiting[destination] = count` rather than
  individual passenger objects, which keeps saves tiny and the sim fast.
- **Routes are stop lists.** `Route { stops: string[], loop: boolean }`. The sim already
  handles multi-stop routes; the UI just builds 1- and 2-stop ones today.
- **Save versioning.** `GameState.version` plus `migrate()` in `persistence/save.ts`.
  New catalog airports show up in old saves automatically.

### Time & economy at a glance

All in [`src/config.ts`](src/config.ts):

- 1 real minute of flying ≈ 1 game hour (`realSecondsPerGameHour`). London → Paris is about
  50 s in a Sparrow; London → New York is about 6 min in an Albatross.
- Fare = $25 + $0.14/km per passenger. Mail pays 30% of a fare per empty seat. Fuel is
  $0.015/km per seat.
- Airports spawn 4/6/9 passengers per minute by tier, up to 20/28/36 waiting.

## Replacing the art

The visuals are placeholders built to be swapped:

- **Planes:** add a PNG facing right (east), then call
  `registerImageSprite('jet', '/sprites/jet.png')` from `render/sprites.ts` before the game
  starts. The keys are `prop`, `jet` and `jumbo` (see `sprite` in `data/planes.ts`). Put
  images in `public/sprites/`.
- **Airports and clouds:** same registry, `getAirportSprite` / `getCloudSprite`.
- **World map:** `getMapTexture()` returns any drawable in an equirectangular projection
  (1440×720 by default). Return a loaded painted image instead of the generated one.
- **UI theme:** colors are CSS variables at the top of `src/style.css`.

## Debugging

In dev builds, `window.pixelPlanes` is exposed in the browser console:

```js
pixelPlanes.state            // live game state
pixelPlanes.timeTravel(60)   // pretend the tab was closed for 60 minutes, then reload
```

Saves live in `localStorage` under `pixel-planes:save`. Reset from the ⚙ menu.

## Next steps

Rough order, smallest first:

1. **Balance pass**: tune `config.ts` after real play sessions.
2. **More content**: airports and plane types are one-line additions to `data/`.
3. **Multi-stop routes in the UI** (the sim already supports them).
4. **Airport upgrades**: bigger terminals (higher waiting cap or spawn rate) per airport.
5. **Plane upgrades**: seats/speed/range upgrades per plane.
6. **Real sprites, sound and music**: hook sounds onto `events.on('flightLanded', ...)`.
7. **Light events**: e.g. a "festival in Rome" with temporary passenger bonuses.
8. **Tests** for `core/` (it's DOM-free, so Vitest drops right in).
9. **Cloud saves / PWA** for playing across devices.

## Credits

- Coastlines: [Natural Earth](https://www.naturalearthdata.com/) (public domain) via
  [`world-atlas`](https://github.com/topojson/world-atlas).
- Fonts: [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) and
  [Nunito](https://fonts.google.com/specimen/Nunito) (SIL Open Font License).
