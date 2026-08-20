'use strict';

const os = require('node:os');
const path = require('node:path');

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseCorsOrigins(value) {
  if (!value) {
    return new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);
  }

  return new Set(
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

const PORT = parsePositiveInteger(process.env.PORT, 3000);
const HOST = process.env.HOST || '127.0.0.1';
const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';
const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';
const ZIP_BIN = process.env.ZIP_BIN || 'zip';
// YouTube periodically changes which client can serve media to a headless
// downloader. web_embedded currently returns playable media on the public
// server, while yt-dlp's default client can receive a 403 mid-transfer.
const YTDLP_JS_RUNTIME = process.env.YTDLP_JS_RUNTIME || 'node';
const YTDLP_REMOTE_COMPONENTS = process.env.YTDLP_REMOTE_COMPONENTS || 'ejs:github';
const YTDLP_EXTRACTOR_ARGS = process.env.YTDLP_EXTRACTOR_ARGS || 'youtube:player_client=web_embedded';
const DOWNLOAD_ROOT = path.resolve(
  process.env.DOWNLOAD_DIR || path.join(os.tmpdir(), 'clipjet-downloads'),
);
const MAX_CONCURRENT_DOWNLOADS = parsePositiveInteger(
  process.env.MAX_CONCURRENT_DOWNLOADS,
  2,
);
const MAX_PENDING_JOBS = parsePositiveInteger(process.env.MAX_PENDING_JOBS, 20);
const EPHEMERAL_FILE_TTL_MS = parsePositiveInteger(
  process.env.EPHEMERAL_FILE_TTL_MS,
  5 * 60 * 1000,
);
const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_URL_LENGTH = 2048;
const DOWNLOAD_TIMEOUT_MS = parsePositiveInteger(
  process.env.DOWNLOAD_TIMEOUT_MS,
  30 * 60 * 1000,
);
const MAX_JOB_BYTES = parsePositiveInteger(
  process.env.MAX_JOB_BYTES,
  8 * 1024 * 1024 * 1024,
);
const RESOURCE_CHECK_INTERVAL_MS = 2000;
const RATE_LIMIT_WINDOW_MS = parsePositiveInteger(
  process.env.RATE_LIMIT_WINDOW_MS,
  10 * 60 * 1000,
);
const MAX_CREATE_REQUESTS_PER_IP = parsePositiveInteger(
  process.env.MAX_CREATE_REQUESTS_PER_IP,
  8,
);
const MAX_ACTIVE_JOBS_PER_IP = parsePositiveInteger(
  process.env.MAX_ACTIVE_JOBS_PER_IP,
  2,
);
const MAX_INVALID_REQUESTS_PER_IP = parsePositiveInteger(
  process.env.MAX_INVALID_REQUESTS_PER_IP,
  8,
);
const MAX_FAILED_JOBS_PER_IP = parsePositiveInteger(
  process.env.MAX_FAILED_JOBS_PER_IP,
  5,
);
const IP_BLOCK_DURATION_MS = parsePositiveInteger(
  process.env.IP_BLOCK_DURATION_MS,
  15 * 60 * 1000,
);
const IP_STRIKE_LIMIT = parsePositiveInteger(process.env.IP_STRIKE_LIMIT, 3);
const TRUST_PROXY_HOPS = parseNonNegativeInteger(process.env.TRUST_PROXY_HOPS, 0);
const CORS_ORIGINS = parseCorsOrigins(process.env.CORS_ORIGIN);

const FORMAT_CONFIG = Object.freeze({
  mp4: Object.freeze({
    extension: 'mp4',
    label: 'MP4',
  }),
  mp3: Object.freeze({
    extension: 'mp3',
    label: 'MP3',
  }),
});

const VIDEO_QUALITY_CONFIG = Object.freeze({
  best: Object.freeze({ label: '最高可用', height: null }),
  '1080': Object.freeze({ label: '1080p / Full HD', height: 1080 }),
  '720': Object.freeze({ label: '720p / HD', height: 720 }),
  '480': Object.freeze({ label: '480p', height: 480 }),
  '360': Object.freeze({ label: '360p', height: 360 }),
});

const AUDIO_QUALITY_CONFIG = Object.freeze({
  '320k': Object.freeze({ label: '320 kbps', bitrate: '320K' }),
  '256k': Object.freeze({ label: '256 kbps', bitrate: '256K' }),
  '192k': Object.freeze({ label: '192 kbps', bitrate: '192K' }),
  '128k': Object.freeze({ label: '128 kbps', bitrate: '128K' }),
});

module.exports = {
  parsePositiveInteger,
  parseNonNegativeInteger,
  parseCorsOrigins,
  PORT,
  HOST,
  YTDLP_BIN,
  FFMPEG_BIN,
  ZIP_BIN,
  YTDLP_JS_RUNTIME,
  YTDLP_REMOTE_COMPONENTS,
  YTDLP_EXTRACTOR_ARGS,
  DOWNLOAD_ROOT,
  MAX_CONCURRENT_DOWNLOADS,
  MAX_PENDING_JOBS,
  EPHEMERAL_FILE_TTL_MS,
  MAX_REQUEST_BYTES,
  MAX_URL_LENGTH,
  DOWNLOAD_TIMEOUT_MS,
  MAX_JOB_BYTES,
  RESOURCE_CHECK_INTERVAL_MS,
  RATE_LIMIT_WINDOW_MS,
  MAX_CREATE_REQUESTS_PER_IP,
  MAX_ACTIVE_JOBS_PER_IP,
  MAX_INVALID_REQUESTS_PER_IP,
  MAX_FAILED_JOBS_PER_IP,
  IP_BLOCK_DURATION_MS,
  IP_STRIKE_LIMIT,
  TRUST_PROXY_HOPS,
  CORS_ORIGINS,
  FORMAT_CONFIG,
  VIDEO_QUALITY_CONFIG,
  AUDIO_QUALITY_CONFIG,
};
