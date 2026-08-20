'use strict';

// Shared in-memory stores for the running server. Each module mutates these
// same references, so the objects must never be reassigned — only mutated.
const jobs = new Map();
const queuedJobIds = [];
const ipStates = new Map();
const runtime = { activeJobCount: 0 };

module.exports = { jobs, queuedJobIds, ipStates, runtime };
