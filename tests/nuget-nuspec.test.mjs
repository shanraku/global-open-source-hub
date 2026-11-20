import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { readNuGetRepositoryMetadata } from "../scripts/nuget-nuspec.mjs";
import { expectedNuGetPackageContentUrl, validateNuGetPackageContentUrl, readBoundedNuGetResponse } from "../scripts/nuget-package-download.mjs";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries, options = {}) {
  const locals = [];
  const centrals = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const raw = Buffer.from(entry.content);
    const method = entry.method ?? 0;
    const compressed = method === 8 ? deflateRawSync(raw) : raw;
    const flags = entry.flags ?? 0;
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centrals.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const localBytes = Buffer.concat(locals);
  const comment = Buffer.from(options.comment ?? "");
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(localBytes.length, 16);
  end.writeUInt16LE(comment.length, 20);
  return Buffer.concat([localBytes, centralBytes, end, comment]);
}

const nuspec = (repository = '<repository type="git" url="https://github.com/example/project" />') =>
  Buffer.from(`<?xml version="1.0"?><package><metadata><id>Example</id><${repository.startsWith("<repository") ? "" : ""}></metadata></package>`.replace("<></metadata>", "</metadata>"));


test("finds the real end record when the ZIP comment contains a fake signature", () => {
  const archive = makeZip([{ name: "Example.nuspec", content: '<package><metadata><repository type="git" url="https://github.com/example/project"/></metadata></package>' }], { comment: "fake PK\x05\x06 signature" });
  assert.equal(readNuGetRepositoryMetadata(archive).repository_url, "https://github.com/example/project");
});

test("rejects mismatched local and central compression methods", () => {
  const archive = makeZip([{ name: "Example.nuspec", content: '<package><metadata><repository type="git" url="https://github.com/example/project"/></metadata></package>' }]);
  archive.writeUInt16LE(8, 8);
  assert.throws(() => readNuGetRepositoryMetadata(archive), /local and central ZIP flags or methods differ/);
});

test("rejects non-matching central directory bounds", () => {
  const archive = makeZip([{ name: "Example.nuspec", content: '<package><metadata><repository type="git" url="https://github.com/example/project"/></metadata></package>' }]);
  const eocd = archive.length - 22;
  archive.writeUInt32LE(archive.readUInt32LE(eocd + 16) + 1, eocd + 16);
  assert.throws(() => readNuGetRepositoryMetadata(archive), /central directory bounds/);
});

test("reads one explicit git repository from a stored nuspec", () => {
  const archive = makeZip([{ name: "Example.nuspec", content: '<package><metadata><repository type="git" url="https://github.com/example/project" /></metadata></package>' }]);
  assert.deepEqual(readNuGetRepositoryMetadata(archive), {
    repository_type: "git",
    repository_url: "https://github.com/example/project",
    metadata_path: "nuspec:repository/@url",
    metadata_type_path: "nuspec:repository/@type"
  });
});

test("reads a deflated nuspec", () => {
  const archive = makeZip([{ name: "Example.nuspec", method: 8, content: '<package><metadata><repository type="git" url="https://gitlab.com/example/project" /></metadata></package>' }]);
  assert.equal(readNuGetRepositoryMetadata(archive).repository_url, "https://gitlab.com/example/project");
});

test("rejects a nuspec without repository metadata", () => {
  const archive = makeZip([{ name: "Example.nuspec", content: "<package><metadata><id>Example</id></metadata></package>" }]);
  assert.throws(() => readNuGetRepositoryMetadata(archive), /repository element/);
});

test("rejects non-git repository metadata", () => {
  const archive = makeZip([{ name: "Example.nuspec", content: '<package><metadata><repository type="svn" url="https://github.com/example/project" /></metadata></package>' }]);
  assert.throws(() => readNuGetRepositoryMetadata(archive), /type=git/);
});

test("rejects duplicate repository elements", () => {
  const archive = makeZip([{ name: "Example.nuspec", content: '<package><repository type="git" url="https://github.com/a/b"/><repository type="git" url="https://github.com/c/d"/></package>' }]);
  assert.throws(() => readNuGetRepositoryMetadata(archive), /exactly one repository/);
});


