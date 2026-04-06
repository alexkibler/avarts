# Random Node Generation API Options

Currently, Bikeapelago uses the public Overpass API to fetch cycling-friendly intersections within a given radius. Since we already have `.pbf` map data locally for GraphHopper routing (as seen in the `graph-cache` directory like `pennsylvania-latest.osm.pbf`, `new-york-latest.osm.pbf`, etc.), we can move away from the external Overpass API.

Here are the primary options for implementing our own local node generation, keeping in mind the preference to leverage existing data and services.

## Option 1: Extend GraphHopper with a Custom Endpoint (Recommended)

Since GraphHopper is already parsing the `.pbf` files, building an optimized routing graph, and keeping it in memory, this is the most efficient and powerful option. GraphHopper uses the Dropwizard framework under the hood, making it relatively straightforward to add custom REST endpoints.

**How it works:**
1. Create a custom Java project that depends on GraphHopper.
2. Write a custom Dropwizard `Resource` class (the API endpoint, e.g., `/custom/nodes`).
3. Inject the `GraphHopper` instance into your resource.
4. Use GraphHopper's `LocationIndex` and `Graph` API to query for nodes (e.g., intersections or random points along edges) within a specified bounding box or radius.
5. Compile this into a new JAR (or a plugin) and run GraphHopper using this custom JAR instead of the default `graphhopper-web-X.jar`.

**Pros:**
- **Zero redundant data processing:** GraphHopper has already processed the `.pbf` files and filtered out non-cyclable ways based on its profiles (e.g., `bike`). You only get nodes that are guaranteed to be routable.
- **High Performance:** The graph and spatial index (`LocationIndexTree`) are already in RAM, making radius queries extremely fast.
- **No extra services:** You don't need to spin up a new Docker container.
- **Aligns with preference:** Fulfills the goal of extending the existing GraphHopper engine.

**Cons:**
- Requires writing and maintaining a small amount of Java code.
- You have to build your own custom GraphHopper JAR rather than using the generic upstream release directly.

---

## Option 2: Build a Parser/Cache in Bikeapelago (SvelteKit / Node.js)

Instead of modifying GraphHopper, we could handle the `.pbf` files natively within the existing SvelteKit backend.

**How it works:**
1. Use a Node.js library like `osmium` or `pbf` to parse the `.pbf` files on disk (the ones mounted in the `/graphhopper/data/` or `/graph-cache/` directory).
2. Write a script or server route to scan the file for highway intersections (nodes shared by multiple ways tagged with `highway=*`).
3. Cache the extracted nodes either in memory, a local JSON/SQLite file, or directly insert them into the PocketBase database.
4. The frontend queries a new `/api/nodes` endpoint on the SvelteKit server, which performs a standard spatial query against PocketBase or the local cache.

**Pros:**
- Keeps all custom logic within the JavaScript/TypeScript ecosystem (SvelteKit/Node.js).
- Keeps the GraphHopper image completely vanilla.

**Cons:**
- **Duplicated effort:** Node parsing logic has to be rewritten in JS, duplicating the work GraphHopper already did.
- **Routing inconsistencies:** Just because an intersection exists in the `.pbf` doesn't mean GraphHopper's `bike` profile considers it accessible. This could lead to generating nodes that the router can't reach.
- **High memory/storage overhead:** Processing large `.pbf` files (like a whole state) in Node.js can be highly memory-intensive and slow.

---

## Option 3: Self-Host Overpass API Locally

If the logic of the Overpass QL query is complex and hard to replicate in GraphHopper or Node.js, we can simply host our own Overpass API instance.

**How it works:**
1. Add an `overpass` service to the `docker-compose.yml`.
2. Feed the same `.osm.pbf` files into the Overpass container to build its database.
3. Change the Overpass URL in `src/lib/osm.ts` from `https://overpass-api.de/api/interpreter` to `http://overpass:1234/api/interpreter`.

**Pros:**
- **Zero code changes to generation logic:** The existing Overpass QL query in SvelteKit works exactly as it does now.
- **No Java required:** Completely infrastructure-based solution.

**Cons:**
- **Heavy resource usage:** Overpass API is a massive resource hog. It requires converting `.pbf` to its own specialized database format, which will consume significant disk space and RAM.
- **Redundant data:** You are storing the map data twice: once for GraphHopper's graph cache, and once for Overpass's database.

---

## Conclusion

**Option 1 (Extending GraphHopper)** is highly recommended. Because GraphHopper already understands the cycling network, it guarantees that any generated node is physically routable by a bike. It's also the most memory-efficient since it reuses the existing in-memory spatial index. You can achieve this by creating a Dropwizard Resource that queries the `GraphHopper.getLocationIndex()` within a bounding box, filters for intersections (nodes with edge count > 2), and returns them as JSON.
