export class Co2LineChart {
  constructor(canvasEl, noteEl) {
    this.canvas = canvasEl;
    this.noteEl = noteEl;
    this.series = new Map(); // device -> [{tLabel, y}]
    this.lastDevice = null;
    window.addEventListener('resize', () => this.redraw('__all__'));
  }

  clear() {
    this.series.clear();
    this.lastDevice = null;
    this.redraw('__all__');
  }

  push(device, y, maxPoints) {
    const now = new Date();
    const tLabel = now.toLocaleTimeString();

    if (!this.series.has(device)) this.series.set(device, []);
    const arr = this.series.get(device);
    arr.push({ tLabel, y });
    if (arr.length > maxPoints) arr.splice(0, arr.length - maxPoints);

    this.lastDevice = device;
  }

  redraw(selectedDevice) {
    const device = (selectedDevice === '__all__') ? this.lastDevice : selectedDevice;
    this.draw(device);
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    return { w, h };
  }

  draw(device) {
    const { w, h } = this._resize();
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    const padL = 48, padR = 12, padT = 14, padB = 28;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // grid
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH * i / 4);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    }
    for (let i = 0; i <= 6; i++) {
      const x = padL + (plotW * i / 6);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
    }

    // axis
    ctx.strokeStyle = '#bbb';
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    const arr = device ? (this.series.get(device) || []) : [];
    if (arr.length < 2) {
      ctx.fillStyle = '#666';
      ctx.font = '12px system-ui, Segoe UI, Arial';
      ctx.fillText('等待数据…', padL + 8, padT + 18);
      this.noteEl.textContent = device ? `当前设备：${device}（数据点不足）` : '未选择设备或尚未收到数据';
      return;
    }

    const ys = arr.map(p => p.y);
    let yMin = Math.min(...ys);
    let yMax = Math.max(...ys);
    if (yMin === yMax) { yMin -= 1; yMax += 1; }

    // y ticks
    ctx.fillStyle = '#666';
    ctx.font = '12px system-ui, Segoe UI, Arial';
    for (let i = 0; i <= 4; i++) {
      const v = yMax - (yMax - yMin) * (i / 4);
      const y = padT + plotH * (i / 4);
      ctx.fillText(v.toFixed(1), 6, y + 4);
    }

    // line
    ctx.strokeStyle = '#1f77b4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < arr.length; i++) {
      const x = padL + plotW * (i / (arr.length - 1));
      const yNorm = (arr[i].y - yMin) / (yMax - yMin);
      const y = padT + plotH * (1 - yNorm);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const last = arr[arr.length - 1];
    const xLast = padL + plotW;
    const yLast = padT + plotH * (1 - (last.y - yMin) / (yMax - yMin));
    ctx.fillStyle = '#1f77b4';
    ctx.beginPath(); ctx.arc(xLast, yLast, 3, 0, Math.PI * 2); ctx.fill();

    this.noteEl.textContent =
      `设备：${device} ｜ 点数：${arr.length} ｜ min=${yMin.toFixed(1)} max=${yMax.toFixed(1)} ｜ latest=${last.y}`;
  }
}
