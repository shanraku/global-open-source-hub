const MAX_PACKAGE_BYTES = 8 * 1024 * 1024;
const NUGET_ORIGIN = "https://api.nuget.org";

function reject(message) {
  throw new Error(`NuGet package download rejected: ${message}`);
}

function packageSegment(value, label) {
  if (typeof value !== "string" || !value || value.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9_.+-]*$/.test(value)) {
    reject(`invalid package ${label}`);
  }
  return value.toLowerCase();
}

export function expectedNuGetPackageContentUrl(packageId, version) {
  const id = packageSegment(packageId, "ID");
  const normalizedVersion = packageSegment(version, "version");
  return `${NUGET_ORIGIN}/v3-flatcontainer/${encodeURIComponent(id)}/${encodeURIComponent(normalizedVersion)}/${encodeURIComponent(id)}.${encodeURIComponent(normalizedVersion)}.nupkg`;
}

export function validateNuGetPackageContentUrl(rawUrl, packageId, version) {
  if (typeof rawUrl !== "string" || rawUrl.length > 2048) reject("invalid packageContent URL");
  let supplied;
  try {
    supplied = new URL(rawUrl);
  } catch {
    reject("malformed packageContent URL");
  }
  const expected = new URL(expectedNuGetPackageContentUrl(packageId, version));
  if (
    supplied.protocol !== "https:" ||
    supplied.origin !== NUGET_ORIGIN ||
    supplied.username ||
    supplied.password ||
    supplied.port ||
    supplied.search ||
    supplied.hash ||
    supplied.href !== expected.href
  ) {
    reject("packageContent URL does not match the exact NuGet flat-container resource");
  }
  return expected.href;
}

export async function readBoundedNuGetResponse(response, maxBytes = MAX_PACKAGE_BYTES) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_PACKAGE_BYTES) reject("invalid byte limit");
  if (!response || response.status !== 200 || response.redirected) reject("unexpected HTTP response");
  const contentLength = response.headers?.get?.("content-length");
  if (contentLength !== null && contentLength !== undefined) {
    if (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes) reject("Content-Length exceeds the package size limit");
  }
  if (!response.body || typeof response.body.getReader !== "function") reject("streaming response body is required");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) reject("invalid response chunk");
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        reject("download exceeded the package size limit");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock?.();
  }
  if (total === 0) reject("empty package response");
  return Buffer.concat(chunks, total);
}

export async function downloadNuGetPackageArchive(packageContentUrl, packageId, version, options = {}) {
  const url = validateNuGetPackageContentUrl(packageContentUrl, packageId, version);
  const timeoutMs = options.timeoutMs ?? 15000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) reject("invalid timeout");
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/octet-stream", "User-Agent": "global-open-source-hub-discovery/1.0" },
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs)
  });
  return readBoundedNuGetResponse(response);
}
