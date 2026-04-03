/**
 * Initialize PocketBase for E2E testing:
 * 1. Create the first admin account (handles the case when DB is empty)
 * 2. Import schema from pb_schema.json
 */

import * as fs from 'fs';

const PB_URL = process.env.TEST_PB_URL || 'http://127.0.0.1:8090';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@bikeapelago.lan';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'adminadmin';

async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create the first PocketBase admin account.
 * When the database is new, there's an unauthenticated endpoint for this.
 */
async function createFirstAdmin(): Promise<string | null> {
	try {
		const res = await fetch(`${PB_URL}/api/admins`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email: ADMIN_EMAIL,
				password: ADMIN_PASSWORD,
				passwordConfirm: ADMIN_PASSWORD,
			}),
		});

		if (res.ok) {
			console.log(`✓ Created admin account: ${ADMIN_EMAIL}`);
			return null; // No token yet, need to auth
		}

		// If admin already exists (400), that's fine — continue
		const text = await res.text();
		if (res.status === 400 && text.includes('already exists')) {
			console.log('✓ Admin account already exists');
			return null;
		}

		// 401 means DB is already initialized with an admin; auth to get token
		if (res.status === 401) {
			console.log('Database already initialized, authenticating...');
			return null;
		}

		throw new Error(`Admin creation failed (${res.status}): ${text}`);
	} catch (err) {
		console.error('Error creating admin:', err);
		throw err;
	}
}

/**
 * Authenticate as admin and get a token
 */
async function getAdminToken(): Promise<string> {
	for (let attempt = 1; attempt <= 5; attempt++) {
		try {
			const res = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
			});

			if (!res.ok) {
				const text = await res.text();
				if (attempt < 5) {
					console.log(`Auth attempt ${attempt} failed, retrying...`);
					await sleep(500);
					continue;
				}
				throw new Error(`Admin auth failed (${res.status}): ${text}`);
			}

			const data = (await res.json()) as any;
			console.log('✓ Authenticated as admin');
			return data.token as string;
		} catch (err) {
			if (attempt === 5) throw err;
			await sleep(500);
		}
	}
	throw new Error('Failed to authenticate after 5 attempts');
}

/**
 * Import collections from pb_schema.json
 */
async function importSchema(adminToken: string): Promise<void> {
	const schemaPath = './pocketbase/pb_schema.json';
	if (!fs.existsSync(schemaPath)) {
		throw new Error(`Schema file not found: ${schemaPath}`);
	}

	const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
	const listRes = await fetch(`${PB_URL}/api/collections`, {
		headers: { Authorization: `Bearer ${adminToken}` },
	});

	if (!listRes.ok) {
		throw new Error(`Failed to list collections (${listRes.status})`);
	}

	const { items: existing } = (await listRes.json()) as any;
	const existingNames = new Set(existing.map((c: any) => c.name));

	// Pass 1: Create all collections with schema but NO rules
	// Use retry logic to handle relation dependencies between collections
	const pending = new Set(schema.filter((c: any) => !existingNames.has(c.name)).map((c: any) => c.name));
	const created = new Set<string>();

	for (let attempt = 0; attempt < 3 && pending.size > 0; attempt++) {
		for (const collDef of schema) {
			if (pending.has(collDef.name)) {
				const createRes = await fetch(`${PB_URL}/api/collections`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${adminToken}`,
					},
					body: JSON.stringify({
						name: collDef.name,
						type: collDef.type,
						schema: collDef.schema,
						listRule: null,
						viewRule: null,
						createRule: null,
						updateRule: null,
						deleteRule: null,
						options: collDef.options,
					}),
				});

				if (createRes.ok) {
					pending.delete(collDef.name);
					created.add(collDef.name);
					console.log(`✓ Created collection "${collDef.name}"`);
				} else {
					const errData = await createRes.text();
					// Retry on relation errors; fail on other errors
					if (!errData.includes('relation') && !errData.includes('collectionId')) {
						throw new Error(`Failed to create collection "${collDef.name}" (${createRes.status}): ${errData}`);
					}
				}
			} else if (!created.has(collDef.name) && existingNames.has(collDef.name)) {
				console.log(`✓ Collection "${collDef.name}" already exists`);
				created.add(collDef.name);
			}
		}
		if (pending.size > 0 && attempt < 2) await sleep(200);
	}

	if (pending.size > 0) {
		throw new Error(`Failed to create collections after retries: ${Array.from(pending).join(', ')}`);
	}

	// Pass 2: Update collections to add rules (now that all relations exist)
	for (const collDef of schema) {
		if (!collDef.listRule && !collDef.viewRule && !collDef.createRule && !collDef.updateRule && !collDef.deleteRule) {
			continue; // No rules to apply
		}

		const updateRes = await fetch(`${PB_URL}/api/collections/${collDef.id}`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${adminToken}`,
			},
			body: JSON.stringify({
				listRule: collDef.listRule,
				viewRule: collDef.viewRule,
				createRule: collDef.createRule,
				updateRule: collDef.updateRule,
				deleteRule: collDef.deleteRule,
			}),
		});

		if (!updateRes.ok) {
			const errData = await updateRes.text();
			console.warn(`⚠ Failed to update rules for "${collDef.name}" (${updateRes.status}): ${errData}`);
			continue;
		}

		console.log(`✓ Updated rules for "${collDef.name}"`);
	}
}

async function main() {
	console.log(`[setup-test-db] Initializing PocketBase at ${PB_URL}`);

	try {
		// Step 1: Try to create the first admin (may fail if DB already init)
		await createFirstAdmin();

		// Step 2: Authenticate
		const adminToken = await getAdminToken();

		// Step 3: Import schema
		await importSchema(adminToken);

		console.log('[setup-test-db] ✓ PocketBase ready for E2E tests');
	} catch (err) {
		console.error('[setup-test-db] Failed:', err);
		process.exit(1);
	}
}

main();
