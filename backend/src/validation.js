'use strict';

const { HttpError } = require('./errors');
const {
  MAX_URL_LENGTH,
  FORMAT_CONFIG,
  VIDEO_QUALITY_CONFIG,
  AUDIO_QUALITY_CONFIG,
} = require('./config');

function parseYouTubeUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_LENGTH) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return null;
  }

  if (parsed.username || parsed.password) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  const isYoutubeHost = new Set([
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'youtu.be',
  ]).has(hostname);

  if (!isYoutubeHost) {
    return null;
  }

  const hasVideoId =
    (hostname === 'youtu.be' && parsed.pathname.length > 1) ||
    Boolean(parsed.searchParams.get('v')) ||
    /^\/(shorts|live|embed)\/[^/]+/i.test(parsed.pathname);
  const hasPlaylistId = Boolean(parsed.searchParams.get('list'));

  return hasVideoId || hasPlaylistId ? { parsed, hasVideoId, hasPlaylistId } : null;
}

function isYouTubeUrl(value) {
  return parseYouTubeUrl(value) !== null;
}

function normalizeFormat(value) {
  if (value === 'audio') {
    return 'mp3';
  }

  return value;
}

function normalizeOption(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return String(value).trim().toLowerCase();
}

function normalizeVideoQuality(value) {
  const normalized = normalizeOption(value, '1080');
  return normalized.endsWith('p') ? normalized.slice(0, -1) : normalized;
}

function normalizeAudioQuality(value) {
  const normalized = normalizeOption(value, '192k');
  return normalized.replace(/(?:kbps|kbit\/s)$/i, 'k');
}

function validateDownloadInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, '請提供 JSON 格式的下載參數。');
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  const format = normalizeFormat(body.format);
  const videoQuality = normalizeVideoQuality(body.videoQuality);
  const audioQuality = normalizeAudioQuality(body.audioQuality);
  const requestedScope = body.scope || (body.playlist === true ? 'playlist' : null);
  const youtubeUrl = parseYouTubeUrl(url);

  if (!youtubeUrl) {
    throw new HttpError(400, '目前只接受有效的 YouTube 影片或播放清單連結。');
  }

  if (!Object.hasOwn(FORMAT_CONFIG, format)) {
    throw new HttpError(400, '格式只支援 mp4 或 mp3。');
  }

  if (!Object.hasOwn(VIDEO_QUALITY_CONFIG, videoQuality)) {
    throw new HttpError(400, '畫質只支援最高可用、1080p、720p、480p 或 360p。');
  }

  if (!Object.hasOwn(AUDIO_QUALITY_CONFIG, audioQuality)) {
    throw new HttpError(400, '音質只支援 320k、256k、192k 或 128k。');
  }

  if (requestedScope && !['video', 'playlist'].includes(requestedScope)) {
    throw new HttpError(400, 'scope 只支援 video 或 playlist。');
  }

  const scope = requestedScope || (!youtubeUrl.hasVideoId ? 'playlist' : 'video');

  if (scope === 'video' && !youtubeUrl.hasVideoId) {
    throw new HttpError(400, '這個網址是播放清單，請使用 scope: playlist。');
  }

  if (scope === 'playlist' && !youtubeUrl.hasPlaylistId) {
    throw new HttpError(400, '播放清單模式需要包含 YouTube playlist 的 list 參數。');
  }

  return { url, format, scope, videoQuality, audioQuality };
}

function isValidJobId(jobId) {
  return /^[0-9a-f-]{36}$/i.test(jobId);
}

function isValidItemId(itemId) {
  return /^\d{1,6}$/.test(itemId);
}

module.exports = {
  parseYouTubeUrl,
  isYouTubeUrl,
  normalizeFormat,
  normalizeOption,
  normalizeVideoQuality,
  normalizeAudioQuality,
  validateDownloadInput,
  isValidJobId,
  isValidItemId,
};
