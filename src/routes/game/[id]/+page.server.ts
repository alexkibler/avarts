import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	if (!locals.user) {
		throw redirect(303, '/');
	}
	return {
		user: locals.user,
		sessionId: params.id
	};
};
