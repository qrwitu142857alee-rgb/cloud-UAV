// Timescale 历史数据提供者（HTTP）
// 约定 API：
//   GET /api/query
//   GET /api/export.csv
//   GET /api/dates   （可选）

function isoDayRange(day) {
  // day: YYYY-MM-DD
  const from = `${day}T00:00:00Z`;
  const to = `${day}T00:00:00Z`;
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + 1);
  return { from, to: d.toISOString() };
}

export function createTimescaleHistoryProvider({
  apiBase = "",
  histDeviceSel,
  histDateInput,
  barEl,
  statusEl,
  datesEl
}) {
  function setStatus(s) {
    statusEl.textContent = s;
  }

  function setProgress(pct) {
    const v = Math.max(0, Math.min(100, pct));
    barEl.style.width = `${v}%`;
  }

  function clearDates() {
    datesEl.innerHTML = "";
  }

  function renderDates(dates) {
    clearDates();
    if (!dates || !dates.length) {
      const d = document.createElement("div");
      d.className = "muted small";
      d.textContent = "（无）";
      datesEl.appendChild(d);
      return;
    }
    for (const day of dates) {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.textContent = day;
      chip.onclick = () => histDateInput.value = day;
      datesEl.appendChild(chip);
    }
  }

  async function listDates() {
    const device = histDeviceSel.value;
    if (!device) { alert("请选择 device"); return; }

    setStatus("云端查询日期列表...");
    setProgress(10);
    clearDates();

    try {
      const r = await fetch(`${apiBase}/api/dates?device=${encodeURIComponent(device)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const dates = await r.json();
      renderDates(dates);
      setProgress(100);
      setStatus(`云端日期：${dates.length}`);
    } catch (e) {
      setProgress(0);
      setStatus(`云端日期失败：${e.message}`);
    }
  }

  async function fetchCsv() {
    const device = histDeviceSel.value;
    const day = histDateInput.value;
    if (!device) { alert("请选择 device"); return; }
    if (!day) { alert("请选择 date"); return; }

    const { from, to } = isoDayRange(day);
    const url = `${apiBase}/api/export.csv?device=${encodeURIComponent(device)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

    setStatus(`云端下载：${device} ${day}`);
    setProgress(30);

    // 直接下载（浏览器处理）
    window.open(url, "_blank");

    setTimeout(() => {
      setProgress(100);
      setStatus(`已请求云端 CSV：${day}`);
    }, 500);
  }

  return {
    listDates,
    fetchCsv,
    setStatus,
    setProgress,
    renderDates,
    clearDates
  };
}
