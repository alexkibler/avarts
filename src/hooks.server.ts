// @ts-nocheck
import { serializeNonPOJOs } from '$lib/utils';
import { createPbClient } from '$lib/database';
import type { Handle } from '@sveltejs/kit';

import { env } from '$env/dynamic/public';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.pb = createPbClient();

	if (env.PUBLIC_MOCK_MODE === 'true') {
		event.locals.user = serializeNonPOJOs(event.locals.pb.authStore.model);
	} else {
		event.locals.pb.authStore.loadFromCookie(event.request.headers.get('cookie') || '');

		if (event.locals.pb.authStore.isValid) {
			event.locals.user = serializeNonPOJOs(event.locals.pb.authStore.model);
		} else {
			event.locals.user = undefined;
		}
	}

	const response = await resolve(event);
	const isSecure = event.url.protocol === 'https:';
	response.headers.append(
		'set-cookie',
		event.locals.pb.authStore.exportToCookie({ secure: isSecure, httpOnly: false })
	);

	return response;
};
