import http from "http";
import fs from "fs";
import path from "path";
import { WebSocketServer } from "ws";
import mqtt from "mqtt";

import { config } from "./config.js";
import { createPipeline } from "./pipeline/index.js";
import normalize from "./pipeline/plugins/normalize.js";
import makeBroadcastWs from "./pipeline/plugins/broadcast_ws.js";
//import makeStoreCsv from "./pipeline/plugins/store_csv.js";
import makeStoreCsvDaily from "./pipeline/plugins/store_csv_daily.js";
import makeDeviceStatus from "./pipeline/plugins/device_status.js";
import makeDownsampleWs from "./pipeline/plugins/downsample_ws.js";
import makePublishCloud from "./pipeline/plugins/publish_cloud.js";
import makePublishUplink from "./pipeline/plugins/publish_uplink.js";
import makeCloudHistoryRpc from "./pipeline/plugins/cloud_history_rpc.js";
import { getCloudClient } from "./cloud_mqtt.js";

// const uplinkState = {
//   hive: { state: "unknown" },
//   aliyun: { state: "unknown" }
// };

const webRoot = path.resolve("./web");

// 1) 静态文件服务器（打开网页用）
const server = http.createServer((req, res) => {
  // ===== 本地控制接口：切换 uplinks（只允许本机访问） =====
  if (req.url === "/api/uplinks" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ uplinks: currentUplinks }));
    return;
  }

  if (req.url === "/api/uplinks" && req.method === "POST") {
    // 只允许本机访问（防止局域网其他机器切换）
    const ra = req.socket.remoteAddress || "";
    const okLocal = ra.includes("127.0.0.1") || ra.includes("::1");
    if (!okLocal) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let obj;
      try { obj = JSON.parse(body || "{}"); } catch { obj = {}; }
      const arr = Array.isArray(obj.uplinks) ? obj.uplinks : [];
      const norm = arr.map(s => String(s).trim()).filter(Boolean);

      // 只允许这两种
      const allowed = new Set(["hive", "aliyun"]);
      const next = norm.filter(x => allowed.has(x));

      currentUplinks = next; // ✅ 真正切换开关

      // 推送到网页（让 UI 立即知道“切换完成”）
      wsBroadcast({
        type: "sys",
        kind: "uplink",
        name: "uplinks",
        state: "enabled",
        detail: currentUplinks.join(","),
        ts: Date.now()
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, uplinks: currentUplinks }));
    });
    return;
  }

  const urlPath = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(webRoot, urlPath);

  if (!filePath.startsWith(webRoot)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200);
    res.end(data);
  });
});

// server.listen(3000, () => {
//   console.log("HTTP: http://127.0.0.1:3000");
// });
server.listen(config.httpPort, "0.0.0.0", () => {
  console.log(`HTTP: http://127.0.0.1:${config.httpPort}`);
});

// 2) WebSocket 服务
//const wss = new WebSocketServer({ port: 8080 });
//console.log("WS: ws://127.0.0.1:8080");
const wss = new WebSocketServer({ port: config.wsPort, host: "0.0.0.0"});
console.log(`WS: ws://127.0.0.1:${config.wsPort}`);

const uplinkState = {
  uplinks: { name: "uplinks", state: "unknown", detail: "", ts: Date.now() },
  hive:    { name: "hive",    state: "unknown", detail: "", ts: Date.now() },
  aliyun:  { name: "aliyun",  state: "unknown", detail: "", ts: Date.now() }
};

function wsBroadcast(obj) {
  const s = JSON.stringify(obj);
  console.log("[WS] broadcast", obj, "clients=", wss.clients.size); // ✅加这行
  for (const c of wss.clients) {
    if (c.readyState === 1) c.send(s);
  }
}

// 当前启用的 uplinks（不重启切换的“真开关”）
let currentUplinks = Array.isArray(config.uplinks) ? [...config.uplinks] : ["hive"];

