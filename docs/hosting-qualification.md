# Qualify a hosted wallet on regtest

Use a separate, stable HTTPS origin for regtest. Install the [verified release archive](releases.md) there. Configure both services for `WALLET_NETWORK=regtest`, your regtest Lightning peer and Electrum server. Apply the [relay ingress configuration](relay.md) and [browser security policy](browser-security.md). Keep the site private during qualification. The host serves code that can access an unlocked wallet, so its release credentials and domain credentials are part of the wallet's security boundary.

## Check the deployed origin

1. Start with two fresh browser profiles and a disposable Pubky identity. Confirm that `/api/wallet/networks` reports regtest and that Ring wallet creation explicitly identifies Bitcoin regtest. Use test funds only.
2. Check the HTTPS responses for `/` and `/wallet-engine/worker.js`. Each should have its own enforced Content Security Policy. Refresh the document and confirm its script nonce changes. Run the [Chromium policy check](browser-security.md) against the deployed origin.
3. Create a password wallet, generate a regtest receive address, and open a second tab in the same profile. Verify the second tab reports the wallet is in use. Lock the original, try an incorrect password, then unlock with the correct password. Reload and unlock again.
4. Use fresh profiles for the Ring flow. In the source profile choose **Continue with Pubky Ring**. Scan each approval with a test phone. Check the displayed identity and requested permissions before approving. Choose **Set up with Ring**, then **Create with Ring** on regtest. Generate a receive address. Reload and approve a fresh browser-specific unlock.
5. Sign in with the same identity in the destination profile. Verify it reports ownership by another device. On the source, use **Settings**, **Move to another device**, and **Prepare transfer**. Approve in Ring and wait for **Ready on your other device**.
6. Claim the transfer on the destination and unlock again. Check the expected wallet state and generate the next regtest address. Reload the source and verify that even an approved local unlock cannot give it access while the destination owns the wallet.

Record the commit, archive SHA-256, wallet origin, approval relay, browser and Ring versions, and which checks passed. Keep grant links, QR contents, passwords, session data, key material and channel backups out of reports.

## Approval relay and physical device

The default release contacts the production Pubky approval relay at `https://httprelay.pubky.app/inbox`. Bitcoin regtest and the approval relay are independent settings. Use an explicit build-time `NEXT_PUBLIC_PUBKY_HTTP_RELAY` override when qualifying a different service. A relay change requires a new build and a new approval test.

For a phone test, both devices must reach the approval relay, and the phone must be able to reach the test identity's homeserver. Publish the wallet only on the intended private network and use a hostname with HTTPS that the clients trust. A phone interprets `localhost` as the phone itself. Keep the same wallet origin throughout the test.

## Account and recovery access

Enroll two hardware security keys where supported on the accounts controlling GitHub, the wallet host and the domain. Store the spare key and recovery codes separately. Verify sign-in and recovery while the original session is available. Review who can change DNS, deploy code or recover these accounts. [GitHub security key setup](https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/configuring-two-factor-authentication#configuring-two-factor-authentication-using-a-security-key)

Retain the verified archive and follow the [rollback procedure](releases.md#roll-back). Roll back the deployed code while preserving current wallet and channel state.
