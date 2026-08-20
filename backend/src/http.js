'use strict';

const path = require('node:path');

const { HttpError } = require('./errors');
const { CORS_ORIGINS, MAX_REQUEST_BYTES } = require('./config');
const { getClientIp } = require('./client-ip');
const { recordInvalidRequest } = require('./rate-limit');

function addCorsHeaders(req, res) {
  const requestOrigin = req.headers.origin;

  if (CORS_ORIGINS.has('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (requestOrigin && CORS_ORIGINS.has(requestOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Disposition, Content-Length',
  );
}

function addSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store');
}

function sendJson(req, res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  addCorsHeaders(req, res);
  addSecurityHeaders(res);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

function sendError(req, res, error) {
  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  const message =
    error instanceof HttpError
      ? error.message
      : '伺服器發生未預期錯誤，請稍後再試。';

  if (statusCode >= 500) {
    console.error('[ClipJet] request error:', error);
  }

  if ([400, 404, 413, 415].includes(statusCode)) {
    recordInvalidRequest(getClientIp(req));
  }

  const headers = {};
  if (error.retryAfterSeconds) {
    headers['Retry-After'] = String(error.retryAfterSeconds);
  }

  sendJson(req, res, statusCode, {
    error: {
      code: error.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST'),
      message,
    },
  }, headers);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let totalBytes = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      if (settled) {
        return;
      }

      totalBytes += chunk.length;
      if (totalBytes > MAX_REQUEST_BYTES) {
        settled = true;
        req.resume();
        reject(new HttpError(413, '請求內容過大。'));
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) {
        return;
      }

      settled = true;
      const rawBody = Buffer.concat(chunks).toString('utf8');

      if (!rawBody.trim()) {
        reject(new HttpError(400, '請提供請求內容。'));
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch {
        reject(new HttpError(400, '請提供有效的 JSON。'));
      }
    });

    req.on('error', (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

function contentDisposition(filename) {
  const safeFilename = path
    .basename(String(filename || 'download'))
    .replace(/[\r\n"]/g, '_');
  const fallbackFilename =
    safeFilename.replace(/[^\x20-\x7e]/g, '_').replace(/\\/g, '_') || 'download';

  return `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`;
}

module.exports = {
  addCorsHeaders,
  addSecurityHeaders,
  sendJson,
  sendError,
  readJsonBody,
  contentDisposition,
};
