# ClipJet Frontend

The public ClipJet UI, built with Astro, TypeScript, and plain CSS. It uses an
editorial, album-tracklist-inspired layout with blue stage lighting and a coral
accent. No third-party character art, stills, or logos are used.

## Running

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

The frontend serves on `http://127.0.0.1:4321` by default and talks to the
backend API at `http://127.0.0.1:3000`. Change `PUBLIC_API_BASE_URL` if your
backend lives elsewhere.

## What the UI does

- Single video or full playlist
- MP4 or MP3, with selectable video/audio quality
- Asynchronous job progress and cancellation
- Whole-playlist ZIP plus per-item downloads once complete
- Backend engine status shown on load
- A mock download flow in Astro dev mode that previews progress and the completed
  screen without producing real media files

The frontend uses the public API with no login flow; the download job ID acts as
the backend's unguessable job token.

## Mock mode

During local development without `yt-dlp` installed, the UI defaults to mock
mode. To force the real API, set this in `.env`:

```bash
PUBLIC_MOCK_DOWNLOADS=false
```

Production builds never enable mock mode by default; only an explicit
`PUBLIC_MOCK_DOWNLOADS=true` simulates downloads.

## Source layout

`src/scripts/` is split into focused modules: `api` (backend calls), `dom`
(element registry), `state` (shared UI state), `format` (pure URL/format
helpers), `ui`, `render`, and `mock`, wired together by `app.ts`.
