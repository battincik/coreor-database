import type { DatabaseServerConfig } from 'types';
import { readDesktopConfig, writeDesktopConfig } from '@/lib/desktopClient';

function cloneProfiles(servers: DatabaseServerConfig[]) {
  return structuredClone(servers);
}

export async function readLocalServerProfiles() {
  const config = await readDesktopConfig();
  return cloneProfiles(config.connections as DatabaseServerConfig[]);
}

export async function writeLocalServerProfiles(servers: DatabaseServerConfig[]) {
  const config = await readDesktopConfig();
  await writeDesktopConfig({ ...config, connections: cloneProfiles(servers) });
}
