import fs from "fs";
import path from "path";

export default function makeStoreCsv(csvPath) {
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });

  if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(csvPath, "ts,device,co2,temp,rh,rssi\n", "utf8");
  }

  return async function storeCsv(ctx) {
    const s = ctx.msg.sensors || {};
    const row = [
      ctx.msg.ts,
      ctx.msg.device,
      v(s.co2),
      v(s.temp),
      v(s.rh),
      v(s.rssi)
    ].join(",") + "\n";

    fs.appendFile(csvPath, row, () => {});
  };
}

function v(x) {
  if (x === undefined || x === null) return "";
  return String(x).replaceAll(",", ";");
}
