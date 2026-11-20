import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const catalogue = JSON.parse(await readFile(new URL("data/projects.json", root), "utf8"));
const reportUrl = new URL("data/project-health.json", root);
const previous = await readFile(reportUrl, "utf8").then(JSON.parse).catch(() => ({ schema_version: 1, projects: [] }));
const previousByUrl = new Map((previous.projects || []).map(item => [item.repository, item]));
const token = process.env.GITHUB_TOKEN;
const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "global-open-source-hub-health-monitor"
};
if (token) headers.Authorization = `Bearer ${token}`;

const checkedAt = new Date().toISOString();
const results = [];
let reachable = 0, archived = 0, unknown = 0, stale = 0;

for (const project of catalogue.projects || []) {
  let owner, name;
  try {
    const url = new URL(project.repository);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") throw new Error("Unsupported repository host or URL scheme");
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_.-]+$/.test(part))) throw new Error("Expected https://github.com/owner/repo");
    [owner, name] = parts;
  } catch (error) {
    results.push({ name: project.name, repository: project.repository, status: "invalid_source", checked_at: checkedAt, detail: error.message });
    unknown++;
    continue;
  }

  const prior = previousByUrl.get(project.repository);
  try {
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, {
      headers, signal: AbortSignal.timeout(12000)
    });
    if (response.status === 404) {
      results.push({
        name: project.name, repository: project.repository, status: "not_found_or_private",
        checked_at: checkedAt,
        detail: "GitHub returned 404. The repository may be deleted, renamed, or private; this does not prove deletion."
      });
      unknown++;
      continue;
    }
    if (response.status === 403 || response.status === 429) {
      const result = { name: project.name, repository: project.repository, status: "unknown", checked_at: checkedAt, detail: `GitHub rate limit or access restriction (HTTP ${response.status}); retry later.` };
      if (prior?.last_successful_check) result.last_successful_check = prior.last_successful_check;
      results.push(result); unknown++; continue;
    }
    if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`);
    const data = await response.json();
    const lastPush = data.pushed_at || null;
    const ageDays = lastPush ? Math.floor((Date.now() - Date.parse(lastPush)) / 86400000) : null;
    const isStale = Number.isFinite(ageDays) && ageDays > 365;
    const status = data.archived ? "archived" : "reachable";
    const result = {
      name: project.name,
      repository: data.html_url || project.repository,
      status,
      checked_at: checkedAt,
      last_successful_check: checkedAt,
      archived: Boolean(data.archived),
      visibility: data.visibility || "unknown",
      last_push_at: lastPush,
      days_since_last_push: ageDays,
      inactivity_hint: isStale ? "no_push_detected_in_over_365_days" : "no_stale_hint",
      default_branch: data.default_branch || null,
      stars: data.stargazers_count ?? null,
      forks: data.forks_count ?? null,
      license_spdx: data.license?.spdx_id ?? null,
      source: "GitHub REST API"
    };
    results.push(result);
    if (data.archived) archived++;
    else reachable++;
    if (isStale) stale++;
  } catch (error) {
    const result = { name: project.name, repository: project.repository, status: "unknown", checked_at: checkedAt, detail: error.message };
    if (prior?.last_successful_check) result.last_successful_check = prior.last_successful_check;
    results.push(result); unknown++;
  }
}

const output = {
  schema_version: 1,
  checked_at: checkedAt,
  summary: {
    total: results.length, reachable, archived, unknown,
    inactivity_hints_over_365_days: stale,
    interpretation: "Availability and metadata signals only; not a security, quality, uptime or maintenance guarantee."
  },
  projects: results
};
await writeFile(reportUrl, JSON.stringify(output, null, 2) + "\\n");
console.log(`Project health check finished: ${reachable} reachable, ${archived} archived, ${unknown} unknown, ${stale} inactivity hints. No catalogue entries were changed.`);
