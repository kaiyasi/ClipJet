import { root, mockDownloads, fallbackThumbnail, PROGRESS_POLL_INTERVAL_MS } from './config';
import { el, watchBrowserHintAttributes } from './dom';
import { state } from './state';
import { hasPlaylistId } from './format';
import {
  setBusy,
  setMessage,
  setPanelView,
  setProgress,
  selectScope,
  selectFormat,
  selectVideoQuality,
  selectAudioQuality,
  syncScopeFromUrl,
} from './ui';
import { renderJob } from './render';
import { startMockDownload, stopMockTimer } from './mock';
import {
  createDownloadJob,
  fetchDownloadJob,
  cancelDownloadJob,
  fetchHealth,
} from './api';
import type { Scope, Format, VideoQuality, AudioQuality } from './types';

watchBrowserHintAttributes();

async function pollJob() {
  if (!state.currentJobId) return;

  try {
    const job = await fetchDownloadJob(state.currentJobId);
    renderJob(job);

    if (job.status === 'queued' || job.status === 'running') {
      state.pollTimer = window.setTimeout(pollJob, PROGRESS_POLL_INTERVAL_MS);
    } else {
      state.currentJobId = null;
      state.pollTimer = undefined;
    }
  } catch (error) {
    state.currentJobId = null;
    setBusy(false);
    setMessage(error instanceof Error ? error.message : '無法查詢下載進度。');
    setPanelView('form');
  }
}

async function submitDownload(event: SubmitEvent) {
  event.preventDefault();
  if (!el.urlInput || !el.urlInput.value.trim() || state.currentJobId) return;

  setMessage('');
  setBusy(true);
  setPanelView('progress');
  setProgress({
    id: '', status: 'queued', phase: '建立工作中', format: state.selectedFormat, scope: state.selectedScope,
    videoQuality: state.selectedVideoQuality, audioQuality: state.selectedAudioQuality,
    progress: 0, speed: null, eta: null, filename: null, itemCount: null, items: null, error: null,
  });

  if (mockDownloads) {
    startMockDownload();
    return;
  }

  try {
    const job = await createDownloadJob({
      url: el.urlInput.value.trim(),
      format: state.selectedFormat,
      scope: state.selectedScope,
      videoQuality: state.selectedVideoQuality,
      audioQuality: state.selectedAudioQuality,
    });
    state.currentJobId = job.id;
    renderJob(job);
    void pollJob();
  } catch (error) {
    setBusy(false);
    setPanelView('form');
    setMessage(error instanceof Error ? error.message : '無法建立下載工作。');
  }
}

async function cancelDownload() {
  if (!state.currentJobId) return;
  el.cancelButton?.toggleAttribute('disabled', true);

  if (mockDownloads && state.currentJobId.startsWith('demo-')) {
    stopMockTimer();
    state.currentJobId = null;
    setBusy(false);
    setPanelView('form');
    setMessage('這次模擬下載已取消。', 'info');
    return;
  }

  try {
    await cancelDownloadJob(state.currentJobId);
  } finally {
    if (state.pollTimer) window.clearTimeout(state.pollTimer);
    state.pollTimer = undefined;
    state.currentJobId = null;
    setBusy(false);
    setPanelView('form');
    setMessage('這次下載已取消。', 'info');
  }
}

function resetForm() {
  stopMockTimer();
  if (state.pollTimer) window.clearTimeout(state.pollTimer);
  state.pollTimer = undefined;
  state.currentJobId = null;
  el.form?.reset();
  selectScope('video');
  selectFormat('mp4');
  selectVideoQuality('1080');
  selectAudioQuality('192k');
  setBusy(false);
  setMessage('');
  setPanelView('form');
  if (el.archiveDownload) {
    el.archiveDownload.hidden = true;
    el.archiveDownload.removeAttribute('href');
    el.archiveDownload.removeAttribute('data-preview-download');
  }
  el.urlInput?.focus();
}

