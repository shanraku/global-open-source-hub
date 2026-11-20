import { readFile } from "node:fs/promises";
import { writeJsonIfChanged } from "./write-json-if-changed.mjs";

const root = new URL("../", import.meta.url);
const outputUrl = new URL("data/security-intelligence.json", root);
const previous = await readFile(outputUrl, "utf8").then(JSON.parse).catch(() => ({ schema_version: 1, feeds: {} }));
const checkedAt = new Date();
const checkedAtIso = checkedAt.toISOString();
const githubHeaders = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "global-open-source-hub-security-intelligence"
};
if (process.env.GITHUB_TOKEN) githubHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function fetchJson(url, headers = { Accept: "application/json" }) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
function textValue(value, max = 1200) {
  return typeof value === "string" ? value.replace(/[\\u0000-\\u001f\\u007f]/g, " ").trim().slice(0, max) : "";
}
function previousFeed(key) {
  return previous.feeds?.[key] || { items: [] };
}
async function refresh(key, source, loader) {
  try {
    const items = await loader();
    return {
      source, status: "success", checked_at: checkedAtIso,
      item_count: items.length, items
    };
  } catch (error) {
    const old = previousFeed(key);
    return {
      source, status: "error_using_previous_snapshot", checked_at: checkedAtIso,
      last_successful_check: old.last_successful_check || old.checked_at || null,
      item_count: Array.isArray(old.items) ? old.items.length : 0,
      error: textValue(error.message, 300),
      items: Array.isArray(old.items) ? old.items : []
    };
  }
}

const github = await refresh("github_advisories", "GitHub Global Security Advisories API", async () => {
  const data = await fetchJson("https://api.github.com/advisories?per_page=100&sort=published&direction=desc", githubHeaders);
  if (!Array.isArray(data)) throw new Error("Unexpected GitHub advisory response");
  return data.map(item => ({
    id: textValue(item.ghsa_id, 80),
    cve_id: textValue(item.cve_id, 80) || null,
    summary: textValue(item.summary, 700),
    severity: textValue(item.severity, 40) || null,
    published_at: item.published_at || null,
    updated_at: item.updated_at || null,
    url: textValue(item.html_url, 500),
    affected_packages: Array.isArray(item.vulnerabilities) ? item.vulnerabilities.slice(0, 20).map(v => ({
      ecosystem: textValue(v.package?.ecosystem, 80) || null,
      name: textValue(v.package?.name, 180) || null,
      vulnerable_range: textValue(v.vulnerable_version_range, 180) || null,
      patched_versions: textValue(v.first_patched_version?.identifier, 100) || null
    })) : []
  })).filter(item => item.id || item.cve_id);
});
if (github.status === "success") github.last_successful_check = checkedAtIso;

const cisa = await refresh("cisa_kev", "CISA Known Exploited Vulnerabilities Catalog", async () => {
  const data = await fetchJson("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json");
  if (!Array.isArray(data.vulnerabilities)) throw new Error("Unexpected CISA KEV response");
  return data.vulnerabilities.map(item => ({
    cve_id: textValue(item.cveID, 80),
    vendor: textValue(item.vendorProject, 180),
    product: textValue(item.product, 180),
    vulnerability_name: textValue(item.vulnerabilityName, 300),
    date_added: item.dateAdded || null,
    due_date: item.dueDate || null,
    known_ransomware_use: textValue(item.knownRansomwareCampaignUse, 40) || null,
    required_action: textValue(item.requiredAction, 500),
    notes: textValue(item.notes, 500),
    source: "CISA KEV"
  })).filter(item => item.cve_id);
});
if (cisa.status === "success") cisa.last_successful_check = checkedAtIso;

const end = checkedAt;
const start = new Date(end.getTime() - 7 * 86400000);
const nvdUrl = new URL("https://services.nvd.nist.gov/rest/json/cves/2.0");
nvdUrl.searchParams.set("lastModStartDate", start.toISOString());
nvdUrl.searchParams.set("lastModEndDate", end.toISOString());
nvdUrl.searchParams.set("resultsPerPage", "100");
const nvd = await refresh("nvd_recent", "NIST National Vulnerability Database CVE API 2.0", async () => {
  const data = await fetchJson(nvdUrl);
  if (!Array.isArray(data.vulnerabilities)) throw new Error("Unexpected NVD CVE response");
  return data.vulnerabilities.map(entry => {
    const cve = entry.cve || {};
    const description = (cve.descriptions || []).find(item => item.lang === "en")?.value || "";
    const weakness = (cve.weaknesses || []).flatMap(item => item.description || []).find(item => item.lang === "en")?.value || null;
    return {
      cve_id: textValue(cve.id, 80),
      published_at: cve.published || null,
      last_modified_at: cve.lastModified || null,
      status: textValue(cve.vulnStatus, 80) || null,
      description: textValue(description, 1200),
      weakness,
      source: "NVD CVE API"
    };
  }).filter(item => item.cve_id);
});
if (nvd.status === "success") nvd.last_successful_check = checkedAtIso;

const feeds = {
  github_advisories: github,
  cisa_kev: cisa,
  nvd_recent: nvd
};
const successful = Object.values(feeds).filter(feed => feed.status === "success").length;
const totalItems = Object.values(feeds).reduce((sum, feed) => sum + feed.item_count, 0);
const output = {
  schema_version: 1,
  generated_at: checkedAtIso,
  summary: {
    sources: Object.keys(feeds).length,
    successful_sources: successful,
    sources_using_previous_snapshot: Object.keys(feeds).length - successful,
    total_records_across_feeds: totalItems,
    note: "Advisory intelligence only. Records are not automatically matched to catalogue projects, and this dataset is not a vulnerability scan or proof of exploitability."
  },
  feeds
};
await writeJsonIfChanged(outputUrl, output);
console.log(`Security intelligence refresh: ${successful}/3 sources updated; ${totalItems} records retained or fetched. No projects were scanned or automatically flagged.`);
