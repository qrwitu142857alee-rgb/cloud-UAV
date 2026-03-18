import { connectWsLive } from "./ws_live_client.js";
import { createTimescaleRangeProvider } from "./history/providers/timescale_range.js";

// ===== utils（独立，不依赖你原来的 utils.js） =====
async function loadConfig() {
  const r = await fetch("./config.json", { cache: "no-store" });
  if (!r.ok) throw new Error("config.json load failed: " + r.status);
  return await r.json();
}

function setStatus(el, ok, text) {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("good", "bad");
  el.classList.add(ok ? "good" : "bad");
}

function renderSensorCards(cardsEl, telemetry) {
  if (!cardsEl) return;
  const s = telemetry?.sensors || {};
  const co2 = s.co2 ?? "--";
  const temp = s.temp ?? "--";
  const rh = s.rh ?? "--";

  cardsEl.innerHTML = `
    <div class="card">
      <div class="muted">CO₂</div>
      <div style="font-size:28px;font-weight:700;">${co2} <span class="muted" style="font-size:12px;">ppm</span></div>
    </div>
    <div class="card">
      <div class="muted">Temp</div>
      <div style="font-size:28px;font-weight:700;">${temp} <span class="muted" style="font-size:12px;">°C</span></div>
    </div>
    <div class="card">
      <div class="muted">RH</div>
      <div style="font-size:28px;font-weight:700;">${rh} <span class="muted" style="font-size:12px;">%</span></div>
    </div>
  `;
}

class Co2LineChart {
  constructor(canvas, noteEl) {
    this.canvas = canvas;
    this.noteEl = noteEl;
    this.series = new Map(); // device -> [{t, v}]
    this._resize();
    window.addEventListener("resize", () => this._resize());
  }

  resize() {
    this._resize();
  }

  _resize() {
    if (!this.canvas) return;
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * dpr);
    c.height = Math.round(rect.height * dpr);
    this.ctx = c.getContext("2d");
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.redraw("__all__");
  }

  push(device, co2, maxPoints = 120) {
    if (!Number.isFinite(co2)) return;
    const arr = this.series.get(device) || [];
    arr.push({ t: Date.now(), v: co2 });
    while (arr.length > maxPoints) arr.shift();
    this.series.set(device, arr);
  }

  clear() {
    this.series.clear();
    this.redraw("__all__");
  }

  setSeries(device, points) {
    this.series.set(device, points);
  }

  redrawHistory(device, points) {
    this.setSeries(device, points);
    this.redraw(device);
  }

  redraw(deviceSel) {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const c = this.canvas;
    const w = c.getBoundingClientRect().width;
    const h = c.getBoundingClientRect().height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.fillRect(0, 0, w, h);

    const dev = deviceSel === "__all__" ? this._pickAnyDevice() : deviceSel;
    const arr = dev ? (this.series.get(dev) || []) : [];
    if (!dev || arr.length < 2) {
      if (this.noteEl) this.noteEl.textContent = dev ? "数据不足（至少 2 个点）" : "暂无设备数据";
      return;
    }
    if (this.noteEl) this.noteEl.textContent = `device=${dev} points=${arr.length}`;

    const margin = { left: 52, right: 16, top: 18, bottom: 26 };
    const pw = w - margin.left - margin.right;
    const ph = h - margin.top - margin.bottom;

    let min = Infinity, max = -Infinity;
    for (const p of arr) {
      min = Math.min(min, p.v);
      max = Math.max(max, p.v);
    }
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const pad = (max - min) * 0.12;
    min -= pad;
    max += pad;

    const t0 = arr[0].t;
    const t1 = arr[arr.length - 1].t || (t0 + 1);

    const xOf = (t) => margin.left + ((t - t0) / (t1 - t0)) * pw;
    const yOf = (v) => margin.top + ph - ((v - min) / (max - min)) * ph;

    ctx.strokeStyle = "rgba(255,255,255,.14)";
    ctx.strokeRect(margin.left, margin.top, pw, ph);

    ctx.strokeStyle = "rgba(255,255,255,.08)";
    ctx.fillStyle = "#a9b2d6";
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    for (let i = 0; i <= 4; i++) {
      const y = margin.top + (ph * i) / 4;
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + pw, y);
      ctx.stroke();

      const val = (max - (max - min) * (i / 4)).toFixed(0);
      ctx.fillText(val, 8, y + 4);
    }

    ctx.strokeStyle = "rgba(120,180,255,.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xOf(arr[0].t), yOf(arr[0].v));
    for (let i = 1; i < arr.length; i++) {
      ctx.lineTo(xOf(arr[i].t), yOf(arr[i].v));
    }
    ctx.stroke();
  }

  _pickAnyDevice() {
    for (const k of this.series.keys()) return k;
    return "";
  }
}

