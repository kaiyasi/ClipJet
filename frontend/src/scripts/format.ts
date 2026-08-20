import { fallbackThumbnail } from './config';
import type { Job } from './types';

export function extractVideoId(value: string) {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const candidate = hostname === 'youtu.be'
      ? pathParts[0]
      : parsed.searchParams.get('v') || (['shorts', 'embed', 'live'].includes(pathParts[0]) ? pathParts[1] : undefined);
    return candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function hasPlaylistId(value: string) {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    return ['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(hostname)
      && Boolean(parsed.searchParams.get('list'));
  } catch {
    return false;
  }
}

export function safeThumbnailUrl(value: string) {
  try {
    const parsed = new URL(value);
    const allowedHost = ['i.ytimg.com', 'img.youtube.com'].includes(parsed.hostname.toLowerCase());
    return parsed.protocol === 'https:' && allowedHost ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function getThumbnailUrl(sourceUrl: string, thumbnailUrl?: string) {
  const videoId = extractVideoId(sourceUrl);
  return safeThumbnailUrl(thumbnailUrl || '')
    || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : fallbackThumbnail);
}

export function getQualityLabel(job: Job) {
  return job.format === 'mp4'
    ? job.videoQuality === 'best' ? '最高畫質' : `${job.videoQuality}p`
    : job.audioQuality.toUpperCase();
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function escapeHtml(value: string) {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  };
  return value.replace(/[&<>'"]/g, (character) => entities[character] || character);
}
