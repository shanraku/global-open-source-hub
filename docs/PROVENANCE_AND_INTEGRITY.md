# Package provenance and integrity evidence

## Goal
Record verifiable references for release artifacts: immutable version, SHA-256 digest, source repository/commit, provenance attestation and optional signature evidence. This is an evidence register, not a trust badge.

## Record format
Add reviewed entries to `data/provenance-evidence.json` with:
- `id`: unique evidence record identifier.
- `artifact` and `version`: exact release artifact and version.
- `sha256`: 64 hexadecimal characters for the artifact digest.
- `provenance_url`: HTTPS link to an attestation or provenance document.
- Optional `signature_url`, `source_repository`, and `source_commit`.
- Optional `verification` metadata. A declared cryptographically verified status must include verifier name/version, timestamp and HTTPS verification evidence link.

## Validation
`scripts/validate-provenance-evidence.mjs` checks required fields, SHA-256 syntax, HTTPS references, Git commit syntax, duplicate IDs and declared verification metadata. The workflow runs when relevant files change, weekly, and manually. It writes `data/provenance-validation.json`.

## Critical distinction
The validator performs structural checks only. It does not fetch artifacts, recompute their SHA-256 digests, validate signatures, verify Sigstore certificates/transparency-log inclusion, or validate SLSA/in-toto attestations. A `cryptographically_verified` value is a maintainer-declared status, not a result produced by this script. Do not display it as a verified badge without an independent cryptographic verifier and reproducible verification record.

## Useful standards and systems
- SLSA: https://slsa.dev/
- in-toto attestations: https://in-toto.io/
- Sigstore: https://sigstore.dev/
- Rekor transparency log: https://docs.sigstore.dev/logging/overview/
- SHA-256 specification family: https://csrc.nist.gov/projects/hash-functions

## Safety
Never execute an artifact to inspect it. Do not accept credentials, private keys, wallet seed phrases or signing secrets. Keep evidence links public and avoid embedding untrusted HTML. Verify claims against the original publisher and preserve timestamps and immutable digests.
