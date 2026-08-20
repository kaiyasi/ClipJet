'use strict';

const path = require('node:path');
const crypto = require('node:crypto');

const { DOWNLOAD_ROOT } = require('./config');

function nowIso() {
  return new Date().toISOString();
}

function createJob(input, clientIp) {
  const id = crypto.randomUUID();
  const createdAt = nowIso();

  return {
    id,
    url: input.url,
    clientIp,
    format: input.format,
    scope: input.scope,
    videoQuality: input.videoQuality,
    audioQuality: input.audioQuality,
    status: 'queued',
    phase: '等待下載',
    progress: 0,
    speed: null,
    eta: null,
    filename: null,
    itemCount: null,
    items: [],
    sourceUrl: input.url,
    sourceTitle: null,
    thumbnailUrl: null,
    playlistIndex: null,
    playlistCount: null,
    progressUnitKey: null,
    progressStreamPass: 0,
    progressLastPercent: null,
    downloadStartedAt: null,
    progressLastSignalAt: null,
    progressSignalCount: 0,
    filePath: null,
    outputDir: path.join(DOWNLOAD_ROOT, id),
    process: null,
    cleanupTimer: null,
    activeTransfers: 0,
    resourceLimitExceeded: false,
    timeoutExceeded: false,
    storageBytes: 0,
    cancelRequested: false,
    error: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function publicJob(job) {
  const result = {
    id: job.id,
    status: job.status,
    phase: job.phase,
    format: job.format,
    scope: job.scope,
    videoQuality: job.videoQuality,
    audioQuality: job.audioQuality,
    progress: job.progress,
    speed: job.speed,
    eta: job.eta,
    filename: job.filename,
    itemCount: job.itemCount,
    sourceUrl: job.sourceUrl,
    sourceTitle: job.sourceTitle,
    thumbnailUrl: job.thumbnailUrl,
    items:
      job.scope === 'playlist' && job.status === 'completed'
        ? job.items.map((item) => ({
            id: item.id,
            filename: item.filename,
            size: item.size,
            downloadUrl: `/api/downloads/${job.id}/items/${item.id}`,
            title: item.title || null,
            sourceUrl: item.sourceUrl || null,
            thumbnailUrl: item.thumbnailUrl || null,
          }))
        : null,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };

  if (job.status === 'completed') {
    result.downloadUrl = `/api/downloads/${job.id}/file`;
  }

  return result;
}

function updateJob(job, updates) {
  Object.assign(job, updates, { updatedAt: nowIso() });
}

module.exports = { nowIso, createJob, publicJob, updateJob };
