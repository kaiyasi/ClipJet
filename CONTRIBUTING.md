# Contributing to ClipJet

Thanks for your interest in improving ClipJet! This is a small project, so the
process is lightweight.

## Ground rules

- ClipJet is for downloading content you own or are authorized to download.
  Please keep contributions aligned with that purpose; features whose primary
  aim is to bypass access controls or Terms of Service are out of scope.
- By contributing, you agree that your contributions are licensed under the
  project's [KYL Open License](LICENSE).

## Development setup

See the [root README](README.md) for prerequisites (`yt-dlp`, `ffmpeg`, `zip`,
Node.js). Then:

```bash
# Backend (no dependencies to install)
cd backend
npm run lint
npm run check

# Frontend
cd frontend
npm install
npm run check
npm run build
```

## Coding conventions

- Match the style of the surrounding code. The repo ships an `.editorconfig`, a
  shared Prettier config, and ESLint for the backend (`npm run lint` / `npm run
  format`).
- Backend code uses only Node.js built-in modules — please avoid adding runtime
  npm dependencies unless there is a strong reason.
- Keep modules focused; `backend/src/` and `frontend/src/scripts/` are split into
  small single-purpose files.

## Pull requests

1. Fork and create a feature branch.
2. Keep changes focused and describe the intent in the PR.
3. Make sure lint, type check, and build pass locally (CI runs the same).

## Reporting issues

When filing a bug, include your OS, Node.js version, `yt-dlp --version`, the
command or request you ran, and the observed vs. expected behavior. Please do not
include full URLs of private or unauthorized content.
