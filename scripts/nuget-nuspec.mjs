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
  let output = "";
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== "&") {
      const code = value.charCodeAt(i);
      if (code < 0x20 && ![0x09, 0x0a, 0x0d].includes(code)) fail("invalid XML control character");
      output += value[i];
      continue;
    }
    const end = value.indexOf(";", i + 1);
    if (end < 0) fail("unterminated XML entity reference");
    const token = value.slice(i + 1, end);
    const key = token.toLowerCase();
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (Object.hasOwn(named, key)) output += named[key];
    else if (/^#x[0-9a-f]+$/i.test(token) || /^#\d+$/.test(token)) {
      const point = key.startsWith("#x") ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
      const valid = point === 0x9 || point === 0xa || point === 0xd ||
        (point >= 0x20 && point <= 0xd7ff) || (point >= 0xe000 && point <= 0xfffd) ||
        (point >= 0x10000 && point <= 0x10ffff);
      if (!valid) fail("invalid XML character reference");
      output += String.fromCodePoint(point);
    } else fail("unsupported XML entity");
    i = end;
  }
  return output;
}

function validateXmlAttributes(source) {
  const attributes = Object.create(null);
  const pattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*("[^"]*"|'[^']*')/gy;
  let offset = 0;
  while (offset < source.length) {
    const beforeWhitespace = offset;
    while (/\s/.test(source[offset] || "")) offset++;
    if (offset >= source.length) break;
    if (offset === beforeWhitespace && beforeWhitespace !== 0) fail("XML attributes must be separated by whitespace");
    pattern.lastIndex = offset;
    const match = pattern.exec(source);
    if (!match) fail("malformed XML attributes");
    const name = match[1];
    if (Object.hasOwn(attributes, name)) fail("duplicate XML attribute");
    attributes[name] = decodeXmlAttribute(match[2].slice(1, -1));
    offset = pattern.lastIndex;
  }
  return attributes;
}

function parseRepositoryElement(xml) {
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(xml)) fail("DTD, entities and stylesheets are not allowed");

  const stack = [];
  const repositories = [];
  let offset = 0;
  let rootSeen = false;
  let rootClosed = false;
  let metadataCount = 0;

  while (offset < xml.length) {
    const open = xml.indexOf("<", offset);
    if (open < 0) {
      if (xml.slice(offset).trim() && (!rootSeen || rootClosed)) fail("text outside XML root");
      break;
    }
    const textNode = xml.slice(offset, open);
    if ((!rootSeen || rootClosed) && textNode.trim()) fail("text outside XML root");
    if (rootSeen && !rootClosed) decodeXmlAttribute(textNode);
    offset = open;

    if (xml.startsWith("<!--", offset)) {
      const close = xml.indexOf("-->", offset + 4);
      if (close < 0 || xml.slice(offset + 4, close).includes("--")) fail("malformed XML comment");
      offset = close + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", offset)) {
      const close = xml.indexOf("]]>", offset + 9);
      if (close < 0 || !stack.length) fail("malformed CDATA section");
      offset = close + 3;
      continue;
    }
    if (xml.startsWith("<?", offset)) {
      const close = xml.indexOf("?>", offset + 2);
      if (close < 0) fail("malformed XML processing instruction");
      offset = close + 2;
      continue;
    }
    if (xml.startsWith("<!", offset)) fail("unsupported XML declaration");

    let close = offset + 1;
    let quote = null;
    for (; close < xml.length; close++) {
      const ch = xml[close];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        break;
      }
    }
    if (close >= xml.length || quote) fail("unterminated XML tag");

    const token = xml.slice(offset + 1, close);
    const closing = token.startsWith("/");
    const selfClosing = !closing && /\/\s*$/.test(token);
    const body = closing ? token.slice(1).trim() : selfClosing ? token.replace(/\/\s*$/, "").trim() : token.trim();
    const nameMatch = /^([A-Za-z_][A-Za-z0-9_.:-]*)([\s\S]*)$/.exec(body);
    if (!nameMatch) fail("malformed XML tag");
    const name = nameMatch[1];

    if (closing) {
      if (nameMatch[2].trim() || stack.pop() !== name) fail("mismatched XML closing tag");
      if (!stack.length) rootClosed = true;
    } else {
      if (rootClosed) fail("multiple XML root elements");
      if (!rootSeen) {
        if (name !== "package") fail("nuspec root element must be package");
        rootSeen = true;
      }
      if (name === "metadata" && stack.length === 1 && stack[0] === "package") metadataCount++;
      const parsedAttributes = validateXmlAttributes(nameMatch[2]);
      if (name === "repository" && stack.length === 2 && stack[0] === "package" && stack[1] === "metadata") {
        repositories.push({ type: parsedAttributes.type, url: parsedAttributes.url });
      }
      if (!selfClosing) stack.push(name);
      else if (!stack.length) rootClosed = true;
    }
    offset = close + 1;
  }

  if (!rootSeen || !rootClosed || stack.length) fail("incomplete or malformed nuspec XML");
  if (metadataCount !== 1) fail("expected exactly one metadata element under package");
  if (repositories.length !== 1) fail("expected exactly one repository element under package metadata");
  const repository = repositories[0];
  if (repository.type?.toLowerCase() !== "git") fail("repository must declare type=git");
  if (!repository.url) fail("repository URL is missing");
  return repository;
}

