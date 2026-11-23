import type { Path, Session, SessionStorage, StorageLock } from '@synonymdev/pubky';
import { useAuthStore } from '@/stores/auth/auth.store';

function assertSession(session: Session, assertActive: () => void) {
  assertActive();
  if (useAuthStore.getState().session !== session) throw new Error('The wallet session has ended.');
}

export const HomeserverService = {
  async putTextLocked(
    session: Session,
    storage: SessionStorage,
    lock: StorageLock,
    body: string,
    assertActive: () => void,
  ) {
    // A lost reply can mean the ownership marker already changed. The caller reconciles it under lock.
    assertSession(session, assertActive);
    return storage.putTextLocked(lock, body);
  },

  async writeHandoffChunk(
    session: Session,
    storage: SessionStorage,
    path: Path,
    body: Uint8Array | null,
    assertActive: () => void,
  ) {
    // Content-addressed chunks are idempotent. Check the lease again before each retry.
    for (let attempt = 0; ; attempt++) {
      assertSession(session, assertActive);
      try {
        return await (body ? storage.putBytes(path, body) : storage.delete(path));
      } catch (error) {
        const status = (error as { data?: { statusCode?: number } } | null)?.data?.statusCode;
        if (attempt >= 2 || ![429, 500, 503].includes(status ?? 0)) throw error;
        await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 250));
      }
    }
  },
};
