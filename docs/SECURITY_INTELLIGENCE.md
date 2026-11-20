# Open security intelligence

## Sources
The daily workflow retrieves public advisory metadata from three authoritative sources:

- GitHub Global Security Advisories API: GHSA/CVE identifiers, summary, severity, timestamps and limited affected-package/version metadata.
- CISA Known Exploited Vulnerabilities (KEV) catalog: CVEs that CISA identifies as exploited in the wild, along with vendor/product and remediation due-date fields.
- NIST National Vulnerability Database (NVD) CVE API 2.0: CVEs modified in the most recent seven-day window, including English descriptions and available weakness identifiers.

Source documentation:
- https://docs.github.com/en/rest/security-advisories/global-advisories
- https://www.cisa.gov/known-exploited-vulnerabilities-catalog
- https://nvd.nist.gov/developers/vulnerabilities

## Automation
`scripts/refresh-security-intelligence.mjs` updates `data/security-intelligence.json`. The workflow `.github/workflows/refresh-security-intelligence.yml` runs daily and supports manual dispatch. GitHub uses the built-in Actions token for its public API; CISA and NVD requests do not require a stored API key for this limited use.

Requests have timeouts and bounded result counts. If a source fails, its last successful snapshot is retained and the feed is marked `error_using_previous_snapshot`; an API failure is never interpreted as zero vulnerabilities. NVD results cover a rolling seven-day last-modified window, not the full NVD database. GitHub's feed is limited to the newest 100 results per run.

## How to interpret the data
- An advisory is not proof that a listed Hub project is affected.
- CVE names, package names and version ranges must be matched against a project's actual dependency manifests and lockfiles before any alert is raised.
- Ecosystem and package identifiers matter; matching only by project name or text is unsafe.
- CISA KEV inclusion means CISA lists the CVE as known exploited; it does not establish that every product or version is affected.
- Severity labels and CVSS scores are source-provided metadata, not a complete risk assessment.
- No discovered code is downloaded, built, installed or executed by this workflow.

## Explicit limitations
This is an advisory-feed collector, not a dependency scanner, SBOM generator, malware detector, penetration test, exploitability assessment or security certification. It does not automatically modify catalogue entries or notify users that a project is vulnerable. Provider coverage and API limits can change; inspect each original advisory for authoritative current details.
