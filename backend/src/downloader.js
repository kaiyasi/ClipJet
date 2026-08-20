'use strict';

const fsp = require('node:fs').promises;
const path = require('node:path');

const { DownloadError } = require('./errors');
const { MAX_CONCURRENT_DOWNLOADS, FORMAT_CONFIG } = require('./config');
const { jobs, queuedJobIds, runtime } = require('./state');
const { updateJob } = require('./job-model');
const { recordSuccessfulJob } = require('./rate-limit');
const { dependencyStatus, ensureDependencies } = require('./deps');
const { friendlyDownloadError } = require('./error-map');
const { buildVideoFormat, buildYtDlpArgs, runYtDlp } = require('./ytdlp');
const { ensureJobWithinSize, startResourceMonitor } = require('./resource-monitor');
const {
  pathWithoutExtension,
  findOutputFile,
  findPlaylistFiles,
  readYtDlpMetadata,
} = require('./output-files');
const { runZip } = require('./archive');
const {
  removeJobDirectory,
  scheduleCleanup,
  failDownload,
  removeStaleWorkDirectories,
} = require('./job-lifecycle');

// Orchestrates one job end to end: environment check, download, post-processing,
// packaging and completion. The individual steps live in the sibling modules
// required above; this function is the sequence that ties them together.
async function runDownload(job) {
  updateJob(job, {
    status: 'running',
    phase: '檢查下載環境',
    progress: 1,
  });
  await fsp.mkdir(job.outputDir, { recursive: true });
  const resourceMonitor = startResourceMonitor(job);

  try {
    const dependencies = await ensureDependencies();
    updateJob(job, {
      phase: '取得影片資訊',
      progress: Math.max(job.progress, 3),
    });

    if (job.scope === 'playlist' && !dependencies.zip.available) {
      throw new DownloadError('找不到 zip 打包工具。', { code: 'MISSING_ZIP' });
    }

    if (job.scope === 'playlist') {
      await fsp.mkdir(path.join(job.outputDir, 'items'), { recursive: true });
    }

    updateJob(job, {
      phase: '下載中',
      progress: Math.max(job.progress, 5),
    });
    const result = await runYtDlp(job, buildYtDlpArgs(job));
    updateJob(job, {
      phase: job.format === 'mp3' ? '轉換音訊' : '合併影音',
      progress: Math.max(job.progress, 90),
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    updateJob(job, {
      phase: '整理下載檔案',
      progress: Math.max(job.progress, 96),
    });
    const metadataRecords = await readYtDlpMetadata(job);
    await ensureJobWithinSize(job);
    let filePath;
    let itemCount = null;

    if (job.scope === 'playlist') {
      const playlistFiles = await findPlaylistFiles(job);
      if (playlistFiles.length === 0) {
        throw new DownloadError('播放清單下載完成，但找不到輸出檔案。', {
          output: result.output,
        });
      }

      itemCount = playlistFiles.length;
      const items = [];
      for (let index = 0; index < playlistFiles.length; index += 1) {
        const itemFilePath = playlistFiles[index];
        const itemStat = await fsp.stat(itemFilePath);
        const itemFileKey = path.resolve(pathWithoutExtension(itemFilePath));
        const metadata = metadataRecords.find(
          (record) => path.resolve(record.filePath) === itemFileKey,
        ) || metadataRecords.find(
          (record) => record.playlistIndex === index + 1,
        );
        items.push({
          id: String(index + 1).padStart(4, '0'),
          filename: path.basename(itemFilePath),
          size: itemStat.size,
          filePath: itemFilePath,
          title: metadata?.title || path.basename(itemFilePath).replace(/\.[^.]+$/, ''),
          sourceUrl: metadata?.sourceUrl || job.url,
          thumbnailUrl: metadata?.thumbnailUrl || null,
        });
      }

      updateJob(job, {
        items,
        sourceTitle: metadataRecords.find((record) => record.playlistTitle)?.playlistTitle
          || 'YouTube 播放清單來源',
      });
      filePath = path.join(job.outputDir, `clipjet-${job.id.slice(0, 8)}-playlist.zip`);
      updateJob(job, { phase: '打包播放清單', progress: 99, itemCount });
      await runZip(job, filePath);
    } else {
      filePath = await findOutputFile(job, result.printedPaths);
      const fileKey = filePath ? path.resolve(pathWithoutExtension(filePath)) : null;
      const metadata = (fileKey && metadataRecords.find(
        (record) => path.resolve(record.filePath) === fileKey,
      )) || metadataRecords[0];
      updateJob(job, {
        sourceTitle: metadata?.title || 'YouTube 影片來源',
        sourceUrl: metadata?.sourceUrl || job.url,
        thumbnailUrl: metadata?.thumbnailUrl || null,
      });
    }

    await ensureJobWithinSize(job);

    if (!filePath) {
      throw new DownloadError('下載完成，但找不到輸出檔案。', {
        output: result.output,
      });
    }

    const fileStat = await fsp.stat(filePath);
    if (!fileStat.isFile() || fileStat.size === 0) {
      throw new DownloadError('輸出檔案無效或為空檔案。');
    }

    const extension =
      job.scope === 'playlist' ? 'zip' : FORMAT_CONFIG[job.format].extension;
    updateJob(job, {
      status: 'completed',
      phase: '下載完成',
      progress: 100,
      speed: null,
      eta: null,
      filename:
        job.scope === 'playlist'
          ? `clipjet-${job.id.slice(0, 8)}-playlist.zip`
          : `clipjet-${job.id.slice(0, 8)}.${extension}`,
      itemCount,
      filePath,
    });

    recordSuccessfulJob(job);
    scheduleCleanup(job);
  } finally {
    clearInterval(resourceMonitor);
  }
}

function pumpQueue() {
  while (runtime.activeJobCount < MAX_CONCURRENT_DOWNLOADS && queuedJobIds.length > 0) {
    const jobId = queuedJobIds.shift();
    const job = jobs.get(jobId);

    if (!job || job.status !== 'queued') {
      continue;
    }

    runtime.activeJobCount += 1;
    runDownload(job)
      .catch((error) => failDownload(job, error))
      .catch((error) => {
        console.error(`[ClipJet] failed to finalize job ${job.id}:`, error);
      })
      .finally(() => {
        runtime.activeJobCount -= 1;
        pumpQueue();
      });
  }
}

// Public surface of the download subsystem. Handlers, the server bootstrap and
// tests import these names from here; the implementations now live in the
// focused sibling modules and are re-exported to keep that surface stable.
module.exports = {
  runDownload,
  pumpQueue,
  dependencyStatus,
  friendlyDownloadError,
  buildVideoFormat,
  buildYtDlpArgs,
  failDownload,
  scheduleCleanup,
  removeJobDirectory,
  removeStaleWorkDirectories,
};