test("ignores repository-like markup inside XML comments", () => {
  const xml = '<package><!-- <repository type="svn" url="https://evil.example/repo"/> --><metadata><repository type="git" url="https://github.com/example/project"/></metadata></package>';
  const archive = makeZip([{ name: "Example.nuspec", content: xml }]);
  assert.equal(readNuGetRepositoryMetadata(archive).repository_url, "https://github.com/example/project");
});

test("ignores repository-like markup inside CDATA", () => {
  const xml = '<package><metadata><description><![CDATA[<repository type="svn" url="https://evil.example/repo"/>]]></description><repository type="git" url="https://github.com/example/project"/></metadata></package>';
  const archive = makeZip([{ name: "Example.nuspec", content: xml }]);
  assert.equal(readNuGetRepositoryMetadata(archive).repository_url, "https://github.com/example/project");
});

test("rejects repository elements outside package metadata", () => {
  const xml = '<package><repository type="git" url="https://github.com/example/project"/><metadata/></package>';
  const archive = makeZip([{ name: "Example.nuspec", content: xml }]);
  assert.throws(() => readNuGetRepositoryMetadata(archive), /exactly one repository element under package metadata/);
});

test("rejects mismatched XML nesting", () => {
  const xml = '<package><metadata><repository type="git" url="https://github.com/example/project"></metadata></package>';
  const archive = makeZip([{ name: "Example.nuspec", content: xml }]);
  assert.throws(() => readNuGetRepositoryMetadata(archive), /mismatched XML closing tag/);
});

test("rejects malformed XML comments", () => {
  const xml = '<package><!-- broken -- comment --><metadata><repository type="git" url="https://github.com/example/project"/></metadata></package>';
  const archive = makeZip([{ name: "Example.nuspec", content: xml }]);
  assert.throws(() => readNuGetRepositoryMetadata(archive), /malformed XML comment/);
});

test("rejects DTD and entity expansion payloads", () => {
  const xml = '<!DOCTYPE package [<!ENTITY x "boom">]><package><metadata><repository type="git" url="https://github.com/a/b"/></metadata></package>';
  const archive = makeZip([{ name: "Example.nuspec", content: xml }]);
  assert.throws(() => readNuGetRepositoryMetadata(archive), /DTD, entities/);
});

test("rejects multiple nuspec entries", () => {
  const archive = makeZip([
    { name: "one.nuspec", content: "<package/>" },
    { name: "two.nuspec", content: "<package/>" }
  ]);
  assert.throws(() => readNuGetRepositoryMetadata(archive), /exactly one .nuspec/);
});

test("rejects path traversal entries", () => {
  const archive = makeZip([{ name: "../Example.nuspec", content: '<package><repository type="git" url="https://github.com/a/b"/></package>' }]);
  assert.throws(() => readNuGetRepositoryMetadata(archive), /unsafe ZIP entry path/);
});

test("rejects encrypted entries", () => {
  const archive = makeZip([{ name: "Example.nuspec", flags: 1, content: "<package/>" }]);
  assert.throws(() => readNuGetRepositoryMetadata(archive), /encrypted or unsupported/);
});

test("rejects malformed ZIP input", () => {
  assert.throws(() => readNuGetRepositoryMetadata(Buffer.from("not a zip")), /ZIP end record/);
});

test("rejects archives larger than the configured hard cap", () => {
  assert.throws(() => readNuGetRepositoryMetadata(Buffer.alloc(8 * 1024 * 1024 + 1)), /size is outside/);
});

test("rejects a nuspec whose ZIP CRC does not match its contents", () => {
  const archive = makeZip([{ name: "Example.nuspec", content: '<package><repository type="git" url="https://github.com/a/b"/></package>' }]);
  const central = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  archive.writeUInt32LE(0x12345678, central + 16);
  assert.throws(() => readNuGetRepositoryMetadata(archive), /CRC/);
});

test("rejects mismatched local and central ZIP flags", () => {
  const archive = makeZip([{ name: "Example.nuspec", content: '<package><repository type="git" url="https://github.com/a/b"/></package>' }]);
  archive.writeUInt16LE(1, 6);
  assert.throws(() => readNuGetRepositoryMetadata(archive), /local and central ZIP metadata differ/);
});


