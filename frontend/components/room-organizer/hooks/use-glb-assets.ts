import { useEffect, useSyncExternalStore } from 'react';
import { ensureGlbAsset, getGlbAssetRevision, getGlbAssetState, glbAssetKey, subscribeGlbAssets } from '../three/glb-assets';
import type { RoomLayout } from '../lib/types';

const serverRevision = () => 0;
/** Loading never changes the document. A late completion only refreshes objects still in the scene. */
export function useGlbAssets(layout: RoomLayout): number {
  const revision = useSyncExternalStore(subscribeGlbAssets, getGlbAssetRevision, serverRevision);
  useEffect(() => {
    for (const floor of layout.floors) for (const item of floor.items) {
      const key = glbAssetKey(item);
      if (key && item.glbUrl && getGlbAssetState(key).status === 'idle') {
        void ensureGlbAsset(key, item.glbUrl).catch(() => { /* Error remains in the queryable cache state. */ });
      }
    }
  }, [layout.floors, revision]);
  return revision;
}
