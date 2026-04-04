import { error, redirect } from '@sveltejs/kit';

export const actions = {
	update: async ({ request, locals }) => {
		if (!locals.user || !locals.pb) {
			throw redirect(303, '/');
		}

		const formData = await request.formData();
		const id = formData.get('id') as string;

		try {
			const record = await locals.pb.collection('users').update(id, formData);
			if (locals.user) {
				locals.user.name = record.name;
				locals.user.avatar = record.avatar;
				locals.user.weight = record.weight;
			}
		} catch (err) {
			return error(500, 'Something went wrong');
		}
	}
};
