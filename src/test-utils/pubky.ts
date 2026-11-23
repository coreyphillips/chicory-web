import type { Session } from '@synonymdev/pubky';
import { asOpaque } from './type-assertions';

export function mockRingSession(capabilities: string[], pubky = 'mock-session-pubky') {
  return asOpaque<Session>({
    info: { publicKey: { z32: () => pubky, free() {} }, capabilities, free() {} },
  });
}