test("builds the canonical NuGet flat-container package URL", () => {
  assert.equal(
    expectedNuGetPackageContentUrl("Example.Package", "1.2.3"),
    "https://api.nuget.org/v3-flatcontainer/example.package/1.2.3/example.package.1.2.3.nupkg"
  );
});

test("accepts only the exact NuGet packageContent URL for the package ID and version", () => {
  const expected = expectedNuGetPackageContentUrl("Example.Package", "1.2.3");
  assert.equal(validateNuGetPackageContentUrl(expected, "Example.Package", "1.2.3"), expected);
});

test("rejects lookalike hosts, alternate origins and unexpected paths", () => {
  const valid = expectedNuGetPackageContentUrl("Example.Package", "1.2.3");
  for (const url of [
    valid.replace("api.nuget.org", "api.nuget.org.evil.example"),
    valid.replace("https://", "http://"),
    valid.replace("/v3-flatcontainer/", "/other/"),
    valid + "?redirect=https://github.com/",
    valid.replace("api.nuget.org", "evil.example")
  ]) assert.throws(() => validateNuGetPackageContentUrl(url, "Example.Package", "1.2.3"));
});

test("rejects URL credentials and non-standard ports", () => {
  const valid = expectedNuGetPackageContentUrl("Example.Package", "1.2.3");
  assert.throws(() => validateNuGetPackageContentUrl(valid.replace("https://", "https://user@"), "Example.Package", "1.2.3"));
  assert.throws(() => validateNuGetPackageContentUrl(valid.replace("api.nuget.org", "api.nuget.org:8443"), "Example.Package", "1.2.3"));
});

test("rejects a packageContent URL for a different package version", () => {
  const url = expectedNuGetPackageContentUrl("Example.Package", "1.2.3");
  assert.throws(() => validateNuGetPackageContentUrl(url, "Example.Package", "9.9.9"));
});

test("rejects oversized declared download length before reading", async () => {
  const response = {
    status: 200,
    redirected: false,
    headers: { get: () => String(1024) },
    body: { getReader: () => ({ read: async () => ({ done: true }), releaseLock() {} }) }
  };
  await assert.rejects(readBoundedNuGetResponse(response, 128), /Content-Length/);
});

test("rejects streamed package bytes that exceed the hard limit", async () => {
  let cancelled = false;
  const response = {
    status: 200,
    redirected: false,
    headers: { get: () => null },
    body: { getReader: () => ({
      read: async () => ({ done: false, value: new Uint8Array(129) }),
      cancel: async () => { cancelled = true; },
      releaseLock() {}
    }) }
  };
  await assert.rejects(readBoundedNuGetResponse(response, 128), /exceeded the package size limit/);
  assert.equal(cancelled, true);
});


test("rejects malformed Content-Length values", async () => {
  for (const value of ["-1", "1.5", "12bytes", ""]) {
    const response = {
      status: 200,
      redirected: false,
      headers: { get: () => value },
      body: { getReader: () => ({ read: async () => ({ done: true }), releaseLock() {} }) }
    };
    await assert.rejects(readBoundedNuGetResponse(response, 128), /Content-Length/);
  }
});

test("rejects empty and non-streaming package responses", async () => {
  await assert.rejects(readBoundedNuGetResponse({
    status: 200, redirected: false, headers: { get: () => null }, body: null
  }), /streaming response body/);
  await assert.rejects(readBoundedNuGetResponse({
    status: 200, redirected: false, headers: { get: () => null },
    body: { getReader: () => ({ read: async () => ({ done: true }), releaseLock() {} }) }
  }), /empty package response/);
});

test("rejects invalid stream chunks and unsafe configured byte limits", async () => {
  const response = {
    status: 200, redirected: false, headers: { get: () => null },
    body: { getReader: () => ({ read: async () => ({ done: false, value: "not bytes" }), releaseLock() {} }) }
  };
  await assert.rejects(readBoundedNuGetResponse(response, 128), /invalid response chunk/);
  await assert.rejects(readBoundedNuGetResponse(response, 8 * 1024 * 1024 + 1), /invalid byte limit/);
});

test("rejects non-200 or redirected responses", async () => {
  await assert.rejects(readBoundedNuGetResponse({ status: 302, redirected: true }), /unexpected HTTP response/);
});
