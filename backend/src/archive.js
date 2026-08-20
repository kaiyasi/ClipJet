'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

const { DownloadError } = require('./errors');
const { ZIP_BIN, DOWNLOAD_TIMEOUT_MS } = require('./config');
const { appendOutput } = require('./progress');

function runZip(job, archivePath) {
  return new Promise((resolve, reject) => {
    const itemsDirectory = path.join(job.outputDir, 'items');
    const output = [];
    let settled = false;
    const child = spawn(ZIP_BIN, ['-q', '-r', archivePath, '.'], {
      cwd: itemsDirectory,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    job.process = child;
    job.timeoutExceeded = false;
    const timeoutTimer = setTimeout(() => {
      job.timeoutExceeded = true;
      child.kill('SIGTERM');
    }, DOWNLOAD_TIMEOUT_MS);
    timeoutTimer.unref?.();

    const collect = (chunk) => {
      const lines = String(chunk).split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        appendOutput(output, line.trim());
      }
    };

    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    const finish = (error, result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutTimer);
      job.process = null;
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    };

    child.on('error', (error) => {
      finish(
        new DownloadError('無法啟動 ZIP 打包工具。', {
          code: error.code === 'ENOENT' ? 'MISSING_ZIP' : error.code,
          output: output.join('\n'),
        }),
      );
    });

    child.on('close', (exitCode, signal) => {
      if (job.cancelRequested) {
        finish(new DownloadError('下載已取消。', { code: 'CANCELED' }));
        return;
      }

      if (job.resourceLimitExceeded) {
        finish(new DownloadError('下載工作超過檔案大小限制。', { code: 'MAX_JOB_BYTES' }));
        return;
      }

      if (job.timeoutExceeded) {
        finish(new DownloadError('下載工作超過執行時間限制。', { code: 'DOWNLOAD_TIMEOUT' }));
        return;
      }

      if (exitCode !== 0) {
        finish(
          new DownloadError('ZIP 打包失敗。', {
            code: signal || `ZIP_EXIT_${exitCode}`,
            output: output.join('\n'),
          }),
        );
        return;
      }

      finish(null, { output: output.join('\n') });
    });
  });
}

module.exports = { runZip };
