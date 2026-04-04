# PocketBase Schema for Bikeapelago

The following collections must be created in PocketBase to support the Bikeapelago Archipelago client.

## Collection: `game_sessions`

Stores the overarching Archipelago game sessions.

- **Type:** Base
- **Name:** `game_sessions`
- **Fields:**
  - `user` (Relation, single, to `users` collection) - The player hosting/playing the session.
  - `ap_seed_name` (Text) - The name of the Archipelago seed.
  - `ap_server_url` (Text) - URL of the Archipelago server (e.g., `archipelago.gg:38281`).
  - `ap_slot_name` (Text) - The player's slot name.
  - `center_lat` (Number) - The starting/center latitude for node generation.
  - `center_lon` (Number) - The starting/center longitude for node generation.
  - `radius` (Number) - The radius (in meters) for node generation.
  - `status` (Select: `Active`, `Completed`) - The current status of the session.

## Collection: `map_nodes`

Stores the individual physical real-world intersection locations acting as checks.

- **Type:** Base
- **Name:** `map_nodes`
- **Fields:**
  - `session` (Relation, single, to `game_sessions` collection) - The game session this node belongs to.
  - `ap_location_id` (Number) - The Archipelago location ID associated with this check.
  - `osm_node_id` (Text) - The OpenStreetMap node ID.
  - `lat` (Number) - Latitude of the intersection.
  - `lon` (Number) - Longitude of the intersection.
  - `state` (Select: `Hidden`, `Available`, `Checked`) - The gameplay state of this node.
    - `Hidden`: Node exists but is not currently routable/visible.
    - `Available`: Node has been unlocked and is ready to be physically routed to.
    - `Checked`: Player has visited this node and submitted the check.
