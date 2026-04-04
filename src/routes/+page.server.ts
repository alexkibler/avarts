import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { serializeNonPOJOs } from '$lib/utils';

export const load = async ({ locals }) => {
  if (!locals.user) {
    return {
      gameSessions: []
    };
  }

  try {
    const gameSessions = await locals.pb.collection('game_sessions').getFullList({
      filter: `user = "${locals.user.id}" && status = "Active"`,
      sort: '-created',
    });

    return {
      gameSessions: serializeNonPOJOs(gameSessions)
    };
  } catch (err) {
    console.error('Error fetching game sessions:', err);
    return {
      gameSessions: []
    };
  }
};

export const actions = {
  login: async ({ request, locals }) => {
    // get data from form
    const formData = Object.fromEntries(await request.formData());
    const username = formData.username?.toString() || '';
    const password = formData.password?.toString() || '';

    if (env.PUBLIC_MOCK_MODE === 'true') {
      throw redirect(303, '/');
    }

    try {
      // try to log in
      await locals.pb.collection('users').authWithPassword(username, password);
    } catch (err: any) {
      // if error returned, send prop with email = true (will show message on screen)
      if (err.status === 400 || err.status === 401) {
        console.log('Login Error: ', err.response?.message || err);
        return {
          login: true,
          error: err.response?.message || 'Invalid username or password'
        };
      } else {
        return error(500, 'Something went wrong logging in');
      };
    };

    // if response ok, logged in and redirected to the homepage
    throw redirect(303, '/');
  },
  register: async ({ request, locals }) => {
    if (env.PUBLIC_MOCK_MODE === 'true') {
      throw redirect(303, '/');
    }

    if (env.PUBLIC_REGISTRATION == "true") {
      const formData = await request.formData();
      // Generate a random string for the internal email field
      const randomString = (Math.random() + 1).toString(36).substring(2);
      formData.set('email', `${randomString}@bikeapelago.com`);

      // Convert FormData to plain object for PB (prevents serialization issues with SSR)
      const payload = Object.fromEntries(formData);

      try {
        await locals.pb.collection('users').create(payload);
        
        // Auto-login the user into their session after creation
        const username = payload.username?.toString() || '';
        const password = payload.password?.toString() || '';
        await locals.pb.collection('users').authWithPassword(username, password);
      } catch (err: any) {
        if (err.status === 400 || err.status === 401) {
          console.log('Registration Error: ', err.response?.message || err);
          return {
            email: true,
            error: err.response?.message || 'Error creating account. Make sure username is valid and passwords match.'
          };
        } else {
          return error(500, 'Something went wrong registering');
        };
      };

      // if response ok, logged in and redirected to the homepage
      throw redirect(303, '/');
    };
  },
};


