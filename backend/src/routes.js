'use strict';

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');

const { HttpError } = require('./errors');
const { MAX_CONCURRENT_DOWNLOADS, MAX_PENDING_JOBS } = require('./config');
const { jobs, queuedJobIds, runtime } = require('./state');
const { getClientIp } = require('./client-ip');
const { assertIpAllowed, enforceCreateLimits } = require('./rate-limit');
const {
  validateDownloadInput,
  isValidJobId,
  isValidItemId,
} = require('./validation');
const { createJob, publicJob, updateJob } = require('./job-model');
const { isInsideDirectory } = require('./paths');
const {
  addCorsHeaders,
  addSecurityHeaders,
  sendJson,
  readJsonBody,
  contentDisposition,
} = require('./http');
const {
  dependencyStatus,
  pumpQueue,
  scheduleCleanup,
} = require('./downloader');

function getJobOrThrow(jobId) {
  const job = jobs.get(jobId);
  if (!job) {
    throw new HttpError(404, '找不到這個下載工作，可能已過期。');
  }
  return job;
}

function streamJobFile(req, res, job, filePath, contentType, filename, size) {
  job.activeTransfers += 1;
  scheduleCleanup(job);

  let released = false;
  const releaseTransfer = () => {
    if (released) {
      return;
    }
    released = true;
    job.activeTransfers = Math.max(0, job.activeTransfers - 1);
    scheduleCleanup(job);
  };

  res.once('finish', releaseTransfer);
  res.once('close', releaseTransfer);

  addCorsHeaders(req, res);
  addSecurityHeaders(res);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': size,
    'Content-Disposition': contentDisposition(filename),
  });

  const fileStream = fs.createReadStream(filePath);
  fileStream.on('error', () => {
    releaseTransfer();
    if (!res.headersSent) {
      res.writeHead(500);
    }
    res.destroy();
  });
  fileStream.pipe(res);
}

async function handleCreateDownload(req, res) {
  const clientIp = getClientIp(req);
  assertIpAllowed(clientIp);

  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    throw new HttpError(415, 'Content-Type 必須是 application/json。', {
      code: 'UNSUPPORTED_MEDIA_TYPE',
    });
  }

  const body = await readJsonBody(req);
  const input = validateDownloadInput(body);
  enforceCreateLimits(clientIp);
  const job = createJob(input, clientIp);

  jobs.set(job.id, job);
  queuedJobIds.push(job.id);
  pumpQueue();

  sendJson(req, res, 202, {
    job: publicJob(job),
  });
}

async function handleGetDownload(req, res, jobId) {
  if (!isValidJobId(jobId)) {
    throw new HttpError(404, '找不到這個下載工作。');
  }

  const job = getJobOrThrow(jobId);
  sendJson(req, res, 200, { job: publicJob(job) });
}

async function handleDownloadFile(req, res, jobId) {
  if (!isValidJobId(jobId)) {
    throw new HttpError(404, '找不到這個檔案。');
  }

  const job = getJobOrThrow(jobId);
  if (job.status !== 'completed' || !job.filePath) {
    throw new HttpError(409, '檔案尚未準備完成。');
  }

  let fileStat;
  try {
    fileStat = await fsp.stat(job.filePath);
  } catch {
    throw new HttpError(404, '檔案已過期，請重新建立下載工作。');
  }

  if (!fileStat.isFile() || !isInsideDirectory(job.filePath, job.outputDir)) {
    throw new HttpError(404, '找不到這個檔案。');
  }

  const contentType =
    job.scope === 'playlist'
      ? 'application/zip'
      : job.format === 'mp4'
        ? 'video/mp4'
        : 'audio/mpeg';
  streamJobFile(req, res, job, job.filePath, contentType, job.filename, fileStat.size);
}