function parseRepositoryAttributes(source) {
  const attributes = Object.create(null);
  const attributePattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gy;
  let offset = 0;
  let previousEnd = 0;
  while (offset < source.length) {
    while (/\s/.test(source[offset] || "")) offset++;
    if (offset >= source.length) break;
    if (previousEnd > 0 && offset === previousEnd) fail("repository attributes must be separated by whitespace");
    attributePattern.lastIndex = offset;
    const match = attributePattern.exec(source);
    if (!match) fail("malformed repository attributes");
    const name = match[1].toLowerCase();
    if (Object.hasOwn(attributes, name)) fail("duplicate repository attribute");
    attributes[name] = decodeXmlAttribute(match[2] ?? match[3] ?? "");
    previousEnd = attributePattern.lastIndex;
    offset = previousEnd;
  }
  return { type: attributes.type, url: attributes.url };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let k = 0; k < 8; k++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();
function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function validateExtraFields(buffer, start, length) {
  const end = start + length;
  if (end > buffer.length) fail("ZIP extra fields exceed archive bounds");
  let offset = start;
  while (offset < end) {
    if (offset + 4 > end) fail("truncated ZIP extra field");
    const id = buffer.readUInt16LE(offset);
    const size = buffer.readUInt16LE(offset + 2);
    offset += 4;
    if (offset + size > end) fail("ZIP extra field exceeds declared bounds");
    if (id === 0x0001) fail("ZIP64 extra fields are not supported");
    offset += size;
  }
}

function findEndOfCentralDirectory(buffer) {
  const min = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= min; i--) {
    if (buffer.readUInt32LE(i) !== EOCD_SIGNATURE) continue;
    const commentLength = buffer.readUInt16LE(i + 20);
    if (i + 22 + commentLength === buffer.length) return i;
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
  if (centralOffset + centralSize !== eocd || centralOffset < 0 || centralSize === 0xffffffff || centralOffset === 0xffffffff) fail("invalid central directory bounds or ZIP64 marker");

  let offset = centralOffset;
  const entries = [];
  for (let i = 0; i < totalEntries; i++) {
    if (offset + 46 > centralOffset + centralSize || buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) fail("invalid ZIP central directory");
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const expectedCrc = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const entryCommentLength = buffer.readUInt16LE(offset + 32);
    const diskStart = buffer.readUInt16LE(offset + 34);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const extraStart = nameStart + nameLength;
    const end = extraStart + extraLength + entryCommentLength;
    if (end > centralOffset + centralSize) fail("central directory entry exceeds bounds");
    if (diskStart !== 0) fail("multi-disk ZIP entries are not supported");
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) fail("ZIP64 entries are not supported");
    validateExtraFields(buffer, extraStart, extraLength);
    let name;
    try { name = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(nameStart, extraStart)); }
    catch { fail("invalid ZIP entry name encoding"); }
    if (name.includes("\\") || name.includes("\0") || name.startsWith("/") || name.split("/").includes("..")) fail("unsafe ZIP entry path");
    const allowedFlags = 0x0808 | (method === 8 ? 0x0006 : 0);
    if ((flags & ~allowedFlags) !== 0 || ![0, 8].includes(method)) fail("encrypted or unsupported ZIP entry flags");
    if (localOffset + 30 > centralOffset || buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) fail("invalid local ZIP header");
    const localFlags = buffer.readUInt16LE(localOffset + 6);
    const localMethod = buffer.readUInt16LE(localOffset + 8);
    const localCrc = buffer.readUInt32LE(localOffset + 14);
    const localCompressedSize = buffer.readUInt32LE(localOffset + 18);
    const localUncompressedSize = buffer.readUInt32LE(localOffset + 22);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const localNameStart = localOffset + 30;
    const localExtraStart = localNameStart + localNameLength;
    const dataStart = localExtraStart + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataStart > centralOffset || dataEnd > centralOffset) fail("ZIP entry data exceeds archive bounds");
    validateExtraFields(buffer, localExtraStart, localExtraLength);
    let localName;
    try { localName = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(localNameStart, localExtraStart)); }
    catch { fail("invalid local ZIP entry name encoding"); }
    if (localName !== name || localFlags !== flags || localMethod !== method) fail("local and central ZIP metadata differ");
    const hasDataDescriptor = Boolean(flags & 0x0008);
    if (!hasDataDescriptor && (localCrc !== expectedCrc || localCompressedSize !== compressedSize || localUncompressedSize !== uncompressedSize)) fail("local and central ZIP sizes or CRC differ");
    if (hasDataDescriptor && !((localCrc === 0 && localCompressedSize === 0 && localUncompressedSize === 0) || (localCrc === expectedCrc && localCompressedSize === compressedSize && localUncompressedSize === uncompressedSize))) fail("invalid ZIP data descriptor header");
    let rangeEnd = dataEnd;
    if (hasDataDescriptor) {
      const unsignedMatches = dataEnd + 12 <= centralOffset &&
        buffer.readUInt32LE(dataEnd) === expectedCrc &&
        buffer.readUInt32LE(dataEnd + 4) === compressedSize &&
        buffer.readUInt32LE(dataEnd + 8) === uncompressedSize;
      const signedMatches = dataEnd + 16 <= centralOffset &&
        buffer.readUInt32LE(dataEnd) === 0x08074b50 &&
        buffer.readUInt32LE(dataEnd + 4) === expectedCrc &&
        buffer.readUInt32LE(dataEnd + 8) === compressedSize &&
        buffer.readUInt32LE(dataEnd + 12) === uncompressedSize;
      if (!unsignedMatches && !signedMatches) fail("invalid or truncated ZIP data descriptor");
      rangeEnd = dataEnd + (signedMatches ? 16 : 12);
    }
    entries.push({ name, flags, method, expectedCrc, compressedSize, uncompressedSize, localOffset, dataStart, dataEnd, rangeEnd });
    offset = end;
  }
  if (offset !== centralOffset + centralSize) fail("invalid ZIP central directory length");
  const ranges = [...entries].sort((a, b) => a.localOffset - b.localOffset);
  for (let i = 0; i < ranges.length; i++) {
    if (ranges[i].rangeEnd > (ranges[i + 1]?.localOffset ?? centralOffset)) fail("overlapping ZIP local entries");
  }
  const nuspecEntries = entries.filter(entry => entry.name.toLowerCase().endsWith(".nuspec"));
  if (nuspecEntries.length !== 1) fail("expected exactly one .nuspec entry");
  const entry = nuspecEntries[0];
  if (entry.uncompressedSize > MAX_NUSPEC_BYTES || entry.compressedSize > MAX_NUSPEC_BYTES || entry.uncompressedSize > entry.compressedSize * MAX_COMPRESSION_RATIO) fail("nuspec size or compression ratio exceeds limit");
  const compressed = buffer.subarray(entry.dataStart, entry.dataEnd);
  let result;
  try {
    result = entry.method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: MAX_NUSPEC_BYTES });
  } catch {
    fail("nuspec decompression failed");
  }
  if (result.length !== entry.uncompressedSize || result.length > MAX_NUSPEC_BYTES) fail("nuspec length mismatch");
  if (crc32(result) !== entry.expectedCrc) fail("nuspec CRC check failed");
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
