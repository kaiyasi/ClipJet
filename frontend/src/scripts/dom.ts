// Central registry of the elements the UI drives, plus the observer that keeps
// browser-injected hint attributes (title/accesskey) off our controls.

export const el = {
  form: document.querySelector<HTMLFormElement>('#download-form'),
  urlInput: document.querySelector<HTMLInputElement>('#video-url'),
  submitButton: document.querySelector<HTMLButtonElement>('[data-submit]'),
  pasteButton: document.querySelector<HTMLElement>('[data-paste]'),
  cancelButton: document.querySelector<HTMLButtonElement>('[data-cancel]'),
  resetButton: document.querySelector<HTMLButtonElement>('[data-reset]'),
  progressPanel: document.querySelector<HTMLElement>('[data-progress-panel]'),
  resultPanel: document.querySelector<HTMLElement>('[data-result-panel]'),
  recordShell: document.querySelector<HTMLElement>('.desk-card'),
  formMessage: document.querySelector<HTMLElement>('[data-form-message]'),
  healthLabel: document.querySelector<HTMLElement>('#health-label'),
  progressTitle: document.querySelector<HTMLElement>('[data-progress-title]'),
  progressPercent: document.querySelector<HTMLElement>('[data-progress-percent]'),
  progressBar: document.querySelector<HTMLElement>('[data-progress-bar]'),
  progressPhase: document.querySelector<HTMLElement>('[data-progress-phase]'),
  progressSpeed: document.querySelector<HTMLElement>('[data-progress-speed]'),
  progressEta: document.querySelector<HTMLElement>('[data-progress-eta]'),
  resultTitle: document.querySelector<HTMLElement>('[data-result-title]'),
  resultSourceTitle: document.querySelector<HTMLElement>('[data-result-source-title]'),
  resultSourceUrl: document.querySelector<HTMLElement>('[data-result-source-url]'),
  resultThumbnail: document.querySelector<HTMLImageElement>('[data-result-thumbnail]'),
  resultFormat: document.querySelector<HTMLElement>('[data-result-format]'),
  resultQuality: document.querySelector<HTMLElement>('[data-result-quality]'),
  resultScope: document.querySelector<HTMLElement>('[data-result-scope]'),
  archiveDownload: document.querySelector<HTMLAnchorElement>('[data-archive-download]'),
  archiveLabel: document.querySelector<HTMLElement>('[data-archive-label]'),
  archiveNote: document.querySelector<HTMLElement>('[data-archive-note]'),
  archiveKind: document.querySelector<HTMLElement>('[data-archive-kind]'),
  tracklist: document.querySelector<HTMLElement>('[data-tracklist]'),
  trackLabel: document.querySelector<HTMLElement>('[data-track-label]'),
  trackCount: document.querySelector<HTMLElement>('[data-track-count]'),
  trackItems: document.querySelector<HTMLElement>('[data-track-items]'),
  videoQualityGroup: document.querySelector<HTMLElement>('[data-quality-group="video"]'),
  audioQualityGroup: document.querySelector<HTMLElement>('[data-quality-group="audio"]'),
};

export function setHidden(element: HTMLElement | null, hidden: boolean) {
  if (element) element.hidden = hidden;
}

function stripBrowserHintAttributes(target: ParentNode = document) {
  if (target instanceof HTMLElement) {
    target.removeAttribute('title');
    target.removeAttribute('accesskey');
    target.removeAttribute('aria-keyshortcuts');
  }

  target.querySelectorAll<HTMLElement>('[title], [accesskey], [aria-keyshortcuts]').forEach((element) => {
    element.removeAttribute('title');
    element.removeAttribute('accesskey');
    element.removeAttribute('aria-keyshortcuts');
  });
}

// Runs once on import and then keeps watching for re-injected hint attributes.
export function watchBrowserHintAttributes() {
  stripBrowserHintAttributes();
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
        stripBrowserHintAttributes(mutation.target);
      }

      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          stripBrowserHintAttributes(node);
        }
      });
    });
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['title', 'accesskey', 'aria-keyshortcuts'],
    childList: true,
    subtree: true,
  });
}