// ===== 页面逻辑（Aliyun tab）=====
let wsConn = null;
let cfg = null;

const el = {
  liveUrl: document.getElementById("a_liveUrl"),
  st: document.getElementById("a_st"),
  hint: document.getElementById("a_hint"),
  deviceSel: document.getElementById("a_deviceSel"),
  cards: document.getElementById("a_cards"),
  meta: document.getElementById("a_meta"),
  out: document.getElementById("a_out"),
  chartCanvas: document.getElementById("a_co2Chart"),
  chartNote: document.getElementById("a_chartNote"),
  btnConn: document.getElementById("a_btnConn"),
  btnDis: document.getElementById("a_btnDis"),
  btnClear: document.getElementById("a_btnClear"),

  tsDevice: document.getElementById("a_tsDevice"),
  tsStart: document.getElementById("a_tsStart"),
  tsEnd: document.getElementById("a_tsEnd"),
  tsQuery: document.getElementById("a_tsQuery"),
  tsExport: document.getElementById("a_tsExport"),
  tsListDays: document.getElementById("a_tsListDays"),
  tsStatus: document.getElementById("a_tsStatus"),
  tsDates: document.getElementById("a_tsDates"),
  tsHours: document.getElementById("a_tsHours"),

  histChartCanvas: document.getElementById("a_histChart"),
  histChartNote: document.getElementById("a_histChartNote"),
  histMeta: document.getElementById("a_histMeta"),
  histRawMeta: document.getElementById("a_histRawMeta"),
  histOut: document.getElementById("a_histOut"),
};

const chart = new Co2LineChart(el.chartCanvas, el.chartNote);
const histChart = new Co2LineChart(el.histChartCanvas, el.histChartNote);

const known = new Set();
const latest = new Map(); // dev -> telemetry
let selectedDevice = "__all__";

function ensureDevice(dev) {
  if (!dev || known.has(dev) || !el.deviceSel) return;
  known.add(dev);

  const opt = document.createElement("option");
  opt.value = dev;
  opt.textContent = dev;
  el.deviceSel.appendChild(opt);

  if (el.tsDevice && !el.tsDevice.value) {
    el.tsDevice.value = dev;
  }
}

function parseTelemetryFromWsMsg(msg) {
  if (!msg) return null;
  if (msg.type === "telemetry" && msg.data) return msg.data;
  return null;
}

function pickAnyLatestDevice() {
  for (const k of latest.keys()) return k;
  return "";
}

function renderActive() {
  const dev = (selectedDevice === "__all__") ? pickAnyLatestDevice() : selectedDevice;
  if (!dev) return;

  const t = latest.get(dev);
  if (!t) return;

  renderSensorCards(el.cards, t);

  if (el.meta) el.meta.textContent = `device=${dev}  time=${new Date().toLocaleString()}`;
  if (el.out) el.out.textContent = JSON.stringify(t, null, 2);

  const co2 = Number(t?.sensors?.co2);
  if (Number.isFinite(co2)) {
    chart.push(dev, co2, cfg?.aliyun?.maxPoints ?? cfg?.maxPoints ?? 120);
    chart.redraw(selectedDevice);
  }
}

function connect() {
  const url = (el.liveUrl?.value || "").trim();
  if (!url) {
    alert("liveUrl 不能为空");
    return;
  }

  if (wsConn) wsConn.end();

  wsConn = connectWsLive({
    url,
    onStatus: (ok, text) => setStatus(el.st, ok, text),
    onMessage: (msg) => {
      const t = parseTelemetryFromWsMsg(msg);
      if (!t) return;

      const dev = t.device || "unknown";
      ensureDevice(dev);
      latest.set(dev, t);

      if (selectedDevice === "__all__" || selectedDevice === dev) {
        renderActive();
      } else {
        const co2 = Number(t?.sensors?.co2);
        if (Number.isFinite(co2)) {
          chart.push(dev, co2, cfg?.aliyun?.maxPoints ?? cfg?.maxPoints ?? 120);
        }
      }
    }
  });

  if (el.hint) el.hint.textContent = url;
}