// setTimeout(() => {
//   wsBroadcast({ type: "sys", kind: "uplink", name: "hive", state: "connected", detail: "test", ts: Date.now() });
// }, 1000);
// wss.on("connection", (ws) => {
//   console.log("[WS] client connected, total =", wss.clients.size);
//   ws.send(JSON.stringify({
//     type: "sys",
//     kind: "uplink",
//     name: "hive",
//     state: "connected",
//     detail: "hello-from-server",
//     ts: Date.now()
//   }));
// });
wss.on("connection", (ws) => {
  console.log("[WS] client connected, total =", wss.clients.size);

  // ✅ 新连接立刻补发“当前 uplink 状态快照”
  for (const key of Object.keys(uplinkState)) {
    ws.send(JSON.stringify({ type: "sys", kind: "uplink", ...uplinkState[key] }));
  }
});
console.log("DEBUG config.hive =", config.hive);
console.log("DEBUG config.cloudMqttUrl =", config.cloudMqttUrl);
console.log("DEBUG hive url candidate =", config.hive?.url || config.cloudMqttUrl);

// const cloudClient = config.cloudEnabled ? getCloudClient(config) : null;
const cloudClient = getCloudClient(config);

// 3) Pipeline：normalize → ws广播 → csv落盘
const pipeline = createPipeline([
  normalize,
  //makeDeviceStatus(wss, { offlineMs: 5000 }),
  makeDeviceStatus(wss, { offlineMs: config.offlineMs }),
  // 只影响网页推送频率，不影响 CSV
  //makeDownsampleWs({ intervalMs: 100 }),
  makeDownsampleWs({ intervalMs: config.downsampleMs }),
  makeBroadcastWs(wss),
  //makeStoreCsv("./data/telemetry.csv"),
  //makeStoreCsv(config.csvPath),
  makeStoreCsvDaily("./data"),
  // makePublishCloud({
  // enabled: config.cloudEnabled,
  // url: config.cloudMqttUrl,
  // username: config.cloudMqttUser,
  // password: config.cloudMqttPass,
  // baseTopic: config.cloudBaseTopic
  // }),

  // makePublishCloud({
  //   enabled: config.cloudEnabled,
  //   baseTopic: config.cloudBaseTopic,
  //   config
  // }),

  makePublishUplink({
    // uplinks: config.uplinks,
    getUplinks: () => currentUplinks,   // ✅关键：每条消息实时读取当前开关
    hive: {
      config,
      baseTopic: config.hive.baseTopic
    },
    aliyun: {
      url: config.aliyun.url,
      baseTopic: config.aliyun.baseTopic
    },
    // onStatus: (e) => wsBroadcast({ type: "sys", kind: "uplink", ...e })
    onStatus: (e) => {
      console.log("[UPLINK status]", e);

      // ✅ 更新缓存（保证新打开网页也能看到）
      uplinkState[e.name] = { ...uplinkState[e.name], ...e };

      // ✅ 广播给当前已连接的网页
      wsBroadcast({ type: "sys", kind: "uplink", ...uplinkState[e.name] });
    }

  }),

  makeCloudHistoryRpc({
    // enabled: true,
    cloudClient,
    dataDir: "./data",
    reqTopic: "cloud/uav/rpc/history/request"
  }),
]);

// 4) MQTT 订阅
// const mqttUrl = "mqtt://127.0.0.1:1883";
// const mqttTopic = "uav/+/telemetry";
const mqttUrl = config.mqttUrl;
const mqttTopic = config.mqttTopic;

console.log("LOCAL mqttUrl =", mqttUrl);
console.log("LOCAL mqttTopic =", mqttTopic);
const mclient = mqtt.connect(mqttUrl, { reconnectPeriod: 2000 });

mclient.on("connect", () => {
  console.log("MQTT connected:", mqttUrl);
  mclient.subscribe(mqttTopic, (err) => {
    if (err) console.error("MQTT subscribe error:", err);
    else console.log("MQTT subscribed:", mqttTopic);
  });
});

mclient.on("message", async (topic, raw) => {
  const ctx = { topic, raw, msg: null, stop: false };
  await pipeline.run(ctx);
});
