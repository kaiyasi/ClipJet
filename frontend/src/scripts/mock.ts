import { el } from './dom';
import { state } from './state';
import { renderJob } from './render';
import type { Job } from './types';

export function stopMockTimer() {
  if (state.mockTimer !== undefined) {
    window.clearInterval(state.mockTimer);
    state.mockTimer = undefined;
  }
}

function createMockJob(): Job {
  const extension = state.selectedFormat;
  const sourceUrl = el.urlInput?.value.trim() || '';
  const items = state.selectedScope === 'playlist'
    ? Array.from({ length: 4 }, (_, index) => ({
      id: String(index + 1).padStart(4, '0'),
      filename: `${String(index + 1).padStart(2, '0')} - demo-track-${index + 1}.${extension}`,
      size: state.selectedFormat === 'mp4' ? 18 * 1024 * 1024 + index * 3 * 1024 * 1024 : 5 * 1024 * 1024 + index * 512 * 1024,
      title: `播放清單影片 ${index + 1}`,
      sourceUrl,
    }))
    : null;

  return {
    id: `demo-${Date.now()}`,
    status: 'queued',
    phase: '建立模擬工作',
    format: state.selectedFormat,
    scope: state.selectedScope,
    videoQuality: state.selectedVideoQuality,
    audioQuality: state.selectedAudioQuality,
    mock: true,
    progress: 0,
    speed: null,
    eta: null,
    filename: state.selectedScope === 'playlist' ? 'clipjet-demo-playlist.zip' : `clipjet-demo.${extension}`,
    itemCount: items?.length || null,
    items,
    sourceUrl,
    sourceTitle: state.selectedScope === 'playlist' ? 'YouTube 播放清單來源' : 'YouTube 影片來源',
    error: null,
  };
}

export function startMockDownload() {
  stopMockTimer();
  const demoJob = createMockJob();
  let progress = 0;
  state.currentJobId = demoJob.id;
  renderJob(demoJob);

  state.mockTimer = window.setInterval(() => {
    if (state.currentJobId !== demoJob.id) {
      stopMockTimer();
      return;
    }

    progress = Math.min(100, progress + (demoJob.scope === 'playlist' ? 8 : 10));
    const completed = progress >= 100;
    const phases = demoJob.format === 'mp4'
      ? ['讀取影片資訊', '下載影音串流', '合併 MP4']
      : ['讀取影片資訊', '下載音訊串流', '轉換 MP3'];
    const phaseIndex = Math.min(phases.length - 1, Math.floor(progress / 34));
    const phase = demoJob.scope === 'playlist'
      ? completed ? '播放清單整理完成' : `下載第 ${Math.min(4, Math.floor(progress / 25) + 1)}/4 項`
      : completed ? '模擬轉檔完成' : phases[phaseIndex];

    renderJob({
      ...demoJob,
      status: completed ? 'completed' : 'running',
      phase,
      progress,
      speed: completed ? null : '4.8 MiB/s',
      eta: completed ? null : `~${Math.max(1, Math.ceil((100 - progress) / 10))}s`,
    });

    if (completed) {
      stopMockTimer();
      state.currentJobId = null;
    }
  }, 650);
}
