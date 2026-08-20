# ClipJet Backend

An HTTP API for managing download jobs. It supports single YouTube videos and
full playlists, producing MP4, MP3, or a playlist ZIP. **Only download content
you own or are authorized to download, and respect the relevant terms of service
and copyright law.**

It uses no npm dependencies — only Node.js built-in modules.

## Requirements

- Node.js 20 or newer
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [ffmpeg](https://ffmpeg.org/)
- `zip` (required for playlist packaging)

`yt-dlp` and `ffmpeg` must be runnable via `PATH`; playlists additionally need
`zip`. You can also point at full paths with `YTDLP_BIN`, `FFMPEG_BIN`, and
`ZIP_BIN`.

By default the backend runs yt-dlp's JavaScript challenge solver with `node` and
loads the official EJS component via `ejs:github`; the YouTube client is fixed to
`web_embedded` to reduce the chance of a public server receiving a 403 mid-stream.
If your environment already has a working yt-dlp configuration, override with
`YTDLP_JS_RUNTIME`, `YTDLP_REMOTE_COMPONENTS`, and `YTDLP_EXTRACTOR_ARGS`.

## Running

```bash
cd backend
npm run check
npm start
```

By default it listens only on `http://127.0.0.1:3000`. CORS allows
`http://localhost:5173` and `http://127.0.0.1:5173` out of the box (Vite dev).

To allow Docker or other devices on your LAN:

```bash
HOST=0.0.0.0 CORS_ORIGIN=http://localhost:5173 npm start
```

For a public deployment, place it behind an HTTPS reverse proxy and set the real
frontend origin and trusted proxy hop count:

```bash
HOST=0.0.0.0 \
CORS_ORIGIN=https://your-frontend.example \
TRUST_PROXY_HOPS=1 \
npm start
```

Do not expose the raw Node.js port directly to the internet.

## API

### `GET /api/health`

Reports whether the backend and `yt-dlp` / `ffmpeg` are ready;
`capabilities.playlist` also indicates whether `zip` is available. Returns `200`
when the core tools are usable, otherwise `503`.

### `POST /api/downloads`

Create a download job:

```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "format": "mp4",
  "videoQuality": "1080",
  "audioQuality": "192k"
}
```

Playlists can use a `playlist` URL, or set `scope` explicitly:

```json
{
  "url": "https://www.youtube.com/playlist?list=PLAYLIST_ID",
  "format": "mp3",
  "audioQuality": "256k",
  "scope": "playlist"
}
```

`format` is `mp4` or `mp3`; `scope` is `video` or `playlist`. For MP4,
`videoQuality` is one of `best`, `1080`, `720`, `480`, `360`; for MP3,
`audioQuality` is one of `320k`, `256k`, `192k`, `128k`. When quality is omitted,
the defaults are MP4 `1080` and MP3 `192k`. When `scope` is omitted, only
playlist URLs are auto-detected as `playlist`; URLs carrying a video ID stay
single-video. A finished playlist is packaged into one ZIP. Returns `202` with a
`job.id` on success.

### `GET /api/downloads/:jobId`

Poll job status. `status` is one of:

- `queued` — waiting to run
- `running` — downloading or converting
- `completed` — file is ready
- `failed` — the download failed
- `canceled` — canceled

Once completed, the response includes `downloadUrl`.

A completed single-video job also returns `sourceTitle`, `sourceUrl`, and
`thumbnailUrl` when available; `sourceTitle` is the YouTube title read by yt-dlp,
falling back to a generic label only when the source returns no metadata.

A completed playlist job also returns an `items` array; each item has its own
`downloadUrl` so it can be fetched individually without re-downloading the whole
playlist. Each item also provides `title`, `sourceUrl`, and `thumbnailUrl` when
available.

### `GET /api/downloads/:jobId/file`

Streams the finished MP4, MP3, or playlist ZIP. Files exist only in the job's
temp directory and are cleaned up after five minutes of transfer inactivity by
default; there is no database and no download history.

### `GET /api/downloads/:jobId/items/:itemId`

Streams a single MP4 or MP3 item from a playlist. After a playlist completes, use
the `items[].downloadUrl` values from `GET /api/downloads/:jobId`.

### `DELETE /api/downloads/:jobId`

Cancels a queued or running job.

## Security boundaries

- Only allowlisted hosts are accepted: `youtube.com`, `www.youtube.com`,
  `m.youtube.com`, `music.youtube.com`, and `youtu.be`.
- Single videos use `--no-playlist`; playlists use `--yes-playlist`, writing each
  item to an isolated directory before packaging into a ZIP.
- Child processes are launched with argument arrays, never through a shell.
- Output files stay within each job's own temp directory, and the path is
  re-checked to be inside that directory before a file is served.
- Downloads are bounded by a global queue, a global concurrency limit, and a
  per-IP concurrency limit, with per-IP create-request rate limiting.
- Repeated invalid requests, excessive jobs, or repeated failures trigger a
  temporary IP block; client-IP resolution does not trust `X-Forwarded-For` by
  default.
- Each job has a 30-minute download timeout and an 8 GiB temp-size cap to avoid
  unbounded CPU, bandwidth, and disk use; tune with `DOWNLOAD_TIMEOUT_MS` and
  `MAX_JOB_BYTES`.
- Temp data is cleaned on completion, cancellation, failure, transfer idle
  timeout, or server restart.
- Responses include basic security headers, and error messages do not echo raw
  yt-dlp output, avoiding leakage of local paths or environment details.

This is a login-less public MVP; the job ID is the unguessable access token for a
download job. For multi-instance deployments, move the IP rate limiting and job
queue to a shared service (e.g. Redis), otherwise each instance counts limits
independently.
