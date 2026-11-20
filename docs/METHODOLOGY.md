# Directory methodology

## Purpose
The Global Open Source Hub is an independent discovery portal for practical open-source projects. It is not a ranking authority, security auditor, endorsement service or guarantee that a project is maintained.

## Inclusion policy
A project should have a public source repository, a clear practical purpose, enough documentation for a visitor to understand it, and a legitimate license or an explicit note that licensing needs verification. Entries should link directly to the original repository.

## Evidence and freshness
- Repository documentation is the starting point for descriptions.
- Features, release activity, license status, security and compatibility can change. Verify them at the repository before relying on them.
- Do not infer that a project is actively maintained from its presence in this directory.
- Do not display fabricated stars, download counts, ratings, uptime or update timestamps.
- Project records are curated in `data/projects.json`. Changes are visible in Git history.

## Safety and privacy
- Never add secrets, access tokens, private contact details or personal data.
- Do not claim a project is safe, audited, certified or privacy-preserving without specific evidence.
- Clearly distinguish local browser processing from network requests to external services.
- Respect project licenses, trademarks and upstream terms.

## Corrections and submissions
Open an issue or pull request with the repository URL, a concise explanation of its usefulness, its license link and authoritative documentation. Maintainers review submissions; inclusion is not automatic.

## Scope
This is a growing curated directory, not a complete index of every open-source project worldwide. Search coverage and category choices will evolve through reviewed contributions.

## Automated repository metadata refresh
The workflow `.github/workflows/refresh-project-metadata.yml` requests public repository metadata from the GitHub REST API every Monday and can be started manually from the Actions tab. It records fields such as star/fork counts, detected SPDX license identifier, archived status, default branch and last push timestamp. These are GitHub repository metadata, not independent quality, security or maintenance assessments.

The workflow uses the repository-scoped `GITHUB_TOKEN` and requests only public repository metadata. If an API request fails, the last known good metadata is retained and the failure is recorded. A failed request is not interpreted as zero stars or as proof that a repository is deleted. Scheduled GitHub Actions can be delayed or disabled by repository settings and service limits. The first snapshot is not available until a workflow run succeeds.


## Project health snapshots

The workflow `.github/workflows/monitor-project-health.yml` checks listed public GitHub repositories after a successful metadata refresh, and can also be run manually. It stores reachability, archived status, last-push age and uncertainty in `data/project-health.json`. A 404 is ambiguous, API errors remain unknown, and inactivity is only a hint. The monitor does not remove or hide catalogue entries and is not an uptime or security audit. See [docs/PROJECT_HEALTH.md](PROJECT_HEALTH.md) for status definitions and limitations.
