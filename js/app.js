import { loadConfig, buildWssUrl, safeJson, extractDeviceFromTopic, setStatus } from './utils.js';
import { connectMqtt } from './mqtt_client.js';
import { parseTelemetry } from './parsers/default_parser.js';
import { Co2LineChart } from './widgets/co2_line_chart.js';
import { renderSensorCards } from './widgets/sensor_cards.js';
import { renderDevicePanels } from './widgets/device_panels.js';
import { summarizeOnline } from './widgets/device_status.js';
import { createHistoryFetcher } from './widgets/history_fetch.js';

let client = null;
const knownDevices = new Set();

// 关键：每个设备的最新状态
// Map(device -> { telemetry, lastSeen })
const deviceState = new Map();

const el = {
  host: document.getElementById('host'),
  port: document.getElementById('port'),
  path: document.getElementById('path'),
  user: document.getElementById('user'),
  pass: document.getElementById('pass'),
  topic: document.getElementById('topic'),
  maxPoints: document.getElementById('maxPoints'),
  st: document.getElementById('st'),
  hint: document.getElementById('hint'),
  onlineSummary: document.getElementById('onlineSummary'),
  deviceSel: document.getElementById('deviceSel'),
  meta: document.getElementById('meta'),
  out: document.getElementById('out'),
  cards: document.getElementById('cards'),
  devicePanels: document.getElementById('devicePanels'),
  chartCanvas: document.getElementById('co2Chart'),
  chartNote: document.getElementById('chartNote'),
  histDevice: document.getElementById('histDevice'),
  histDate: document.getElementById('histDate'),
  btnFetchCsv: document.getElementById('btnFetchCsv'),
  btnListDates: document.getElementById('btnListDates'),
  histBar: document.getElementById('histBar'),
  histStatus: document.getElementById('histStatus'),
  histDates: document.getElementById('histDates')
};

const chart = new Co2LineChart(el.chartCanvas, el.chartNote);

const historyFetcher = createHistoryFetcher({
  histDeviceSel: el.histDevice,
  histDateInput: el.histDate,
  btnFetchCsv: el.btnFetchCsv,
  btnListDates: el.btnListDates,
  barEl: el.histBar,
  statusEl: el.histStatus,
  datesEl: el.histDates,
  getClient: () => client,
  getConnectedId: () => (client?.options?.clientId || "web_unknown")
});

let OFFLINE_MS = 8000;

function ensureDevice(device) {
  if (knownDevices.has(device)) return;
  knownDevices.add(device);
  const opt = document.createElement('option');
  opt.value = device;
  opt.textContent = device;
  el.deviceSel.appendChild(opt);

  // 同步到历史 device 下拉
  if (el.histDevice) {
    const opt2 = document.createElement('option');
    opt2.value = device;
    opt2.textContent = device;
    el.histDevice.appendChild(opt2);

    // 如果历史下拉还没选过，默认选第一个设备
    if (!el.histDevice.value) el.histDevice.value = device;
  }
}

function getMaxPoints() {
  const v = Number(el.maxPoints.value || 120);
  return Number.isFinite(v) && v > 10 ? Math.floor(v) : 120;
}

function redrawChart() {
  chart.redraw(el.deviceSel.value);
}

// 每秒刷新一次在线状态（即使没新消息也会更新 ONLINE/OFFLINE）
function refreshStatusUI() {
  renderDevicePanels(el.devicePanels, deviceState, OFFLINE_MS);

  const lastSeenMap = new Map();
  for (const [dev, st] of deviceState.entries()) lastSeenMap.set(dev, st.lastSeen);

  const sum = summarizeOnline(lastSeenMap, OFFLINE_MS);
  if (el.onlineSummary) {
    el.onlineSummary.textContent = `devices: ${sum.total} | online: ${sum.online} | offline: ${sum.offline}`;
  }

  // 当前设备卡片：根据选择刷新（如果选择 ALL，就显示最近活跃设备）
  const sel = el.deviceSel.value;
  if (sel !== '__all__') {
    const st = deviceState.get(sel);
    if (st?.telemetry) renderSensorCards(el.cards, st.telemetry);
  }
}
setInterval(refreshStatusUI, 1000);

