# Verified wallet releases

The production artifact is a Linux x64 archive for Ubuntu 24.04 or a compatible glibc system with Node.js 24. It includes the standalone Next.js server, the relay, the browser worker, SQLite WASM and the traced runtime dependencies. Keep service accounts, DNS credentials and wallet relay secrets outside the build. The reviewed browser code selects the default Pubky approval relay at build time. The deployment sets its Bitcoin network, transport endpoints and relay secret at runtime.

## Build a release candidate

Merge the reviewed change to protected `main` after the required `verify` check passes. Dispatch **Attest wallet release** from Actions on that branch. The workflow rebuilds and tests the selected commit with read-only repository permissions, then starts the packaged app and relay from an extracted archive. A second GitHub-hosted job signs the archive's SHA-256 using GitHub artifact attestations. It has no checkout and runs no repository code. The workflow produces a candidate. An operator selects the exact commit and artifact digest for production after regtest qualification.

```sh
gh workflow run release.yml --ref main --repo coreyphillips/chicory-web
gh run list --workflow release.yml --repo coreyphillips/chicory-web
```

Use hardware-backed MFA on the GitHub, hosting, and DNS accounts allowed to change this origin. Restrict production deployment credentials and release directories to release operators. Give the runtime account read access to deployed code. Changes to the release workflow, lockfile, engine patches and authentication code deserve the same review as changes to signing logic.

## Verify and run the archive

On the Linux deployment host, select the full reviewed commit SHA and the successful workflow run and build attempt in its Actions summary. Use a fresh download directory. In the example below, replace all three values.

```sh
repo=coreyphillips/chicory-web
revision=REVIEWED_40_CHARACTER_COMMIT_SHA
run=RUN_ID
attempt=BUILD_ATTEMPT_NUMBER

gh run download "$run" --repo "$repo" --name "chicory-web-$revision-$attempt" --dir candidate
archive=candidate/chicory-web-linux-x64.tar.gz
gh attestation verify "$archive" --repo "$repo" \
  --signer-workflow "$repo/.github/workflows/release.yml" \
  --source-ref refs/heads/main --source-digest "$revision" --deny-self-hosted-runners
sha256sum "$archive"
```

Stop if verification fails. Record the verified SHA-256 with the commit, run ID and network in the deployment record. Actions retains the uploaded artifact for up to 90 days. Keep the exact archive and its attestation bundle in durable release storage for the lifetime of the deployment.

```sh
gh attestation download "$archive" --repo "$repo"
```

Use the SHA-256 to name a new versioned directory. The following commands assume the release operator owns `/srv/chicory/releases`. Creating a fresh directory prevents installing over an older build.

```sh
digest=$(sha256sum "$archive" | cut -d' ' -f1)
release_dir="/srv/chicory/releases/$digest"
mkdir "$release_dir" && tar --no-same-owner -xzf "$archive" -C "$release_dir"
```

Qualify that directory with regtest. Configure the app and relay as separate unprivileged services. Run the following commands from the selected release directory with your private runtime environment file readable only by those services and the operator.

```sh
HOSTNAME=127.0.0.1 PORT=3000 node --env-file=/etc/chicory/wallet.env server.js
```

```sh
node --env-file=/etc/chicory/wallet.env scripts/wallet/relay.mjs
```

The [hosting instructions](../README.md#hosting) describe the shared origins, network, reverse proxy and fixed upstreams.

## Roll back

Retain the previous verified archive, its digest and the corresponding runtime configuration. Check that the previous release can open the current vault and channel-state formats using a disposable test wallet before rolling back. If compatibility has changed, ship a forward fix. Reinstalling stale Lightning channel data can put funds at risk.

To roll back compatible code, point both service working directories to the previous verified release, restore the matching transport configuration, and restart both services. Preserve the public hostname, user vaults and current device ownership records. Verify the served app, wallet worker and relay from a fresh browser profile, then test Ring unlock and a device handoff on regtest.

[GitHub artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations) · [Verification command reference](https://cli.github.com/manual/gh_attestation_verify)
