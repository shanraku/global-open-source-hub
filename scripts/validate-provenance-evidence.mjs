import { readFile } from "node:fs/promises";
import { writeJsonIfChanged } from "./write-json-if-changed.mjs";

const root = new URL("../", import.meta.url);
const inventoryUrl = new URL("data/provenance-evidence.json", root);
const reportUrl = new URL("data/provenance-validation.json", root);
const inventory = JSON.parse(await readFile(inventoryUrl, "utf8"));
const records = Array.isArray(inventory.records) ? inventory.records : [];
if (records.length > 500) throw new Error("Provenance inventory exceeds the 500-record safety limit.");

const checkedAt = new Date().toISOString();
const issues = [];
const output = [];
const seen = new Set();
const allowedStatus = new Set(["unverified", "manual_reviewed", "cryptographically_verified"]);
const clean = (v, n = 500) => typeof v === "string" ? v.trim().slice(0, n) : "";
const isHttps = value => {
  try { const url = new URL(value); return url.protocol === "https:" && Boolean(url.hostname); }
  catch { return false; }
};

for (let index = 0; index < records.length; index++) {
  const item = records[index] || {};
  const id = clean(item.id, 100);
  const artifact = clean(item.artifact, 300);
  const version = clean(item.version, 120);
  const sha256 = clean(item.sha256, 64).toLowerCase();
  const provenanceUrl = clean(item.provenance_url, 1000);
  const signatureUrl = clean(item.signature_url, 1000);
  const repository = clean(item.source_repository, 500);
  const commit = clean(item.source_commit, 100);
  const key = id || `record-${index + 1}`;
  const recordIssues = [];
  if (!id) recordIssues.push("missing_id");
  if (seen.has(id) && id) recordIssues.push("duplicate_id");
  seen.add(id);
  if (!artifact) recordIssues.push("missing_artifact");
  if (!version) recordIssues.push("missing_version");
  if (!/^[a-f0-9]{64}$/.test(sha256)) recordIssues.push("invalid_or_missing_sha256");
  if (!isHttps(provenanceUrl)) recordIssues.push("provenance_url_must_be_https");
  if (signatureUrl && !isHttps(signatureUrl)) recordIssues.push("signature_url_must_be_https");
  if (repository && !isHttps(repository)) recordIssues.push("source_repository_must_be_https");
  if (commit && !/^[a-f0-9]{7,64}$/i.test(commit)) recordIssues.push("source_commit_must_be_git_sha");
  const verification = item.verification || {};
  const status = clean(verification.status, 50) || "unverified";
  if (!allowedStatus.has(status)) recordIssues.push("unsupported_verification_status");
  if (status === "cryptographically_verified") {
    if (!clean(verification.verifier, 160)) recordIssues.push("verified_status_missing_verifier");
    if (!clean(verification.verifier_version, 80)) recordIssues.push("verified_status_missing_verifier_version");
    if (!clean(verification.verified_at, 80) || Number.isNaN(Date.parse(verification.verified_at))) recordIssues.push("verified_status_missing_valid_timestamp");
    if (!isHttps(verification.verification_evidence_url)) recordIssues.push("verified_status_missing_https_evidence_url");
  }
  const result = {
    id: key, artifact, version, sha256,
    status: recordIssues.length ? "invalid_record" : status,
    checked_at: checkedAt,
    issues: recordIssues,
    note: "Structural metadata validation only. This script does not download artifacts, recompute hashes, verify signatures, or validate provenance attestations."
  };
  output.push(result);
  for (const issue of recordIssues) issues.push({ id: key, issue });
}

const invalid = output.filter(item => item.status === "invalid_record").length;
const summary = {
  total_records: output.length,
  structurally_valid_records: output.length - invalid,
  invalid_records: invalid,
  unverified_records: output.filter(item => item.status === "unverified").length,
  manually_reviewed_records: output.filter(item => item.status === "manual_reviewed").length,
  declared_cryptographically_verified_records: output.filter(item => item.status === "cryptographically_verified").length,
  note: "Declared verification levels are maintainer-supplied claims. Structural validation is not cryptographic verification or a trust guarantee."
};
await writeJsonIfChanged(reportUrl, { schema_version: 1, generated_at: checkedAt, summary, records: output, issues });
console.log(`Provenance evidence validation: ${summary.structurally_valid_records}/${summary.total_records} structurally valid; ${invalid} invalid. No artifact was downloaded or cryptographically verified.`);
