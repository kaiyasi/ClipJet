export const root = document.documentElement;
export const apiBase = (root.dataset.apiBase || 'http://127.0.0.1:3000').replace(/\/$/, '');
export const mockDownloads = root.dataset.mockDownloads === 'true';
export const fallbackThumbnail = '/assets/clipjet-source-placeholder.png';
export const PROGRESS_POLL_INTERVAL_MS = 250;

export function apiUrl(path: string) {
  return `${apiBase}${path.startsWith('/') ? path : `/${path}`}`;
}
