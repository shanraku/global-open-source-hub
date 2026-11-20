import test from "node:test";
import assert from "node:assert/strict";
import { discoverNuGetV3Resources, searchNuGetPackages, getNuGetRegistrationLeaf } from "../scripts/nuget-registration.mjs";

const originalFetch = globalThis.fetch;
const serviceIndex = {
  version: "3.0.0",
  resources: [
    { "@id": "https://api-v2v3search-0.nuget.org/query", "@type": "SearchQueryService/3.5.0" },
    { "@id": "https://api.nuget.org/v3/registration6-gz-semver2/", "@type": "RegistrationsBaseUrl/3.6.0" }
  ]
};

function jsonResponse(value) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

test("discovers only official NuGet search and registration resources", async t => {
  globalThis.fetch = async url => {
    assert.equal(String(url), "https://api.nuget.org/v3/index.json");
    return jsonResponse(serviceIndex);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  assert.deepEqual(await discoverNuGetV3Resources(), {
    searchUrl: "https://api-v2v3search-0.nuget.org/query",
    registrationsUrl: "https://api.nuget.org/v3/registration6-gz-semver2/"
  });
});

test("rejects a service index that advertises an unapproved search host", async t => {
  globalThis.fetch = async () => jsonResponse({
    version: "3.0.0",
    resources: [
      { "@id": "https://evil.example/query", "@type": "SearchQueryService/3.5.0" },
      serviceIndex.resources[1]
    ]
  });
  t.after(() => { globalThis.fetch = originalFetch; });
  await assert.rejects(discoverNuGetV3Resources(), /official NuGet resource allowlist/);
});

test("searches with bounded pagination and excludes prereleases", async t => {
  let requested;
  globalThis.fetch = async url => {
    requested = new URL(String(url));
    return jsonResponse({ data: [{ id: "Example.Package", version: "1.2.3" }] });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const result = await searchNuGetPackages("https://api-v2v3search-0.nuget.org/query", "json parser", { take: 10, skip: 20 });
  assert.equal(requested.searchParams.get("q"), "json parser");
  assert.equal(requested.searchParams.get("take"), "10");
  assert.equal(requested.searchParams.get("skip"), "20");
  assert.equal(requested.searchParams.get("prerelease"), "false");
  assert.equal(requested.searchParams.get("semVerLevel"), "2.0.0");
  assert.equal(result[0].id, "Example.Package");
});

test("rejects search pagination outside configured limits", async () => {
  await assert.rejects(searchNuGetPackages("https://api-v2v3search-0.nuget.org/query", "x", { take: 100 }), /pagination/);
});

test("fetches only the exact registration leaf URL supplied for the package version", async t => {
  const leafUrl = "https://api.nuget.org/v3/registration6-gz-semver2/example.package/1.2.3.json";
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    return jsonResponse({
      "@id": leafUrl,
      packageContent: "https://api.nuget.org/v3-flatcontainer/example.package/1.2.3/example.package.1.2.3.nupkg",
      published: "2025-01-01T00:00:00Z",
      listed: true
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const leaf = await getNuGetRegistrationLeaf(
    "https://api.nuget.org/v3/registration6-gz-semver2/",
    "Example.Package",
    "1.2.3",
    { leafUrl }
  );
  assert.equal(leaf.id, "Example.Package");
  assert.equal(leaf.version, "1.2.3");
  assert.equal(leaf.packageContent.includes("example.package"), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0], leafUrl);
});

test("rejects registration leaf URLs outside the official registration path", async () => {
  await assert.rejects(
    getNuGetRegistrationLeaf(
      "https://api.nuget.org/v3/registration6-gz-semver2/",
      "Example.Package",
      "1.2.3",
      { leafUrl: "https://api.nuget.org/v3/catalog0/payload.json" }
    ),
    /outside the discovered package registration path/
  );
});

test("requires an exact registration leaf URL", async () => {
  await assert.rejects(
    getNuGetRegistrationLeaf(
      "https://api.nuget.org/v3/registration6-gz-semver2/",
      "Example.Package",
      "1.2.3"
    ),
    /exact registration leaf URL/
  );
});
