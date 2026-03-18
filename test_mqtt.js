import mqtt from "mqtt";

const client = mqtt.connect("mqtt://127.0.0.1:1883");

client.on("connect", () => {
  console.log("MQTT connected");
  client.subscribe("uav/test");
});

client.on("message", (topic, msg) => {
  console.log(topic, msg.toString());
});
