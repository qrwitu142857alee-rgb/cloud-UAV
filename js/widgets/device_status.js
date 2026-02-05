export function isOnline(lastSeenTs, offlineMs, now = Date.now()) {
  if (!lastSeenTs) return false;
  return (now - lastSeenTs) <= offlineMs;
}

export function summarizeOnline(lastSeenMap, offlineMs, now = Date.now()) {
  let total = 0, online = 0;
  for (const [, ts] of lastSeenMap.entries()) {
    total++;
    if (isOnline(ts, offlineMs, now)) online++;
  }
  return { total, online, offline: Math.max(0, total - online) };
}
