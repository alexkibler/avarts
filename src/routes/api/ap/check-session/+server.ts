import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createPbClient } from '$lib/database';
import { env } from '$env/dynamic/private';

/**
 * GET /api/ap/check-session
 *
 * Safely checks if an Archipelago seed is already in use by ANY user.
 * This bypasses the normal user-level PocketBase listRules to ensure session isolation.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const seedId = url.searchParams.get('seedId');
	const userId = locals.user?.id;

	if (!seedId) {
		throw error(400, 'Seed ID is required');
	}

	if (!userId) {
		throw error(401, 'Must be logged in');
	}

	try {
		// We MUST authenticate as admin to check for sessions across all users.
		// Falling back to user-level permissions would allow seed collision exploits.
		const pb = createPbClient();

		const adminEmail = env.POCKETBASE_ADMIN_EMAIL || process.env.POCKETBASE_ADMIN_EMAIL;
		const adminPassword = env.POCKETBASE_ADMIN_PASSWORD || process.env.POCKETBASE_ADMIN_PASSWORD;

		if (!adminEmail || !adminPassword) {
			console.error('[SessionCheck] Missing admin credentials - cannot verify session isolation');
			throw error(500, 'Session verification system unavailable. Please try again later.');
		}

		try {
			await pb.admins.authWithPassword(adminEmail, adminPassword);
		} catch (authError) {
			console.error('[SessionCheck] Admin authentication failed:', authError);
			throw error(500, 'Session verification system unavailable. Please try again later.');
		}

		// Query for ANY session with this seed
		// We only request the 'user' field to determine if it's a collision or a resume
		const result = await pb.collection('game_sessions').getList(1, 1, {
			filter: `ap_seed_name = "${seedId}"`,
			fields: 'id,user',
			sort: '-created'
		});

		if (result.items.length > 0) {
			const session = result.items[0];
			return json({
				exists: true,
				isOwner: session.user === userId,
				sessionId: session.id
			});
		}

		return json({
			exists: false,
			isOwner: false,
			sessionId: null
		});
	} catch (e: any) {
		console.error('[SessionCheck Error]', e);
		return json({ error: 'Internal server error', message: e.message }, { status: 500 });
	}
};
