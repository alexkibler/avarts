# CI/CD Smoke Testing Guide

This guide explains how to run the Bikeapelago E2E suite as a smoke test against a public URL in a CI/CD pipeline (e.g., GitHub Actions).

## Prerequisites

1.  **Public URL**: Your site must be accessible from the internet (or your CI runner).
2.  **Smoke Test Account**: Create a dedicated user (e.g., `smoketest`) and a game session on your public site.
3.  **Secrets**: Store your PocketBase admin credentials in your CI provider (if you need to reset the DB for the smoke test account).

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BASE_URL` | The public URL of your site (e.g., `https://bikeapelago.com`). Disables local `webServer`. |
| `SKIP_DB_RESET` | Set to `true` to skip the `resetGameDb()` call. Crucial for non-destructive production tests. |
| `TEST_ADMIN_EMAIL` | PocketBase admin email (required if `SKIP_DB_RESET=false`). |
| `TEST_ADMIN_PASSWORD` | PocketBase admin password (required if `SKIP_DB_RESET=false`). |

## GitHub Actions Example

Save this as `.github/workflows/smoke-test.yml`:

```yaml
name: Remote Smoke Test
on:
  deployment_status:
  workflow_dispatch:
    inputs:
      base_url:
        description: 'URL to test'
        required: true
        default: 'https://bikeapelago.alexkibler.com'

jobs:
  smoke-test:
    if: github.event_name == 'workflow_dispatch' || github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
          
      - name: Install dependencies
        run: npm ci
        working-directory: bikeapelago-src

      - name: Install Playwright Browsers
        run: npx playwright install --with-deps
        working-directory: bikeapelago-src

      - name: Run Smoke Test
        run: npx playwright test
        working-directory: bikeapelago-src
        env:
          BASE_URL: ${{ github.event.inputs.base_url || github.event.deployment_status.target_url }}
          SKIP_DB_RESET: "true"
          # Optional: provide DB URL if reset is needed
          # PUBLIC_DB_URL: https://pb.bikeapelago.alexkibler.com
          
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: bikeapelago-src/playwright-report/
          retention-days: 7
```

## Local Verification

You can verify the smoke test behavior locally by running:

```bash
cd bikeapelago-src
SKIP_DB_RESET=true BASE_URL=https://your-public-site.com npx playwright test
```

> [!WARNING]
> Running with `SKIP_DB_RESET=true` means the test will interact with whatever state is currently in the database for the user. Ensure your "Smoke Test Session" is pre-configured with a valid route for the test to succeed.
