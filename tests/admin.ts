/**
 * Shared PocketBase admin authentication for E2E tests.
 * Import from here — do not duplicate getAdminToken() in other test files.
 */

import * as fs from 'fs';

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

/**
 * Import collections from pocketbase/pb_schema.json into a running PocketBase instance.
 * Used during CI setup to ensure all required collections exist.
 */
export async function importSchema(adminToken: string): Promise<void> {
	try {
		// Load schema from file
		const schemaPath = './pocketbase/pb_schema.json';
		if (!fs.existsSync(schemaPath)) {
			throw new Error(`Schema file not found: ${schemaPath}`);
		}

		const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

		// Fetch existing collections
		const listRes = await fetch(`${PB_URL}/api/collections`, {
			headers: { Authorization: adminToken },
		});

		if (!listRes.ok) {
			throw new Error(`Failed to list collections (${listRes.status})`);
		}

		const { items: existing } = await listRes.json();
		const existingNames = new Set(existing.map((c: any) => c.name));

		// Create missing collections
		for (const collDef of schema) {
			if (existingNames.has(collDef.name)) {
				console.log(`✓ Collection "${collDef.name}" already exists`);
				continue;
			}

			const createRes = await fetch(`${PB_URL}/api/collections`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: adminToken },
				body: JSON.stringify({
					name: collDef.name,
					type: collDef.type,
					schema: collDef.schema,
					listRule: collDef.listRule,
					viewRule: collDef.viewRule,
					createRule: collDef.createRule,
					updateRule: collDef.updateRule,
					deleteRule: collDef.deleteRule,
					options: collDef.options,
				}),
			});

			if (!createRes.ok) {
				const errData = await createRes.text();
				throw new Error(`Failed to create collection "${collDef.name}" (${createRes.status}): ${errData}`);
			}

			console.log(`✓ Created collection "${collDef.name}"`);
		}
	} catch (err) {
		console.error('Failed to import schema:', err);
		throw err;
	}
}
