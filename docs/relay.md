# Wallet relay ingress

## Single-host deployment

Run Caddy, Next.js and the wallet relay on the same machine. Point the wallet hostname at Caddy. Use the [Caddyfile](../deploy/Caddyfile) and set `WALLET_HOST` in Caddy's environment to the exact hostname, such as `wallet.example.org`. Caddy terminates HTTPS, forwards WebSocket upgrades for `/peer` and `/electrum`, and preserves the public Host header. Caddy's automatic public certificate provisioning requires a reachable hostname. For a private deployment, arrange HTTPS for the private hostname and restrict access at the network edge. [Caddy HTTPS](https://caddyserver.com/docs/automatic-https) · [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)

Configure both Node services with the same values. Use a unique 32-byte random `WALLET_RELAY_SECRET` and the fixed upstreams described in the [hosting guide](../README.md#hosting).

```dotenv
WALLET_APP_ORIGIN=https://wallet.example.org
WALLET_RELAY_ORIGIN=wss://wallet.example.org
WALLET_RELAY_PORT=8790
WALLET_TRUST_PROXY=1
```

Start Next with `npm start -- -H 127.0.0.1 -p 3000` and the relay with `npm run relay`. Only the proxy should accept remote connections to these services. The proxy must **overwrite** `X-Chicory-Client-IP` with the direct socket peer on every request, including upgrades. The example Caddyfile does this for both upstreams. Enable `WALLET_TRUST_PROXY=1` only with this private ingress arrangement. A missing, malformed, or comma-separated address is rejected in trusted proxy mode. Keep request bodies, WebSocket protocol headers and connection grant responses out of logs.

With the default local configuration, client-supplied forwarding headers are ignored. The local relay counts the socket peer and the local Next grant endpoint uses a single shared budget. When using a CDN in front of Caddy, the example counts the CDN's egress IP. Apply client-based controls at the CDN and restrict Caddy's ingress to the CDN before relying on forwarded client identity.

## Limits

| Operation | Limit |
| --- | --- |
| Issue `/api/wallet/connection` grants | 30 per source IP per 60-second window |
| Attempt `/peer` or `/electrum` upgrades | 90 per source IP per 60-second window, including attempts with invalid tickets |
| Concurrent upstream connections | 16 per source IP, 256 per relay process |

These limits allow multiple wallet startup sockets and reconnects from a shared network. Excess requests receive HTTP 429 with `Retry-After`. A new fixed window resets the request counter. The limiter holds at most 4,096 source addresses in memory per window. Devices sharing a public IPv4 address share their budget. IPv6 budgets group temporary addresses by their /64 network.

On Vercel the routes read the platform's `x-vercel-forwarded-for` header. Limits apply per running function instance. Separate replicas or routes can serve requests concurrently, so use edge rate limiting for a deployment-wide policy. Configure IP-based rate limit rules for the exact grant path and for the two WebSocket paths on the production hostname. Set a 429 response. Apply equivalent controls at the load balancer for a replicated self-hosted deployment. [Vercel request headers](https://vercel.com/docs/headers/request-headers) · [Vercel firewall rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
