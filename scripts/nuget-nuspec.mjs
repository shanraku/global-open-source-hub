import { inflateRawSync } from "node:zlib";

const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;
const MAX_NUSPEC_BYTES = 256 * 1024;
const MAX_COMPRESSION_RATIO = 100;
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function fail(message) {
  throw new Error(`NuGet package rejected: ${message}`);
}

function decodeXmlAttribute(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, token) => {
    const key = token.toLowerCase();
    if (key === "amp") return "&";
    if (key === "lt") return "<";
    if (key === "gt") return ">";
    if (key === "quot") return '"';
    if (key === "apos") return "'";
    const codePoint = key.startsWith("#x") ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
    if (!Number.isInteger(codePoint) || codePoint < 1 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) fail("invalid XML character reference");
    return String.fromCodePoint(codePoint);
  }).replace(/&[^;\s]+;/g, () => fail("unsupported XML entity"));
}

function parseRepositoryElement(xml) {
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(xml)) fail("DTD, entities and stylesheets are not allowed");
  const matches = [...xml.matchAll(/<repository\b([^>]*)\/?\s*>/gi)];
  if (matches.length !== 1) fail("expected exactly one repository element");

  const attributes = Object.create(null);
  const source = matches[0][1];
  const attributePattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gy;
  let offset = 0;
  while (offset < source.length) {
    while (/\s/.test(source[offset] || "")) offset++;
    if (offset >= source.length) break;
    attributePattern.lastIndex = offset;
    const match = attributePattern.exec(source);
    if (!match) fail("malformed repository attributes");
    const name = match[1].toLowerCase();
    if (Object.hasOwn(attributes, name)) fail("duplicate repository attribute");
    attributes[name] = decodeXmlAttribute(match[2] ?? match[3] ?? "");
    offset = attributePattern.lastIndex;
  }
  if (attributes.type?.toLowerCase() !== "git" || !attributes.url) fail("repository must declare type=git and a URL");
  return { type: attributes.type, url: attributes.url };
}

function findEndOfCentralDirectory(buffer) {
  const min = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= min; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  fail("ZIP end record not found");
}

function extractNuspec(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer.length > MAX_ARCHIVE_BYTES) fail("archive size is outside the allowed limit");
  const eocd = findEndOfCentralDirectory(buffer);
  const disk = buffer.readUInt16LE(eocd + 4);
  const centralDisk = buffer.readUInt16LE(eocd + 6);
  const diskEntries = buffer.readUInt16LE(eocd + 8);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const commentLength = buffer.readUInt16LE(eocd + 20);
  if (disk || centralDisk || diskEntries !== totalEntries || totalEntries > 2048 || eocd + 22 + commentLength !== buffer.length) fail("multi-disk, ZIP64 or malformed ZIP archives are not supported");
  if (centralOffset + centralSize > eocd || centralOffset < 0) fail("invalid central directory bounds");

  let offset = centralOffset;
  const entries = [];
  for (let i = 0; i < totalEntries; i++) {
    if (offset + 46 > centralOffset + centralSize || buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) fail("invalid ZIP central directory");
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const entryCommentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const end = offset + 46 + nameLength + extraLength + entryCommentLength;
    if (end > centralOffset + centralSize) fail("central directory entry exceeds bounds");
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (name.includes("\\") || name.startsWith("/") || name.split("/").includes("..")) fail("unsafe ZIP entry path");
    if (name.toLowerCase().endsWith(".nuspec")) entries.push({ name, flags, method, compressedSize, uncompressedSize, localOffset });
    offset = end;
  }
  if (offset !== centralOffset + centralSize || entries.length !== 1) fail("expected exactly one .nuspec entry");
  const entry = entries[0];
  if ((entry.flags & 1) || (entry.flags & 0x40) || ![0, 8].includes(entry.method)) fail("encrypted or unsupported ZIP entry");
  if (entry.uncompressedSize > MAX_NUSPEC_BYTES || entry.compressedSize > MAX_NUSPEC_BYTES || entry.uncompressedSize > entry.compressedSize * MAX_COMPRESSION_RATIO) fail("nuspec size or compression ratio exceeds limit");
  const local = entry.localOffset;
  if (local + 30 > centralOffset || buffer.readUInt32LE(local) !== LOCAL_SIGNATURE) fail("invalid local ZIP header");
  const localNameLength = buffer.readUInt16LE(local + 26);
  const localExtraLength = buffer.readUInt16LE(local + 28);
  const dataStart = local + 30 + localNameLength + localExtraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > centralOffset) fail("compressed nuspec exceeds archive bounds");
  const localName = buffer.subarray(local + 30, local + 30 + localNameLength).toString("utf8");
  if (localName !== entry.name) fail("local and central entry names differ");
  const compressed = buffer.subarray(dataStart, dataEnd);
  let result;
  try {
    result = entry.method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: MAX_NUSPEC_BYTES });
  } catch {
    fail("nuspec decompression failed");
  }
  if (result.length !== entry.uncompressedSize || result.length > MAX_NUSPEC_BYTES) fail("nuspec length mismatch");
  return result;
}

export function readNuGetRepositoryMetadata(archive) {
  const nuspec = extractNuspec(archive);
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(nuspec);
  const repository = parseRepositoryElement(xml);
  return Object.freeze({
    repository_type: repository.type,
    repository_url: repository.url,
    metadata_path: "nuspec:repository/@url",
    metadata_type_path: "nuspec:repository/@type"
  });
}
