'use strict';

const { updateJob } = require('./job-model');

const DOWNLOAD_PROGRESS_START = 5;
const DOWNLOAD_PROGRESS_END = 90;
const DOWNLOAD_PROGRESS_FALLBACK_CAP = 85;
const DOWNLOAD_PROGRESS_FALLBACK_DELAY_MS = 4000;
const DOWNLOAD_PROGRESS_FALLBACK_RAMP_MS = 180000;

function normalizeDownloadProgress(progress) {
  if (progress === null) {
    return null;
  }

  return Math.min(
    DOWNLOAD_PROGRESS_END,
    Math.max(DOWNLOAD_PROGRESS_START, progress),
  );
}

function stripAnsi(value) {
  // Removes ANSI colour/cursor sequences yt-dlp emits on some terminals
  // before a progress line is parsed. The control char is intentional.
  // eslint-disable-next-line no-control-regex
  return String(value).replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
}

function markProgressSignal(job) {
  job.progressSignalCount = (job.progressSignalCount || 0) + 1;
  job.progressLastSignalAt = Date.now();
}

function shouldUseProgressFallback(job, now = Date.now()) {
  if (!job.downloadStartedAt) {
    return false;
  }

  return !job.progressLastSignalAt
    || now - job.progressLastSignalAt >= DOWNLOAD_PROGRESS_FALLBACK_DELAY_MS;
}

function calculateFallbackProgress(job, now = Date.now()) {
  const startedAt = Number.isFinite(job.downloadStartedAt)
    ? job.downloadStartedAt
    : now;
  const elapsed = now - startedAt - DOWNLOAD_PROGRESS_FALLBACK_DELAY_MS;
  if (elapsed <= 0) {
    return job.progress || 0;
  }

  const ratio = 1 - Math.exp(-elapsed / DOWNLOAD_PROGRESS_FALLBACK_RAMP_MS);
  const estimated = DOWNLOAD_PROGRESS_START
    + (DOWNLOAD_PROGRESS_FALLBACK_CAP - DOWNLOAD_PROGRESS_START) * ratio;
  return Math.min(
    DOWNLOAD_PROGRESS_FALLBACK_CAP,
    Math.max(job.progress || 0, estimated),
  );
}

function parsePercent(value) {
  const match = String(value).match(/(\d+(?:[.,]\d+)?)/);
  if (!match) {
    return null;
  }

  const percent = Number.parseFloat(match[1].replace(',', '.'));
  return Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : null;
}

function cleanProgressValue(value) {
  const cleaned = String(value || '').trim();
  return !cleaned || cleaned === 'NA' || cleaned === 'N/A' ? null : cleaned;
}

