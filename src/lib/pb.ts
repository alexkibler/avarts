import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/public';

// If PUBLIC_DB_URL is set, use it; otherwise default to localhost:8090
const pbUrl = env.PUBLIC_DB_URL || 'http://127.0.0.1:8090';

export const pb = new PocketBase(pbUrl);
