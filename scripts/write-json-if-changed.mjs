import { readFile, writeFile } from "node:fs/promises";

const volatileKeys = new Set(["generated_at", "checked_at", "last_successful_check"]);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).filter(key => !volatileKeys.has(key)).sort()
      .map(key => [key, stableValue(value[key])])
  );
}

export async function writeJsonIfChanged(fileUrl, value) {
  const nextStable = JSON.stringify(stableValue(value));
  const previous = await readFile(fileUrl, "utf8").then(JSON.parse).catch(() => null);
  if (previous !== null && JSON.stringify(stableValue(previous)) === nextStable) {
    console.log("No substantive source-data changes; preserving the previous snapshot.");
    return false;
  }
  await writeFile(fileUrl, JSON.stringify(value, null, 2) + "\n");
  return true;
}
