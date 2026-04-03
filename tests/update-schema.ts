/**
 * Update PocketBase collections with changes from pb_schema.json
 * Handles both creating new collections and updating existing ones
 */

import * as fs from 'fs';
import { PB_URL, getAdminToken } from './admin';

async function updateSchema(): Promise<void> {
	try {
		console.log('Getting admin token...');
		const adminToken = await getAdminToken();

		// Load schema from file
		const schemaPath = './pocketbase/pb_schema.json';
		if (!fs.existsSync(schemaPath)) {
			throw new Error(`Schema file not found: ${schemaPath}`);
		}

		const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
		console.log(`Loaded schema with ${schema.length} collections`);

		// Fetch existing collections
		const listRes = await fetch(`${PB_URL}/api/collections`, {
			headers: { Authorization: adminToken },
		});

		if (!listRes.ok) {
			throw new Error(`Failed to list collections (${listRes.status})`);
		}

		const { items: existing } = await listRes.json() as { items: any[] };
		const existingMap = new Map(existing.map((c: any) => [c.name, c]));

		// Create or update collections
		for (const collDef of schema) {
			if (existingMap.has(collDef.name)) {
				// Update existing collection
				const existingColl = existingMap.get(collDef.name);
				const updateRes = await fetch(`${PB_URL}/api/collections/${existingColl.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json', Authorization: adminToken },
					body: JSON.stringify({
						schema: collDef.schema,
						listRule: collDef.listRule,
						viewRule: collDef.viewRule,
						createRule: collDef.createRule,
						updateRule: collDef.updateRule,
						deleteRule: collDef.deleteRule,
						options: collDef.options,
					}),
				});

				if (!updateRes.ok) {
					const errData = await updateRes.text();
					throw new Error(`Failed to update collection "${collDef.name}" (${updateRes.status}): ${errData}`);
				}

				console.log(`✓ Updated collection "${collDef.name}"`);
			} else {
				// Create new collection
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
		}

		console.log('\n✅ Schema updated successfully!');
	} catch (err) {
		console.error('❌ Failed to update schema:', err);
		throw err;
	}
}

updateSchema().catch(process.exit);