async function init() {
  if (!el.btnConn || !el.st) return;

  try {
    cfg = await loadConfig();
    const liveUrl = cfg?.aliyun?.liveUrl || "ws://120.55.249.41:3000/ws/live";
    if (el.liveUrl) el.liveUrl.value = liveUrl;
  } catch (e) {
    if (el.hint) el.hint.textContent = "config.json 读取失败：" + e.message;
    if (el.liveUrl) el.liveUrl.value = "ws://120.55.249.41:3000/ws/live";
  }

  el.deviceSel?.addEventListener("change", () => {
    selectedDevice = el.deviceSel.value;
    chart.redraw(selectedDevice);
    renderActive();
  });

  el.btnConn?.addEventListener("click", connect);

  el.btnDis?.addEventListener("click", () => {
    if (wsConn) wsConn.end();
    wsConn = null;
  });

  el.btnClear?.addEventListener("click", () => {
    latest.clear();
    known.clear();

    if (el.deviceSel) el.deviceSel.innerHTML = `<option value="__all__">全部设备（ALL）</option>`;
    if (el.cards) el.cards.innerHTML = "";
    if (el.meta) el.meta.textContent = "-";
    if (el.out) el.out.textContent = "{}";

    if (el.tsStatus) el.tsStatus.textContent = "-";
    if (el.tsDates) el.tsDates.innerHTML = "";
    if (el.tsStart) el.tsStart.value = "";
    if (el.tsEnd) el.tsEnd.value = "";
    if (el.tsHours) el.tsHours.innerHTML = "";

    if (el.histMeta) el.histMeta.textContent = "查询后会在这里显示历史数据摘要。";
    if (el.histRawMeta) el.histRawMeta.textContent = "-";
    if (el.histOut) el.histOut.textContent = "[]";

    histChart.clear();
    chart.clear();
  });

  // ===== Timescale history =====
  const tsProvider = createTimescaleRangeProvider({
    apiBase: cfg?.history?.timescale?.apiBase || "http://120.55.249.41",
    deviceInput: el.tsDevice,
    startInput: el.tsStart,
    endInput: el.tsEnd,
    statusEl: el.tsStatus,
    datesEl: el.tsDates,
    hoursEl: el.tsHours
  });

  el.tsListDays?.addEventListener("click", async () => {
    await tsProvider.listDays();
  });

  el.tsQuery?.addEventListener("click", async () => {
    const rows = await tsProvider.query();
    if (!rows || !rows.length) {
      if (el.histRawMeta) el.histRawMeta.textContent = "Timescale query: no data";
      if (el.histOut) el.histOut.textContent = "[]";
      if (el.histMeta) el.histMeta.textContent = "没有查到历史数据。";
      histChart.clear();
      return;
    }

    if (el.histRawMeta) {
      el.histRawMeta.textContent = `Timescale query: device=${el.tsDevice.value} rows=${rows.length}`;
    }
    if (el.histOut) {
      el.histOut.textContent = JSON.stringify(rows.slice(0, 20), null, 2);
    }

    const dev = el.tsDevice.value.trim() || rows[0]?.device || "unknown";
    const points = rows
      .map(r => {
        const payload = r.payload || {};
        const co2 = Number(
          payload?.sensors?.co2 ??
          payload?.co2 ??
          payload?.data?.sensors?.co2
        );
        const t = new Date(r.time).getTime();
        if (!Number.isFinite(co2) || !Number.isFinite(t)) return null;
        return { t, v: co2 };
      })
      .filter(Boolean);

    if (!points.length) {
      if (el.tsStatus) {
        el.tsStatus.textContent = `返回 ${rows.length} 条，但没有可绘制的 CO₂ 数据`;
      }
      if (el.histMeta) {
        el.histMeta.textContent = `device=${dev} | rows=${rows.length} | 无 CO₂ 曲线`;
      }
      histChart.clear();
      return;
    }

    histChart.redrawHistory(dev, points);

    if (el.histChartNote) {
      el.histChartNote.textContent = `Timescale history | device=${dev} | points=${points.length}`;
    }

    if (el.histMeta) {
      const first = rows[0]?.time || "-";
      const last = rows[rows.length - 1]?.time || "-";
      el.histMeta.textContent = `device=${dev} | rows=${rows.length} | from=${first} | to=${last}`;
    }
  });

  el.tsExport?.addEventListener("click", () => {
    tsProvider.exportCsv();
  });

  setStatus(el.st, false, "disconnected");
}

init();

window.addEventListener("viewer:tabchange", (e) => {
  if (e.detail?.tab === "aliyun") {
    chart.resize();
    chart.redraw(selectedDevice);
    histChart.resize();
  }
});