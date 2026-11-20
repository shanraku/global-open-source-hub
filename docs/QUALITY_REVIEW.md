# Review and quality intelligence

## Purpose
Help maintainers triage discovery candidates using transparent, limited metadata signals and a repeatable human checklist. This is not an automated project-quality verdict.

## Automated triage signals
Run `node scripts/score-review-candidates.mjs` to annotate the current review queue. The script checks only fields already present in `data/review-queue.json`:
- Non-empty description
- At least one topic
- Provider-reported SPDX license identifier
- Provider-reported activity date within 365 days

Each available signal contributes at most one point. Missing or malformed data is marked unknown. Stars are deliberately not scored because popularity is not quality.

## Required human review
Before adding a candidate to `data/projects.json`, a maintainer should:
1. Open the canonical original repository and confirm that it exists and is public.
2. Confirm the project has a clear, useful purpose and is not spam, malware promotion or a duplicate.
3. Read the README and setup/use documentation; confirm that instructions are understandable and not obviously misleading.
4. Inspect the actual LICENSE file and repository ownership/provenance. An API SPDX field alone is not legal verification.
5. Check recent releases, commits, issue responses and archived status. Record uncertainty; do not promise maintenance.
6. Consider accessibility, privacy, data collection, telemetry and external dependencies where relevant.
7. Check whether the project is a fork or mirror and link related projects rather than merging distinct repositories.
8. Record the reviewer, review date, evidence links and decision rationale.

## Decision states
- `pending`: not yet reviewed.
- `needs_information`: evidence is incomplete; request or gather more information.
- `approved_for_listing`: a human reviewer has approved inclusion in the curated directory.
- `rejected`: a human reviewer has documented why it should not be listed.

The triage script never changes a candidate's decision state and never publishes candidates.

## Limitations
No source code is downloaded or executed. No dependency, malware, vulnerability, license-compliance or maintainer-identity audit is performed. API metadata can be incomplete, stale or incorrect. Scores are triage aids only and must not be presented as trust ratings.
