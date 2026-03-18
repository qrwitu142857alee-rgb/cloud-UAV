export function connectMqtt({ url, username, password, topic, onStatus, onMessage }) {
  if (!window.mqtt) throw new Error("mqtt.js not loaded");

  onStatus?.(false, 'connecting...');

  const client = window.mqtt.connect(url, {
    protocol: "wss",
    protocolId: "MQTT",
    protocolVersion: 4, // MQTT 3.1.1
    username,
    password,
    reconnectPeriod: 2000,
    keepalive: 30,
    clean: true,
    clientId: 'web_' + Math.random().toString(16).slice(2, 10)
  });

  // client.on('connect', () => {
  //   onStatus?.(true, 'connected');
  //   client.subscribe(topic, (err) => {
  //     if (err) onStatus?.(false, 'subscribe error: ' + err.message);
  //   });
  // });

  client.on('connect', () => {
    console.log('[mqtt_client] connected:', url);
    console.log('[mqtt_client] subscribing topic:', topic);

    onStatus?.(true, 'connected');

    client.subscribe(topic, (err) => {
      if (err) {
        console.error('[mqtt_client] subscribe error:', err);
        onStatus?.(false, 'subscribe error: ' + err.message);
      } else {
        console.log('[mqtt_client] subscribed ok:', topic);
      }
    });
  });

  client.on('reconnect', () => onStatus?.(false, 'reconnecting...'));
  client.on('close', () => onStatus?.(false, 'disconnected'));
  client.on('offline', () => onStatus?.(false, 'offline'));
  client.on('error', (e) => onStatus?.(false, 'error: ' + (e?.message || String(e))));

  // client.on('message', (t, payload) => onMessage?.(t, payload));
  client.on('message', (t, payload) => {
    console.log('[mqtt_client] message:', t, payload?.toString?.());
    onMessage?.(t, payload);
  });

  return client;
}
