import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const queueUrl = new URL("data/review-queue.json", root);
const catalogue = JSON.parse(await readFile(new URL("data/projects.json", root), "utf8"));
const queue = JSON.parse(await readFile(queueUrl, "utf8"));
const now = new Date().toISOString();

function canonical(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    url.hostname = url.hostname.toLowerCase().replace(/^www\\./, "");
    url.pathname = url.pathname.replace(/\\.git$/i, "").replace(/\\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch { return null; }
}
function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\\s+/g, " ");
}
const catalogueByUrl = new Map();
const catalogueByName = new Map();
for (const project of catalogue.projects || []) {
  const url = canonical(project.repository);
  if (url) catalogueByUrl.set(url, project);
  const name = normalizeName(project.name);
  if (name) {
    const list = catalogueByName.get(name) || [];
    list.push(project);
    catalogueByName.set(name, list);
  }
}
const queueByUrl = new Map();
const queueByName = new Map();
for (const candidate of queue.candidates || []) {
  const url = canonical(candidate.repository_url || candidate.canonical_url);
  if (url) {
    const list = queueByUrl.get(url) || [];
    list.push(candidate);
    queueByUrl.set(url, list);
  }
  const name = normalizeName(candidate.name);
  if (name) {
    const list = queueByName.get(name) || [];
    list.push(candidate);
    queueByName.set(name, list);
  }
}
let exact = 0, possible = 0;
for (const candidate of queue.candidates || []) {
  const url = canonical(candidate.repository_url || candidate.canonical_url);
  const name = normalizeName(candidate.name);
  const exactMatches = [];
  if (url && catalogueByUrl.has(url)) exactMatches.push({
    type: "same_canonical_repository_url",
    repository: catalogueByUrl.get(url).repository
  });
  const queueSameUrl = (url ? queueByUrl.get(url) : []) || [];
  for (const other of queueSameUrl) {
    if (other !== candidate) exactMatches.push({
      type: "same_canonical_repository_url_in_queue",
      candidate_key: other.candidate_key
    });
  }
  const nameMatches = [];
  for (const project of catalogueByName.get(name) || []) {
    if (project.repository !== candidate.repository_url) nameMatches.push({
      type: "same_normalized_name",
      name: project.name,
      repository: project.repository
    });
  }
  for (const other of queueByName.get(name) || []) {
    if (other !== candidate && other.repository_url !== candidate.repository_url) nameMatches.push({
      type: "same_normalized_name_in_queue",
      name: other.name,
      repository: other.repository_url
    });
  }
  const uniqueExact = [...new Map(exactMatches.map(item => [JSON.stringify(item), item])).values()];
  const uniquePossible = [...new Map(nameMatches.map(item => [JSON.stringify(item), item])).values()];
  candidate.duplicate_review = {
    checked_at: now,
    status: uniqueExact.length ? "exact_duplicate_candidate" : uniquePossible.length ? "possible_name_match" : "no_match_found",
    exact_matches: uniqueExact,
    possible_matches: uniquePossible,
    instruction: uniqueExact.length
      ? "Do not publish until a human confirms the duplicate and chooses the canonical listing."
      : uniquePossible.length
        ? "Name similarity is only a lead. Compare source, ownership, purpose and code manually; do not merge automatically."
        : "No exact URL or normalized-name match was found in the current catalogue and queue. This does not prove uniqueness."
  };
  if (uniqueExact.length) exact++;
  else if (uniquePossible.length) possible++;
}
queue.duplicate_scan = {
  checked_at: now,
  candidates_checked: (queue.candidates || []).length,
  exact_duplicate_candidates: exact,
  possible_name_matches: possible,
  automatic_merge: false,
  automatic_rejection: false
};
await writeFile(queueUrl, JSON.stringify(queue, null, 2) + "\\n");
console.log(`Duplicate review hints generated for ${queue.candidates?.length || 0} candidates; ${exact} exact URL matches and ${possible} possible name matches. No records were merged or removed.`);
