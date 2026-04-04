import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/public'
import { MockPocketBase } from './mock';

let url: string;
if (env.PUBLIC_DB_URL) {
  url = env.PUBLIC_DB_URL
} else {
  url = "http://127.0.0.1:8090"

}

export const pb = env.PUBLIC_MOCK_MODE === 'true'
  ? new MockPocketBase() as unknown as PocketBase
  : new PocketBase(url);

pb.autoCancellation(false);

export async function getLink(collection: string, id: string) {
  const dataLink = await pb.collection(collection).getOne(id);
  const dataName = dataLink.dataset;
  return await fetch(pb.files.getUrl(dataLink,dataName));
};
