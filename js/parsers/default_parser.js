import { toNumberOrNull } from "../utils.js";

export function parseTelemetry(obj) {
  if (!obj || typeof obj !== 'object') return null;

  const device = obj.device ?? null;
  const ts = obj.ts ?? Date.now();

  const sensors = (obj.sensors && typeof obj.sensors === 'object') ? obj.sensors : obj;

  const co2  = toNumberOrNull(sensors.co2 ?? sensors.CO2 ?? sensors.co2_ppm);
  const temp = toNumberOrNull(sensors.temp ?? sensors.temperature);
  const rh   = toNumberOrNull(sensors.rh ?? sensors.humidity);

  return { device, ts, sensors: { co2, temp, rh } };
}
