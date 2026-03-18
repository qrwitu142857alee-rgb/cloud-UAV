import { isOnline } from './device_status.js';

export function renderDevicePanels(container, deviceStateMap, offlineMs) {
  // deviceStateMap: Map(device -> { telemetry, lastSeen })
  const now = Date.now();

  // 按 device 名排序，展示稳定
  const devices = Array.from(deviceStateMap.keys()).sort();
  container.innerHTML = '';

  for (const dev of devices) {
    const st = deviceStateMap.get(dev);
    const telem = st?.telemetry;
    const lastSeen = st?.lastSeen;

    const online = isOnline(lastSeen, offlineMs, now);

    const panel = document.createElement('div');
    panel.className = 'panel';

    const top = document.createElement('div');
    top.className = 'panelTop';

    const title = document.createElement('div');
    title.style.fontWeight = '600';
    title.textContent = dev;

    const badge = document.createElement('span');
    badge.className = `badge ${online ? 'badgeOnline' : 'badgeOffline'}`;
    badge.textContent = online ? 'ONLINE' : 'OFFLINE';

    top.appendChild(title);
    top.appendChild(badge);

    const kv = document.createElement('div');
    kv.className = 'kv';

    const co2 = telem?.sensors?.co2;
    const temp = telem?.sensors?.temp;
    const rh = telem?.sensors?.rh;

    kv.appendChild(kvItem('CO₂', co2, 'ppm'));
    kv.appendChild(kvItem('Temp', temp, '°C'));
    kv.appendChild(kvItem('RH', rh, '%'));

    const time = document.createElement('div');
    time.className = 'panelTime';
    time.textContent = lastSeen ? `last: ${new Date(lastSeen).toLocaleString()}` : 'last: -';

    panel.appendChild(top);
    panel.appendChild(kv);
    panel.appendChild(time);

    container.appendChild(panel);
  }
}

function kvItem(name, val, unit) {
  const wrap = document.createElement('div');
  const k = document.createElement('div');
  k.className = 'k';
  k.textContent = name;
  const v = document.createElement('div');
  v.className = 'v';
  v.textContent = (val === null || val === undefined) ? '-' : `${val}${unit ? ' ' + unit : ''}`;
  wrap.appendChild(k);
  wrap.appendChild(v);
  return wrap;
}
