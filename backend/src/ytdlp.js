'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

const { DownloadError } = require('./errors');
const {
  YTDLP_BIN,
  YTDLP_JS_RUNTIME,
  YTDLP_REMOTE_COMPONENTS,
  YTDLP_EXTRACTOR_ARGS,
  DOWNLOAD_TIMEOUT_MS,
  VIDEO_QUALITY_CONFIG,
  AUDIO_QUALITY_CONFIG,
} = require('./config');
const { updateJob } = require('./job-model');
const {
  handleProgressLine,
  appendOutput,
  calculateFallbackProgress,
  shouldUseProgressFallback,
} = require('./progress');

function buildVideoFormat(videoQuality) {
  const quality = VIDEO_QUALITY_CONFIG[videoQuality];

  if (!quality.height) {
    return 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b';
  }

  return `bv*[height<=${quality.height}][ext=mp4]+ba[ext=m4a]/b[height<=${quality.height}][ext=mp4]/b[height<=${quality.height}]`;
}

function buildYtDlpArgs(job) {
  const isPlaylist = job.scope === 'playlist';
  const formatArgs =
    job.format === 'mp4'
      ? [
          '--format',
          buildVideoFormat(job.videoQuality),
          '--merge-output-format',
          'mp4',
        ]
      : [
          '--extract-audio',
          '--audio-format',
          'mp3',
          '--audio-quality',
          AUDIO_QUALITY_CONFIG[job.audioQuality].bitrate,
        ];

  return [
    ...(YTDLP_JS_RUNTIME ? ['--js-runtimes', YTDLP_JS_RUNTIME] : []),
    ...(YTDLP_REMOTE_COMPONENTS ? ['--remote-components', YTDLP_REMOTE_COMPONENTS] : []),
    ...(YTDLP_EXTRACTOR_ARGS ? ['--extractor-args', YTDLP_EXTRACTOR_ARGS] : []),
    isPlaylist ? '--yes-playlist' : '--no-playlist',
    // Real playlists routinely contain a private / removed / region-locked
    // entry. Without this, yt-dlp aborts the whole playlist on the first such
    // error; with it, the remaining items still download and we keep whatever
    // succeeded (see the partial-success handling in runYtDlp).
    ...(isPlaylist ? ['--ignore-errors'] : []),
    '--newline',
    '--no-warnings',
    '--restrict-filenames',
    '--progress-template',
    'download:%(progress._percent_str)s|%(progress.speed)s|%(progress.eta)s|%(playlist_index)s|%(playlist_count)s',
    '--write-info-json',
    '--print',
    'after_move:filepath',
    '--output',
    isPlaylist
      ? path.join(
          job.outputDir,
          'items',
          '%(playlist_index)03d - %(title).80s [%(id)s].%(ext)s',
      )
      : path.join(job.outputDir, 'source.%(ext)s'),
    ...formatArgs,
    job.url,
  ];
}

// Some yt-dlp client/runtime combinations emit few or no progress lines. This
// interval advances the bar based on elapsed time when the stream goes quiet,
// so the UI keeps moving; it never lowers a real progress value.
function startProgressFallback(job) {
  const monitor = setInterval(() => {
    if (job.status !== 'running' || !job.process || !shouldUseProgressFallback(job)) {
      return;
    }

    const progress = calculateFallbackProgress(job);
    if (progress <= job.progress) {
      return;
    }

    updateJob(job, { progress });
  }, 1000);

  monitor.unref?.();
  return monitor;
}

function runYtDlp(job, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP_BIN, args, {
      cwd: job.outputDir,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const output = [];
    const printedPaths = [];
    job.process = child;
    job.downloadStartedAt = Date.now();
    job.progressLastSignalAt = null;
    job.progressSignalCount = 0;
    const progressFallback = startProgressFallback(job);
    job.timeoutExceeded = false;
    const timeoutTimer = setTimeout(() => {
      job.timeoutExceeded = true;
      child.kill('SIGTERM');
    }, DOWNLOAD_TIMEOUT_MS);
    timeoutTimer.unref?.();

    const consumeStream = (stream, isStdout) => {
      let pending = '';

      const consumeLine = (line) => {
        const normalizedLine = String(line).trim();
        appendOutput(output, normalizedLine);

        if (isStdout) {
          handleProgressLine(job, normalizedLine);
          if (normalizedLine && !normalizedLine.startsWith('download:')) {
            printedPaths.push(normalizedLine);
          }
        } else {
          handleProgressLine(job, normalizedLine);
        }
      };

      // yt-dlp uses both regular newlines and carriage returns depending on
      // the output mode. Reading chunks ourselves keeps progress updates
      // flowing even when a stream splits a status line across chunks.
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        pending += chunk;
        const lines = pending.split(/\r\n|\n|\r/);
        pending = lines.pop() || '';
        for (const line of lines) {
          consumeLine(line);
        }
      });
      stream.on('end', () => {
        if (pending) {
          consumeLine(pending);
          pending = '';
        }
      });
    };

    consumeStream(child.stdout, true);
    consumeStream(child.stderr, false);

    child.on('error', (error) => {
      clearTimeout(timeoutTimer);
      clearInterval(progressFallback);
      reject(
        new DownloadError('無法啟動下載工具。', {
          code: error.code === 'ENOENT' ? 'MISSING_YTDLP' : error.code,
          output: output.join('\n'),
        }),
      );
    });

    child.on('close', (exitCode, signal) => {
      clearTimeout(timeoutTimer);
      clearInterval(progressFallback);
      job.process = null;

      if (job.cancelRequested) {
        reject(new DownloadError('下載已取消。', { code: 'CANCELED' }));
        return;
      }

      if (job.resourceLimitExceeded) {
        reject(new DownloadError('下載工作超過檔案大小限制。', { code: 'MAX_JOB_BYTES' }));
        return;
      }

      if (job.timeoutExceeded) {
        reject(new DownloadError('下載工作超過執行時間限制。', { code: 'DOWNLOAD_TIMEOUT' }));
        return;
      }

      if (exitCode !== 0) {
        // For playlists a non-zero exit usually means some entries failed while
        // others succeeded. Treat it as a partial success and let the caller
        // decide based on how many files actually landed; only a truly empty
        // result becomes an error downstream. Single videos stay strict.
        if (job.scope === 'playlist' && !signal) {
          resolve({ printedPaths, output: output.join('\n'), partial: true });
          return;
        }

        reject(
          new DownloadError('下載工具執行失敗。', {
            code: signal || `EXIT_${exitCode}`,
            output: output.join('\n'),
          }),
        );
        return;
      }

      resolve({ printedPaths, output: output.join('\n') });
    });
  });
}

module.exports = { buildVideoFormat, buildYtDlpArgs, runYtDlp };
