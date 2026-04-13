# Svelte 4 to Svelte 5 Migration Plan

This document outlines the comprehensive strategy for migrating the Bikeapelago project from Svelte 4 to Svelte 5. The primary goal is to leverage Svelte 5's new reactivity model (Runes) for improved performance, maintainability, and developer experience, while ensuring compatibility with external libraries like Leaflet and GraphHopper.

## 1. Dependency Updates & Tooling

Before making code changes, the project's tooling needs to be updated to support Svelte 5.

*   **`package.json` Updates:**
    *   Update `svelte` to `^5.0.0` (or the latest stable Svelte 5 release).
    *   Update `@sveltejs/kit` to the latest version compatible with Svelte 5.
    *   Update `@sveltejs/vite-plugin-svelte` to `^4.0.0` (or compatible version).
    *   Update `@sveltejs/adapter-node`.
    *   Update `svelte-check` and `eslint-plugin-svelte` to their latest versions to ensure proper type checking and linting for Runes.
*   **CLI Tooling:**
    *   While `npx svelte-migrate svelte-5` exists, it is highly recommended to run this on individual components or directories and carefully review the output, rather than relying on it to perfectly convert complex files like `MapCore.svelte` or `apMap.svelte`.

## 2. Component Props Refactoring (`$props()`)

Svelte 5 introduces `$props()` to replace `export let`.

*   **Action:** Find all instances of `export let` in `.svelte` files and refactor them.
*   **Pattern:**
    ```svelte
    <!-- Before (Svelte 4) -->
    <script lang="ts">
      export let sessionId: string;
      export let sessionName: string = '';
    </script>

    <!-- After (Svelte 5) -->
    <script lang="ts">
      let { sessionId, sessionName = '' }: { sessionId: string; sessionName?: string } = $props();
    </script>
    ```
*   **Impacted Files:**
    *   `src/components/game/MapCore.svelte` (`centerLat`, `centerLon`, `radius`, `sessionId`)
    *   `src/components/apMap.svelte`
    *   `src/components/game/GameHUD.svelte`
    *   `src/routes/+layout.svelte` (and other layout/page components receiving `data`)
    *   *Note: If a prop was two-way bound (e.g., `bind:this` from a parent), ensure it is properly destructured as a bindable prop if the child intends to reassign it.*

## 3. Reactivity Refactoring (`$derived`, `$effect`, `$state`)

The most significant change is replacing reactive statements (`$:`) with Svelte 5 Runes.

*   **Local State (`$state`):** Replace standard `let` declarations that require reactivity with `let variable = $state(initialValue)`.
*   **Derived State (`$derived`):** Replace reactive assignments (`$: x = y * 2`) with `$derived`.
    ```svelte
    <!-- Before -->
    $: isVisible = !!$currentRoute;

    <!-- After -->
    let isVisible = $derived(!!$currentRoute);
    ```
*   **Side Effects (`$effect`):** Replace reactive blocks (`$: { ... }`) that execute side effects (like updating Leaflet maps or syncing PocketBase) with `$effect`.
    ```svelte
    <!-- Before -->
    $: if ($mapNodes && map && L) {
        renderPins();
    }

    <!-- After -->
    $effect(() => {
        if ($mapNodes && map && L) {
            renderPins();
        }
    });
    ```
*   **Warning (Over-fetching):** Be extremely careful with `$effect`. Unlike `$:`, `$effect` tracks dependencies automatically based on what is read inside the block. If an `$effect` reads a value and also mutates a value that triggers another `$effect`, infinite loops can occur. Carefully review `MapCore.svelte` and `apMap.svelte` to ensure map re-rendering doesn't cause infinite loops when interacting with `$lib/mapState.ts`.

## 4. Event Refactoring (Callback Props)

Svelte 5 deprecates `createEventDispatcher` in favor of passing callback functions as props.

*   **Action:** Remove `createEventDispatcher` from all components.
*   **Pattern:**
    ```svelte
    <!-- Before (Child.svelte) -->
    <script>
      import { createEventDispatcher } from 'svelte';
      const dispatch = createEventDispatcher();
      function handleClick() { dispatch('validated'); }
    </script>

    <!-- After (Child.svelte) -->
    <script>
      let { onValidated }: { onValidated?: () => void } = $props();
      function handleClick() { onValidated?.(); }
    </script>
    ```
*   **Impacted Files:**
    *   `src/components/game/MapCore.svelte` (`validated` event)
    *   `src/components/game/GameHUD.svelte` (`routeToAvailable`, `clearRoute`, `rideParsed`, `rideCancelled`, `validated`)
    *   `src/components/game/RoutePanel.svelte` (`routeToAvailable`, `clearRoute`, `nodeTap`)
    *   `src/components/VictoryScreen.svelte` (`close`)

## 5. Stores Refactoring (`.svelte.ts`)

While Svelte 4 `writable` stores (`$lib/stores.ts`, `$lib/mapState.ts`) still work in Svelte 5, it is highly recommended to refactor them to use global `$state` runes within `.svelte.ts` files for a more cohesive architecture.

*   **Action:** Create `.svelte.ts` files to replace existing stores.
*   **Pattern:**
    ```typescript
    // Before (Svelte 4 Store)
    import { writable } from 'svelte/store';
    export const userCookie = writable(null);

    // After (Svelte 5 Rune in stores.svelte.ts)
    export const userState = {
      userCookie: $state(null)
    };
    // Usage in component: import { userState } from '$lib/stores.svelte'; ... userState.userCookie.user
    ```
*   **Refactoring Scope:** This is an opportunity for improved maintainability. `mapState.ts` is complex and manages heavily interconnected state (routes, distances, nodes). Moving this to a class-based state object using Runes might simplify the logic.

## 6. External Libraries & Lifecycle Methods

*   **Lifecycle Hooks:** `onMount` and `onDestroy` continue to work. However, some initialization logic currently in `onMount` might be better suited for an `$effect` (if it depends on reactive state).
*   **Leaflet (`MapCore.svelte`):** Leaflet modifies the DOM directly. It is crucial that the container `div` where Leaflet mounts is *not* destroyed and recreated by Svelte's reactivity.
    *   Ensure the `bind:this={mapElement}` pattern is maintained.
    *   Initialization of `L.map()` must remain in `onMount` (or a client-side-only `$effect`) because it requires the physical DOM element to exist.
    *   Use `$effect` blocks strictly to *update* existing Leaflet objects (e.g., `marker.setLatLng()`, `marker.setStyle()`) based on state changes, rather than recreating them entirely, to ensure performance.
*   **Context API:** `getContext` and `setContext` (used heavily in `IGameEngine` implementations) are fully supported, but if you are passing Runes (`$state`) via context, you don't need to wrap them in Svelte 4 stores anymore. You can just pass the state object.

## 7. Next Steps & Execution

1.  **Create Branch:** Branch off `main` for the `svelte-5-migration`.
2.  **Update Dependencies:** Apply the `package.json` updates and run `npm install`.
3.  **Automated Migration (Optional):** Run `npx svelte-migrate svelte-5` and carefully review the diff. Revert any changes that look incorrect.
4.  **Manual Refactoring:** Follow the steps above, working incrementally (e.g., Route Panel first, then Map Core).
5.  **Testing:** The `npm run test:e2e` suite (Playwright) will be critical to verify that the map renders correctly and visual interactions remain identical to the Svelte 4 version. Run tests frequently.
