# Next.js Porting Plan for Bikeapelago

This document outlines the step-by-step plan for porting the existing Bikeapelago application from SvelteKit to Next.js (App Router), while preserving its current backend integration (PocketBase, GraphHopper), deployment strategy (Docker Compose), and preparing it for native mobile deployment via Capacitor.

## 1. Project Initialization & Setup

- [ ] Initialize a new Next.js project (with App Router, TypeScript, Tailwind CSS, and ESLint).
- [ ] Set up the directory structure mapping `src/routes` from SvelteKit to the Next.js `app` directory.
- [ ] Install equivalent UI dependencies (matching those in `package.json`):
  - `leaflet`, `react-leaflet`, `leaflet-routing-machine`, etc.
  - `canvas-confetti`
  - Charting libraries for elevation (equivalent to `@raruto/leaflet-elevation` but for React).
- [ ] Setup global CSS (`app/globals.css`), migrating SvelteKit's `app.css`.
- [ ] Configure next.config.js for static export (output: 'export') and disable default image optimization (images: { unoptimized: true }).

## 2. Authentication & Database Integration (PocketBase)

- [ ] Port `src/lib/database.ts` and `src/hooks.server.ts` logic.
- [ ] Create a React context or Zustand store to manage PocketBase authentication state on the client side.
- [ ] Since we are using static export (`output: 'export'`) for Capacitor, server-side auth (like SvelteKit's `hooks.server.ts` modifying cookies) will need to be adapted to client-side auth. The Next.js app will rely on the PocketBase SDK directly from the client.
- [ ] Ensure mock mode (`MockPocketBase`) logic is properly ported and injected based on environment variables (`process.env.NEXT_PUBLIC_MOCK_MODE`).

## 3. UI Component Migration

- [ ] Port Svelte components from `src/components/` to React components.
  - Migrate Leaflet map components carefully. Note that React Strict Mode can cause issues with Leaflet; ensure map instances are initialized properly within `useEffect` or via `react-leaflet`.
  - Port `.fit` file parsing (`fit-file-parser`) and chart rendering logic to React components.

## 4. Route Migration

- [ ] `/`: Port `src/routes/+page.svelte` to `app/page.tsx`.
- [ ] `/login` & `/register`: Implement PocketBase client-side authentication.
- [ ] `/new-game`: Port `src/routes/new-game/+page.svelte` to `app/new-game/page.tsx`.
- [ ] `/game/[id]`: Port the main game dashboard (`src/routes/game/+page.svelte` or nested routes). Handle Archipelago connection logic within a persistent React Context or specialized hook so connections aren't dropped on re-renders.
- [ ] `/athlete`: Port profile page (`src/routes/athlete/+page.svelte` to `app/athlete/page.tsx`).
- [ ] `/setup-session`, `/yaml-creator`: Port game setup forms.

## 5. Archipelago Integration

- [ ] Port Archipelago client logic to a React Context or custom hooks. Ensure the implementation handles React Strict Mode to prevent duplicate connections.
- [ ] Ensure item processing logic properly interacts with the PocketBase database as it currently does.

## 6. Capacitor Setup

- [ ] Install `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, and `@capacitor/android`.
- [ ] Initialize Capacitor (`npx cap init`).
- [ ] Configure `capacitor.config.ts` to point the `webDir` to Next.js's output directory (`out`).
- [ ] Add platform targets (`npx cap add android`, `npx cap add ios`).
- [ ] Set up any necessary Capacitor plugins (e.g., Geolocation, FileSystem).

## 7. Build and Deployment Adaptation

- [ ] Update `Dockerfile`:
  - Change the builder stage to run `npm run build` using Next.js.
  - The express server approach (`server.js`) can be kept if we choose not to statically export the web version, or we can use a standard static server (like `serve` or Nginx) since the mobile version requires a static build. If we want SSR for the web and static for mobile, we need two separate build commands/configurations.
  - Update the `docker-compose.yml` (if necessary) to reflect any port changes (though keeping 8080 is fine).

## 8. Testing & Validation

- [ ] Port E2E Playwright tests to work with the Next.js UI structure.
- [ ] Validate PocketBase integration.
- [ ] Validate Archipelago multiworld connection.
- [ ] Validate routing engine (GraphHopper) integration.
- [ ] Verify static export (`npm run build`) works flawlessly for Capacitor deployment.

## 9. Final Review & Cleanup

- [ ] Ensure all mock modes work.
- [ ] Clean up redundant SvelteKit specific configurations (`svelte.config.js`, `vite.config.ts`, etc. - or move them to a legacy branch/folder).
- [ ] Add detailed documentation in README about running the Next.js dev server and building for Capacitor.
