# GEMINI.md - Developer Guide

## Commands & Scripts

- **Development**: `npm run dev`
- **Build Production**: `npm run build`
- **Linting**: `npm run lint`
- **Typing Check**: `npm run check`
- **Prettier Format**: `npm run format`
- **Unit Testing**: `npm run test`
- **E2E Testing (General)**: `npm run test:e2e`
- **E2E Testing (Specific)**: `npm run test:e2e <test-file> -- <args>` (Always use this format to avoid manual approval prompts)

## Tech Stack Overview

- **UI Framework**: SvelteKit (Svelte 4)
- **Programming Language**: TypeScript (Strict Mode)
- **CSS Strategy**: Vanilla CSS + TailwindCSS (v3)
- **Backend/Storage**: PocketBase (via `$lib/database`)
- **Map Library**: Leaflet (via `$lib/osm` and various components)
- **Routing Engine**: GraphHopper (Local or remote)
- **Integration Layer**: Archipelago.js (@airbreather/archipelago.js)

## Coding Conventions

- **Component Naming**: PascalCase for `.svelte` files.
- **Directory Structure**:
  - `src/components`: Reusable UI components.
  - `src/lib`: Core logic, types, and database utilities.
  - `src/routes`: SvelteKit pages and API endpoints.
- **Import Aliases**:
  - `$lib`: Points to `src/lib`.
  - `$components`: Points to `src/components`.
  - `$app`: SvelteKit app modules (navigation, stores, etc.).
- **Async Logic**: Use `onMount` for client-side window/navigator access.
- **Geolocation**: Prefer standard `navigator.geolocation` patterns for acquiring user position.
