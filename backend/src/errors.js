'use strict';

class HttpError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = options.code;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

class DownloadError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'DownloadError';
    this.code = details.code;
    this.output = details.output || '';
  }
}

module.exports = { HttpError, DownloadError };
