import { el, setHidden } from './dom';
import { state } from './state';
import { hasPlaylistId } from './format';
import type { Scope, Format, VideoQuality, AudioQuality, PanelView, Job } from './types';

export function setPanelView(view: PanelView) {
  el.recordShell?.classList.toggle('is-result', view === 'result');
  setHidden(el.form, view !== 'form');
  setHidden(el.progressPanel, view !== 'progress');
  setHidden(el.resultPanel, view !== 'result');
}

export function setMessage(message: string, tone: 'error' | 'info' = 'error') {
  if (!el.formMessage) return;
  el.formMessage.textContent = message;
  el.formMessage.dataset.tone = tone;
  el.formMessage.hidden = !message;
}

export function setBusy(busy: boolean) {
  if (el.submitButton) {
    el.submitButton.disabled = busy;
    el.submitButton.classList.toggle('is-loading', busy);
    el.submitButton.querySelector('span:first-child')!.textContent = busy ? '處理中…' : '開始下載';
  }

  el.urlInput?.toggleAttribute('disabled', busy);
  if (el.pasteButton) el.pasteButton.setAttribute('aria-disabled', String(busy));
  el.pasteButton?.classList.toggle('is-disabled', busy);
  document.querySelectorAll<HTMLButtonElement>('[data-scope], [data-format], [data-video-quality], [data-audio-quality]').forEach((button) => {
    button.disabled = busy;
  });
  if (el.cancelButton) el.cancelButton.disabled = !busy;
}

export function selectScope(scope: Scope, automatic = false) {
  state.selectedScope = scope;
  if (!automatic) state.scopeAutoDetected = false;
  document.querySelectorAll<HTMLButtonElement>('[data-scope]').forEach((button) => {
    const active = button.dataset.scope === scope;
    button.classList.toggle('is-selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

export function selectFormat(format: Format) {
  state.selectedFormat = format;
  document.querySelectorAll<HTMLButtonElement>('[data-format]').forEach((button) => {
    const active = button.dataset.format === format;
    button.classList.toggle('is-selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
  setHidden(el.videoQualityGroup, format !== 'mp4');
  setHidden(el.audioQualityGroup, format !== 'mp3');
}

export function selectVideoQuality(quality: VideoQuality) {
  state.selectedVideoQuality = quality;
  document.querySelectorAll<HTMLButtonElement>('[data-video-quality]').forEach((button) => {
    const active = button.dataset.videoQuality === quality;
    button.classList.toggle('is-selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

export function selectAudioQuality(quality: AudioQuality) {
  state.selectedAudioQuality = quality;
  document.querySelectorAll<HTMLButtonElement>('[data-audio-quality]').forEach((button) => {
    const active = button.dataset.audioQuality === quality;
    button.classList.toggle('is-selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

export function syncScopeFromUrl(announce = false) {
  if (!el.urlInput) return;
  const isPlaylist = hasPlaylistId(el.urlInput.value.trim());
  if (isPlaylist) {
    if (state.selectedScope !== 'playlist') selectScope('playlist', true);
    state.scopeAutoDetected = true;
    if (announce) setMessage('偵測到播放清單連結，已切換為整份播放清單。', 'info');
    return;
  }

  if (state.scopeAutoDetected) {
    selectScope('video', true);
    state.scopeAutoDetected = false;
  }
}

export function setProgress(job: Job) {
  const percent = Math.max(0, Math.min(100, Math.round(job.progress || 0)));
  if (el.progressTitle) el.progressTitle.textContent = job.scope === 'playlist' ? '播放清單正在整理。' : '你的檔案正在整理。';
  if (el.progressPercent) el.progressPercent.textContent = `${percent}%`;
  if (el.progressBar) el.progressBar.style.width = `${percent}%`;
  if (el.progressPhase) el.progressPhase.textContent = job.phase || '處理中';
  if (el.progressSpeed) el.progressSpeed.textContent = job.speed || '—';
  if (el.progressEta) el.progressEta.textContent = job.eta ? `ETA ${job.eta}` : 'ETA —';
}
