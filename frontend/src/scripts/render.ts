import { el, setHidden } from './dom';
import { apiUrl } from './config';
import { setBusy, setMessage, setPanelView, setProgress } from './ui';
import {
  escapeHtml,
  formatBytes,
  getQualityLabel,
  getThumbnailUrl,
} from './format';
import type { Job } from './types';

function renderItems(job: Job) {
  if (!el.tracklist || !el.trackItems || !el.trackCount) return;
  const sourceUrl = job.sourceUrl || el.urlInput?.value.trim() || '';
  const fallbackTitle = job.scope === 'playlist' ? 'YouTube 播放清單來源' : 'YouTube 影片來源';
  const items = job.items && job.items.length > 0
    ? job.items
    : [{
        id: '0001',
        filename: job.filename || `clipjet.${job.format}`,
        size: 0,
        downloadUrl: job.downloadUrl,
        title: job.sourceTitle || fallbackTitle,
        sourceUrl,
        thumbnailUrl: job.thumbnailUrl,
      }];
  const qualityLabel = getQualityLabel(job);
  const isPlaylist = job.scope === 'playlist';
  if (el.trackLabel) el.trackLabel.textContent = isPlaylist ? 'PLAYLIST / 播放清單' : 'FILE / 檔案';
  el.trackCount.textContent = isPlaylist
    ? `${items.length} VIDEO${items.length === 1 ? '' : 'S'}`
    : `${items.length} FILE${items.length === 1 ? '' : 'S'}`;
  el.trackItems.innerHTML = items.map((item) => {
    const itemTitle = escapeHtml(item.title || item.filename.replace(/\.(?:mp4|mp3|zip)$/i, ''));
    const itemName = escapeHtml(item.filename);
    const itemThumbnail = escapeHtml(getThumbnailUrl(item.sourceUrl || sourceUrl, item.thumbnailUrl));
    const itemSize = formatBytes(item.size);
    const itemDetails = escapeHtml(`${job.format.toUpperCase()} · ${qualityLabel}${itemSize === '—' ? '' : ` · ${itemSize}`}`);
    const downloadIcon = '<span class="track-download-symbol" aria-hidden="true"><svg class="download-glyph" viewBox="0 0 24 24" focusable="false"><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M4 21h16" /></svg></span>';
    const action = item.downloadUrl
      ? `<a class="track-download" href="${apiUrl(item.downloadUrl)}" download aria-label="下載 ${itemTitle}">${downloadIcon}</a>`
      : job.mock
        ? `<a class="track-download" href="#" data-preview-download aria-label="下載 ${itemTitle}">${downloadIcon}</a>`
        : '<span class="track-download is-disabled" aria-label="檔案尚未就緒">—</span>';

    return `
      <div class="track-item">
        <div class="track-thumb"><img src="${itemThumbnail}" data-source-preview="true" alt="" loading="lazy" /></div>
        <div class="track-info">
          <strong class="track-name">${itemTitle}</strong>
          <span class="track-detail">${itemDetails}</span>
          <small class="track-file">${itemName}</small>
        </div>
        ${action}
      </div>
    `;
  }).join('');
}

function renderCompleted(job: Job) {
  setPanelView('result');
  setBusy(false);
  if (el.archiveDownload) {
    el.archiveDownload.hidden = true;
    el.archiveDownload.removeAttribute('href');
    el.archiveDownload.removeAttribute('data-preview-download');
  }
  if (el.resultTitle) {
    el.resultTitle.textContent = job.scope === 'playlist'
      ? '播放清單，準備好了。'
      : '你的檔案，準備好了。';
  }
  if (el.resultSourceTitle) {
    el.resultSourceTitle.textContent = job.sourceTitle
      || (job.scope === 'playlist' ? 'YouTube 播放清單來源' : 'YouTube 影片來源');
  }
  if (el.resultSourceUrl) {
    el.resultSourceUrl.textContent = job.sourceUrl || el.urlInput?.value.trim() || '—';
  }
  if (el.resultThumbnail) {
    const sourceUrl = job.sourceUrl || el.urlInput?.value.trim() || '';
    el.resultThumbnail.src = getThumbnailUrl(sourceUrl, job.thumbnailUrl);
    el.resultThumbnail.alt = job.sourceTitle || '來源縮圖';
  }
  if (el.resultFormat) el.resultFormat.textContent = job.format.toUpperCase();
  if (el.resultQuality) el.resultQuality.textContent = getQualityLabel(job);
  if (el.resultScope) el.resultScope.textContent = job.scope === 'playlist' ? '整份播放清單' : '單支影片';

  if (el.archiveDownload && el.archiveLabel && el.archiveNote) {
    el.archiveDownload.hidden = false;
    const isPlaylist = job.scope === 'playlist';
    el.archiveDownload.classList.toggle('is-bundle', isPlaylist);
    el.archiveDownload.setAttribute('aria-label', isPlaylist ? '下載整個播放清單 ZIP' : `下載整個 ${job.format.toUpperCase()}`);
    if (el.archiveKind) {
      el.archiveKind.textContent = isPlaylist
        ? 'DOWNLOAD PLAYLIST / 下載整份播放清單 · ZIP'
        : `DOWNLOAD ${job.format.toUpperCase()} / 下載整個 ${job.format.toUpperCase()}`;
    }
    el.archiveLabel.textContent = isPlaylist ? '下載整個 ZIP' : `下載整個 ${job.format.toUpperCase()}`;
    const qualityLabel = job.format === 'mp4'
      ? job.videoQuality === 'best' ? '最高畫質' : `${job.videoQuality}p`
      : job.audioQuality.toUpperCase();
    el.archiveNote.textContent = isPlaylist
      ? `整份播放清單 · ${job.itemCount || 0} 部影片 · ZIP 打包`
      : `單支檔案 · ${qualityLabel} · 已完成轉檔`;

    if (job.downloadUrl) {
      el.archiveDownload.href = apiUrl(job.downloadUrl);
      el.archiveDownload.download = job.filename || '';
    } else {
      el.archiveDownload.href = '#';
      el.archiveDownload.removeAttribute('download');
      el.archiveDownload.dataset.previewDownload = 'true';
    }
  }

  setHidden(el.tracklist, false);
  renderItems(job);
}

function renderFailed(job: Job) {
  setPanelView('form');
  setBusy(false);
  setMessage(job.error || '下載失敗，請稍後再試。');
}

export function renderJob(job: Job) {
  if (job.status === 'completed') {
    renderCompleted(job);
    return;
  }

  if (job.status === 'failed' || job.status === 'canceled') {
    renderFailed(job);
    return;
  }

  setPanelView('progress');
  setProgress(job);
}
