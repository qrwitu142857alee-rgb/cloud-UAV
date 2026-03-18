// WebSocket 地址：先用固定 8080（你现在就是 8080）
// 后面我们再升级成“自动跟随端口”
// const ws = new WebSocket("ws://127.0.0.1:8080");
const ws = new WebSocket(`ws://${location.hostname}:8080`);

const $ = (id) => document.getElementById(id);

let pendingUplink = null; // { sel:"hive|aliyun|both|off", ts:number }

// ===== 多设备状态 =====
const latestByDevice = new Map();   // device -> latest telemetry {ts, device, sensors}
const statusByDevice = new Map();   // device -> status {device, online, lastTs}
const seriesByDevice = new Map();   // device -> [{ts, co2}]
let selectedDevice = "";            // "" 表示 auto

// ===== 图表 =====
const windowMs = 60_000;

const canvas = $("chart");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  // 用 CSS 像素坐标绘图
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", () => { resizeCanvas(); draw(); });

function getActiveDevice() {
  if (selectedDevice && latestByDevice.has(selectedDevice)) return selectedDevice;
  for (const k of latestByDevice.keys()) return k; // auto：第一个有数据的设备
  return "";
}

function ensureDeviceOption(dev) {
  const sel = $("deviceSelect");
  for (const opt of sel.options) {
    if (opt.value === dev) return;
  }
  const opt = document.createElement("option");
  opt.value = dev;
  opt.textContent = dev;
  sel.appendChild(opt);
}

function setStatusPill(online, device) {
  const dot = $("statusDot");
  const txt = $("statusText");
  txt.textContent = `${device} · ${online ? "ONLINE" : "OFFLINE"}`;
  dot.classList.remove("good", "bad");
  dot.classList.add(online ? "good" : "bad");
}

function pushPoint(device, ts, co2) {
  if (!Number.isFinite(co2)) return;
  if (!seriesByDevice.has(device)) seriesByDevice.set(device, []);
  const arr = seriesByDevice.get(device);

  arr.push({ ts, co2 });
  const cutoff = Date.now() - windowMs;
  while (arr.length && arr[0].ts < cutoff) arr.shift();
}

function renderActive() {
  const dev = getActiveDevice();
  if (!dev) return;

  // 设备下拉框补全
  ensureDeviceOption(dev);
  for (const d of latestByDevice.keys()) ensureDeviceOption(d);

  // 让下拉框显示当前选择（如果用户选了）
  if (selectedDevice) $("deviceSelect").value = selectedDevice;

  // telemetry
  const d = latestByDevice.get(dev);
  if (d) {
    const s = d.sensors || {};
    const co2 = s.co2 == null ? null : Number(s.co2);
    const temp = s.temp == null ? null : Number(s.temp);
    const rh = s.rh == null ? null : Number(s.rh);

    $("co2").textContent = co2 ?? "--";
    $("temp").textContent = temp ?? "--";
    $("rh").textContent = rh ?? "--";
    $("raw").textContent = JSON.stringify(d, null, 2);
  }

  // status
  const st = statusByDevice.get(dev);
  if (st) setStatusPill(!!st.online, st.device);

  draw();
}

function draw() {
  const w = canvas.getBoundingClientRect().width;
  const h = canvas.getBoundingClientRect().height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(0,0,0,.18)";
  ctx.fillRect(0, 0, w, h);

  const margin = { left: 56, right: 16, top: 22, bottom: 28 };
  const pw = w - margin.left - margin.right;
  const ph = h - margin.top - margin.bottom;

  // 标题
  ctx.fillStyle = "#a9b2d6";
  ctx.font = "12px system-ui";
  const dev = getActiveDevice() || "--";
  ctx.fillText(`CO₂ (ppm) · ${dev} · last 60s`, margin.left, 14);

  // 轴框
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.strokeRect(margin.left, margin.top, pw, ph);

  const arr = seriesByDevice.get(dev) || [];
  if (arr.length === 0) return;

  // min/max
  let min = Infinity, max = -Infinity;
  for (const p of arr) { min = Math.min(min, p.co2); max = Math.max(max, p.co2); }
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.12;
  min -= pad; max += pad;

  const now = Date.now();
  const t0 = now - windowMs;

  const xOf = (ts) => margin.left + ((ts - t0) / windowMs) * pw;
  const yOf = (v)  => margin.top + ph - ((v - min) / (max - min)) * ph;

  // 网格 + Y刻度
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

  // 折线
  ctx.strokeStyle = "rgba(120,180,255,.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xOf(arr[0].ts), yOf(arr[0].co2));
  for (let i = 1; i < arr.length; i++) ctx.lineTo(xOf(arr[i].ts), yOf(arr[i].co2));
  ctx.stroke();

  // 末端点
  const last = arr[arr.length - 1];
  ctx.fillStyle = "rgba(120,180,255,1)";
  ctx.beginPath();
  ctx.arc(xOf(last.ts), yOf(last.co2), 3.2, 0, Math.PI * 2);
  ctx.fill();
}

