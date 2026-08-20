'use strict';

const { execFile } = require('node:child_process');

const { DownloadError } = require('./errors');
const { YTDLP_BIN, FFMPEG_BIN, ZIP_BIN } = require('./config');

function commandVersion(command, args) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout: 5000, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          resolve({ available: false, version: null });
          return;
        }

        const version = String(stdout).trim().split(/\r?\n/, 1)[0] || 'unknown';
        resolve({ available: true, version });
      },
    );
  });
}

async function dependencyStatus() {
  const [ytDlp, ffmpeg, zip] = await Promise.all([
    commandVersion(YTDLP_BIN, ['--version']),
    commandVersion(FFMPEG_BIN, ['-version']),
    commandVersion(ZIP_BIN, ['-v']),
  ]);

  return { ytDlp, ffmpeg, zip };
}

async function ensureDependencies() {
  const dependencies = await dependencyStatus();

  if (!dependencies.ytDlp.available) {
    throw new DownloadError('找不到 yt-dlp。', { code: 'MISSING_YTDLP' });
  }

  if (!dependencies.ffmpeg.available) {
    throw new DownloadError('找不到 ffmpeg。', { code: 'MISSING_FFMPEG' });
  }

  return dependencies;
}

module.exports = { commandVersion, dependencyStatus, ensureDependencies };
