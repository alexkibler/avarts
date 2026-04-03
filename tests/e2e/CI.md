# CI/CD Smoke Testing Guide

This guide explains how to run the Bikeapelago E2E suite against a live deployment from a cloud agent session (Jules, Claude Code cloud, GitHub Actions, etc.).

## How It Works

The test suite is fully self-contained. On each run it:
1. Creates a fresh test user in PocketBase
2. Creates a game session with 10 seeded map nodes (Pittsburgh coordinates)
3. Runs all tests
4. Deletes the test user and all associated data (cascade)

No pre-seeded accounts, no `SKIP_DB_RESET`, no manual setup required.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `BASE_URL` | Public URL of the SvelteKit app | Yes |
| `TEST_PB_URL` | Public URL of PocketBase API | Yes |
| `TEST_ADMIN_EMAIL` | PocketBase admin email | Yes |
| `TEST_ADMIN_PASSWORD` | PocketBase admin password | Yes |

## Running from a Cloud Agent

```bash
cd bikeapelago-src
npm ci
npx playwright install --with-deps
BASE_URL=https://bikeapelago.alexkibler.com \
  TEST_PB_URL=https://pb.bikeapelago.alexkibler.com \
  TEST_ADMIN_EMAIL=<secret> \
  TEST_ADMIN_PASSWORD=<secret> \
  npm run test:e2e
```

Results (screenshots, traces on failure) are in `playwright-report/`.

## GitHub Actions Example

```yaml
name: E2E Smoke Test
on:
  workflow_dispatch:

jobs:
  smoke-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
      - name: Install dependencies
        run: npm ci
        working-directory: bikeapelago-src
      - name: Install Playwright browsers
        run: npx playwright install --with-deps
        working-directory: bikeapelago-src
      - name: Run E2E suite
        run: npm run test:e2e
        working-directory: bikeapelago-src
        env:
          BASE_URL: ${{ vars.APP_URL }}
          TEST_PB_URL: ${{ vars.PB_URL }}
          TEST_ADMIN_EMAIL: ${{ secrets.PB_ADMIN_EMAIL }}
          TEST_ADMIN_PASSWORD: ${{ secrets.PB_ADMIN_PASSWORD }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: bikeapelago-src/playwright-report/
          retention-days: 7
```
