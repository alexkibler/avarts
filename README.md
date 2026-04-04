<h1 align="center">
  <br>
  <img src="/static/bikeapelago.svg" alt="Bikeapelago" width="500">
</h1>

<h4 align="center">An Archipelago multiworld client where real-world cycling intersections are your Locations.</h4>

<p align="center">
  <a href="#how-it-works">How It Works</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#apworld-setup">apworld Setup</a> •
  <a href="#pocketbase-setup">PocketBase Setup</a> •
  <a href="#creating-a-session">Creating a Session</a> •
  <a href="#playing">Playing</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#testing">Testing</a> •
  <a href="#configuration">Configuration</a>
</p>

---

**Bikeapelago** is an [Archipelago](https://archipelago.gg) multiworld game where you play in the real world.

- **Locations** are real cycling intersections near you, sourced live from OpenStreetMap.
- **Items** are **Node Unlocks** — each one reveals a new intersection on your map.
- **Checks** are completed by riding to an unlocked intersection and uploading the `.fit` file from your GPS device.

---

## How It Works

1. Generate an Archipelago seed that includes `Bikeapelago` as one of the games.
2. Create a **Game Session** in the web client — pick a map center and radius, and the app fetches real cycling intersections from OSM and assigns them as your locations.
3. Connect to the Archipelago server. As you receive **Node Unlock** items from the multiworld, intersections appear on your map.
4. Ride to them IRL. Upload your `.fit` file to validate the check — the app runs a 30-metre Haversine proximity check against all available nodes.
5. Validated checks are sent to the Archipelago server as `LocationChecks`.

---

## Quick Start

### Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- A self-hosted or cloud [Archipelago](https://archipelago.gg) server
- A cycling GPS device that produces `.fit` files (Garmin, Wahoo, etc.)
- A self-hosted [GraphHopper](https://www.graphhopper.com/) routing server (or a GraphHopper API key) for route planning

### Run with Docker Compose

```bash
git clone <this-repo> && cd bikeapelago
docker compose up -d
```

The app is available at `http://localhost:8182`.  
PocketBase admin UI is at `http://localhost:8090/_/` (default credentials: `admin@bikeapelago.lan` / `adminadmin` — **change these immediately**).

---

## apworld Setup

The Archipelago world definition lives in `apworld/bikeapelago/`.

### Install

1. Zip the `bikeapelago/` directory into `bikeapelago.apworld`:
   ```bash
   cd apworld
   zip -r bikeapelago.apworld bikeapelago/
   ```
2. Place `bikeapelago.apworld` in your Archipelago `worlds/` directory.

### YAML Options

```yaml
game: Bikeapelago
name: YourSlotName
Bikeapelago:
  check_count: 50          # Number of intersections / locations (10–1000, default 100)
  goal_type: all_intersections  # all_intersections | percentage
```

| Option | Values | Description |
|--------|--------|-------------|
| `check_count` | 10 – 1000 | How many intersection locations to generate |
| `goal_type` | `all_intersections` | Win by checking every location |
| | `percentage` | Win by checking 70 % of locations |

### Items & Locations

- **Items:** `Node Unlock 1` … `Node Unlock N` — each unlocks one intersection on the map.
- **Locations:** `Intersection 1` … `Intersection N` — completed by riding to that node IRL.
- **Goal:** A locked `Victory` item is placed at the `Goal` event location, accessible once the required number of checks are complete.

---

## PocketBase Setup

Bikeapelago requires two custom PocketBase collections: `game_sessions` and `map_nodes`.

### Import via Admin UI

1. Open the PocketBase Admin UI at `http://localhost:8090/_/`.
2. Go to **Settings → Import collections**.
3. Paste the contents of `pocketbase/pb_schema.json` and click **Import**.

### Manual Collection Definitions

If you prefer to create the collections by hand:

#### `game_sessions`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `user` | Relation → `users` | ✓ | cascade delete |
| `ap_seed_name` | Text | ✓ | human-readable label |
| `ap_server_url` | Text | ✓ | e.g. `archipelago.gg:38281` |
| `ap_slot_name` | Text | ✓ | your slot name in the multiworld |
| `center_lat` | Number | ✓ | latitude of the play area centre |
| `center_lon` | Number | ✓ | longitude of the play area centre |
| `radius` | Number | ✓ | radius in metres |
| `status` | Select | ✓ | `Active` \| `Completed` |

**API Rules** (recommended):
- List / View / Update / Delete: `@request.auth.id = user.id`
- Create: `@request.auth.id != ""`

#### `map_nodes`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `session` | Relation → `game_sessions` | ✓ | cascade delete |
| `ap_location_id` | Number | ✓ | Archipelago location ID (e.g. 800001) |
| `osm_node_id` | Text | ✓ | OpenStreetMap node ID |
| `lat` | Number | ✓ | |
| `lon` | Number | ✓ | |
| `state` | Select | ✓ | `Hidden` \| `Available` \| `Checked` |

**API Rules** (recommended):
- List / View / Update / Delete: `@request.auth.id = session.user.id`
- Create: `@request.auth.id != ""`

---

## Creating a Session

1. Log in to the web client and click **Play → + New Session** (or navigate to `/new-game`).
2. Fill in the form:
   - **Seed Name** — a label for this session (e.g. `Summer 2025 Multiworld`)
   - **Archipelago Server** — hostname and port (e.g. `archipelago.gg:38281`)
   - **Slot Name** — your slot name in the generated seed
   - **Radius** — how large a play area to generate (metres)
   - **Check Count** — must match the `check_count` in your YAML
3. Set your centre point — type an address and click **Search**, click **Use My Location**, or click directly on the map.
4. Click **Generate Session**.

The app queries OpenStreetMap's Overpass API for cycling intersections inside your radius (only `residential`, `tertiary`, `unclassified`, `living_street`, `cycleway`, and `track` ways where `bicycle != no`), filters for real intersections (nodes belonging to 2+ differently named ways), shuffles them, and writes `check_count` nodes to PocketBase with `state: Hidden`.

You are then redirected to the game page automatically.

---

## Playing

### Connect to Archipelago

On the game page (`/game/<id>`), confirm or edit the connection details and click **Connect & Play**.

The client connects via WebSocket using `archipelago.js`. On connection:
- All already-received **Node Unlock** items are processed — the corresponding nodes flip from `Hidden` → `Available` and appear on the map.
- New items received during the session are processed in real time.

### The Map

- **Orange markers** — Available intersections you can ride to.
- **Green markers** — Checked (completed) intersections.
- Click an available marker to add it as a routing waypoint.
- Use **Download GPX** to download the planned route to your device.
*(Note: The ability to add specific non-node locations to the route planner is planned for a future update.)*

### Validating a Check

1. Ride to one or more available intersections IRL.
2. Save the activity as a `.fit` file and transfer it to your computer.
3. Drag and drop (or click to upload) the `.fit` file into the **Validate Check(s)** panel on the game page.
4. Click **Validate**.

The app parses the GPS track, runs a **30-metre Haversine proximity check** against every available node, and for each match:
- Updates the node's `state` to `Checked` in PocketBase.
- Sends a `LocationChecks` packet to the Archipelago server.

Results are shown inline. The node stats counter in the header updates automatically.

### Winning

When the goal condition is met (all intersections checked, or 70 % for `percentage` mode), the Archipelago server will send the `Victory` item to your slot, completing your game.

---

## Testing

Bikeapelago uses [Playwright](https://playwright.dev/) for end-to-end (E2E) testing. The suite validates the full gameplay loop from session creation to FIT file upload.

### Running Tests

Execute the suite from the `bikeapelago-src` directory:

```bash
# Run all tests (desktop & mobile)
npx playwright test

# Run specifically for mobile (iPhone 16 Pro configuration)
npx playwright test --project=mobile

# Run specifically for desktop chromium
npx playwright test --project=chromium
```

### Automated Screenshots
Tests generate visual walkthroughs in the `test-screenshots/` directory. 
- **Mobile Screenshots**: Use `fullPage: true` to capture the entire layout.
- **The Fold**: Mobile captures include a **red horizontal line** at `874px` to indicate the initial device viewport (at the fold).

### Routing Verification
The E2E suite requires a running GraphHopper instance (configured via `playwright.config.ts`) to verify road-snapped routing.

---

## Deployment

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PUBLIC_DB_URL` | `http://127.0.0.1:8090` | Public URL of the PocketBase API (browser-facing — required for internet hosting) |
| `PUBLIC_GRAPHHOPPER_URL` | — | **Recommended:** URL of a self-hosted GraphHopper `/route` endpoint (e.g., `http://localhost:8989/route`) |
| `PUBLIC_GRAPHHOPPER_API` | — | GraphHopper cloud API key (used if no self-hosted URL is set) |
| `PUBLIC_REGISTRATION` | `true` | Set to `false` to disable new user registration |
| `BODY_SIZE_LIMIT` | `5242880` | Max upload size in bytes (default 20 MB in Docker Compose) |

### Docker Compose (recommended)

The repo root contains a `docker-compose.yml` that builds and runs both the Bikeapelago app and GraphHopper.

**1. Clone and configure**

```bash
git clone <this-repo> bikeapelago && cd bikeapelago
```

Edit the `environment:` block in `docker-compose.yml` to set your public URLs:

```yaml
environment:
  - PUBLIC_DB_URL=https://pb.yourdomain.com
  - PUBLIC_GRAPHHOPPER_URL=https://routing.yourdomain.com/route
  - PUBLIC_REGISTRATION=true
  - BODY_SIZE_LIMIT=20971520
```

**2. Set up GraphHopper map data**

Download a regional `.osm.pbf` extract from [Geofabrik](https://download.geofabrik.de/) and place it in `graphhopper/data/`. Update `PBF_FILE` in the compose file to match the filename.

**3. Build and start**

```bash
docker compose build
docker compose up -d
```

The Bikeapelago frontend is available at `http://localhost:8182`.  
PocketBase admin UI is at `http://localhost:8090/_/`.

> **First boot:** GraphHopper indexes the `.osm.pbf` on startup — this takes 20–40 minutes for large regions. Watch progress with `docker logs -f graphhopper`.

**4. PocketBase first-time setup**

1. Open the admin UI at `http://localhost:8090/_/` (or your public PocketBase URL).
2. Create your admin account — change the default `admin@bikeapelago.lan` / `adminadmin` immediately.
3. Go to **Settings → Import collections** and paste `pocketbase/pb_schema.json`.

### Deploying Updates

```bash
git pull
docker compose build bikeapelago && docker compose up -d bikeapelago
```

GraphHopper only needs a rebuild if its `Dockerfile` or `config.yml` changed.

### Reverse Proxy

The app exposes two ports that need public DNS:

| Port | Service |
|------|---------|
| `8182` | SvelteKit frontend |
| `8090` | PocketBase API + admin UI |

Set `PUBLIC_DB_URL` to the public URL of port 8090 so the browser can reach PocketBase directly.

For nginx-proxy-manager, add two proxy hosts pointing to `host.docker.internal` at each port and enable SSL.

### GraphHopper (self-hosted routing)

Self-hosted GraphHopper gives cycling-optimised routes from local OSM data. On first boot it indexes the `.osm.pbf` — this can take 20–40 minutes for large regions.

1. Download a region `.osm.pbf` from [Geofabrik](https://download.geofabrik.de/) into `graphhopper/data/`.
2. Set `PBF_FILE=your-region.osm.pbf` in the `graphhopper` service environment.
3. Run `docker compose up -d graphhopper`.
4. Point the app at it with `PUBLIC_GRAPHHOPPER_URL=http://<host>:8989/route`.

To update map data later: stop GraphHopper, replace the `.osm.pbf`, delete the cache files (`*.ghz`, `graph-cache/`), then rebuild and restart.

---

## Configuration

### Resetting Passwords

Since registration does not require an email address, password resets must be done via the PocketBase admin UI (`/users` collection) or via the CLI:

```bash
./db/pocketbase admin update admin@bikeapelago.lan
```

### PocketBase Admin Credentials

Default: `admin@bikeapelago.lan` / `adminadmin`

Change these immediately after first deployment via the admin UI at `http://localhost:8090/_/`.

---

## FAQ

**Q: What GPS file format is supported for validation?**  
A: Only `.fit` files (Garmin FIT format) are currently supported. Most modern cycling computers and smartwatches export this format natively.

**Q: How accurate is the proximity check?**  
A: 30 metres by default. This is calculated using the Haversine formula against every GPS point in your ride track.

**Q: What routing engine is recommended?**  
A: Self-hosted GraphHopper with a local OSM extract gives the best cycling-specific routes.

**Q: Can I play multiple multiworlds at once?**  
A: Yes — each game session is independent. Use the **Play** page to switch between sessions.
