import { discoverNuGetV3Resources, searchNuGetPackages, getNuGetRegistrationLeaf } from "./nuget-registration.mjs";
import { downloadNuGetPackageArchive } from "./nuget-package-download.mjs";
import { readNuGetRepositoryMetadata } from "./nuget-nuspec.mjs";

const MAX_PACKAGES_PER_RUN = 20;

export async function discoverNuGetRepositoryLeads(queries, options = {}) {
  if (!Array.isArray(queries)) throw new TypeError("NuGet queries must be an array");
  const boundedQueries = queries.filter(q => typeof q === "string" && q.trim()).slice(0, 10);
  const maxPackages = options.maxPackages ?? MAX_PACKAGES_PER_RUN;
  if (!Number.isInteger(maxPackages) || maxPackages < 1 || maxPackages > MAX_PACKAGES_PER_RUN) {
    throw new RangeError("NuGet package limit is outside configured bounds");
  }

  const resources = await discoverNuGetV3Resources(options);
  const leads = [];
  const errors = [];
  const seen = new Set();

  for (const query of boundedQueries) {
    if (seen.size >= maxPackages) break;
    let packages;
    try {
      packages = await searchNuGetPackages(resources.searchUrl, query, {
        ...options,
        take: Math.min(10, maxPackages),
        skip: 0
      });
    } catch (error) {
      errors.push({ stage: "search", query, reason: error.message });
      continue;
    }

    for (const pkg of packages) {
      if (seen.size >= maxPackages) break;
      const id = pkg.id;
      const version = pkg.version;
      const packageKey = `${String(id).toLowerCase()}@${String(version).toLowerCase()}`;
      if (seen.has(packageKey)) continue;
      seen.add(packageKey);
      try {
        const versionEntry = Array.isArray(pkg.versions)
          ? pkg.versions.find(item => typeof item?.version === "string" && item.version.toLowerCase() === String(version).toLowerCase() && typeof item["@id"] === "string")
          : null;
        if (!versionEntry) continue;
        const registration = await getNuGetRegistrationLeaf(resources.registrationsUrl, id, version, { ...options, leafUrl: versionEntry["@id"] });
        if (!registration || registration.listed === false || typeof registration.packageContent !== "string") continue;
        const archive = await downloadNuGetPackageArchive(registration.packageContent, id, version, options);
        const metadata = readNuGetRepositoryMetadata(archive);
        if (metadata.repository_type.toLowerCase() !== "git") continue;
        leads.push({
          provider: "NuGet",
          provider_id: packageKey,
          package_id: registration.id,
          package_version: registration.version,
          package_url: `https://www.nuget.org/packages/${encodeURIComponent(registration.id)}/${encodeURIComponent(registration.version)}`,
          package_content_url: registration.packageContent,
          repository_url: metadata.repository_url,
          repository_metadata_path: metadata.metadata_path,
          repository_metadata_type_path: metadata.metadata_type_path,
          repository_type: metadata.repository_type,
          published_at: registration.published,
          project_url: typeof pkg.projectUrl === "string" ? pkg.projectUrl : null,
          description: typeof pkg.description === "string" ? pkg.description.slice(0, 500) : "",
          tags: Array.isArray(pkg.tags) ? pkg.tags.slice(0, 12) : []
        });
      } catch (error) {
        errors.push({ stage: "enrichment", package_id: id, package_version: version, reason: error.message });
      }
    }
  }

  return { leads, errors, packages_examined: seen.size, publication: "manual_review_required" };
}
