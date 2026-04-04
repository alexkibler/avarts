# CLAUDE.md — Bikeapelago Developer Notes

## Important: Git Repository Root

**The git repository root is `bikeapelago-src/`, not the parent `avarts/` directory.**

This is critical for:

- **GitHub Actions workflows**: All paths in `.github/workflows/*.yml` must be relative to `bikeapelago-src/`
  - ✅ Correct: `./db/pocketbase`, `./tests/setup-test-db.ts`, `./pocketbase/pb_schema.json`
  - ❌ Wrong: `./bikeapelago-src/db/pocketbase`
- **Working directories**: Don't set `working-directory:` if the command is already at repo root
- **File references**: All relative paths assume the `bikeapelago-src/` directory as `.`

## E2E Testing

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
