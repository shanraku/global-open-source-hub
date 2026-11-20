# Project repository health monitoring

## What it checks
The monitor `scripts/monitor-project-health.mjs` requests public GitHub repository metadata for each listed GitHub project and writes a timestamped snapshot to `data/project-health.json`.

Signals include:
- Whether the public repository API currently responds successfully.
- Whether GitHub marks the repository as archived.
- Last push timestamp and a cautious inactivity hint when no push is seen for more than 365 days.
- Default branch, stars, forks and SPDX license metadata when returned by GitHub.

## Status meanings
- `reachable`: GitHub returned public repository metadata successfully.
- `archived`: GitHub reports the repository is archived.
- `not_found_or_private`: GitHub returned 404; the repository may have been renamed, deleted or made private. This is not proof of deletion.
- `unknown`: rate limiting, access restrictions, network/API errors or other uncertainty.
- `invalid_source`: the catalogue URL is not a supported canonical GitHub repository URL.

A successful API response does not prove that a website, release artifact, dependency or feature works. A push older than 365 days is only an inactivity hint, not a quality verdict; stable software can be healthy without frequent commits.

## Automation and safety
The workflow runs after a successful repository metadata refresh and can also be started manually. It uses the built-in GitHub Actions token for public metadata requests. It writes a separate health snapshot and never edits, deletes, merges, hides or automatically rejects catalogue entries.

When checks fail, the result is marked unknown and the last successful check timestamp is retained when available. A 404 is explicitly ambiguous. This monitor is not an uptime monitor, vulnerability scanner, malware scan, license legal review or endorsement.

## Current limitations
The first real snapshot depends on a successful Actions run. GitHub repositories only are currently supported; GitLab, Codeberg and other Forgejo sources need their own verified provider-specific checks.
