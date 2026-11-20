# Daily global refresh policy

## Schedule
The automated refresh workflows are scheduled for `00:30 UTC`, which is `06:00 India Standard Time (IST, UTC+05:30)`, every day. GitHub Actions scheduled jobs can start later than the requested minute during platform load; this is a daily target, not a guaranteed exact-second execution.

## Refresh scope
The daily jobs re-check the configured public sources and current records:
- Public repository metadata for listed GitHub projects.
- New public project candidates from broad topic- and language-based GitHub searches plus configured GitLab.com and Codeberg/Forgejo searches.
- Public security advisory feeds (GitHub Security Advisories, CISA KEV and NIST NVD).
- Exact package/version entries already present in the reviewed SBOM inventory via OSV.dev.
- Existing project health and provenance evidence records.

Dependent health and duplicate-analysis workflows run after their upstream discovery/metadata workflows complete successfully. All scheduled workflows also retain manual dispatch where configured.

## Change-only publishing
The shared `scripts/write-json-if-changed.mjs` helper compares substantive JSON data while ignoring volatile observation timestamps such as `generated_at`, `checked_at` and `last_successful_check`. If no substantive information changed, it leaves the existing snapshot untouched. Workflow commit steps also skip commits when tracked output files are unchanged.

When upstream data changes, the corresponding snapshot is updated. When a source fails, existing successful data is retained where the collector supports fallback and the failure/unknown state is reported; missing data is never fabricated as zero or treated as proof of safety.

## Boundaries
- The configured sources are not the entire internet. Discovery is bounded by public APIs, search seeds, pagination and provider availability.
- New project candidates remain in a human-review queue; daily refresh does not automatically publish them.
- SBOM checks only cover exact reviewed package/version entries supplied in the inventory.
- Security feeds are intelligence feeds, not proof that a listed project is affected.
- No private repositories, credentials, wallet secrets or personal data are collected.
- Scheduled workflow timing and success depend on GitHub Actions availability, API limits and upstream services.
