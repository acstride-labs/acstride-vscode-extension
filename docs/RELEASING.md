# Publishing Codeforces Workbench

## Identity and public versions

- Publisher: `acstride` (display name AC-Stride).
- Extension: `codeforces-workbench`; Marketplace identity: `acstride.codeforces-workbench`.
- First public preview: `0.1.0`, tag `v0.1.0`.
- Odd minor versions are pre-release; even minor versions are stable. Examples: `0.1.1` preview, `0.2.0` stable.
- Do not use `-alpha`/`-beta` suffixes in package.json. Mark the GitHub Release as pre-release and use Alpha/Beta in its title.
- Internal 0.2–0.17 milestones are preserved in `internal-development-history.md`; they were not public releases.

## One-time Marketplace authentication

Create the GitHub environment **marketplace** in this repository. Set up one of the following methods. Never commit credentials or paste them into an issue/chat.

### PAT (default; transitional)

Create an Azure DevOps PAT for the Microsoft account owning publisher `acstride`, with Marketplace → Manage scope. Put its value directly in environment secret `VSCE_PAT`. The workflow passes it only to the publishing step, not to PR/build jobs. Keep its lifetime short.

Microsoft documents retirement of global Azure DevOps PATs on December 1, 2026. Treat this route as transitional and check current Microsoft guidance before renewing. The registration of a Marketplace publisher by itself does not create a publishing token.

### Microsoft Entra ID (long-term)

1. Create an Entra application/service principal or managed identity and authorize its Marketplace identity as a Contributor of publisher `acstride`.
2. Configure a federated credential with issuer `https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange`, subject `repo:acstride-labs@347157336/codeforces-workbench@1431532498:environment:marketplace`.
3. In environment variables set `MARKETPLACE_AUTH_MODE=entra`, `AZURE_CLIENT_ID` and `AZURE_TENANT_ID`.
4. Run **Verify Marketplace authentication** with publisher verification disabled to retrieve the public Marketplace identity ID. Add that ID to publisher `acstride` as Contributor, then run again with publisher verification enabled. This verifies rights without uploading or publishing an extension.
5. The workflow uses `azure/login` with no subscription requirement, then `vsce publish --azure-credential`. No client secret is needed.

The subject uses immutable organization/repository IDs, required for this renamed GitHub repository. Do not copy a name-only subject from an older repository. Only jobs using the `marketplace` environment can match this trust. The federated credential has no fixed expiry; GitHub exchanges each job identity for a short-lived access token automatically. After both verification steps pass, select `MARKETPLACE_AUTH_MODE=entra` and remove the unused PAT from GitHub and Azure DevOps.

These account-side permissions must be configured before Marketplace publishing works. They are not created automatically by this workflow. An environment reviewer is optional for solo maintenance; do not require your own approval while also preventing self-review.

Official guidance:

- https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-create-trust
- https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims

## Publish

1. Merge the version, package-lock and CHANGELOG changes into `master` after CI passes.
2. In GitHub Releases choose **Draft a new release**, create tag `v0.1.0` on that reviewed commit, mark **Set as a pre-release**, and enter release notes. Use **Publish release** to start the pipeline.
3. `Publish release` validates tag/version/channel, checks the commit belongs to `master`, then reuses the complete four-platform CI at that exact SHA.
4. All four builds and final VSIX checks must pass before attachment upload. The workflow adds Windows x64, Linux x64, macOS x64 and macOS ARM64 VSIX files and `SHA256SUMS` to the Release.
5. The Marketplace job downloads those exact public assets, verifies hashes, identity, target and channel, then publishes all four packages. VS Code selects the appropriate platform package.
6. Check the workflow result and Marketplace management page. A successful upload may still need Marketplace processing before appearing publicly.

The Release page is published before builds finish, so attachments will appear later. Publishing a Release is an external distribution action: do it only when ready to ship. The workflow does not create releases on ordinary pushes.

## Retry and recovery

Use Actions → **Publish release** → **Run workflow**, supply the existing Release tag. Keep **Publish the verified packages to Marketplace** enabled to retry publishing; disable it to attach packages without uploading to Marketplace.

Existing Release files are reused, never overwritten; checksums must match. `--skip-duplicate` allows resuming partial Marketplace uploads. Do not move published tags or replace existing files. If the package itself is wrong, increment the version and publish a new release.

A Marketplace credential failure does not remove the downloadable GitHub assets. Configure the credential and retry. First establish a clean successful preview before creating a stable release. Preserve existing data formats when rolling back implementation; publish a higher patch version for fixes.
