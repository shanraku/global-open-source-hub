import test from "node:test";
import assert from "node:assert/strict";
import { discoverNuGetRepositoryLeads } from "../scripts/nuget-discovery.mjs";

const resources = {
  searchUrl: "https://api-v2v3search-0.nuget.org/query",
  registrationsUrl: "https://api.nuget.org/v3/registration6-gz-semver2/"
};
const packageRecord = (id, version = "1.0.0") => ({
  id,
  version,
  versions: [{
    version,
    "@id": `https://api.nuget.org/v3/registration6-gz-semver2/${id.toLowerCase()}/${version}.json`
  }]
});
const successfulRegistration = (id, version) => ({
  id,
  version,
  listed: true,
  packageContent: "https://api.nuget.org/v3-flatcontainer/example/1.0.0/example.1.0.0.nupkg"
});
const metadata = {
  repository_type: "git",
  repository_url: "https://github.com/example/project",
  metadata_path: "nuspec:repository/@url",
  metadata_type_path: "nuspec:repository/@type"
};

function adapters(packages, overrides = {}) {
  return {
    discoverNuGetV3Resources: async () => resources,
    searchNuGetPackages: async () => packages,
    getNuGetRegistrationLeaf: async (_base, id, version) => successfulRegistration(id, version),
    downloadNuGetPackageArchive: async () => Buffer.from("fixture"),
    readNuGetRepositoryMetadata: () => metadata,
    ...overrides
  };
}

test("isolates a broken package and preserves a later valid repository lead", async () => {
  const result = await discoverNuGetRepositoryLeads(["libraries"], {
    adapters: adapters(
      [packageRecord("Broken.Package"), packageRecord("Good.Package")],
      {
        getNuGetRegistrationLeaf: async (_base, id, version) => {
          if (id === "Broken.Package") throw new Error("registration fixture failure");
          return successfulRegistration(id, version);
        },
        readNuGetRepositoryMetadata: () => ({
          ...metadata,
          repository_url: "https://github.com/good/project"
        })
      }
    )
  });

  assert.equal(result.packages_examined, 2);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].package_id, "Broken.Package");
  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0].package_id, "Good.Package");
  assert.equal(result.publication, "manual_review_required");
});

test("examines a duplicate package ID and version only once", async () => {
  let registrationCalls = 0;
  const result = await discoverNuGetRepositoryLeads(["libraries"], {
    adapters: adapters(
      [packageRecord("Example.Package"), packageRecord("example.package", "1.0.0")],
      {
        getNuGetRegistrationLeaf: async (_base, id, version) => {
          registrationCalls++;
          return successfulRegistration(id, version);
        }
      }
    )
  });

  assert.equal(result.packages_examined, 1);
  assert.equal(registrationCalls, 1);
  assert.equal(result.leads.length, 1);
});

test("rejects ambiguous duplicate version entries without blocking another package", async () => {
  const ambiguous = packageRecord("Ambiguous.Package");
  ambiguous.versions.push({ ...ambiguous.versions[0] });
  const result = await discoverNuGetRepositoryLeads(["libraries"], {
    adapters: adapters([ambiguous, packageRecord("Good.Package")])
  });

  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].reason, /ambiguous duplicate package version/);
  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0].package_id, "Good.Package");
});
