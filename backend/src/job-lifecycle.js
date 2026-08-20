'use strict';

const fsp = require('node:fs').promises;
const path = require('node:path');

const { EPHEMERAL_FILE_TTL_MS, DOWNLOAD_ROOT } = require('./config');
const { jobs } = require('./state');
const { updateJob } = require('./job-model');
const { isInsideDirectory } = require('./paths');
const { isValidJobId } = require('./validation');
const { recordFailedJob } = require('./rate-limit');
const { friendlyDownloadError } = require('./error-map');

async function removeJobDirectory(job) {
  if (!job.outputDir || !isInsideDirectory(job.outputDir, DOWNLOAD_ROOT)) {
    return;
  }

  try {
    await fsp.rm(job.outputDir, { recursive: true, force: true });
  } catch (error) {
    console.error(`[ClipJet] failed to clean job ${job.id}:`, error);
  }
}

function scheduleCleanup(job) {
  if (job.cleanupTimer) {
    clearTimeout(job.cleanupTimer);
  }

  job.cleanupTimer = setTimeout(async () => {
    if (job.activeTransfers > 0) {
      scheduleCleanup(job);
      return;
    }

    await removeJobDirectory(job);
    jobs.delete(job.id);
    job.cleanupTimer = null;
  }, EPHEMERAL_FILE_TTL_MS);

  job.cleanupTimer.unref?.();
}

async function failDownload(job, error) {
  const isCanceled = error.code === 'CANCELED' || job.cancelRequested;
  updateJob(job, {
    status: isCanceled ? 'canceled' : 'failed',
    phase: isCanceled ? '已取消' : '下載失敗',
    error: isCanceled ? '下載已取消。' : friendlyDownloadError(error),
  });

  recordFailedJob(job, error);
  console.warn(`[ClipJet] job ${job.id} ended with code=${error.code || 'UNKNOWN'}`);

  await removeJobDirectory(job);
  scheduleCleanup(job);
}

async function removeStaleWorkDirectories() {
  let entries;
  try {
    entries = await fsp.readdir(DOWNLOAD_ROOT, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    if (entry.isDirectory() && isValidJobId(entry.name)) {
      await fsp.rm(path.join(DOWNLOAD_ROOT, entry.name), {
        recursive: true,
        force: true,
      });
    }
  }
}

module.exports = {
  removeJobDirectory,
  scheduleCleanup,
  failDownload,
  removeStaleWorkDirectories,
};
