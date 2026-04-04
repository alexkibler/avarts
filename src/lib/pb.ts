import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/public';
import { browser } from '$app/environment';
import { MockPocketBase } from './mock';

// If PUBLIC_DB_URL is set, use it; otherwise default to localhost:8090
const pbUrl = env.PUBLIC_DB_URL || 'http://127.0.0.1:8090';

export const pb =
	env.PUBLIC_MOCK_MODE === 'true'
		? (new MockPocketBase() as unknown as PocketBase)
		: new PocketBase(pbUrl);

pb.autoCancellation(false);

if (browser) {
	pb.authStore.loadFromCookie(document.cookie);
}
