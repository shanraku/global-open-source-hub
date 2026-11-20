const SERVICE_INDEX_URL = "https://api.nuget.org/v3/index.json";
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const ALLOWED_RESOURCE_HOSTS = new Set(["api.nuget.org", "api-v2v3search-0.nuget.org"]);

function fail(message) {
  throw new Error(`NuGet registration lookup rejected: ${message}`);
}

function safeNuGetResourceUrl(raw, allowedHosts = ALLOWED_RESOURCE_HOSTS) {
  if (typeof raw !== "string" || raw.length > 2048) fail("invalid resource URL");
  let url;
  try { url = new URL(raw); } catch { fail("malformed resource URL"); }
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname.toLowerCase()) ||
      url.username || url.password || url.port || url.search || url.hash) {
    fail("resource URL is outside the official NuGet resource allowlist");
  }
  return url;
}

async function fetchJsonBounded(url, options = {}) {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", "User-Agent": "global-open-source-hub-discovery/1.0" },
    redirect: "error",
    signal: AbortSignal.timeout(options.timeoutMs ?? 15000)
  });
  if (response.status !== 200 || response.redirected || !response.body?.getReader) fail("unexpected JSON HTTP response");
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_JSON_BYTES)) fail("JSON response exceeds size limit");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) fail("invalid JSON response chunk");
      total += value.byteLength;
      if (total > MAX_JSON_BYTES) {
        await reader.cancel().catch(() => {});
        fail("JSON response exceeded size limit");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock?.();
  }
  try { return JSON.parse(Buffer.concat(chunks, total).toString("utf8")); }
  catch { fail("invalid JSON document"); }
}

export async function discoverNuGetV3Resources(options = {}) {
  const indexUrl = options.serviceIndexUrl ?? SERVICE_INDEX_URL;
  if (indexUrl !== SERVICE_INDEX_URL) fail("only the official nuget.org service index is supported");
  const index = await fetchJsonBounded(indexUrl, options);
  if (!index || typeof index.version !== "string" || !index.version.startsWith("3.") || !Array.isArray(index.resources)) {
    fail("invalid NuGet service index schema");
  }
  const findResource = predicate => {
    const matches = index.resources.filter(resource => typeof resource?.["@type"] === "string" && predicate(resource["@type"]));
    for (const resource of matches) {
      const url = safeNuGetResourceUrl(resource["@id"]);
      if (url.hostname === "api.nuget.org" || url.hostname === "api-v2v3search-0.nuget.org") return url.href;
    }
    return null;
  };
  const searchUrl = findResource(type => type === "SearchQueryService/3.5.0" || type === "SearchQueryService/3.0.0" || type === "SearchQueryService/3.0.0-rc" || type === "SearchQueryService");
  const registrationsUrl = findResource(type => type === "RegistrationsBaseUrl/3.6.0" || type === "RegistrationsBaseUrl/3.4.0" || type === "RegistrationsBaseUrl/3.0.0-rc" || type === "RegistrationsBaseUrl");
  if (!searchUrl || !registrationsUrl) fail("required SearchQueryService or RegistrationsBaseUrl resource is missing");
  return { searchUrl, registrationsUrl };
}

export async function searchNuGetPackages(searchUrl, query, options = {}) {
  const base = safeNuGetResourceUrl(searchUrl);
  if (base.hostname !== "api-v2v3search-0.nuget.org" && base.hostname !== "api.nuget.org") fail("unapproved search service host");
  if (typeof query !== "string" || !query.trim() || query.length > 200) fail("invalid search query");
  const take = options.take ?? 20;
  const skip = options.skip ?? 0;
  if (!Number.isInteger(take) || take < 1 || take > 30 || !Number.isInteger(skip) || skip < 0 || skip > 300) fail("search pagination is outside configured bounds");
  const url = new URL(base.href);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("take", String(take));
  url.searchParams.set("skip", String(skip));
  url.searchParams.set("prerelease", "false");
  url.searchParams.set("semVerLevel", "2.0.0");
  const data = await fetchJsonBounded(url.href, options);
  if (!data || !Array.isArray(data.data)) fail("invalid search response schema");
  return data.data.slice(0, take).filter(item => typeof item?.id === "string" && typeof item?.version === "string");
}

export async function getNuGetRegistrationLeaf(registrationsUrl, packageId, version, options = {}) {
  const base = safeNuGetResourceUrl(registrationsUrl);
  if (base.hostname !== "api.nuget.org") fail("unapproved registration service host");
  const id = typeof packageId === "string" ? packageId.toLowerCase() : "";
  if (!/^[a-z0-9][a-z0-9_.+-]{0,127}$/.test(id) || typeof version !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.+-]{0,127}$/.test(version)) fail("invalid package ID or version");
  if (!base.pathname.endsWith("/") || typeof options.leafUrl !== "string") fail("an exact registration leaf URL from search metadata is required");

  const leafUrl = safeNuGetResourceUrl(options.leafUrl);
  const expectedPath = base.pathname + encodeURIComponent(id) + "/" + encodeURIComponent(version.toLowerCase()) + ".json";
  if (leafUrl.origin !== base.origin || leafUrl.pathname !== expectedPath) {
    fail("registration leaf URL does not match the exact package version path");
  }
  const leaf = await fetchJsonBounded(leafUrl.href, options);
  if (!leaf || typeof leaf !== "object" || Array.isArray(leaf) ||
      leaf["@id"] !== leafUrl.href ||
      typeof leaf.packageContent !== "string" ||
      (leaf.published !== undefined && leaf.published !== null && typeof leaf.published !== "string") ||
      (leaf.listed !== undefined && typeof leaf.listed !== "boolean")) {
    fail("registration leaf identity or metadata schema is invalid");
  }
  return {
    id: packageId,
    version,
    packageContent: leaf.packageContent,
    published: leaf.published ?? null,
    listed: leaf.listed ?? true,
    projectUrl: null
  };
}