el.deviceSel.addEventListener('change', () => {
  const sel = el.deviceSel.value;
  if (sel === '__all__') {
    // ALL 模式：不强行切卡片（由 refreshStatusUI 更新最近活跃设备时显示）
    el.cards.innerHTML = '';
  } else {
    const st = deviceState.get(sel);
    if (st?.telemetry) renderSensorCards(el.cards, st.telemetry);
  }
  redrawChart();
});

el.maxPoints.addEventListener('change', redrawChart);

document.getElementById('btnClear').onclick = () => {
  chart.clear();
  knownDevices.clear();
  deviceState.clear();

  el.deviceSel.innerHTML = '<option value="__all__">全部设备（ALL）</option>';
  el.cards.innerHTML = '';
  el.devicePanels.innerHTML = '';
  el.meta.textContent = '-';
  el.out.textContent = '{}';

  el.histDates.innerHTML = '';
  el.histStatus.textContent = '-';
  el.histBar.style.width = '0%';

  redrawChart();
  refreshStatusUI();
};

document.getElementById('btnDis').onclick = () => {
  if (client) client.end(true);
  client = null;
  setStatus(el.st, false, 'disconnected');

  el.histStatus.textContent = '（已断开 MQTT，无法拉取历史）';
  el.histBar.style.width = '0%';
};

document.getElementById('btnConn').onclick = () => {
  const url = buildWssUrl({ host: el.host.value, port: el.port.value, path: el.path.value });
  const username = el.user.value.trim();
  const password = el.pass.value;
  const topic = el.topic.value.trim();
  el.hint.textContent = url;

  if (client) client.end(true);

  client = connectMqtt({
    url, username, password, topic,
    onStatus: (ok, msg) => setStatus(el.st, ok, msg),
    onMessage: (t, payload) => {
      const text = payload.toString();
      const obj = safeJson(text);

      el.meta.textContent = `topic=${t}   time=${new Date().toLocaleString()}`;
      el.out.textContent = (typeof obj === 'object') ? JSON.stringify(obj, null, 2) : String(obj);

      const deviceFromTopic = extractDeviceFromTopic(t);
      ensureDevice(deviceFromTopic);

      const parsed = parseTelemetry(obj);
      if (!parsed) return;

      // 设备名优先用 payload 的 device（更稳），没有就用 topic
      const device = parsed.device || deviceFromTopic;
      ensureDevice(device);

      // 更新设备状态表（用于面板 + 在线离线）
      deviceState.set(device, { telemetry: parsed, lastSeen: Date.now() });

      // 当前设备卡片显示逻辑
      const sel = el.deviceSel.value;
      if (sel === '__all__') {
        // ALL：展示最近活跃设备（就是当前这条消息的设备）
        renderSensorCards(el.cards, parsed);
      } else if (sel === device) {
        renderSensorCards(el.cards, parsed);
      }

      // CO2 折线：只在有 co2 时推进
      const co2 = parsed.sensors?.co2;
      if (co2 !== null && co2 !== undefined) {
        chart.push(device, co2, getMaxPoints());
        if (sel === device || sel === '__all__') chart.redraw(sel);
      }

      // 更新全设备面板/统计
      refreshStatusUI();
    }
  });
};

async function init() {
  try {
    const cfg = await loadConfig();
    el.host.value = cfg.host ?? el.host.value;
    el.port.value = cfg.port ?? el.port.value;
    el.path.value = cfg.path ?? el.path.value;
    el.topic.value = cfg.topic ?? el.topic.value;
    el.maxPoints.value = cfg.maxPoints ?? el.maxPoints.value;
    OFFLINE_MS = cfg.offlineMs ?? OFFLINE_MS;

    const lastUser = localStorage.getItem('viewer_user');
    if (lastUser) el.user.value = lastUser;
    el.user.addEventListener('change', () => localStorage.setItem('viewer_user', el.user.value));
  } catch (e) {
    console.warn('config load failed:', e);
  }
  redrawChart();
  refreshStatusUI();
}
init();
