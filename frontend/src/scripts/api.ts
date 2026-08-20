import { apiUrl } from './config';
import type {
  Job,
  JobResponse,
  ErrorResponse,
  Scope,
  Format,
  VideoQuality,
  AudioQuality,
} from './types';

export type DownloadRequest = {
  url: string;
  format: Format;
  scope: Scope;
  videoQuality: VideoQuality;
  audioQuality: AudioQuality;
};

export type HealthResponse = {
  ok: boolean;
  capabilities?: { video?: boolean; playlist?: boolean };
};

export async function readError(response: Response) {
  try {
    const payload = await response.json() as ErrorResponse;
    return payload.error?.message || `請求失敗（${response.status}）。`;
  } catch {
    return `請求失敗（${response.status}）。`;
  }
}

export async function createDownloadJob(request: DownloadRequest): Promise<Job> {
  const response = await fetch(apiUrl('/api/downloads'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json() as JobResponse).job;
}

export async function fetchDownloadJob(id: string): Promise<Job> {
  const response = await fetch(apiUrl(`/api/downloads/${id}`), { cache: 'no-store' });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json() as JobResponse).job;
}

export async function cancelDownloadJob(id: string): Promise<void> {
  await fetch(apiUrl(`/api/downloads/${id}`), { method: 'DELETE' });
}

export async function fetchHealth(): Promise<HealthResponse> {
  // The health endpoint returns 503 with a valid body when degraded, so the
  // HTTP status is surfaced rather than thrown.
  const response = await fetch(apiUrl('/api/health'), { cache: 'no-store' });
  const payload = await response.json() as Omit<HealthResponse, 'ok'>;
  return { ok: response.ok, capabilities: payload.capabilities };
}
