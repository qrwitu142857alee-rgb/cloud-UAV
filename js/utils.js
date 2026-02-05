export const safeJson = (s) => {
  try {
    const a = JSON.parse(s);
    if (typeof a === "string") { try { return JSON.parse(a); } catch { return a; } }
    return a;
  } catch { return s; }
};

export function toNumberOrNull(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function extractDeviceFromTopic(topic) {
  const parts = topic.split('/');
  const idx = parts.indexOf('uav');
  if (idx >= 0 && parts.length > idx + 1) return parts[idx + 1];
  return parts.length >= 2 ? parts[parts.length - 2] : 'unknown';
}

export function buildWssUrl({ host, port, path }) {
  let p = (path || '').trim();
  if (!p.startsWith('/')) p = '/' + p;
  return `wss://${host.trim()}:${String(port).trim()}${p}`;
}

export function setStatus(el, ok, msg) {
  el.textContent = msg;
  el.className = ok ? 'ok' : 'bad';
}

export async function loadConfig() {
  const res = await fetch('./config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load config.json');
  return res.json();
}
