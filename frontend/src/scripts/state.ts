import type { Scope, Format, VideoQuality, AudioQuality } from './types';

// Single mutable store for the current selections and in-flight job. Kept as one
// object so modules share the same live reference (ES module `let` bindings
// cannot be reassigned by importers).
export const state = {
  selectedScope: 'video' as Scope,
  selectedFormat: 'mp4' as Format,
  selectedVideoQuality: '1080' as VideoQuality,
  selectedAudioQuality: '192k' as AudioQuality,
  scopeAutoDetected: false,
  currentJobId: null as string | null,
  pollTimer: undefined as number | undefined,
  mockTimer: undefined as number | undefined,
};
