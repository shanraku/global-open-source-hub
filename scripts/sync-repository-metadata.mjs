import { readFile, writeFile } from "node:fs/promises";

const dataPath = new URL("../data/projects.json", import.meta.url);
const data = JSON.parse(await readFile(dataPath, "utf8"));
const token = process.env.GITHUB_TOKEN;
const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "global-open-source-hub-metadata-sync"
};
if (token) headers.Authorization = `Bearer ${token}`;

const now = new Date().toISOString();
let updated = 0;
let failed = 0;

for (const project of data.projects) {
  let parsed;
  try {
    const url = new URL(project.repository);
    if (url.hostname.toLowerCase() !== "github.com") throw new Error("Only canonical github.com repositories are supported");
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_.-]+$/.test(part))) throw new Error("Repository URL must be https://github.com/owner/repo");
    parsed = parts;
  } catch (error) {
    project.metadata_sync = { status: "invalid_source", checked_at: now, message: error.message };
    failed++;
    continue;
  }

  const [owner, name] = parsed;
  try {
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, { headers });
    if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status}`);
    const repo = await response.json();
    project.repository_metadata = {
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      open_issues: repo.open_issues_count,
      default_branch: repo.default_branch,
      pushed_at: repo.pushed_at,
      created_at: repo.created_at,
      license_spdx: repo.license?.spdx_id ?? null,
      archived: repo.archived,
      visibility: repo.visibility,
      html_url: repo.html_url
    };
    project.metadata_sync = { status: "success", checked_at: now };
    updated++;
  } catch (error) {
    // Preserve the last known good metadata; never replace it with fabricated zeros.
    project.metadata_sync = {
      status: "error",
      checked_at: now,
      message: error.message,
      retained_previous_metadata: Boolean(project.repository_metadata)
    };
    failed++;
  }
}

data.metadata_snapshot = { checked_at: now, updated, failed, source: "GitHub REST API repository metadata" };
await writeFile(dataPath, JSON.stringify(data, null, 2) + "\n");
console.log(`Repository metadata sync finished: ${updated} updated, ${failed} failed.`);
