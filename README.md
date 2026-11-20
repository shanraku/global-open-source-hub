# Global Open Source Hub

**Useful projects. Open to everyone.**

A growing, independent directory for discovering practical open-source software. Explore projects, inspect their original source repositories, learn how they work and contribute improvements.

## What is included

- Searchable project directory with category filters and A–Z sorting.
- Direct links to original GitHub repositories.
- Mobile-responsive, accessible interface with reduced-motion support.
- Curated, machine-readable project catalogue in `data/projects.json`.
- A reviewed multi-host source registry for GitHub, GitLab.com, Codeberg/Forgejo and Gitea.com discovery; SourceHut is tracked as planned pending API verification.
- Daily broad topic- and language-based discovery across public GitHub repositories, plus configured GitLab.com, Codeberg and Gitea.com searches, with optional explicitly configured public Forgejo/Gitea hosts; candidates enter a review queue and are never auto-published. GitHub search is paginated up to configured limits, not a complete export of every repository.
- Transparent review triage signals and a human checklist; automated scores never approve, reject or publish projects.
- Duplicate-candidate hints based on canonical repository URLs and cautious name matching; no automatic merges or deletions.
- Scheduled repository health snapshots for reachability, archived status and cautious inactivity hints; uncertain API results remain unknown.
- Daily public security-advisory intelligence snapshots from GitHub Security Advisories, CISA KEV and NIST NVD; no automatic project vulnerability claims.
- SBOM-based exact-version dependency advisory checks against OSV.dev, with a reviewed inventory and no package installation or execution.
- Release provenance and integrity evidence register for SHA-256 digests, provenance links, signatures and verification metadata; structural validation never pretends to perform cryptographic verification.
- Safe discovery rules: provenance, canonical URL/provider-ID duplicate detection, public-only access and human review before publication.
- Daily 06:00 IST refresh target across configured public sources, with change-only snapshots and preservation of prior data when no new information arrives.
- Clear methodology, contribution guidance and security policy.
- No account, API key, application backend, analytics or tracking required by this static directory.

## Browse the current catalogue

The starter catalogue includes projects for:
- AI tools and model/API discovery
- Developer utilities and JSON
- Markdown writing
- Colour design and accessibility
- Password and Bitcoin safety education

See `data/projects.json` for the current entries. This is a curated starter collection, not a complete index of every open-source project worldwide. Each listing links to its original repository; check that repository for current features, license, releases and security information.

## Run locally

Requires a modern browser. Serve the repository using any static file server; for example:

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

The directory fetches its catalogue from `data/projects.json`, so use a local server rather than opening the HTML file directly.

## Publish with GitHub Pages

1. Open this repository's **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the `main` branch and `/(root)` folder, then save.
4. Wait for GitHub Pages to publish and use the URL shown in Settings → Pages.

Publishing is not configured or verified by this repository change.

## Update the directory

Edit `data/projects.json` and add a project object with:
- `name`, `category`, `description`
- `repository` (the original public repository URL)
- `tags` (short search keywords)
- `order` (display order)

Use the contribution checklist in [CONTRIBUTING.md](CONTRIBUTING.md). Do not invent release dates, popularity numbers, safety claims or licensing conclusions.

## Global source discovery

The source registry is in [data/source-registry.json](data/source-registry.json), discovery search seeds in [data/discovery-config.json](data/discovery-config.json), and pending candidates in [data/review-queue.json](data/review-queue.json). The scheduled workflow runs [scripts/discover-project-candidates.mjs](scripts/discover-project-candidates.mjs) daily at the 06:00 IST target and on manual dispatch. Candidates require human review and are never automatically published. See [docs/DISCOVERY_SYSTEM.md](docs/DISCOVERY_SYSTEM.md) for limits and safeguards. The optional triage script [scripts/score-review-candidates.mjs](scripts/score-review-candidates.mjs) annotates metadata signals; review criteria are in [docs/QUALITY_REVIEW.md](docs/QUALITY_REVIEW.md). The duplicate scanner [scripts/scan-duplicate-candidates.mjs](scripts/scan-duplicate-candidates.mjs) adds cautious match hints without merging or removing records; see [docs/DUPLICATE_INTELLIGENCE.md](docs/DUPLICATE_INTELLIGENCE.md). The health monitor [scripts/monitor-project-health.mjs](scripts/monitor-project-health.mjs) creates a separate snapshot in [data/project-health.json](data/project-health.json); see [docs/PROJECT_HEALTH.md](docs/PROJECT_HEALTH.md). The security feed collector [scripts/refresh-security-intelligence.mjs](scripts/refresh-security-intelligence.mjs) refreshes [data/security-intelligence.json](data/security-intelligence.json) daily from GitHub advisories, CISA KEV and NIST NVD; see [docs/SECURITY_INTELLIGENCE.md](docs/SECURITY_INTELLIGENCE.md). The SBOM checker [scripts/check-sbom-vulnerabilities.mjs](scripts/check-sbom-vulnerabilities.mjs) checks reviewed exact package versions in [data/sbom-inventory.json](data/sbom-inventory.json) against OSV.dev and writes [data/dependency-intelligence.json](data/dependency-intelligence.json); see [docs/SOFTWARE_SUPPLY_CHAIN.md](docs/SOFTWARE_SUPPLY_CHAIN.md). The provenance register [data/provenance-evidence.json](data/provenance-evidence.json) and structural validator [scripts/validate-provenance-evidence.mjs](scripts/validate-provenance-evidence.mjs) track release digest and attestation evidence without claiming cryptographic verification; see [docs/PROVENANCE_AND_INTEGRITY.md](docs/PROVENANCE_AND_INTEGRITY.md).

## Project policies

- [Daily refresh policy](docs/DAILY_REFRESH_POLICY.md)
- [Methodology](docs/METHODOLOGY.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## License

MIT. See [LICENSE](LICENSE). Third-party names, code, logos and trademarks remain the property of their respective owners. Listing a project does not imply endorsement.

