'use strict';

const fsp = require('node:fs').promises;
const path = require('node:path');

const { DownloadError } = require('./errors');
const { MAX_JOB_BYTES, RESOURCE_CHECK_INTERVAL_MS } = require('./config');

async function calculateDirectorySize(directory) {
  let entries;
  try {
    entries = await fsp.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return 0;
    }
    throw error;
  }

  let total = 0;
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      total += await calculateDirectorySize(candidate);
    } else if (entry.isFile()) {
      const stat = await fsp.stat(candidate);
      total += stat.size;
    }
  }

  return total;
}

async function ensureJobWithinSize(job) {
  const storageBytes = await calculateDirectorySize(job.outputDir);
  job.storageBytes = storageBytes;

  if (storageBytes > MAX_JOB_BYTES) {
    job.resourceLimitExceeded = true;
    throw new DownloadError('下載工作超過檔案大小限制。', {
      code: 'MAX_JOB_BYTES',
    });
  }
}

function startResourceMonitor(job) {
  let checking = false;
  const monitor = setInterval(async () => {
    if (checking || job.status !== 'running') {
      return;
    }

    checking = true;
    try {
      await ensureJobWithinSize(job);
      if (job.resourceLimitExceeded && job.process) {
        job.process.kill('SIGTERM');
      }
    } catch (error) {
      if (error.code === 'MAX_JOB_BYTES' && job.process) {
        job.process.kill('SIGTERM');
      }
    } finally {
      checking = false;
    }
  }, RESOURCE_CHECK_INTERVAL_MS);

  monitor.unref?.();
  return monitor;
}

module.exports = { calculateDirectorySize, ensureJobWithinSize, startResourceMonitor };
