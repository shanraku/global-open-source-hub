import { readFile, mkdir } from "node:fs/promises";
import { writeJsonIfChanged } from "./write-json-if-changed.mjs";
import { dirname } from "node:path";

const root = new URL("../", import.meta.url);
const registry = JSON.parse(await readFile(new URL("data/source-registry.json", root), "utf8"));
const catalogue = JSON.parse(await readFile(new URL("data/projects.json", root), "utf8"));
const config = JSON.parse(await readFile(new URL("data/discovery-config.json", root), "utf8"));
const outputUrl = new URL("data/review-queue.json", root);
const existingQueue = await readFile(outputUrl, "utf8").then(JSON.parse).catch(() => ({ schema_version: 1, candidates: [] }));
const now = new Date().toISOString();
const headers = { "User-Agent": "global-open-source-hub-discovery/1.0", Accept: "application/json" };
const ghToken = process.env.GITHUB_TOKEN;
if (ghToken) headers.Authorization = `Bearer ${ghToken}`;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clean = value => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 500) : "";
function canonical(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || !["github.com", "gitlab.com", "codeberg.org"].includes(u.hostname.toLowerCase())) return null;
    u.hostname = u.hostname.toLowerCase();
    u.pathname = u.pathname.replace(/\\.git$/i, "").replace(/\\/+$/, "");
    u.search = ""; u.hash = "";
    return u.toString();
  } catch { return null; }
}
const knownUrls = new Set(catalogue.projects.map(p => canonical(p.repository)).filter(Boolean));
const knownIds = new Set();
for (const p of catalogue.projects) {
  const m = p.discovery;
  if (m?.provider && m?.provider_id) knownIds.add(`${m.provider}:${m.provider_id}`);
}
for (const c of existingQueue.candidates) {
  if (c.canonical_url) knownUrls.add(c.canonical_url);
  if (c.provider && c.provider_id) knownIds.add(`${c.provider}:${c.provider_id}`);
}
const candidates = [...existingQueue.candidates];
const seen = new Set(candidates.map(c => c.candidate_key));
let fetched = 0, added = 0, errors = 0;

async function getJson(url, providerHeaders = headers) {
  const response = await fetch(url, { headers: providerHeaders, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
function add(provider, id, name, url, description, topics, stars, updatedAt, license) {
  const canonicalUrl = canonical(url);
  if (!canonicalUrl || knownUrls.has(canonicalUrl)) return;
  const providerId = String(id);
  const idKey = `${provider}:${providerId}`;
  if (knownIds.has(idKey)) return;
  const key = `${provider}:${providerId}:${canonicalUrl}`;
  if (seen.has(key)) return;
  const record = {
    candidate_key: key, name: clean(name), provider, provider_id: providerId,
    repository_url: url, canonical_url: canonicalUrl,
    description: clean(description), topics: Array.isArray(topics) ? topics.map(clean).filter(Boolean).slice(0, 12) : [],
    stars: Number.isFinite(stars) ? stars : null,
    last_activity_at: updatedAt || null, license_spdx: license || null,
    discovered_at: now, discovery_source: provider, review_status: "pending",
    review_note: "Unreviewed public metadata. Not a quality, security, maintenance or license-compliance assessment."
  };
  candidates.push(record); seen.add(key); knownUrls.add(canonicalUrl); knownIds.add(idKey); added++;
}

for (const source of registry.sources.filter(s => s.status === "supported")) {
  const terms = config.queries[source.provider] || [];
  for (const term of terms) {
    try {
      if (source.provider === "GitHub") {
        const perPage = Math.min(100, Math.max(1, config.limits.github_per_page || 100));
        const maxPages = Math.max(1, config.limits.github_max_pages_per_query || 3);
        const maxResults = Math.max(perPage, config.limits.max_results_per_query || 300);
        const pageLimit = Math.min(maxPages, Math.ceil(maxResults / perPage));
        let queryFetched = 0;
        for (let page = 1; page <= pageLimit; page++) {
          const url = new URL("https://api.github.com/search/repositories");
          url.searchParams.set("q", `${term} in:name,description,readme`);
          url.searchParams.set("sort", "updated");
          url.searchParams.set("order", "desc");
          url.searchParams.set("per_page", String(perPage));
          url.searchParams.set("page", String(page));
          const data = await getJson(url);
          const items = data.items || [];
          for (const r of items) add("GitHub", r.id, r.full_name, r.html_url, r.description, r.topics, r.stargazers_count, r.pushed_at, r.license?.spdx_id);
          fetched += items.length;
          queryFetched += items.length;
          if (items.length < perPage || queryFetched >= maxResults) break;
          await sleep(config.limits.minimum_delay_between_queries_ms || 2100);
        }
      } else if (source.provider === "GitLab") {
        const url = new URL("https://gitlab.com/api/v4/projects");
        url.searchParams.set("search", term); url.searchParams.set("visibility", "public");
        url.searchParams.set("order_by", "last_activity_at"); url.searchParams.set("sort", "desc"); url.searchParams.set("per_page", "30");
        const data = await getJson(url);
        for (const r of data || []) add("GitLab", r.id, r.path_with_namespace, r.web_url, r.description, r.topics, r.star_count, r.last_activity_at, null);
        fetched += (data || []).length;
      } else if (source.provider === "Codeberg / Forgejo") {
        const url = new URL("https://codeberg.org/api/v1/repos/search");
        url.searchParams.set("q", term); url.searchParams.set("limit", "30");
        const data = await getJson(url);
        for (const r of data.data || []) add("Codeberg", r.id, r.full_name, r.html_url, r.description, r.topics, r.stars_count, r.updated_at, null);
        fetched += (data.data || []).length;
      }
    } catch (error) {
      errors++;
      console.warn(`Discovery source failed (${source.provider}, query ${term}): ${error.message}`);
    }
    await sleep(config.limits.minimum_delay_between_queries_ms || 2100);
  }
}
const output = {
  schema_version: 1,
  generated_at: now,
  summary: { fetched_records: fetched, new_candidates: added, source_errors: errors, publication: "manual_review_required" },
  candidates
};
await mkdir(dirname(new URL(outputUrl).pathname), { recursive: true });
await writeJsonIfChanged(outputUrl, output);
console.log(`Discovery finished: ${fetched} records scanned, ${added} new candidates, ${errors} source errors. Nothing was auto-published.`);
