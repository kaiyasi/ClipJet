'use strict';

const { HttpError } = require('./errors');
const {
  RATE_LIMIT_WINDOW_MS,
  MAX_PENDING_JOBS,
  MAX_CREATE_REQUESTS_PER_IP,
  MAX_ACTIVE_JOBS_PER_IP,
  MAX_INVALID_REQUESTS_PER_IP,
  MAX_FAILED_JOBS_PER_IP,
  IP_BLOCK_DURATION_MS,
  IP_STRIKE_LIMIT,
} = require('./config');
const { jobs, queuedJobIds, ipStates } = require('./state');
const { anonymizeIp } = require('./client-ip');

function getIpState(ip) {
  const now = Date.now();
  let state = ipStates.get(ip);

  if (!state) {
    state = {
      windowStartedAt: now,
      createRequests: 0,
      invalidRequests: 0,
      failedJobs: 0,
      strikes: 0,
      blockedUntil: 0,
    };
    ipStates.set(ip, state);
  }

  if (now - state.windowStartedAt >= RATE_LIMIT_WINDOW_MS) {
    state.windowStartedAt = now;
    state.createRequests = 0;
    state.invalidRequests = 0;
    state.failedJobs = 0;
    state.strikes = Math.max(0, state.strikes - 1);
  }

  return state;
}

function rateLimitError(message, retryAfterSeconds) {
  return new HttpError(429, message, {
    code: 'RATE_LIMITED',
    retryAfterSeconds,
  });
}

function assertIpAllowed(ip) {
  const state = getIpState(ip);
  if (state.blockedUntil <= Date.now()) {
    return state;
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((state.blockedUntil - Date.now()) / 1000),
  );
  throw rateLimitError('目前無法使用下載服務，請稍後再試。', retryAfterSeconds);
}

function countOpenJobsForIp(ip) {
  let count = 0;
  for (const job of jobs.values()) {
    if (job.clientIp === ip && ['queued', 'running'].includes(job.status)) {
      count += 1;
    }
  }
  return count;
}

function registerIpStrike(ip, reason) {
  const state = getIpState(ip);
  state.strikes += 1;

  if (state.strikes >= IP_STRIKE_LIMIT) {
    state.blockedUntil = Date.now() + IP_BLOCK_DURATION_MS;
    state.strikes = 0;
    console.warn(
      `[ClipJet] temporarily blocked IP hash=${anonymizeIp(ip)} reason=${reason}`,
    );
  }
}

function enforceCreateLimits(ip) {
  const state = assertIpAllowed(ip);

  const pendingJobs = queuedJobIds.filter(
    (jobId) => jobs.get(jobId)?.status === 'queued',
  ).length;
  if (pendingJobs >= MAX_PENDING_JOBS) {
    throw new HttpError(503, '目前下載佇列已滿，請稍後再試。', {
      code: 'QUEUE_FULL',
      retryAfterSeconds: 60,
    });
  }

  if (state.createRequests >= MAX_CREATE_REQUESTS_PER_IP) {
    registerIpStrike(ip, 'create-rate-limit');
    throw rateLimitError(
      '這個 IP 的下載請求過於頻繁，請稍後再試。',
      Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
    );
  }

  if (countOpenJobsForIp(ip) >= MAX_ACTIVE_JOBS_PER_IP) {
    registerIpStrike(ip, 'too-many-open-jobs');
    throw rateLimitError(
      '這個 IP 目前已有太多下載工作，請等待部分工作完成。',
      60,
    );
  }

  state.createRequests += 1;
}

function recordInvalidRequest(ip) {
  const state = getIpState(ip);
  state.invalidRequests += 1;
  if (state.invalidRequests >= MAX_INVALID_REQUESTS_PER_IP) {
    registerIpStrike(ip, 'invalid-requests');
    state.invalidRequests = 0;
  }
}

function recordFailedJob(job, error) {
  if (
    !job.clientIp ||
    ['CANCELED', 'MISSING_YTDLP', 'MISSING_FFMPEG', 'MISSING_ZIP'].includes(error.code)
  ) {
    return;
  }

  const state = getIpState(job.clientIp);
  state.failedJobs += 1;
  if (state.failedJobs >= MAX_FAILED_JOBS_PER_IP) {
    registerIpStrike(job.clientIp, 'repeated-failed-jobs');
    state.failedJobs = 0;
  }
}

function recordSuccessfulJob(job) {
  if (!job.clientIp) {
    return;
  }

  const state = getIpState(job.clientIp);
  state.failedJobs = Math.max(0, state.failedJobs - 1);
}

function cleanupIpStates() {
  const now = Date.now();
  for (const [ip, state] of ipStates.entries()) {
    const expiredBlock = state.blockedUntil <= now;
    const expiredWindow = now - state.windowStartedAt >= RATE_LIMIT_WINDOW_MS;
    if (expiredBlock && expiredWindow && countOpenJobsForIp(ip) === 0) {
      ipStates.delete(ip);
    }
  }
}

module.exports = {
  getIpState,
  rateLimitError,
  assertIpAllowed,
  countOpenJobsForIp,
  registerIpStrike,
  enforceCreateLimits,
  recordInvalidRequest,
  recordFailedJob,
  recordSuccessfulJob,
  cleanupIpStates,
};
