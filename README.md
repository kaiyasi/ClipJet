# ClipJet

<p align="center">
  <img src="docs/assets/clipjet-readme-banner.png" alt="ClipJet media download desk banner" width="100%">
</p>

A small, self-hostable YouTube downloader: paste a link, pick a version, get an
MP4, MP3, or a ZIP of a whole playlist. It is a zero-dependency Node.js API
paired with a static [Astro](https://astro.build/) frontend.

> [!IMPORTANT]
> **Only download content you own or are authorized to download.** ClipJet is
> intended for personal, archival, and educational use. You are responsible for
> complying with YouTube's Terms of Service, copyright law, and any other
> applicable rules in your jurisdiction. The authors provide this software "as
> is" and take no responsibility for how it is used.

## Features

- Single video or full playlist
- **MP4** (video) or **MP3** (audio), with selectable quality
- Playlists are packaged into a single **ZIP**, with per-item downloads too
- Asynchronous jobs with live progress, cancellation, and engine status
- Ephemeral by design: files live in a temp directory and are auto-cleaned; no
  database, no accounts, no download history
- Hardened API: allowlisted YouTube hosts, path-traversal checks, per-IP rate
  limiting, resource/timeout caps, and security headers
- Mock mode for developing the UI without `yt-dlp` installed

## Architecture

| Part | Stack | Notes |
| --- | --- | --- |
| `backend/` | Node.js (built-in modules only, no npm deps) | HTTP API that drives `yt-dlp` / `ffmpeg` / `zip` and streams results |
| `frontend/` | Astro + TypeScript + plain CSS | Static site that talks to the backend API |

The backend shells out to external tools rather than bundling them, so the
runtime supply chain stays minimal.

## Prerequisites

- **Node.js** 20+ (backend), 22.12+ (frontend build)
- [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) on `PATH`
- [`ffmpeg`](https://ffmpeg.org/) on `PATH`
- `zip` on `PATH` (required for playlist packaging)

Binaries can also be pointed at explicitly via `YTDLP_BIN`, `FFMPEG_BIN`, and
`ZIP_BIN`.

## Quick start

### Backend

```bash
cd backend
cp .env.example .env      # optional; sensible defaults are built in
npm start                 # listens on http://127.0.0.1:3000 by default
```

The backend has no npm dependencies, so there is nothing to install.

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev               # http://127.0.0.1:4321
```

In Astro dev mode the UI defaults to **mock mode** (no real downloads) so you
can preview the flow without `yt-dlp`. Set `PUBLIC_MOCK_DOWNLOADS=false` to hit
the real backend. Production builds are always real.

## Configuration

All configuration is via environment variables; see
[`backend/.env.example`](backend/.env.example) and
[`frontend/.env.example`](frontend/.env.example) for the full list. Common ones:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` / `PORT` | `127.0.0.1` / `3000` | Backend listener |
| `CORS_ORIGIN` | `http://localhost:5173,http://127.0.0.1:5173` | Allowed frontend origins (comma-separated) |
| `TRUST_PROXY_HOPS` | `0` | Trusted reverse-proxy hops for client IP resolution |
| `DOWNLOAD_DIR` | OS temp dir | Where job work directories are created |
| `MAX_CONCURRENT_DOWNLOADS` | `2` | Global concurrent job limit |
| `DOWNLOAD_TIMEOUT_MS` / `MAX_JOB_BYTES` | 30 min / 8 GiB | Per-job time and size caps |
| `PUBLIC_API_BASE_URL` | `http://127.0.0.1:3000` | Frontend → backend API base |

When exposing the backend publicly, put it behind an HTTPS reverse proxy and set
`HOST`, `CORS_ORIGIN`, and `TRUST_PROXY_HOPS` accordingly. Do not expose the raw
Node port to the internet.

## API

The HTTP API is documented in [`backend/README.md`](backend/README.md). In short:

- `GET  /api/health` — dependency and queue status
- `POST /api/downloads` — create a job (returns `202` + `job.id`)
- `GET  /api/downloads/:jobId` — poll job status
- `GET  /api/downloads/:jobId/file` — download the finished file / ZIP
- `GET  /api/downloads/:jobId/items/:itemId` — download one playlist item
- `DELETE /api/downloads/:jobId` — cancel a job

## Development

```bash
# Backend
cd backend && npm run lint && npm run check

# Frontend
cd frontend && npm run check && npm run build
```

The repo ships an [`.editorconfig`](.editorconfig), a shared
[Prettier config](.prettierrc.json), and ESLint (backend). CI runs lint, type
check, and build via GitHub Actions.

## Project structure

```
backend/    Zero-dependency Node.js HTTP API (src/ is split into focused modules)
frontend/   Astro + TypeScript static UI
```

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Kaiyasi
