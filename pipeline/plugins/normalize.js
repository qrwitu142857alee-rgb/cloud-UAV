export default async function normalize(ctx) {
  // ctx.topic, ctx.raw 来自 MQTT
  const s = ctx.raw.toString("utf8");

  let obj;
  try {
    obj = JSON.parse(s);
  } catch (e) {
    ctx.stop = true;
    ctx.error = "invalid json";
    console.log("MQTT invalid JSON:", ctx.topic, s);
    return;
  }

  const parts = ctx.topic.split("/");
  const deviceFromTopic = parts.length >= 2 ? parts[1] : "unknown";

  // 统一成：{ts, device, sensors}
  ctx.msg = {
    ts: obj.ts ?? Date.now(),
    device: obj.device ?? deviceFromTopic,
    sensors: obj.sensors ?? obj
  };
}
