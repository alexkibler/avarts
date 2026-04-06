import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, fetch }) => {
	const { seedId } = params;

	// Fetch AP items count to determine how many intersections are needed
	try {
		const response = await fetch(`/api/ap/items?seed=${seedId}`);

		if (!response.ok) {
			console.warn(`Failed to fetch AP items for seed ${seedId}`);
			return {
				apItemCount: 10 // Fallback
			};
		}

		const data = await response.json();
		return {
			apItemCount: data.count || 10
		};
	} catch (e) {
		console.warn(`Error fetching AP items for seed ${seedId}:`, e);
		return {
			apItemCount: 10 // Fallback
		};
	}
};
