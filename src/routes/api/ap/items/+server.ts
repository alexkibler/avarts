import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pb } from '$lib/database';

export const GET: RequestHandler = async ({ request, url }) => {
	const seed = url.searchParams.get('seed');

	if (!seed) {
		return json({ count: 10 }); // Fallback
	}

	try {
		// Just a fallback logic, if no seed items are tracked yet, return default
		// Typically the AP items would be fetched to see how many checks exist for this game,
		// but since setup hasn't occurred yet, we might not know unless we parsed an AP patch.
		// Assuming user or game has a default of 10 if not available via PB query.

		// Let's try to query items if any exist for this seed (though normally they wouldn't yet)
		const items = await pb.collection('archipelago_items').getList(1, 1, {
			filter: `game_session.ap_seed_name = "${seed}"`
		});

		const count = items.totalItems > 0 ? items.totalItems : 10;
		return json({ count });
	} catch (err) {
		console.error(`[AP Items API] Error fetching count for seed ${seed}:`, err);
		return json({ count: 10 });
	}
};