async function pasteUrl() {
  if (!el.urlInput) return;

  if (!window.isSecureContext) {
    el.urlInput.focus();
    setMessage('目前頁面不是安全來源，瀏覽器不允許按鈕直接讀取剪貼簿；請先點輸入框，再按 Ctrl/⌘ + V 貼上。', 'info');
    return;
  }

  if (!navigator.clipboard?.readText) {
    el.urlInput.focus();
    setMessage('此瀏覽器沒有提供剪貼簿讀取功能，請先點輸入框，再按 Ctrl/⌘ + V 貼上。', 'info');
    return;
  }

  try {
    const value = await navigator.clipboard.readText();
    if (!value.trim()) {
      el.urlInput.focus();
      setMessage('剪貼簿目前沒有內容。', 'info');
      return;
    }

    el.urlInput.value = value.trim();
    el.urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    el.urlInput.focus();
    if (hasPlaylistId(el.urlInput.value)) {
      syncScopeFromUrl(true);
    } else {
      setMessage('連結已貼上。', 'info');
    }
  } catch {
    el.urlInput.focus();
    let permissionState: PermissionState | null = null;
    try {
      const permission = await navigator.permissions?.query({ name: 'clipboard-read' as PermissionName });
      permissionState = permission?.state || null;
    } catch {
      // Some browsers do not expose clipboard-read through Permissions API.
    }

    setMessage(
      permissionState === 'denied'
        ? '瀏覽器目前拒絕本網站讀取剪貼簿。請點網址列左側的網站設定，將「剪貼簿」改為允許後再按一次；也可以直接按 Ctrl/⌘ + V。'
        : '請在瀏覽器跳出的提示中允許本網站讀取剪貼簿；若沒有提示，請直接按 Ctrl/⌘ + V 貼上。',
      'info',
    );
  }
}

async function checkHealth() {
  if (!el.healthLabel) return;
  if (mockDownloads) {
    el.healthLabel.textContent = 'ENGINE / READY';
    el.healthLabel.parentElement?.classList.add('is-ready');
    return;
  }

  try {
    const health = await fetchHealth();
    const ready = health.ok && health.capabilities?.video;
    el.healthLabel.textContent = ready ? 'ENGINE / READY' : 'ENGINE / SETUP NEEDED';
    el.healthLabel.parentElement?.classList.toggle('is-ready', Boolean(ready));
  } catch {
    el.healthLabel.textContent = 'ENGINE / OFFLINE';
    el.healthLabel.parentElement?.classList.remove('is-ready');
  }
}

el.form?.addEventListener('submit', submitDownload);
el.urlInput?.addEventListener('input', () => syncScopeFromUrl());
el.urlInput?.addEventListener('change', () => syncScopeFromUrl(true));
el.urlInput?.addEventListener('paste', () => {
  window.setTimeout(() => syncScopeFromUrl(true), 0);
});
el.cancelButton?.addEventListener('click', () => void cancelDownload());
el.resetButton?.addEventListener('click', resetForm);
el.pasteButton?.addEventListener('click', () => {
  if (el.pasteButton!.getAttribute('aria-disabled') !== 'true') void pasteUrl();
});
document.querySelectorAll<HTMLButtonElement>('[data-scope]').forEach((button) => {
  button.addEventListener('click', () => selectScope(button.dataset.scope as Scope));
});
document.querySelectorAll<HTMLButtonElement>('[data-format]').forEach((button) => {
  button.addEventListener('click', () => selectFormat(button.dataset.format as Format));
});
document.querySelectorAll<HTMLButtonElement>('[data-video-quality]').forEach((button) => {
  button.addEventListener('click', () => selectVideoQuality(button.dataset.videoQuality as VideoQuality));
});
document.querySelectorAll<HTMLButtonElement>('[data-audio-quality]').forEach((button) => {
  button.addEventListener('click', () => selectAudioQuality(button.dataset.audioQuality as AudioQuality));
});
document.addEventListener('click', (event) => {
  const target = event.target instanceof Element
    ? event.target.closest<HTMLAnchorElement>('[data-preview-download]')
    : null;
  if (target) event.preventDefault();
});
document.addEventListener('error', (event) => {
  const image = event.target instanceof HTMLImageElement && event.target.dataset.sourcePreview === 'true'
    ? event.target
    : null;
  if (image && image.getAttribute('src') !== fallbackThumbnail) {
    image.src = fallbackThumbnail;
  }
}, true);
document.querySelector<HTMLButtonElement>('[data-theme-toggle]')?.addEventListener('click', () => {
  const next = root.dataset.theme === 'light' ? 'dark' : 'light';
  root.dataset.theme = next;
  localStorage.setItem('clipjet-theme', next);
});

const savedTheme = localStorage.getItem('clipjet-theme');
if (savedTheme === 'light' || savedTheme === 'dark') root.dataset.theme = savedTheme;
selectFormat(state.selectedFormat);
selectVideoQuality(state.selectedVideoQuality);
selectAudioQuality(state.selectedAudioQuality);
void checkHealth();
