export default function makeDownsampleWs(opts = {}) {
  const intervalMs = opts.intervalMs ?? 1000; // 1Hz
  const lastSent = new Map();                 // device -> ts

  return async function downsampleWs(ctx) {
    const dev = ctx.msg?.device ?? "unknown";
    const now = Date.now();
    const last = lastSent.get(dev) ?? 0;

    if (now - last < intervalMs) {
      // 阻止后续的 WS 广播（但不影响 CSV/其他插件，如果放在 broadcast_ws 之前）
      ctx.skipWs = true;
      return;
    }

    lastSent.set(dev, now);
    ctx.skipWs = false;
  };
}
