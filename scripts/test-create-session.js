import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PB_URL = process.env.TEST_PB_URL || 'http://127.0.0.1:8090';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@bikeapelago.lan';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'adminadmin';

async function test() {
	try {
		console.log('Step 1: Authenticating as admin...');
		const authRes = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
		});

		if (!authRes.ok) {
			const text = await authRes.text();
			throw new Error(`Admin auth failed (${authRes.status}): ${text}`);
		}

		const authData = await authRes.json();
		const adminToken = authData.token;
		console.log('✓ Admin token obtained\n');

		console.log('Step 2: Creating a test user...');
		const testUser = {
			email: 'testuser@example.com',
			password: 'testpass123',
			passwordConfirm: 'testpass123',
			username: 'testuser_' + Date.now(),
		};

		const userRes = await fetch(`${PB_URL}/api/collections/users/records`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: adminToken },
			body: JSON.stringify(testUser),
		});

		if (!userRes.ok) {
			const text = await userRes.text();
			throw new Error(`User creation failed (${userRes.status}): ${text}`);
		}

		const userData = await userRes.json();
		const userId = userData.id;
		console.log(`✓ Test user created: ${userId}\n`);

		console.log('Step 3: Creating a game_sessions record...');
		const sessionRes = await fetch(`${PB_URL}/api/collections/game_sessions/records`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: adminToken },
			body: JSON.stringify({
				user: userId,
				ap_seed_name: 'Test Seed',
				ap_slot_name: 'TestSlot',
				ap_server_url: 'test',
				center_lat: 40.4406,
				center_lon: -79.9959,
				radius: 5000,
				status: 'Active',
			}),
		});

		console.log('Response status:', userRes.status);
		const sessionData = await sessionRes.json();
		console.log('Response:', JSON.stringify(sessionData, null, 2));

		if (!sessionRes.ok) {
			throw new Error(`Session creation failed (${sessionRes.status})`);
		}

		console.log('\n✅ Success! Session created:', sessionData.id);

		// Cleanup
		console.log('\nStep 4: Cleaning up...');
		await fetch(`${PB_URL}/api/collections/users/records/${userId}`, {
			method: 'DELETE',
			headers: { Authorization: adminToken },
		});
		console.log('✓ Test user deleted');

	} catch (err) {
		console.error('❌ Error:', err.message);
		process.exit(1);
	}
}

test();
