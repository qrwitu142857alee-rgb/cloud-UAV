import fs from "fs";
import path from "path";

function b64Chunks(buf, chunkBytes = 32 * 1024) {
  const chunks = [];
  for (let off = 0; off < buf.length; off += chunkBytes) {
    chunks.push(buf.subarray(off, Math.min(buf.length, off + chunkBytes)).toString("base64"));
  }
  return chunks;
}

export default function makeCloudHistoryRpc(opts = {}) {
  const enabled = opts.enabled !== false;   // 默认启用cheng
  if (!enabled) {
    console.log("[RPC] cloud_history_rpc disabled");
    return () => {};
  }

  const cloudClient = opts.cloudClient;
  const dataDir = opts.dataDir || "./data";
  const reqTopic = opts.reqTopic || "cloud/uav/rpc/history/request";
  const maxBytes = opts.maxBytes || 5 * 1024 * 1024;

  if (!cloudClient) throw new Error("cloudClient is required for cloud_history_rpc");

  console.log("[RPC] cloud_history_rpc enabled");
  console.log("[RPC] subscribing reqTopic =", reqTopic);

  cloudClient.subscribe(reqTopic, (err) => {
    if (err) console.log("[RPC] subscribe error:", err.message);
    else console.log("[RPC] subscribed:", reqTopic);
  });

  cloudClient.on("message", async (topic, payload) => {
    if (topic !== reqTopic) return;

    console.log("[RPC] request raw:", topic, payload.toString());
    console.log("[CLOUD MQTT RAW]", topic, payload.toString());

    let req;
    try {
      req = JSON.parse(payload.toString());
    } catch {
      console.log("[RPC] invalid JSON request");
      return;
    }

    const { reqId, device, date, replyTo, action } = req || {};
    if (!reqId || !device || !replyTo) {
      console.log("[RPC] missing fields:", req);
      return;
    }

    // ---- 列出可用日期 ----
    if (action === "list_dates") {
      try {
        const devDir = path.join(dataDir, device);
        if (!fs.existsSync(devDir)) {
          const msg = { reqId, type: "dates", device, dates: [] };
          console.log("[RPC] reply dates(empty):", replyTo, msg);
          cloudClient.publish(replyTo, JSON.stringify(msg));
          return;
        }

        const files = fs.readdirSync(devDir);
        const dates = files
          .filter(f => /^\d{4}-\d{2}-\d{2}\.csv$/.test(f))
          .map(f => f.replace(".csv", ""))
          .sort();

        const msg = { reqId, type: "dates", device, dates };
        console.log("[RPC] reply dates:", replyTo, msg);
        cloudClient.publish(replyTo, JSON.stringify(msg));
      } catch (e) {
        const msg = {
          reqId,
          type: "error",
          message: "list_dates_failed",
          detail: e.message
        };
        console.log("[RPC] reply error:", replyTo, msg);
        cloudClient.publish(replyTo, JSON.stringify(msg));
      }
      return;
    }

    // ---- 拉取某天 CSV ----
    if (!date) {
      const msg = { reqId, type: "error", message: "date_required" };
      console.log("[RPC] reply error:", replyTo, msg);
      cloudClient.publish(replyTo, JSON.stringify(msg));
      return;
    }

    try {
      const file = path.join(dataDir, device, `${date}.csv`);
      if (!fs.existsSync(file)) {
        const msg = { reqId, type: "error", message: "csv_not_found", file };
        console.log("[RPC] reply error:", replyTo, msg);
        cloudClient.publish(replyTo, JSON.stringify(msg));
        return;
      }

      const buf = fs.readFileSync(file);
      if (buf.length > maxBytes) {
        const msg = {
          reqId,
          type: "error",
          message: "csv_too_large",
          bytes: buf.length,
          maxBytes
        };
        console.log("[RPC] reply error:", replyTo, msg);
        cloudClient.publish(replyTo, JSON.stringify(msg));
        return;
      }

      const chunks = b64Chunks(buf, 32 * 1024);
      const filename = `${device}_${date}.csv`;

      const startMsg = {
        reqId,
        type: "start",
        device,
        date,
        totalChunks: chunks.length,
        filename
      };
      console.log("[RPC] reply start:", replyTo, startMsg);
      cloudClient.publish(replyTo, JSON.stringify(startMsg));

      for (let i = 0; i < chunks.length; i++) {
        const chunkMsg = { reqId, type: "chunk", i, dataB64: chunks[i] };
        if (i === 0) console.log("[RPC] reply chunk[0]:", replyTo, "(first chunk)");
        cloudClient.publish(replyTo, JSON.stringify(chunkMsg));
      }

      const endMsg = { reqId, type: "end" };
      console.log("[RPC] reply end:", replyTo, endMsg);
      cloudClient.publish(replyTo, JSON.stringify(endMsg));
    } catch (e) {
      const msg = {
        reqId,
        type: "error",
        message: "server_error",
        detail: e.message
      };
      console.log("[RPC] reply error:", replyTo, msg);
      cloudClient.publish(replyTo, JSON.stringify(msg));
    }
  });

  return async function noop() {};
}