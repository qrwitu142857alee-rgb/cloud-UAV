export default function makeDeviceStatus(wss, opts = {}) {
  const offlineMs = opts.offlineMs ?? 5000;
  const heartbeatMs = opts.heartbeatMs ?? 1000; // 新增：在线心跳广播频率

  const lastSeen = new Map();       // device -> ts
  const online = new Map();         // device -> bool
  const lastBroadcast = new Map();  // device -> ts（节流）

  // 定时检查离线，并广播 status（离线变化仍然保留）
  setInterval(() => {
    const now = Date.now();
    for (const [dev, ts] of lastSeen.entries()) {
      const isOnline = (now - ts) <= offlineMs;
      const prev = online.get(dev);

      if (prev === undefined || prev !== isOnline) {
        online.set(dev, isOnline);
        broadcastStatus(wss, dev, isOnline, ts, now);
      }
    }
  }, 1000);

  return async function deviceStatus(ctx) {
    const dev = ctx.msg?.device;
    if (!dev) return;

    const now = Date.now();
    lastSeen.set(dev, now);

    // 第一次看到设备，立刻广播在线
    if (online.get(dev) !== true) {
      online.set(dev, true);
      broadcastStatus(wss, dev, true, now, now);
      lastBroadcast.set(dev, now);
      return;
    }

    // 新增：在线时也定期广播一次（让新打开网页能拿到状态）
    const lb = lastBroadcast.get(dev) ?? 0;
    if (now - lb >= heartbeatMs) {
      broadcastStatus(wss, dev, true, now, now);
      lastBroadcast.set(dev, now);
    }
  };
}

function broadcastStatus(wss, device, isOnline, lastTs, nowTs) {
  const payload = JSON.stringify({
    type: "status",
    data: { device, online: isOnline, lastTs, nowTs }
  });

  for (const c of wss.clients) {
    if (c.readyState === 1) c.send(payload);
  }
}
