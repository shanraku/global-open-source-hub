import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { readNuGetRepositoryMetadata } from "../scripts/nuget-nuspec.mjs";

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
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(localBytes.length, 16);
  return Buffer.concat([localBytes, centralBytes, end]);
}

const nuspec = (repository = '<repository type="git" url="https://github.com/example/project" />') =>
  Buffer.from(`<?xml version="1.0"?><package><metadata><id>Example</id><${repository.startsWith("<repository") ? "" : ""}></metadata></package>`.replace("<></metadata>", "</metadata>"));

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
