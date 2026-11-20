# Software supply-chain intelligence

## Purpose
This layer connects a reviewed Software Bill of Materials (SBOM) inventory to public vulnerability metadata. It is designed to avoid guessing dependencies from repository names or descriptions.

## Supported SBOM standards
- SPDX JSON: https://spdx.dev/
- CycloneDX JSON: https://cyclonedx.org/

The Hub does not yet automatically fetch or parse arbitrary project SBOM URLs. Maintainers must review an SBOM and add exact component tuples to `data/sbom-inventory.json`: ecosystem, package name, exact version and a reference to the source SBOM. Keep the SBOM's original provenance and license notices.

## OSV matching
The scheduled checker sends exact package ecosystem, name and version tuples to the official OSV.dev querybatch API:
- API documentation: https://google.github.io/osv.dev/api/

Only exact version matches supplied by the inventory are checked. Results are written to `data/dependency-intelligence.json`. The initial inventory is intentionally empty; therefore an empty report means no inventory entries were supplied, not that projects have no vulnerabilities.

## Safety controls
- Maximum 1,000 inventory package records; API requests are batched in groups of 100.
- Only a fixed allowlist of package ecosystems is accepted.
- Package names and versions are treated as data, not instructions.
- No package is installed, built, downloaded or executed.
- API failures are marked unknown and previous successful results are retained.
- No project is automatically labelled vulnerable, removed or blocked.
- Advisory matches must be reviewed against upstream advisory details, package source and affected-version ranges before communicating risk.

## Important limitations
This checker does not discover dependencies, parse arbitrary lockfiles, generate SBOMs, verify signatures, validate package provenance, detect typosquatting or malware, scan containers, or assess exploitability. It is not a security audit or compliance certification. A match is an investigation lead, not a final verdict.

 
## Release provenance and integrity evidence

The Hub also maintains `data/provenance-evidence.json` for reviewed release evidence: artifact version, SHA-256 digest, source repository/commit, provenance attestation URL and optional signature reference. The validator checks record structure and writes `data/provenance-validation.json`.

This validation is metadata-only. It does not download artifacts, recompute digests, verify signatures, or validate SLSA/in-toto attestations. A declared verification status is not independently proven by the validator. See [PROVENANCE_AND_INTEGRITY.md](PROVENANCE_AND_INTEGRITY.md).
