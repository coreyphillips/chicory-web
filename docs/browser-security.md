# Browser policy for a hosted wallet

The production Next.js server issues a fresh script nonce for each wallet document. It passes the policy to the React renderer so the application scripts and hydration data receive that nonce. The browser can instantiate bundled WebAssembly for Pubky's signing protocol. The credential and payment screens use local assets. Keep analytics, tag managers and third-party scripts off this origin.

Route the wallet document and `/wallet-engine/worker.js` through Next.js. The worker response carries its own content security policy. The worker can fetch same-origin resources, including the local SQLite WASM and connection grant, and open WebSockets to the configured relay's `/peer` and `/electrum` paths. Preserve these response headers at the reverse proxy and respect their `no-store` cache directives.

## Pubky endpoints

The document allows the approval relay selected by `NEXT_PUBLIC_PUBKY_HTTP_RELAY`, the SDK's Pkarr relays (`pkarr.pubky.app` and `pkarr.pubky.org`), and `homeserver.pubky.app` and `homeserver.staging.pubky.app`. Ring approvals, private wallet access and public Paykit recipient lookups can involve a different homeserver discovered through Pkarr. A deployment supporting those identities must allow the actual HTTPS endpoint for each homeserver.

Set `WALLET_PUBKY_CONNECT_ORIGINS` on the app server to add exact origins, separated by commas. For example, `https://homeserver.example.com,https://homeserver.example.org:8443` adds two homeservers. Include the port when it differs from HTTPS port 443. The policy accepts HTTP on loopback for an isolated local Pubky testnet. Changes to this list or `WALLET_RELAY_ORIGIN` take effect on server restart. A different `NEXT_PUBLIC_PUBKY_HTTP_RELAY` requires a new build.

## Check a deployment on regtest

From a source checkout with dependencies and Playwright Chromium installed, run:

```sh
node scripts/wallet/csp-smoke.mjs https://regtest-wallet.example.com
```

The check opens two new document requests, verifies distinct script nonces, generates a Ring sign-in QR, cancels the unsigned request and inspects a fresh browser vault through the wallet worker. It reports CSP violations seen by the document without recording wallet contents. Exercise approval and handoff with your intended Ring signer and homeserver as part of the deployment check.
