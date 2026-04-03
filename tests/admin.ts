/**
 * Shared PocketBase admin authentication for E2E tests.
 * Import from here — do not duplicate getAdminToken() in other test files.
 */

export const PB_URL = process.env.TEST_PB_URL || 'http://127.0.0.1:8090';

const ADMIN_EMAIL    = process.env.TEST_ADMIN_EMAIL    || 'admin@bikeapelago.lan';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'adminadmin';

/** Authenticate as PocketBase admin and return a bearer token. */
export async function getAdminToken(): Promise<string> {
	const res = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Admin auth failed (${res.status}): ${text}`);
	}

	const data = await res.json();
	return data.token as string;
}
