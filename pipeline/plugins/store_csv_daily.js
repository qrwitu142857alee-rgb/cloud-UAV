import fs from "fs";
import path from "path";

export default function makeStoreCsvDaily(baseDir = "./data") {
  const ensured = new Set(); // 记录哪些文件写过 header 了

  return async function storeCsvDaily(ctx) {
    const m = ctx.msg;
    if (!m || !m.device) return;

    const dev = safeName(m.device);
    const day = ymd(m.ts ?? Date.now());

    const dir = path.join(baseDir, dev);
    fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, `${day}.csv`);
    if (!ctx._dbgPrinted) { console.log("[CSV-DAILY]", filePath); ctx._dbgPrinted = true; }

    if (!ensured.has(filePath)) {
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, "ts,device,co2,temp,rh,rssi\n", "utf8");
      }
      ensured.add(filePath);
    }

    const s = m.sensors || {};
    const row = [
      m.ts ?? Date.now(),
      dev,
      v(s.co2),
      v(s.temp),
      v(s.rh),
      v(s.rssi)
    ].join(",") + "\n";

    fs.appendFile(filePath, row, () => {});
  };
}

function ymd(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function v(x) {
  if (x === undefined || x === null) return "";
  return String(x).replaceAll(",", ";");
}

function safeName(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, "_");
}
