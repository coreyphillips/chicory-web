import { describe, expect, it } from 'vitest';
import { walletPagePolicy, walletWorkerPolicy } from './content-security-policy';

function directive(policy: string, name: string) {
  return policy.split('; ').find((entry) => entry.startsWith(name + ' '))?.split(' ').slice(1);
}

describe('wallet content security policies', () => {
  it('requires a fresh script nonce and allows only named Pubky destinations', () => {
    const policy = walletPagePolicy('nonce-value', 'https://ring.example/inbox', 'https://home.example, http://localhost:6286');
    expect(directive(policy, 'script-src')).toEqual(["'nonce-nonce-value'", "'strict-dynamic'", "'wasm-unsafe-eval'"]);
    expect(directive(policy, 'connect-src')).toContain('https://ring.example');
    expect(directive(policy, 'connect-src')).toContain('https://home.example');
    expect(directive(policy, 'connect-src')).toContain('http://localhost:6286');
    expect(directive(policy, 'connect-src')).not.toContain('https:');
  });

  it.each(['*', 'https://*.example.com', 'https://good.example;script-src', 'https://a.example/path',
    'http://home.example', 'https://user:pass@home.example'])('rejects malformed or broad service origins', (origin) => {
    expect(() => walletPagePolicy('abc', 'https://ring.example/inbox', origin)).toThrow();
  });

  it('allows the worker to fetch local WASM and connect to the two configured WebSocket paths', () => {
    const policy = walletWorkerPolicy('wss://relay.example');
    expect(directive(policy, 'default-src')).toEqual(["'none'"]);
    expect(directive(policy, 'script-src')).toEqual(["'wasm-unsafe-eval'"]);
    expect(directive(policy, 'connect-src')).toEqual(["'self'", 'wss://relay.example/peer', 'wss://relay.example/electrum']);
    expect(walletWorkerPolicy('ws://127.0.0.1:8790')).toContain('ws://127.0.0.1:8790/peer');
    expect(() => walletWorkerPolicy('ws://relay.example')).toThrow();
  });
});
