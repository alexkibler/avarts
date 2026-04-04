import { error, redirect } from '@sveltejs/kit';

export const actions = {
	update: async ({ request, locals }) => {
		if (!locals.user) {
			return error(401, 'Unauthorized');
		}

		const formData = await request.formData();

		try {
			const { name, avatar, weight } = await locals.pb.collection('users').update(locals.user.id, formData);
			locals.user.name = name;
			locals.user.avatar = avatar;
			locals.user.weight = weight;
		} catch (err) {
			return error(500, 'Something went wrong');
		}
	}
};
