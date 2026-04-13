# Random Node Generation API Options

Currently, Bikeapelago uses the public Overpass API to fetch cycling-friendly nodes within a given radius. Since we already have `.pbf` map data locally for GraphHopper routing (as seen in the `graph-cache` directory like `pennsylvania-latest.osm.pbf`, `new-york-latest.osm.pbf`, etc.), we can move away from the external Overpass API.

Our goal is to fetch **random GPS coordinates within a radius of a center point on ways tagged as cyclable** (dropping the previous requirement that nodes must strictly be intersections).

Here are the primary options for implementing our own local node generation.

## Option 1: Extend GraphHopper with a Custom Endpoint (Ruled Out)

While GraphHopper already parses the `.pbf` files, this option involves writing and maintaining custom Java code (a Dropwizard Resource) and compiling a custom JAR.

*Status:* **Ruled Out** – Managing Java code for this extension is not desired.

---

## Option 2: Build a Parser/Cache in Bikeapelago (SvelteKit / Node.js)

Instead of spinning up a new service, we could handle the `.pbf` files natively within the existing SvelteKit backend.

**How it works:**
1. Use a Node.js library like `osmium` or `pbf` to parse the `.pbf` files on disk.
2. Write a script or server route to scan the file for ways (lines) tagged with cycling-friendly highway types (e.g., `highway=residential`, `cycleway`, `path`).
3. Extract the nodes (points) that make up those cyclable ways.
4. Cache these valid cyclable nodes either in memory, a local JSON/SQLite file, or insert them directly into the PocketBase database with a spatial index.
5. The frontend queries a new `/api/nodes` endpoint on the SvelteKit server, which performs a spatial radius query and returns a random subset.

**Pros:**
- Keeps all custom logic within the JavaScript/TypeScript ecosystem you are already using.
- Avoids the overhead of adding another container to the stack.
- Dropping the strict "intersection" requirement makes parsing much simpler since you just need points on valid lines.

**Cons:**
- **High memory/storage overhead:** Processing large `.pbf` files (like a whole state) in Node.js can be highly memory-intensive and potentially slow.
- **Routing inconsistencies:** Just because a point exists on a cyclable way in the `.pbf` doesn't strictly guarantee GraphHopper can route exactly to it (though it is highly likely).

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
3. Build an index of valid nodes by filtering for points that belong to ways tagged as cyclable. Store these coordinates in memory or a lightweight local spatial database (like SQLite with SpatiaLite/NetTopologySuite).
4. Expose an endpoint (e.g., `GET /api/random-nodes?lat=...&lon=...&radius=...&count=...`) that the Bikeapelago SvelteKit backend can call to get random points within the requested circle.
5. Package this API as a Docker container and add it to `docker-compose.yml`.

**Pros:**
- **Performance:** .NET is highly performant and handles memory-intensive tasks like parsing binary `.pbf` files much better than Node.js.
- **Ecosystem:** `OsmSharp` and .NET spatial libraries (like NetTopologySuite) are robust for this exact use case.
- **Separation of Concerns:** Keeps the heavy lifting of map data parsing and spatial radius querying out of your SvelteKit backend, ensuring the main app remains fast.
- **Dedicated Purpose:** The API's sole responsibility is fulfilling Bikeapelago's exact random point generation needs, making it easier to tweak and optimize over time.

**Cons:**
- Adds a new service to the infrastructure (and the `docker-compose.yml`).
- Introduces a new language/stack (`.NET`) to the project ecosystem.
