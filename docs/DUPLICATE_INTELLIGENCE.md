# Duplicate, fork and mirror intelligence

## Goal
Identify duplicate listing risks and related repositories without deleting, merging or rejecting projects automatically.

## What the scanner compares
Run `node scripts/scan-duplicate-candidates.mjs` after discovery and before human review. It compares:
- Canonical HTTPS repository URLs (host normalized, trailing slash and `.git` suffix removed, query and fragment removed).
- Exact normalized project names as a weak signal only.
- Candidate records against both the current catalogue and other candidates in the review queue.

## Result labels
- `exact_duplicate_candidate`: same canonical repository URL found. Human confirmation is still required.
- `possible_name_match`: same normalized name, but repository URLs differ. This may be a separate implementation, fork, mirror, or unrelated project.
- `no_match_found`: no match in the current local catalogue and queue. This is not proof that no duplicate exists elsewhere.

## Forks and mirrors
A fork or mirror is not automatically a duplicate. It may contain independent improvements, different governance, or a distinct purpose. Review upstream links, ownership, commit history, license, and project purpose. Keep related projects as separate entries when they provide distinct value; optionally cross-link them after review.

## Safety guarantees
- No repository is deleted, merged, auto-rejected or auto-published.
- Name similarity never triggers an automatic decision.
- The scanner does not clone repositories, execute code or inspect binaries.
- All API-sourced names and descriptions remain untrusted data.
- The scan is limited to the current catalogue and review queue; it cannot prove global uniqueness.

## Workflow
1. Discovery writes public metadata into `data/review-queue.json`.
2. Duplicate scan adds review hints to the queue.
3. Metadata triage may add limited quality-review signals.
4. A human reviews original sources and decides whether to list, request information or reject.
