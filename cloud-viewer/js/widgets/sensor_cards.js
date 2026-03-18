export function renderSensorCards(container, telemetry) {
  // telemetry: { device, ts, sensors:{co2,temp,rh} }
  container.innerHTML = '';

  const { sensors } = telemetry || {};
  if (!sensors) return;

  container.appendChild(card('CO₂', sensors.co2, 'ppm'));
  container.appendChild(card('Temp', sensors.temp, '°C'));
  container.appendChild(card('RH', sensors.rh, '%'));
}

function card(name, val, unit) {
  const d = document.createElement('div');
  d.className = 'cardMini';
  const k = document.createElement('div');
  k.className = 'k';
  k.textContent = name;
  const v = document.createElement('div');
  v.className = 'v';
  v.textContent = (val === null || val === undefined) ? '-' : `${val}${unit ? ' ' + unit : ''}`;
  d.appendChild(k); d.appendChild(v);
  return d;
}
