'use strict';

const fsp = require('node:fs').promises;
const path = require('node:path');

const { FORMAT_CONFIG } = require('./config');
const { isInsideDirectory } = require('./paths');
const { parsePositiveProgressValue } = require('./progress');

// yt-dlp names each sidecar `<output-without-media-ext>.info.json`, so a record's
// filePath carries no extension. Media paths do, so strip theirs before matching.
function pathWithoutExtension(filePath) {
  const extension = path.extname(filePath);
  return extension ? filePath.slice(0, -extension.length) : filePath;
}

async function listFilesRecursively(directory) {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(candidate)));
      continue;
    }

    if (entry.isFile() && !entry.name.endsWith('.part')) {
      files.push(candidate);
    }
  }

  return files;
}

async function findOutputFile(job, printedPaths) {
  const expectedExtension = `.${FORMAT_CONFIG[job.format].extension}`;
  const candidates = [];

  for (const printedPath of printedPaths) {
    const candidate = path.isAbsolute(printedPath)
      ? printedPath
      : path.resolve(job.outputDir, printedPath);

    if (!isInsideDirectory(candidate, job.outputDir)) {
      continue;
    }

    try {
      const stat = await fsp.stat(candidate);
      if (stat.isFile() && candidate.toLowerCase().endsWith(expectedExtension)) {
        candidates.push({ candidate, modifiedAt: stat.mtimeMs });
      }
    } catch {
      // The printed output can include status text; ignore paths that are not files.
    }
  }

  if (candidates.length > 0) {
    candidates.sort((left, right) => right.modifiedAt - left.modifiedAt);
    return candidates[0].candidate;
  }

  const entries = await fsp.readdir(job.outputDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.') || entry.name.endsWith('.part')) {
      continue;
    }

    const candidate = path.join(job.outputDir, entry.name);
    if (!candidate.toLowerCase().endsWith(expectedExtension)) {
      continue;
    }

    const stat = await fsp.stat(candidate);
    files.push({ candidate, modifiedAt: stat.mtimeMs });
  }

  files.sort((left, right) => right.modifiedAt - left.modifiedAt);
  return files[0]?.candidate || null;
}

async function findPlaylistFiles(job) {
  const itemsDirectory = path.join(job.outputDir, 'items');
  const expectedExtension = `.${FORMAT_CONFIG[job.format].extension}`;
  const files = await listFilesRecursively(itemsDirectory);
  const validFiles = [];

  for (const filePath of files) {
    if (!isInsideDirectory(filePath, itemsDirectory)) {
      continue;
    }

    if (!filePath.toLowerCase().endsWith(expectedExtension)) {
      continue;
    }

    const stat = await fsp.stat(filePath);
    if (stat.isFile() && stat.size > 0) {
      validFiles.push(filePath);
    }
  }

  return validFiles.sort((left, right) => left.localeCompare(right));
}

function metadataText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

function metadataUrl(value) {
  const candidate = metadataText(value);
  if (!candidate) {
    return null;
  }

  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

async function readYtDlpMetadata(job) {
  const metadataFiles = (await listFilesRecursively(job.outputDir)).filter((filePath) =>
    filePath.endsWith('.info.json'),
  );
  const records = [];

  for (const metadataPath of metadataFiles) {
    try {
      const rawMetadata = await fsp.readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(rawMetadata);
      records.push({
        filePath: metadataPath.slice(0, -'.info.json'.length),
        id: metadataText(metadata.id),
        title: metadataText(metadata.title),
        sourceUrl: metadataUrl(metadata.webpage_url || metadata.original_url),
        thumbnailUrl: metadataUrl(metadata.thumbnail),
        playlistIndex: parsePositiveProgressValue(metadata.playlist_index),
        playlistTitle: metadataText(metadata.playlist_title),
      });
    } catch {
      // Metadata is optional; a broken sidecar must not invalidate a download.
    } finally {
      await fsp.rm(metadataPath, { force: true });
    }
  }

  return records;
}

module.exports = {
  pathWithoutExtension,
  listFilesRecursively,
  findOutputFile,
  findPlaylistFiles,
  metadataText,
  metadataUrl,
  readYtDlpMetadata,
};