function parsePositiveProgressValue(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePlaylistPosition(line) {
  const match = stripAnsi(line).match(/Downloading item\s+(\d+)\s+of\s+(\d+)/i);
  if (!match) {
    return null;
  }

  const index = parsePositiveProgressValue(match[1]);
  const count = parsePositiveProgressValue(match[2]);
  return index && count ? { index, count } : null;
}

function setPlaylistPosition(job, index, count) {
  markProgressSignal(job);
  job.playlistIndex = index;
  job.playlistCount = count;
  const overallProgress = ((index - 1) / count) * 100;
  updateJob(job, {
    phase: `下載第 ${index}/${count} 項`,
    progress: Math.max(
      job.progress,
      normalizeDownloadProgress(overallProgress) || job.progress,
    ),
  });
}

function calculateOverallProgress(job, progress, playlistIndex, playlistCount) {
  if (progress === null) {
    return null;
  }

  const streamCount = job.format === 'mp4' ? 2 : 1;
  const unitKey = job.scope === 'playlist' ? playlistIndex : 'single';
  if (job.progressUnitKey !== unitKey) {
    job.progressUnitKey = unitKey;
    job.progressStreamPass = 0;
    job.progressLastPercent = null;
  }

  if (
    job.progressLastPercent !== null &&
    progress + 1 < job.progressLastPercent
  ) {
    job.progressStreamPass = Math.min(
      streamCount - 1,
      job.progressStreamPass + 1,
    );
  }
  job.progressLastPercent = progress;

  const unitProgress = Math.min(
    100,
    ((job.progressStreamPass + progress / 100) / streamCount) * 100,
  );

  if (
    job.scope === 'playlist' &&
    playlistIndex !== null &&
    playlistCount !== null
  ) {
    return ((playlistIndex - 1 + unitProgress / 100) / playlistCount) * 100;
  }

  return unitProgress;
}

function handleProgressLine(job, line) {
  const cleanLine = stripAnsi(line).trim();
  const playlistPosition = parsePlaylistPosition(line);
  if (playlistPosition) {
    setPlaylistPosition(job, playlistPosition.index, playlistPosition.count);
    return;
  }

  const playlistCountMatch = cleanLine.match(/Downloading\s+(\d+)\s+items?/i);
  if (job.scope === 'playlist' && playlistCountMatch) {
    const playlistCount = parsePositiveProgressValue(playlistCountMatch[1]);
    if (playlistCount) {
      job.playlistCount = playlistCount;
    }
  }

  // Depending on yt-dlp version and output stream, a progress template can
  // arrive as `download:12.3%|...`, `12.3%|...`, or with a `[download]`
  // prefix. Keep the parser tolerant of all three forms.
  const progressMatch = cleanLine.match(
    /(?:^|\s)(?:download:)?\s*(\d+(?:[.,]\d+)?%\s*\|.*)$/i,
  );

  // yt-dlp currently strips the progress-template name from the emitted line,
  // so both `download:12.3%|...` and `12.3%|...` are valid here.
  if (!progressMatch) {
    if (/extractaudio/i.test(cleanLine)) {
      updateJob(job, { phase: '轉換音訊' });
    } else if (/merger|merging/i.test(cleanLine)) {
      updateJob(job, { phase: '合併影音' });
    } else if (/downloading\s+audio/i.test(cleanLine)) {
      updateJob(job, { phase: '下載音訊' });
    }
    return;
  }

  markProgressSignal(job);
  const [rawPercent, rawSpeed, rawEta, rawPlaylistIndex, rawPlaylistCount] = progressMatch[1]
    .split('|');
  const progress = parsePercent(rawPercent);
  const playlistIndex =
    parsePositiveProgressValue(rawPlaylistIndex) || job.playlistIndex || null;
  const playlistCount =
    parsePositiveProgressValue(rawPlaylistCount) || job.playlistCount || null;
  if (
    job.scope === 'playlist' &&
    playlistIndex !== null &&
    playlistCount !== null &&
    (job.playlistIndex !== playlistIndex || job.playlistCount !== playlistCount)
  ) {
    setPlaylistPosition(job, playlistIndex, playlistCount);
  }

  const overallProgress = calculateOverallProgress(
    job,
    progress,
    playlistIndex,
    playlistCount,
  );
  const mappedProgress = normalizeDownloadProgress(overallProgress);
  const isDownloadComplete =
    overallProgress !== null && overallProgress >= 100;

  updateJob(job, {
    phase:
      isDownloadComplete
        ? job.format === 'mp3' ? '轉換音訊' : '合併影音'
        : job.scope === 'playlist' && playlistIndex && playlistCount
        ? `下載第 ${playlistIndex}/${playlistCount} 項`
        : '下載中',
    progress:
      mappedProgress === null ? job.progress : Math.max(job.progress, mappedProgress),
    speed: cleanProgressValue(rawSpeed),
    eta: cleanProgressValue(rawEta),
  });
}

function appendOutput(output, line) {
  output.push(line);
  if (output.length > 80) {
    output.shift();
  }
}

module.exports = {
  parsePercent,
  cleanProgressValue,
  parsePositiveProgressValue,
  parsePlaylistPosition,
  calculateFallbackProgress,
  shouldUseProgressFallback,
  handleProgressLine,
  appendOutput,
};
