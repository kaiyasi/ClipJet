'use strict';

const path = require('node:path');

function isInsideDirectory(candidate, directory) {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedDirectory = path.resolve(directory);
  return (
    resolvedCandidate !== resolvedDirectory &&
    resolvedCandidate.startsWith(`${resolvedDirectory}${path.sep}`)
  );
}

module.exports = { isInsideDirectory };
