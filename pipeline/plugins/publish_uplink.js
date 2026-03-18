import mqtt from "mqtt";
import { getCloudClient } from "../../cloud_mqtt.js";

function wireStatus(name, client, onStatus) {
  if (!client || !onStatus) return;
  const emit = (state, detail = "") => onStatus({ name, state, detail, ts: Date.now() });

  client.on("connect", () => emit("connected"));
  client.on("reconnect", () => emit("reconnecting"));
  client.on("close", () => emit("closed"));
  client.on("offline", () => emit("offline"));
  client.on("error", (e) => emit("error", e?.message || ""));
}

export default function makePublishUplink(opts = {}) {
  const onStatus = opts.onStatus;
  const getUplinks = typeof opts.getUplinks === "function"
    ? opts.getUplinks
    : () => (Array.isArray(opts.uplinks) ? opts.uplinks : []);

  // Hive client 常驻（不重启）
  let hiveClient = null;
  let hiveBaseTopic = "cloud/uav";
  if (opts.hive?.config) {
    hiveClient = getCloudClient(opts.hive.config);
    hiveBaseTopic = opts.hive.baseTopic || hiveBaseTopic;
    wireStatus("hive", hiveClient, onStatus);
  }

  // Aliyun client 常驻（不重启）
  let aliClient = null;
  let aliBaseTopic = "uav";
  if (opts.aliyun?.url) {
    aliClient = mqtt.connect(opts.aliyun.url, { reconnectPeriod: 2000 });
    aliBaseTopic = opts.aliyun.baseTopic || aliBaseTopic;
    wireStatus("aliyun", aliClient, onStatus);
  }

  // 启动时汇报当前启用列表（读一次）
  if (onStatus) {
    const cur = getUplinks();
    onStatus({ name: "uplinks", state: "enabled", detail: cur.join(","), ts: Date.now() });
  }

  return async function publishUplink(ctx) {
    const m = ctx.msg;
    if (!m || !m.device) return;

    const cur = getUplinks();
    const wantHive = cur.includes("hive");
    const wantAli  = cur.includes("aliyun");

    // if (wantHive && hiveClient) {
    //   hiveClient.publish(`${hiveBaseTopic}/${m.device}/telemetry`, JSON.stringify(m), { qos: 0 });
    // }
    // if (wantAli && aliClient) {
    //   aliClient.publish(`${aliBaseTopic}/${m.device}/telemetry`, JSON.stringify(m), { qos: 0 });
    // }
    if (wantHive && hiveClient) {
      const topic = `${hiveBaseTopic}/${m.device}/telemetry`;
      const payload = JSON.stringify(m);

      console.log("[publish hive topic]", topic);

      hiveClient.publish(topic, payload, { qos: 0 }, (err) => {
        if (err) {
          console.error("[publish hive error]", err.message || err);
        } else {
          console.log("[publish hive ok]", topic);
        }
      });
    }

    if (wantAli && aliClient) {
      const topic = `${aliBaseTopic}/${m.device}/telemetry`;
      console.log("[publish aliyun topic]", topic);
      aliClient.publish(topic, JSON.stringify(m), { qos: 0 });
    }
  };
}
