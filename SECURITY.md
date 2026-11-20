# Security policy

The Hub is a static directory and does not need visitors' passwords, API keys, wallet recovery phrases or private credentials.

## Reporting a vulnerability
Please do not publish exploitable details or secrets in a public issue. Use GitHub's private vulnerability reporting feature for this repository if enabled. Otherwise contact the maintainers privately through a channel listed on the GitHub profile.

## Scope
Report vulnerabilities in this Hub's own code. For a listed project's vulnerability, follow that project's own security policy and report it to its maintainers.

## User safety
- Follow links only when you trust the destination.
- Verify repository ownership, release artifacts and licenses independently.
- A listing is not a security audit or endorsement.

## Automated security intelligence

The Hub collects public advisory metadata from GitHub Security Advisories, CISA's Known Exploited Vulnerabilities catalog and the NIST National Vulnerability Database. See [docs/SECURITY_INTELLIGENCE.md](docs/SECURITY_INTELLIGENCE.md).

This feed collection is not a vulnerability scan, SBOM, malware detector, exploitability assessment or security certification. An advisory is not automatically evidence that a listed project is affected. Verify package ecosystem, package name and affected version against the project's actual dependency manifests and authoritative advisory before drawing conclusions.

## SBOM and dependency intelligence

The optional OSV checker uses exact package ecosystem, name and version records from a reviewed SBOM inventory. It does not install or execute packages, discover dependencies automatically, or prove that a project is secure. Advisory matches require manual validation against the upstream affected-version range and source advisory. See [docs/SOFTWARE_SUPPLY_CHAIN.md](docs/SOFTWARE_SUPPLY_CHAIN.md).
