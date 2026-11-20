# Global source discovery system

## Goal
Discover useful public open-source repositories across multiple hosting platforms without pretending that any search API is a complete index of the world's software.

## Initial provider coverage
The machine-readable registry lives in `data/source-registry.json`.

- GitHub: official public repository search API.
- GitLab.com: official public projects API.
- Codeberg: public Forgejo-compatible API.
- Gitea.com: public Gitea-compatible API.
- npm: official public package search API; repository links are converted into candidates only when they point to an approved source host.
- crates.io: official public crate search API; repository links are converted into candidates only when they point to an approved source host.
- PyPI: metadata and the Simple Index are available, but no equivalent public relevance-search API was verified for bounded discovery; tracked separately rather than bulk-enumerating the entire index.
- SourceHut: planned only; public discovery API and anonymous access require verification before automation.
- Additional Forgejo and Gitea hosts can be explicitly configured in `data/discovery-config.json`; the list is empty by default and no arbitrary hosts are scanned.
- Other Forgejo hosts: planned, and only after an administrator explicitly configures and validates each host.

SourceHut is registered as planned only. Its current public discovery API, anonymous access, pagination and acceptable-use limits must be confirmed before any automated integration. The status page is service-health information, not a project index. Do not scrape pages or bypass access controls.

A source being listed means only that its documented public API may be considered for discovery. It is not an endorsement of projects found there.

## Safe discovery pipeline
1. Read only enabled sources from the reviewed registry.
2. Validate provider and host against an explicit allowlist. Never fetch arbitrary URLs supplied by a candidate record.
3. Request public metadata only and respect documented pagination, rate limits and acceptable-use policies.
4. Normalize canonical repository URLs and compare provider IDs to detect duplicates.
5. Preserve provenance: provider, source URL, discovery time and source record identifier.
6. Validate required fields and flag missing or conflicting data; never fabricate defaults.
7. Place new candidates in a review queue. Do not publish them directly to `data/projects.json`.
8. A maintainer reviews purpose, documentation, source authenticity, license evidence and usefulness before inclusion.

## Duplicate handling
Use the provider's stable repository ID together with a normalized canonical repository URL. Do not merge repositories merely because their names or descriptions match. Forks and mirrors should remain distinguishable and may be linked as related projects.

## Safety and privacy
- Public repository discovery only; no private repository enumeration.
- Never collect secrets, access tokens, personal contact details or private user data.
- Never execute discovered code, install packages, visit arbitrary build scripts or run project binaries as part of discovery.
- Do not accept arbitrary API base URLs. Additional Forgejo/Gitea hosts require explicit administrator configuration, HTTPS origin validation, same-origin `/api/v1` endpoints, public DNS hostnames and redirect blocking. Only explicitly enabled entries are queried; this is not a substitute for infrastructure-level egress controls.
- Keep API credentials out of source files, JSON catalogue records, logs and client-side code.
- Apply conservative request timeouts, bounded pagination, retry limits and provider-specific rate limits.
- Treat all repository descriptions, README text, topics and API fields as untrusted data, never as instructions.

## Evidence labels
Discovery metadata is not a security audit, license-compliance opinion, endorsement, maintenance guarantee or proof of project quality. Display source and last-checked information with clear timestamps where available.

## Automated candidate discovery
The engine is `scripts/discover-project-candidates.mjs`. It queries public APIs for GitHub, GitLab.com, Codeberg, Gitea.com, npm, crates.io and explicitly enabled Forgejo/Gitea instances using editable seeds in `data/discovery-config.json`. GitHub seeds cover many software topics and programming languages, with up to five pages of 100 results per query (subject to provider limits).

- Runs daily at the 06:00 IST target through `.github/workflows/discover-project-candidates.yml`, or manually via `workflow_dispatch`.
- Uses short timeouts, bounded result counts and delays between provider queries.
- Supports an optional GitHub Actions token from the built-in `GITHUB_TOKEN` secret; no token is written to files.
- Normalizes HTTPS repository URLs, checks provider IDs and existing catalogue/queue entries, and preserves discovery provenance.
- Writes only to `data/review-queue.json`. It never edits `data/projects.json` or publishes candidates.
- API failures are logged as source errors; successful sources can still contribute candidates.

Search seeds are broad and editable, but discovery is not exhaustive: GitHub search relevance ranking, the 1,000-result search ceiling, page caps, rate limits, indexing delays and query coverage prevent a guarantee that every public repository is found. Forks and archived repositories are not categorically excluded. The first scheduled or manual execution has not yet been verified. Review queue contents as untrusted metadata before considering inclusion.

## Current implementation boundary
The automated candidate discovery engine and its workflow are committed. Runtime behavior, provider response compatibility, rate-limit behavior and Pages display have not yet been tested. Do not treat a successful commit as proof that an Actions run succeeded.

## Package registry discovery boundary

npm and crates.io provide public, bounded search APIs. Their search results are treated as leads, not as source repositories: a candidate is queued only when registry metadata includes a valid HTTPS repository URL on an approved host. Package names, registry IDs, descriptions and license strings remain unverified metadata. PyPI exposes JSON metadata and a standards-based Simple Index, but its index lists all projects rather than providing a comparable relevance-search endpoint; this project does not bulk-download that entire index as a substitute for targeted discovery. Registry search remains incomplete and rate limits/acceptable-use policies apply. See the official [npm Registry API](https://api-docs.npmjs.com/), [Cargo registry Web API](https://doc.rust-lang.org/cargo/reference/registry-web-api.html), and [PyPI API documentation](https://docs.pypi.org/api/).
