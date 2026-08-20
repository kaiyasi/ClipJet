'use strict';

const net = require('node:net');
const crypto = require('node:crypto');

const { TRUST_PROXY_HOPS } = require('./config');

function normalizeIp(value) {
  const candidate = String(value || '').trim().replace(/^\[|\]$/g, '');
  if (!candidate) {
    return 'unknown';
  }

  const withoutIpv4Prefix = candidate.replace(/^::ffff:/i, '');
  return net.isIP(withoutIpv4Prefix) ? withoutIpv4Prefix : 'unknown';
}

function getClientIp(req) {
  const directIp = normalizeIp(req.socket?.remoteAddress);
  if (TRUST_PROXY_HOPS === 0) {
    return directIp;
  }

  const forwardedHeader = req.headers['x-forwarded-for'];
  if (typeof forwardedHeader !== 'string') {
    return directIp;
  }

  const forwardedIps = forwardedHeader
    .split(',')
    .map((value) => normalizeIp(value))
    .filter((value) => value !== 'unknown');
  const clientIndex = forwardedIps.length - TRUST_PROXY_HOPS - 1;
  return forwardedIps[clientIndex] || directIp;
}

function anonymizeIp(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 12);
}

module.exports = { normalizeIp, getClientIp, anonymizeIp };
