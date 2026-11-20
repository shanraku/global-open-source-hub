# Package registry source-repository enrichment plan

## Purpose

Expand discovery beyond the currently supported registries without mistaking a package page, homepage, namespace, or vanity import path for an original source repository.

This document is an implementation gate. A registry remains `planned` until its API behavior, acceptable-use policy, source-link semantics, bounded pagination and error handling are reviewed and the integration is implemented and tested.

## Universal acceptance contract

A package search result is a discovery lead, not automatically a repository candidate.

A record may enter `data/review-queue.json` only when all of these conditions hold:

1. The registry result came from its documented public API.
2. The package identifier and registry URL are retained as provenance.
3. An explicit source-control URL is obtained from documented package metadata or a documented metadata file.
4. The source URL is HTTPS, has no credentials or non-standard port, and resolves to an approved source-host allowlist.
5. The URL is normalized and deduplicated using the same canonical repository and provider-ID checks as other sources.
6. The candidate records the registry provider, package identifier, source metadata field/path, discovery timestamp and the original repository URL.
7. Missing, ambiguous, conflicting or unsupported source links are skipped and counted; they are never guessed.
8. Candidates remain pending human review. No registry result is added directly to `data/projects.json`.

Do not fetch arbitrary URLs from package metadata. Any enrichment fetch must use a fixed, provider-owned API origin and a narrowly validated path. Block redirects, impose timeouts and response-size limits, and never execute package contents or build scripts.

## Provider-specific design

### NuGet.org

- Use the official V3 service index (`https://api.nuget.org/v3/index.json`) to discover the current Search Query Service endpoint; do not hardcode the search host or endpoint.
- Search with bounded `skip`/`take` values, exclude prereleases by default, and use conservative serial request pacing.
- The official Search Query Service exposes fields such as `id`, `version`, `description`, `tags`, `projectUrl`, downloads and vulnerabilities. The documented Registration catalog-entry schema also exposes `projectUrl`, but does not define a source-repository field. Treat `projectUrl` only as a homepage/landing-page field, never as proof of a source repository.
- NuGet's documented `.nuspec` manifest is included inside each package archive. Its optional `<repository>` metadata contains `type` and `url` attributes; NuGet documents this as the repository that built the package. This is the appropriate evidence to inspect, not a guessed URL.
- Proposed enrichment flow: follow only a `packageContent` URL discovered from the official registration metadata; require HTTPS and the exact NuGet-controlled download origin; block redirects; enforce a strict compressed-byte cap and timeout; inspect the ZIP central directory and extract only the single bounded `.nuspec` XML entry; never extract arbitrary files, install the package, execute code, or follow links from the archive.
- Parse XML with entity expansion/external entities disabled. Require a single unambiguous `<repository type="git" url="...">` value. Treat the URL as untrusted and pass it through the existing HTTPS source-host allowlist and canonicalizer. Reject missing, conflicting, non-git, malformed, unsupported-host or non-repository values.
- A `.nuspec` may omit repository metadata or contain stale/incorrect values. Even a valid explicit link is only a lead for human review, not proof that the package was built from that repository or that the repository is safe.
- Retain package ID, version, canonical NuGet package URL, exact `.nuspec` metadata evidence (`repository/@type` and `repository/@url`), and the source package-content URL as provenance. If only `projectUrl` exists, skip candidate creation.
-  The V3 metadata reader now exists at `scripts/nuget-registration.mjs`: it reads the official service index, selects approved Search Query Service and RegistrationsBaseUrl resources, performs bounded search pagination, and resolves an exact package-version registration leaf while limiting JSON response size and registration page count. It rejects resource hosts outside the narrow NuGet allowlist and does not follow arbitrary catalog or project URLs. Test fixtures are in `tests/nuget-registration.test.mjs`; they have not been run. The first-pass bounded ZIP/.nuspec parser exists at `scripts/nuget-nuspec.mjs`. The strict package download helper at `scripts/nuget-package-download.mjs` accepts only the exact HTTPS `api.nuget.org` flat-container URL for the supplied package ID/version, blocks redirects, applies a timeout, checks declared length and streams at most 8 MiB. The V3 reader at `scripts/nuget-registration.mjs` discovers the official service-index resources, uses bounded Search Query Service pagination (including SemVer 2.0.0), and fetches only the exact registration-leaf URL linked to the matching search-result version. The adapter at `scripts/nuget-discovery.mjs` connects search → exact registration leaf → bounded package download → `.nuspec` parser and emits repository leads only for one explicit `repository type=git` record. The discovery script has a NuGet branch, but the source registry entry deliberately remains `planned`, so the branch is dormant and scheduled discovery will not call NuGet yet. Candidate creation still passes through the existing approved repository-host canonicalizer and human-review queue; package metadata and `projectUrl` are retained as provenance, not treated as source proof. Test fixtures are in `tests/nuget-nuspec.test.mjs` and `tests/nuget-registration.test.mjs`; neither suite has been executed. The parser, download helper, registration reader and adapter have not been runtime-tested. Keep this provider `planned` until a maintainer authorizes and completes static review, tests, and a controlled integration run.

