// utils/limitTracker.js
const ipMap = new Map();
const fpMap = new Map();

const MAX_DOWNLOADS = 2;

function getKey(ip, fingerprint) {
  return fingerprint || ip;
}

function getMap(fingerprint) {
  return fingerprint ? fpMap : ipMap;
}

function canDownload({ ip, fingerprint }) {
  const key = getKey(ip, fingerprint);
  const map = getMap(fingerprint);
  const count = map.get(key) || 0;
  return count < MAX_DOWNLOADS;
}

function registerDownload({ ip, fingerprint }) {
  const key = getKey(ip, fingerprint);
  const map = getMap(fingerprint);
  const count = map.get(key) || 0;
  map.set(key, count + 1);
}

function unregisterDownload({ ip, fingerprint }) {
  const key = getKey(ip, fingerprint);
  const map = getMap(fingerprint);
  const count = map.get(key) || 0;
  if (count > 0) map.set(key, count - 1);
}

module.exports = {
  canDownload,
  registerDownload,
  unregisterDownload,
};
