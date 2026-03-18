import mqtt from "mqtt";

const mqttUrl = process.env.MQTT_URL || "mqtt://127.0.0.1:1883";
const topic = process.env.SIM_TOPIC || "uav/dev01/telemetry";
const intervalMs = Number(process.env.SIM_MS || 200);

// 从 topic 里提取 device：uav/<device>/telemetry
function deviceFromTopic(t) {
  const parts = String(t).split("/");
  return parts.length >= 2 ? parts[1] : "dev01";
}
const device = process.env.SIM_DEVICE || deviceFromTopic(topic);

// 给每个 sim 一个不同 clientId，避免互相踢下线
const clientId = `sim_${device}_${process.pid}_${Math.random().toString(16).slice(2, 8)}`;

const client = mqtt.connect(mqttUrl, { clientId });

client.on("connect", () => {
  console.log("SIM connected:", mqttUrl);
  console.log("Publishing:", topic, "device:", device, "every", intervalMs, "ms");

  setInterval(() => {
    const msg = {
      ts: Date.now(),
      device,
      sensors: {
        co2: Math.round(400 + Math.random() * 900),
        temp: Math.round((20 + Math.random() * 8) * 10) / 10,
        rh: Math.round((35 + Math.random() * 40) * 10) / 10
      }
    };
    client.publish(topic, JSON.stringify(msg));
  }, intervalMs);
});
