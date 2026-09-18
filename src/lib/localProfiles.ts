import type { DatabaseServerConfig } from 'types';
import { readDesktopConfig, writeDesktopConfig } from '@/lib/desktopClient';

let profileMutationQueue: Promise<void> = Promise.resolve();

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


export async function mutateLocalServerProfiles<T>(
  mutation: (servers: DatabaseServerConfig[]) => { servers: DatabaseServerConfig[]; result: T }
) {
  let mutationResult!: T;
  const currentMutation = profileMutationQueue.catch(() => undefined).then(async () => {
    const currentServers = await readLocalServerProfiles();
    const nextState = mutation(currentServers);
    mutationResult = nextState.result;
    await writeLocalServerProfiles(nextState.servers);
  });
  profileMutationQueue = currentMutation;
  await currentMutation;
  return mutationResult;
}
