export default function makeBroadcastWs(wss) {
  return async function broadcastWs(ctx) {
    if (ctx.skipWs) return;

    const payload = JSON.stringify({ type: "telemetry", data: ctx.msg });

    for (const c of wss.clients) {
      if (c.readyState === 1) c.send(payload);
    }
  };
}

