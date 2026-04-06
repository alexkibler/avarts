# CLAUDE.md - Developer Guide

## Build and Test Commands

- **Dev Server**: `npm run dev` (starts Vite dev server)
- **Build**: `npm run build`
- **Lint**: `npm run lint`
- **Format**: `npm run format`
- **Type Check**: `npm run check`
- **Unit Tests**: `npm run test`
- **E2E Tests**: `npm run test:e2e` (standard Playwright tests)
- **E2E (Specific File)**: `npm run test:e2e <test-file> -- <args>`

## Code Style & Standards

- **Framework**: SvelteKit (Svelte 4)
- **Language**: TypeScript
- **Styling**: TailwindCSS & Vanilla CSS
- **Database**: PocketBase
- **Testing**: Vitest (Unit), Playwright (E2E)
- **Linting**: ESLint, Prettier
- **Imports**: Use `$lib`, `$components`, `$app` aliases. Always prefer relative imports within the same route or component folder.
- **Components**: Use PascalCase for Svelte components. Use lowercase with hyphens for standard HTML/CSS classes where applicable.
- **State Management**: Use Svelte stores for global/shared state. Use `setContext`/`getContext` for component-tree state.