function setChip(el, text, state) {
  el.textContent = text;
  el.dataset.state = state; // 方便你用 css 区分颜色
}

const modeEl = document.getElementById("uplinkHint"); // 也可以单独放 chip
const uplinkSel = document.getElementById("uplinkSel");

const activeEl = document.getElementById("uplinkActive");
const hiveEl = document.getElementById("uplinkHive");
const aliEl  = document.getElementById("uplinkAliyun");

function uiSetHint(text) {
  const el = document.getElementById("uplinkHint");
  if (el) el.textContent = text;
}

// ===== WS =====
// ws.onopen = () => console.log("WS open");
ws.onopen = () => console.log("WS open", ws.url);
ws.onerror = (e) => console.log("WS error", e);
ws.onclose = (e) => console.log("WS close", e.code, e.reason);

ws.onmessage = (ev) => {
  // const msg = JSON.parse(ev.data);
  let msg;
  try { msg = JSON.parse(ev.data); } catch { return; }

  console.log("WS msg:", msg);

  if (msg.type === "sys" && msg.kind === "uplink") {
    // 1) 两条链路（是否连得上 broker）
    if (msg.name === "hive") {
      setChip(hiveEl, `Hive link: ${msg.state}${msg.detail ? " | " + msg.detail : ""}`, msg.state);
    }
    if (msg.name === "aliyun") {
      setChip(aliEl, `Aliyun link: ${msg.state}${msg.detail ? " | " + msg.detail : ""}`, msg.state);
    }

    // 2) 当前路由开关（实际在往哪里发）
    if (msg.name === "uplinks") {
      const detail = (msg.detail || "").trim(); // "hive" / "aliyun" / "hive,aliyun" / ""
      const label = detail ? detail : "off";

      // ✅ Active：只有在 WS 确认后才显示最终值
      if (activeEl) setChip(activeEl, `Active: ${label}`, detail ? "enabled" : "off");

      // ✅ hint：长期显示最终结果（不回到 -）
      uiSetHint(`已生效：${label}`);

      // 下拉同步（可选）
      const d = detail.split(",").map(s => s.trim()).filter(Boolean);
      const v = d.length === 0 ? "off" : (d.length === 2 ? "both" : d[0]);
      if (uplinkSel) uplinkSel.value = v;

      // 解除按钮禁用
      const btn = document.getElementById("btnApplyUplink");
      if (btn) btn.disabled = false;

      pendingUplink = null;
    }

    return;
  }

  if (msg.type === "telemetry") {
    const d = msg.data;
    const dev = d.device || "unknown";
    latestByDevice.set(dev, d);

    const s = d.sensors || {};
    const co2 = s.co2 == null ? null : Number(s.co2);
    pushPoint(dev, Date.now(), co2);

    // auto 模式下，第一次收到设备就立即渲染
    renderActive();
    return;
  }

  if (msg.type === "status") {
    const st = msg.data;
    statusByDevice.set(st.device, st);
    renderActive();
    return;
  }
};

// 下拉框选择
$("deviceSelect").addEventListener("change", () => {
  selectedDevice = $("deviceSelect").value; // "" = auto
  renderActive();
});

// last seen 刷新（按当前设备）
setInterval(() => {
  const dev = getActiveDevice();
  if (!dev) return;
  const st = statusByDevice.get(dev);
  if (!st || !st.lastTs) return;
  $("ago").textContent = String(Date.now() - st.lastTs);
}, 300);

// 时间窗口推进
setInterval(draw, 1000);

// 初始化
resizeCanvas();
setStatusPill(false, "--");
draw();

async function setUplinksOnServer(arr) {
  const resp = await fetch("/api/uplinks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uplinks: arr })
  });
  if (!resp.ok) throw new Error("set uplinks failed: " + resp.status);
  return await resp.json();
}

document.getElementById("btnApplyUplink")?.addEventListener("click", async () => {
  const sel = document.getElementById("uplinkSel")?.value || "hive";
  let arr = [];
  if (sel === "hive") arr = ["hive"];
  else if (sel === "aliyun") arr = ["aliyun"];
  else if (sel === "both") arr = ["hive", "aliyun"];
  else if (sel === "off") arr = [];

  pendingUplink = { sel, ts: Date.now() };

  // ✅ UI：进入“切换中”
  if (activeEl) setChip(activeEl, "Active: switching…", "switching");
  uiSetHint("切换中…（等待网关确认）");

  // 按钮可选：暂时禁用，避免连点
  const btn = document.getElementById("btnApplyUplink");
  if (btn) btn.disabled = true;

  try {
    await setUplinksOnServer(arr);
    // ✅ 注意：这里不宣布成功，必须等 WS 的 uplinks 回包确认
    uiSetHint("请求已发送…");
  } catch (e) {
    pendingUplink = null;
    if (activeEl) setChip(activeEl, "Active: error", "error");
    uiSetHint("失败：" + e.message);
    if (btn) btn.disabled = false;
  }
});


// if (hiveEl) hiveEl.textContent = "Hive: ui-ok";
// if (aliEl) aliEl.textContent = "Aliyun: ui-ok";
