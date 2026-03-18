// throw new Error("DEBUG cloud_mqtt.js loaded");
// console.log("DEBUG cloud_mqtt.js LOADED");
import mqtt from "mqtt";

let client = null;

export function getCloudClient(config) {
  if (client) return client;

  const url =
    config?.hive?.url ||
    config?.cloudMqttUrl ||
    "";

  const username =
    config?.hive?.username ||
    config?.cloudMqttUser ||
    "";

  const password =
    config?.hive?.password ||
    config?.cloudMqttPass ||
    "";

  const clientId =
    config?.hive?.clientId ||
    config?.cloudClientId ||
    `cloud_${Math.random().toString(16).slice(2, 8)}`;

  console.log("DEBUG getCloudClient url =", url);
  console.log("DEBUG getCloudClient username =", username);

  if (!url) {
    throw new Error("Hive MQTT url is empty");
  }

  client = mqtt.connect(url, {
    clientId,
    username,
    password,
    reconnectPeriod: 2000
  });

  client.on("connect", () => console.log("CLOUD MQTT connected:", url));
  client.on("reconnect", () => console.log("CLOUD MQTT reconnecting..."));
  client.on("error", (e) => console.log("CLOUD MQTT error:", e.message));

  return client;
}