# AI Developer Notes

## Important: Git Repository Root

**The git repository root is `bikeapelago-src/`**

This is critical for:

- **GitHub Actions workflows**: All paths in `.github/workflows/*.yml` must be relative to `bikeapelago-src/`
  - ✅ Correct: `./db/pocketbase`, `./tests/setup-test-db.ts`, `./pocketbase/pb_schema.json`
  - ❌ Wrong: `./bikeapelago-src/db/pocketbase`
- **Working directories**: Don't set `working-directory:` if the command is already at repo root
- **File references**: All relative paths assume the `bikeapelago-src/` directory as `.`

## System Architecture

Bikeapelago consists of:

1. **Frontend**: SvelteKit application located in `./src/`
2. **Backend**: Custom Node.js/Express server wrapping SvelteKit (`./server.js`)
3. **Database**: PocketBase instance (`./db/pocketbase`)
4. **Game Logic**: Archipelago APWorld definition (`./apworld/`)
5. **Routing Engine**: GraphHopper for processing bike routes (configured in `docker-compose.yml`)

## Core Libraries & Tools

- **UI Framework**: SvelteKit, Tailwind CSS, DaisyUI
- **Map Tools**: Leaflet, Leaflet Routing Machine, @raruto/leaflet-elevation
- **AP Integration**: archipelago.js for connecting to Archipelago game servers
- **Testing**: Vitest (Unit), Playwright (E2E)
- **Formatting**: Prettier, ESLint

## PocketBase Best Practices

- The PocketBase SDK `getList` method expects a maximum of three arguments: `page`, `perPage`, and a single `options` object containing properties like `filter`, `sort`, and `expand`.
- When performing multiple database updates (especially in `src/lib/ap.ts`), prefer concurrent execution using `Promise.all` or PocketBase batching over sequential `await` calls in loops to avoid I/O bottlenecks.
- The PocketBase database schema is defined as a static JSON array in `pocketbase/pb_schema.json`. Schema changes should be manually synced to this file to allow for importing.
- The PocketBase database architecture for Archipelago items aims to use a generic table to track items globally, linked via relation fields to specific detail tables (e.g., map nodes for coordinates), effectively separating Archipelago tracking logic from game-specific logic.

## Archipelago (apworld) Development

- When defining item generation logic in the Archipelago Python codebase (`apworld`), use dedicated configuration constants for ratios and scaling factors (e.g., `LOCATION_SWAP_RATIO`) rather than hardcoding multipliers, to support future difficulty modes and weights.
- Archipelago items are received and initially processed by the SvelteKit application inside the `processReceivedItems` function in `src/lib/ap.ts`, making it the primary location for logic that synchronizes item progression with PocketBase state.

## App Logic & Guidelines

- **SvelteKit Forms**: When working with `FormData` in SvelteKit server routes, retrieve field values using `formData.get('field_name')` rather than direct property access to ensure the values are correctly extracted.
- **Authentication**: The authenticated user's session and profile data (id, name, avatar, weight) are managed via `event.locals.user`, which is populated in `src/hooks.server.ts` from the PocketBase authStore. Always use `locals.user.id` for user-specific server actions to prevent Insecure Direct Object Reference (IDOR) vulnerabilities.
- **Geocoding**: When making batch geocoding requests via the internal `/api/geocode` proxy (e.g., during map_nodes creation), use sequential loops instead of concurrent `Promise.all` to prevent overwhelming the geocoder service and triggering rate limits.
- **Code Refactoring**: Prioritize separating logic from presentation, particularly by extracting complex business logic out of UI components into separate modules.
- **Code Cleanliness**: Remove `console.log` debug statements during cleanup but preserve `console.error` for legitimate error handling and logging.
- **Generated files**: Generated GPX routes are named using the pattern `${sessionName}_${apSlot}` and are meant for direct download rather than being saved to PocketBase.

## Testing Rules & Setup

During refactoring or development, always ensure tests pass. If tests begin failing, build a detailed report outlining the root cause of the failures before applying any fixes.

### Unit Tests

- Write comprehensive unit tests utilizing Vitest for all new components, server routes, and logic modules.
- Run tests: `npm run test`
- Run coverage: `npm run test:coverage`

### End-to-End (E2E) Tests

- Use Playwright for End-to-End (E2E) testing specifically to fully capture the visual UI state across application workflows (especially game mode), ensuring full-page screenshots are attached to the test reports.
- Playwright E2E tests (`npm run test:e2e`) are configured in `playwright.config.ts` to run with the `PUBLIC_MOCK_MODE='true'` environment variable, isolating the frontend and relying on mock data to ensure reliable and consistent visual UI state capturing.
- The `PUBLIC_MOCK_MODE="true"` environment variable replaces PocketBase with an in-memory `MockPocketBase`, bypasses Archipelago API connections, stubs authentication, and mocks all external API/HTTP calls (geocoding, elevation, routing, Overpass) with dummy JSON data.

### GitHub Actions Workflow

- **File**: `.github/workflows/scheduled-e2e.yml`
- **Runs**: Daily at 8:00 AM UTC (4:00 AM EST)
- **What it does**:
  1. Starts fresh PocketBase instance with clean test database (`./db/pb_data_test`)
  2. Runs `tests/setup-test-db.ts` to create admin account and import schema
  3. Installs dependencies and Playwright browsers
  4. Runs full E2E test suite against isolated PocketBase instance

### Local E2E Testing (if needed)

Normally you won't need to run tests locally, but if you do:

```bash
# Terminal 1: Start fresh PocketBase
chmod +x ./db/pocketbase
./db/pocketbase serve --dir=./db/pb_data_test --http=127.0.0.1:8090 &

# Terminal 2: Initialize and run tests
npx ts-node tests/setup-test-db.ts
npm run test:e2e
```

Alternatively, use the setup script approach from the workflow.
