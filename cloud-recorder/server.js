import fs from "fs";
import path from "path";
import express from "express";
import mqtt from "mqtt";

const DATA_DIR = process.env.DATA_DIR || path.resolve("./data");
const HTTP_PORT = Number(process.env.PORT || 8787);

// HiveMQ (MQTTS)
const CLOUD_MQTT_URL  = process.env.CLOUD_MQTT_URL;   // mqtts://host:8883
const CLOUD_MQTT_USER = process.env.CLOUD_MQTT_USER;
const CLOUD_MQTT_PASS = process.env.CLOUD_MQTT_PASS;
const SUB_TOPIC       = process.env.SUB_TOPIC || "cloud/uav/+/telemetry";

// --- utils ---
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function ymd(ts) {
  const d = new Date(ts);
  const Y = d.getFullYear();
  const M = String(d.getMonth()+1).padStart(2, "0");
  const D = String(d.getDate()).padStart(2, "0");
  return `${Y}-${M}-${D}`;
}
function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function pickSensors(obj) {
  // 兼容你的格式：{ ts, device, sensors:{co2,temp,rh} }
  const s = (obj && typeof obj === "object") ? (obj.sensors ?? obj) : {};
  return {
    co2:  s?.co2 ?? s?.CO2 ?? s?.co2_ppm ?? null,
    temp: s?.temp ?? s?.temperature ?? null,
    rh:   s?.rh ?? s?.humidity ?? null
  };
}
function listDevices() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();
}
function listDates(device) {
  const dir = path.join(DATA_DIR, device);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".csv"))
    .map(f => f.replace(".csv", ""))
    .sort();
}

// --- storage write ---
ensureDir(DATA_DIR);
const latestByDevice = new Map(); // device -> latest obj

function appendRow(obj) {
  const ts = Number(obj.ts ?? Date.now());
  const device = String(obj.device ?? "unknown");
  const day = ymd(ts);

  const devDir = path.join(DATA_DIR, device);
  ensureDir(devDir);

  const file = path.join(devDir, `${day}.csv`);
  const isNew = !fs.existsSync(file);

  const { co2, temp, rh } = pickSensors(obj);
  const row = [
    ts,
    device,
    co2 ?? "",
    temp ?? "",
    rh ?? "",
    JSON.stringify(obj)
  ].map(csvEscape).join(",") + "\n";

  if (isNew) {
    fs.appendFileSync(file, "ts,device,co2,temp,rh,raw_json\n");
  }
  fs.appendFileSync(file, row);

  latestByDevice.set(device, obj);

  // 方便快速读取最新值（可选）
  fs.writeFileSync(path.join(devDir, "latest.json"), JSON.stringify(obj, null, 2));
}

// --- MQTT connect ---
if (!CLOUD_MQTT_URL) {
  console.error("Missing CLOUD_MQTT_URL (e.g. mqtts://xxx:8883)");
  process.exit(1);
}
const m = mqtt.connect(CLOUD_MQTT_URL, {
  username: CLOUD_MQTT_USER,
  password: CLOUD_MQTT_PASS,
  reconnectPeriod: 2000
});

m.on("connect", () => {
  console.log("MQTT connected:", CLOUD_MQTT_URL);
  m.subscribe(SUB_TOPIC, (err) => {
    if (err) console.error("subscribe error:", err.message);
    else console.log("subscribed:", SUB_TOPIC);
  });
});
m.on("error", (e) => console.log("MQTT error:", e.message));

m.on("message", (topic, payload) => {
  try {
    const text = payload.toString();
    const obj = JSON.parse(text);
    appendRow(obj);
  } catch (e) {
    // 忽略非JSON
  }
});

// --- HTTP API ---
const app = express();

// 列设备
app.get("/api/devices", (req, res) => {
  res.json({ devices: listDevices() });
});

// 列某设备有哪些日期文件
app.get("/api/dates", (req, res) => {
  const device = String(req.query.device || "");
  if (!device) return res.status(400).json({ error: "device required" });
  res.json({ device, dates: listDates(device) });
});

// 下载某天CSV
app.get("/api/csv", (req, res) => {
  const device = String(req.query.device || "");
  const date = String(req.query.date || ""); // YYYY-MM-DD
  if (!device || !date) return res.status(400).json({ error: "device & date required" });

  const file = path.join(DATA_DIR, device, `${date}.csv`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "not found" });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${device}_${date}.csv"`);
  fs.createReadStream(file).pipe(res);
});

// 取最新（给面板用）
app.get("/api/latest", (req, res) => {
  const device = String(req.query.device || "");
  if (device) return res.json({ device, latest: latestByDevice.get(device) ?? null });

  // 全部设备 latest
  const out = {};
  for (const [d, v] of latestByDevice.entries()) out[d] = v;
  res.json(out);
});

// 简单健康检查
app.get("/health", (req, res) => res.send("ok"));

app.listen(HTTP_PORT, () => {
  console.log("HTTP listening:", `http://0.0.0.0:${HTTP_PORT}`);
  console.log("DATA_DIR:", DATA_DIR);
});
