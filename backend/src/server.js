'use strict';

const http = require('node:http');
const fsp = require('node:fs').promises;

const {
  PORT,
  HOST,
  DOWNLOAD_ROOT,
  CORS_ORIGINS,
  RATE_LIMIT_WINDOW_MS,
} = require('./config');
const { jobs } = require('./state');
const { sendError } = require('./http');
const { cleanupIpStates } = require('./rate-limit');
const { routeRequest } = require('./routes');
const {
  removeStaleWorkDirectories,
  removeJobDirectory,
} = require('./downloader');

const server = http.createServer((req, res) => {
  Promise.resolve()
    .then(() => routeRequest(req, res))
    .catch((error) => sendError(req, res, error));
});

server.on('clientError', (error, socket) => {
  console.error('[ClipJet] client error:', error.message);
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

async function start() {
  await fsp.mkdir(DOWNLOAD_ROOT, { recursive: true });
  await removeStaleWorkDirectories();

  await new Promise((resolve, reject) => {
    const handleListenError = (error) => reject(error);
    server.once('error', handleListenError);
    server.listen(PORT, HOST, () => {
      server.off('error', handleListenError);
      console.log(`[ClipJet] backend listening on http://${HOST}:${PORT}`);
      console.log(`[ClipJet] download directory: ${DOWNLOAD_ROOT}`);
      console.log(`[ClipJet] CORS origins: ${[...CORS_ORIGINS].join(', ')}`);
      resolve();
    });
  });
}

async function shutdown(signal) {
  console.log(`[ClipJet] received ${signal}, shutting down...`);
  clearInterval(ipCleanupTimer);

  for (const job of jobs.values()) {
    if (job.process) {
      job.cancelRequested = true;
      job.process.kill('SIGTERM');
    }
  }

  await Promise.all([...jobs.values()].map((job) => removeJobDirectory(job)));
  server.close(() => process.exit(0));
}

const ipCleanupTimer = setInterval(cleanupIpStates, RATE_LIMIT_WINDOW_MS);
ipCleanupTimer.unref?.();

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

start().catch((error) => {
  console.error('[ClipJet] failed to start:', error);
  process.exitCode = 1;
});