### Maven Central

- Use the official Search REST API with bounded `rows` and `start` values.
- Artifact coordinates, SCM URL strings and POM metadata are separate evidence fields.
- If SCM metadata enrichment is implemented, obtain POM content only from a fixed Maven Central-controlled artifact endpoint derived from validated group/artifact/version coordinates. Encode path segments safely; reject traversal and unexpected hosts.
- Parse the POM's `scm` connection/developerConnection/url fields as untrusted metadata. Accept only an explicit HTTPS browseable repository URL on an approved host. Do not infer a repository from group IDs, artifact IDs, organization names or homepage URLs.
- Handle parent POMs and missing SCM metadata conservatively; do not recursively crawl arbitrary POM references.
- Retain coordinates, selected version, POM artifact URL and the exact SCM field used.

### Go Module Index

- Treat the official index as an incremental module/version feed, not a source repository API.
- Preserve module path, version and timestamp as feed provenance.
- Do not convert module paths into GitHub/GitLab URLs. Vanity import domains and custom VCS mappings make that unsafe.
- A future resolver must use a documented, bounded, non-executing metadata mechanism and explicit host validation. If source ownership cannot be established, keep the item as an unresolved registry lead or skip it; do not queue a guessed repository.

### Hex.pm

- Use only documented public search and package metadata endpoints.
- Confirm the current response schema and pagination behavior before enabling the provider.
- Read explicit source-code links from package metadata only. Do not substitute documentation, homepage or package-page URLs.
- Accept only approved HTTPS repository hosts; skip ambiguous or absent links.
- Do not access private endpoints or send credentials.

### PyPI

- Do not enumerate or download the full Simple Index as a discovery shortcut.
- Use bounded, targeted project lookups only when a relevant package name is already known from a curated seed or another trusted public source.
- Treat project URLs and classifiers as metadata, not source proof.
- Accept an explicit source repository URL only when its field semantics are clear and the URL passes the common allowlist. A homepage alone is insufficient.
- Preserve the PyPI project name/version and exact metadata field used.

## Error and quality behavior

- One provider or package failure must not erase candidates from successful providers.
- Distinguish `not_found`, `no_source_link`, `ambiguous_source_link`, `unsupported_host`, `rate_limited`, `provider_error` and `invalid_metadata` in logs or provider summaries.
- Do not convert missing counts to zero or report partial results as exhaustive.
- Avoid logging full untrusted metadata or query strings that may contain sensitive values.
- Keep requests serial and bounded initially; optimize only after observing documented limits and successful workflow runs.
- Record a source-check timestamp and the registry's canonical package URL so maintainers can revisit stale evidence.

## Rollout checklist

- [ ] Verify official API documentation and acceptable-use terms immediately before implementation.
- [ ] Add a planned registry entry with documentation and explicit limitations.
- [ ] Implement a provider adapter with fixed origins and bounded pagination.
- [ ] Add unit fixtures for valid, missing, ambiguous, malicious and unsupported repository URLs.
- [ ] Add URL validation tests for credentials, ports, redirects, non-HTTPS schemes, IP literals and lookalike domains.
- [ ] Confirm failures preserve existing queue data and successful provider results.
- [ ] Run the workflow manually and inspect the generated queue before enabling the daily schedule for that provider.
- [ ] Keep the provider marked planned until all checks pass.

## Current status

The NuGet V3 adapter, bounded package downloader, `.nuspec` parser and dormant discovery integration are committed. Static review tightened registration-leaf matching to the exact package/version path, skips versions marked unlisted, and hardened `.nuspec` parsing to ignore comment/CDATA lookalikes, require the repository element under `package/metadata`, reject malformed nesting and reject non-whitespace text outside the root. ZIP review also validates the EOCD comment boundary, requires exact central-directory bounds, rejects ZIP64 sentinels and unsupported flags, validates UTF-8 entry names, and cross-checks local versus central header flags, methods, sizes and CRC fields. Network download review confirms exact-origin/path URL validation, redirects disabled, bounded 15-second default timeout (maximum 30 seconds), Content-Length precheck, streaming hard byte cap, stream cancellation on overflow, and rejection of empty, malformed or non-streaming responses; additional response-boundary fixtures were added without execution. These changes have not been runtime-tested; no tests, Actions workflows or deployment have been run. NuGet, Maven Central, Go Modules, Hex and PyPI remain planned in `data/source-registry.json`; no claim is made that these ecosystems are already being automatically indexed.
