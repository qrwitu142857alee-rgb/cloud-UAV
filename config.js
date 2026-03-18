export const config = {
  httpPort: Number(process.env.HTTP_PORT || 3000),
  wsPort: Number(process.env.WS_PORT || 8080),

  mqttUrl: process.env.MQTT_URL || "mqtt://127.0.0.1:1883",
  mqttTopic: process.env.MQTT_TOPIC || "uav/+/telemetry",

  csvPath: process.env.CSV_PATH || "./data/telemetry.csv",

  offlineMs: Number(process.env.OFFLINE_MS || 5000),
  downsampleMs: Number(process.env.DOWNSAMPLE_MS || 100),
  windowMs: Number(process.env.WINDOW_MS || 60000),

  // 旧字段保留兼容
  cloudEnabled: String(process.env.CLOUD_ENABLED || "0") === "1",
  cloudMqttUrl: process.env.CLOUD_MQTT_URL || "",
  cloudMqttUser: process.env.CLOUD_MQTT_USER || "",
  cloudMqttPass: process.env.CLOUD_MQTT_PASS || "",
  cloudBaseTopic: process.env.CLOUD_BASE_TOPIC || "cloud/uav",

  uplinks: (process.env.UPLINKS || "hive")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean),

  // HiveMQ
  hive: {
    url:
      process.env.HIVE_MQTT_URL ||
      process.env.CLOUD_MQTT_URL ||
      "mqtts://8b441659281a45f9a3344a7a63b0a4a7.s1.eu.hivemq.cloud:8883",

    username:
      process.env.HIVE_MQTT_USER ||
      process.env.CLOUD_MQTT_USER ||
      "uav_gateway",

    password:
      process.env.HIVE_MQTT_PASS ||
      process.env.CLOUD_MQTT_PASS ||
      "123456qwertyAd@",

    clientId: process.env.HIVE_CLIENT_ID || "",
    baseTopic: process.env.HIVE_BASE_TOPIC || process.env.CLOUD_BASE_TOPIC || "cloud/uav"
  },

  // 阿里云 MQTT
  aliyun: {
    url: process.env.ALI_MQTT_URL || "mqtt://120.55.249.41:1883",
    baseTopic: process.env.ALI_BASE_TOPIC || "uav"
  }
};