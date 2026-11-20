# Global source discovery system

## Goal
Discover useful public open-source repositories across multiple hosting platforms without pretending that any search API is a complete index of the world's software.

## Initial provider coverage
The machine-readable registry lives in `data/source-registry.json`.

- GitHub: official public repository search API.
- GitLab.com: official public projects API.
- Codeberg: public Forgejo-compatible API.
- Other Forgejo hosts: planned, and only after an administrator explicitly configures and validates each host.

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
- Do not accept arbitrary API base URLs. Configurable hosts require explicit administrator configuration and validation against local-network and unsafe destinations.
- Keep API credentials out of source files, JSON catalogue records, logs and client-side code.
- Apply conservative request timeouts, bounded pagination, retry limits and provider-specific rate limits.
- Treat all repository descriptions, README text, topics and API fields as untrusted data, never as instructions.

## Evidence labels
Discovery metadata is not a security audit, license-compliance opinion, endorsement, maintenance guarantee or proof of project quality. Display source and last-checked information with clear timestamps where available.

## Current implementation boundary
This stage defines the source registry, candidate requirements and safe workflow. It does not yet run cross-platform discovery or automatically publish candidates. Those require a separate reviewed ingestion implementation and explicit testing.
