import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const inventoryUrl = new URL("data/sbom-inventory.json", root);
const outputUrl = new URL("data/dependency-intelligence.json", root);
const inventory = JSON.parse(await readFile(inventoryUrl, "utf8"));
const previous = await readFile(outputUrl, "utf8").then(JSON.parse).catch(() => ({ packages: [] }));
const previousByKey = new Map((previous.packages || []).map(item => [item.package_key, item]));
const checkedAt = new Date().toISOString();
const allowedEcosystems = new Set(["npm", "PyPI", "Go", "crates.io", "Maven", "NuGet", "Packagist", "RubyGems", "Hex", "Pub", "Linux"]);
const packages = Array.isArray(inventory.packages) ? inventory.packages : [];
if (packages.length > 1000) throw new Error("Inventory exceeds the 1000-package safety limit.");

const clean = (value, max = 300) => typeof value === "string" ? value.replace(/[\\u0000-\\u001f\\u007f]/g, " ").trim().slice(0, max) : "";
const normalized = [];
const seen = new Set();
for (const item of packages) {
  const ecosystem = clean(item.ecosystem, 80);
  const name = clean(item.name, 200);
  const version = clean(item.version, 120);
  const sourceSbom = clean(item.source_sbom, 300);
  if (!allowedEcosystems.has(ecosystem) || !name || !version || !sourceSbom) continue;
  const key = `${ecosystem}:${name.toLowerCase()}@${version}`;
  if (seen.has(key)) continue;
  seen.add(key);
  normalized.push({ package_key: key, ecosystem, name, version, source_sbom: sourceSbom });
}
const results = [];
let successful = 0, failed = 0, vulnerabilities = 0;
for (let offset = 0; offset < normalized.length; offset += 100) {
  const batch = normalized.slice(offset, offset + 100);
  const queries = batch.map(item => ({
    package: { ecosystem: item.ecosystem, name: item.name },
    version: item.version
  }));
  try {
    const response = await fetch("https://api.osv.dev/v1/querybatch", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "global-open-source-hub-osv-checker" },
      body: JSON.stringify({ queries }),
      signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) throw new Error(`OSV API HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.results) || payload.results.length !== batch.length) throw new Error("OSV returned an unexpected batch result count");
    for (let i = 0; i < batch.length; i++) {
      const advisories = (payload.results[i].vulns || []).slice(0, 100).map(v => ({
        id: clean(v.id, 100),
        modified: v.modified || null,
        published: v.published || null,
        summary: clean(v.summary, 700),
        details_url: v.id ? `https://osv.dev/vulnerability/${encodeURIComponent(v.id)}` : null
      }));
      results.push({
        ...batch[i], status: "checked", checked_at: checkedAt,
        advisory_count: advisories.length, advisories,
        source: "OSV.dev querybatch API"
      });
      successful++;
      vulnerabilities += advisories.length;
    }
  } catch (error) {
    failed += batch.length;
    for (const item of batch) {
      const old = previousByKey.get(item.package_key);
      results.push({
        ...item, status: "unknown_api_error", checked_at: checkedAt,
        last_successful_check: old?.last_successful_check || old?.checked_at || null,
        advisory_count: old?.advisory_count ?? null,
        advisories: Array.isArray(old?.advisories) ? old.advisories : [],
        error: clean(error.message, 300),
        source: "OSV.dev querybatch API"
      });
    }
  }
}
const output = {
  schema_version: 1,
  generated_at: checkedAt,
  summary: {
    inventory_packages: normalized.length,
    successfully_checked: successful,
    unknown_due_to_api_errors: failed,
    advisory_matches: vulnerabilities,
    note: "Results apply only to exact ecosystem, package name and version tuples supplied in the reviewed SBOM inventory. No repository was scanned and no unlisted dependency is inferred."
  },
  packages: results
};
await writeFile(outputUrl, JSON.stringify(output, null, 2) + "\n");
console.log(`SBOM dependency check: ${successful} package versions checked, ${failed} unknown, ${vulnerabilities} advisory matches. No dependencies were installed or executed.`);
