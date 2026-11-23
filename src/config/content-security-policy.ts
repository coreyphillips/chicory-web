const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);

// The browser SDK resolves Pubky identities through Pkarr, then connects directly
// to the identity's homeserver. Operators can add their own homeserver origins.
const pubkyOrigins = [
  'https://pkarr.pubky.app',
  'https://pkarr.pubky.org',
  'https://homeserver.pubky.app',
  'https://homeserver.staging.pubky.app',
];

function serviceOrigin(value: string, protocol: 'https:' | 'wss:', allowPath = false) {
  const localProtocol = protocol === 'https:' ? 'http:' : 'ws:';
  const url = new URL(value);
  const hostname = url.hostname;

  if (
    (url.protocol !== protocol && !(url.protocol === localProtocol && loopback.has(hostname))) ||
    (!/^[A-Za-z0-9.-]+$/.test(hostname) && !/^\[[A-Fa-f0-9:]+\]$/.test(hostname)) ||
    url.username || url.password || url.search || url.hash || (!allowPath && url.pathname !== '/')
  ) {
    throw new Error('Invalid origin configured for the wallet content security policy.');
  }
  return url.origin;
}

export function walletPagePolicy(nonce: string, approvalRelay: string, extraPubkyOrigins = '') {
  const connections = new Set([
    "'self'",
    ...pubkyOrigins,
    serviceOrigin(approvalRelay, 'https:', true),
    ...extraPubkyOrigins.split(',').map((origin) => origin.trim()).filter(Boolean)
      .map((origin) => serviceOrigin(origin, 'https:')),
  ]);
  return [
    "default-src 'none'",
    // Next supplies the nonce to its scripts and loads its own chunks from those scripts.
    // The Pubky SDK instantiates signed-grant cryptography from bundled WebAssembly.
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'`,
    "script-src-attr 'none'",
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "worker-src 'self'",
    `connect-src ${[...connections].join(' ')}`,
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function walletWorkerPolicy(relayOrigin?: string) {
  // A network-loaded worker is governed by its own response header. All its
  // JavaScript is bundled. It fetches local SQLite WASM and opens fixed relay sockets.
  const relay = relayOrigin ? serviceOrigin(relayOrigin, 'wss:') : null;
  const connections = ["'self'"];
  if (relay) connections.push(relay + '/peer', relay + '/electrum');
  return [
    "default-src 'none'",
    "script-src 'wasm-unsafe-eval'",
    `connect-src ${connections.join(' ')}`,
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}
