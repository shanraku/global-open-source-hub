import { readFile, writeFile } from "node:fs/promises";

const queueUrl = new URL("../data/review-queue.json", import.meta.url);
const rubricUrl = new URL("../data/review-rubric.json", import.meta.url);
const queue = JSON.parse(await readFile(queueUrl, "utf8"));
const rubric = JSON.parse(await readFile(rubricUrl, "utf8"));
const now = new Date();

function validDate(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

for (const candidate of queue.candidates || []) {
  const signals = {};
  let score = 0;

  signals.has_description = Boolean(candidate.description?.trim());
  signals.has_topics = Array.isArray(candidate.topics) && candidate.topics.length > 0;
  signals.license_identifier_present =
    typeof candidate.license_spdx === "string" &&
    candidate.license_spdx.trim().length > 0 &&
    candidate.license_spdx.toUpperCase() !== "NOASSERTION";

  const activity = validDate(candidate.last_activity_at);
  signals.recent_activity = activity
    ? (now.getTime() - activity.getTime() <= 365 * 24 * 60 * 60 * 1000 &&
       activity.getTime() <= now.getTime())
    : null;

  for (const [key, value] of Object.entries(signals)) {
    if (value === true) score += rubric.signals[key]?.points || 0;
  }

  const known = Object.values(signals).filter(value => value !== null).length;
  candidate.triage = {
    rubric_version: rubric.schema_version,
    assessed_at: now.toISOString(),
    score,
    maximum_score: 4,
    known_signals: known,
    signals,
    label: score <= 1 ? "sparse_metadata" : score <= 3 ? "some_metadata_signals" : "more_metadata_signals",
    disclaimer: "Triage metadata only; not a quality rating, security audit, legal opinion, endorsement or approval."
  };
  // Deliberately preserve review_status; automated triage cannot make human decisions.
}

queue.triage_snapshot = {
  assessed_at: now.toISOString(),
  candidates_assessed: (queue.candidates || []).length,
  decision_policy: "human_review_required"
};
await writeFile(queueUrl, JSON.stringify(queue, null, 2) + "\n");
console.log(`Review triage complete: ${queue.candidates?.length || 0} candidates annotated; no decisions or publications changed.`);