async function handleDownloadItem(req, res, jobId, itemId) {
  if (!isValidJobId(jobId) || !isValidItemId(itemId)) {
    throw new HttpError(404, '找不到這個播放清單項目。');
  }

  const job = getJobOrThrow(jobId);
  if (job.scope !== 'playlist' || job.status !== 'completed') {
    throw new HttpError(409, '播放清單項目尚未準備完成。');
  }

  const item = job.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new HttpError(404, '找不到這個播放清單項目。');
  }

  const itemsDirectory = path.join(job.outputDir, 'items');
  if (!isInsideDirectory(item.filePath, itemsDirectory)) {
    throw new HttpError(404, '找不到這個播放清單項目。');
  }

  let fileStat;
  try {
    fileStat = await fsp.stat(item.filePath);
  } catch {
    throw new HttpError(404, '檔案已過期，請重新建立下載工作。');
  }

  if (!fileStat.isFile() || fileStat.size === 0) {
    throw new HttpError(404, '找不到這個播放清單項目。');
  }

  streamJobFile(
    req,
    res,
    job,
    item.filePath,
    job.format === 'mp4' ? 'video/mp4' : 'audio/mpeg',
    item.filename,
    fileStat.size,
  );
}

async function handleCancelDownload(req, res, jobId) {
  if (!isValidJobId(jobId)) {
    throw new HttpError(404, '找不到這個下載工作。');
  }

  const job = getJobOrThrow(jobId);

  if (job.status === 'queued') {
    job.cancelRequested = true;
    updateJob(job, { status: 'canceled', phase: '已取消', error: '下載已取消。' });
    sendJson(req, res, 200, { job: publicJob(job) });
    return;
  }

  if (job.status === 'running' && job.process) {
    job.cancelRequested = true;
    job.process.kill('SIGTERM');
    sendJson(req, res, 202, { job: publicJob(job) });
    return;
  }

  sendJson(req, res, 200, { job: publicJob(job) });
}

async function handleHealth(req, res) {
  const dependencies = await dependencyStatus();
  const ready = dependencies.ytDlp.available && dependencies.ffmpeg.available;
  const playlistReady = ready && dependencies.zip.available;

  sendJson(req, res, ready ? 200 : 503, {
    status: ready ? 'ok' : 'degraded',
    dependencies,
    capabilities: {
      video: ready,
      playlist: playlistReady,
    },
    queue: {
      active: runtime.activeJobCount,
      pending: queuedJobIds.filter((jobId) => jobs.get(jobId)?.status === 'queued')
        .length,
      maxConcurrent: MAX_CONCURRENT_DOWNLOADS,
      maxPending: MAX_PENDING_JOBS,
    },
  });
}

// Declarative route table. Each entry is matched in order; the first entry
// whose method and path pattern both match handles the request. Capture groups
// from the pattern are passed to the handler as trailing path parameters.
const routes = [
  {
    method: 'GET',
    pattern: /^\/api\/health$/,
    handler: (req, res) => handleHealth(req, res),
  },
  {
    method: 'POST',
    pattern: /^\/api\/downloads$/,
    handler: (req, res) => handleCreateDownload(req, res),
  },
  {
    method: 'GET',
    pattern: /^\/api\/downloads\/([^/]+)\/items\/([^/]+)$/,
    handler: (req, res, match) => handleDownloadItem(req, res, match[1], match[2]),
  },
  {
    method: 'GET',
    pattern: /^\/api\/downloads\/([^/]+)\/file$/,
    handler: (req, res, match) => handleDownloadFile(req, res, match[1]),
  },
  {
    method: 'GET',
    pattern: /^\/api\/downloads\/([^/]+)$/,
    handler: (req, res, match) => handleGetDownload(req, res, match[1]),
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/downloads\/([^/]+)$/,
    handler: (req, res, match) => handleCancelDownload(req, res, match[1]),
  },
];

function routeRequest(req, res) {
  const requestUrl = new URL(req.url, 'http://localhost');
  const pathname = requestUrl.pathname.replace(/\/$/, '') || '/';

  if (req.method === 'OPTIONS') {
    addCorsHeaders(req, res);
    res.writeHead(204, { 'Access-Control-Max-Age': '600' });
    res.end();
    return;
  }

  if (pathname !== '/api/health') {
    assertIpAllowed(getClientIp(req));
  }

  for (const route of routes) {
    if (route.method !== req.method) {
      continue;
    }

    const match = pathname.match(route.pattern);
    if (match) {
      return route.handler(req, res, match);
    }
  }

  throw new HttpError(404, '找不到 API 路徑。');
}

module.exports = { routeRequest };
