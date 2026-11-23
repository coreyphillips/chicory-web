import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { acceptsRelayGrant, bridgeSocket, maxRelayPayload } from './bridge.mjs';
import { clientSource, requestLimit, socketLimit, upgradesPerMinute } from './limits.mjs';
import { connectionSettings, socketTarget } from './transport.mjs';

function reject(socket, status, retryAfter = 0) {
  const retry = retryAfter ? 'Retry-After: ' + retryAfter + '\r\n' : '';
  socket.end('HTTP/1.1 ' + status + '\r\n' + retry + 'Connection: close\r\nContent-Length: 0\r\n\r\n');
}

export function createRelay(settings, electrum, peer = settings.peer, env = process.env) {
  const server = createServer((_request, response) => response.writeHead(404).end());
  const limitAttempts = requestLimit(upgradesPerMinute);
  const reserve = socketLimit();
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: maxRelayPayload,
    perMessageDeflate: false,
    handleProtocols: () => 'beignet.v1',
  });
  server.on('upgrade', (request, socket, head) => {
    const client = clientSource(request.headers, env, socket.remoteAddress);
    if (!client) return reject(socket, '403 Forbidden');
    const retryAfter = limitAttempts(client);
    if (retryAfter) return reject(socket, '429 Too Many Requests', retryAfter);
    const target = request.url === '/electrum' ? electrum : request.url === '/peer' ? peer : null;
    if (!target || !acceptsRelayGrant(settings, request.headers.origin, request.headers['sec-websocket-protocol'])) {
      return reject(socket, '403 Forbidden');
    }
    const release = reserve(client);
    if (!release) return reject(socket, '429 Too Many Requests', 1);
    // Invalid or interrupted handshakes can close before ws invokes the callback.
    socket.once('close', release);
    sockets.handleUpgrade(request, socket, head, (ws) => bridgeSocket(ws, target));
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = connectionSettings(process.env);
  const electrum = socketTarget(process.env.WALLET_ELECTRUM);
  const peer = process.env.WALLET_PEER_TUNNEL ? socketTarget(process.env.WALLET_PEER_TUNNEL) : config.peer;
  createRelay(config, electrum, peer).listen(Number(process.env.WALLET_RELAY_PORT || 8790), '127.0.0.1', () => {
    console.info('Wallet relay listening on loopback for ' + config.network);
  });
}
