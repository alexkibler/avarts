# Random Node Generation API Options

Currently, Bikeapelago uses the public Overpass API to fetch cycling-friendly intersections within a given radius. Since we already have `.pbf` map data locally for GraphHopper routing (as seen in the `graph-cache` directory like `pennsylvania-latest.osm.pbf`, `new-york-latest.osm.pbf`, etc.), we can move away from the external Overpass API.

Here are the primary options for implementing our own local node generation.

## Option 1: Extend GraphHopper with a Custom Endpoint (Ruled Out)

While GraphHopper already parses the `.pbf` files, this option involves writing and maintaining custom Java code (a Dropwizard Resource) and compiling a custom JAR.

*Status:* **Ruled Out** – Managing Java code for this extension is not desired.

---

## Option 2: Build a Parser/Cache in Bikeapelago (SvelteKit / Node.js)

Instead of spinning up a new service, we could handle the `.pbf` files natively within the existing SvelteKit backend.

**How it works:**
1. Use a Node.js library like `osmium` or `pbf` to parse the `.pbf` files on disk.
2. Write a script or server route to scan the file for highway intersections.
3. Cache the extracted nodes either in memory, a local JSON/SQLite file, or insert them directly into the PocketBase database.
4. The frontend queries a new `/api/nodes` endpoint on the SvelteKit server.

**Pros:**
- Keeps all custom logic within the JavaScript/TypeScript ecosystem you are already using.
- Avoids the overhead of adding another container to the stack.

**Cons:**
- **High memory/storage overhead:** Processing large `.pbf` files (like a whole state) in Node.js can be highly memory-intensive and potentially slow.
- **Routing inconsistencies:** Just because an intersection exists in the `.pbf` doesn't mean GraphHopper's `bike` profile considers it accessible. This could lead to generating nodes that the router can't reach.

---

## Option 3: Self-Host Overpass API Locally (Ruled Out)

This option involved running an Overpass container to query the local data using the same Overpass QL logic.

*Status:* **Ruled Out** – Difficulties with getting Overpass running locally make this an unviable path.

---

## Option 4: Build a Dedicated .NET API (Recommended Alternative)

Since Option 1 and 3 are out, and Option 2 has potential performance pitfalls in Node.js, building a brand new, lightweight API in .NET (`dotnet`) is a strong alternative.

**How it works:**
1. Create a new .NET Web API project.
2. Use a library like `OsmSharp` to efficiently parse the local `.pbf` files.
3. Build an index of valid intersections (e.g., cross-referencing ways tagged as cyclable) and store them in memory or a lightweight local database (like SQLite/LiteDB).
4. Expose an endpoint (e.g., `GET /api/random-nodes?lat=...&lon=...&radius=...`) that the Bikeapelago SvelteKit backend can call instead of the public Overpass API.
5. Package this API as a Docker container and add it to `docker-compose.yml`.

**Pros:**
- **Performance:** .NET is highly performant and handles memory-intensive tasks like parsing binary `.pbf` files much better than Node.js.
- **Ecosystem:** `OsmSharp` is a mature and robust library specifically designed for working with OSM data in C#.
- **Separation of Concerns:** Keeps the heavy lifting of map data parsing out of your SvelteKit backend, ensuring the main app remains fast and responsive.
- **Dedicated Purpose:** The API's sole responsibility is fulfilling Bikeapelago's exact node generation needs, making it easier to tweak and optimize over time.

**Cons:**
- Adds a new service to the infrastructure (and the `docker-compose.yml`).
- Introduces a new language/stack (`.NET`) to the project ecosystem.
- Like Option 2, it does not guarantee 100% parity with GraphHopper's internal routing graph, so some generated nodes might still be unreachable, though filtering by highway tags can minimize this.
