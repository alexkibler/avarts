import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/public';
import { browser } from '$app/environment';

// If PUBLIC_DB_URL is set, use it; otherwise default to localhost:8090
const pbUrl = env.PUBLIC_DB_URL || 'http://127.0.0.1:8090';

export const pb = new PocketBase(pbUrl);

if (browser) {
  pb.authStore.loadFromCookie(document.cookie);
}
