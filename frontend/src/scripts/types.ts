export type Scope = 'video' | 'playlist';
export type Format = 'mp4' | 'mp3';
export type VideoQuality = 'best' | '1080' | '720' | '480' | '360';
export type AudioQuality = '320k' | '256k' | '192k' | '128k';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

export type JobItem = {
  id: string;
  filename: string;
  size: number;
  downloadUrl?: string;
  title?: string;
  sourceUrl?: string;
  thumbnailUrl?: string;
};

export type Job = {
  id: string;
  status: JobStatus;
  phase: string;
  format: Format;
  scope: Scope;
  videoQuality: VideoQuality;
  audioQuality: AudioQuality;
  mock?: boolean;
  progress: number;
  speed: string | null;
  eta: string | null;
  filename: string | null;
  itemCount: number | null;
  items: JobItem[] | null;
  downloadUrl?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  thumbnailUrl?: string;
  error: string | null;
};

export type JobResponse = { job: Job };
export type ErrorResponse = { error?: { message?: string } };
export type PanelView = 'form' | 'progress' | 'result';
