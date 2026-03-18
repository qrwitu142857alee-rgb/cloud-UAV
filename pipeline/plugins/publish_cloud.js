import { getCloudClient } from "../../cloud_mqtt.js";

export default function makePublishCloud(opts = {}) {
  const enabled = !!opts.enabled;
  if (!enabled) return async function noop() {};

  const client = getCloudClient(opts.config);

  const baseTopic = opts.baseTopic || "cloud/uav";

  return async function publishCloud(ctx) {
    const m = ctx.msg;
    if (!m || !m.device) return;
    const topic = `${baseTopic}/${m.device}/telemetry`;
    client.publish(topic, JSON.stringify(m), { qos: 0 });
  };
}
