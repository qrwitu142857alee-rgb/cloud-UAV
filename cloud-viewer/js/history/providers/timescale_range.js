export function createTimescaleRangeProvider({
  apiBase = "",
  deviceInput,
  startInput,
  endInput,
  statusEl,
  datesEl,
  hoursEl
}) {
  function setStatus(s) {
    if (statusEl) statusEl.textContent = s;
  }

  function clearDates() {
    if (datesEl) datesEl.innerHTML = "";
  }

  function clearHours() {
    if (hoursEl) hoursEl.innerHTML = "";
  }

  function renderDates(rows, onPickDay) {
    clearDates();
    clearHours();

    if (!datesEl) return;

    if (!rows || !rows.length) {
      const d = document.createElement("div");
      d.className = "muted small";
      d.textContent = "（无）";
      datesEl.appendChild(d);
      return;
    }

    for (const row of rows) {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.textContent = `${row.day} (${row.count})`;
      chip.title = `first=${row.first_time} | last=${row.last_time}`;

      chip.onclick = () => {
        startInput.value = `${row.day}T00:00`;
        endInput.value = `${row.day}T23:59`;
        if (typeof onPickDay === "function") onPickDay(row.day);
      };

      datesEl.appendChild(chip);
    }
  }

  function renderHours(rows, day) {
    clearHours();
    if (!hoursEl) return;

    if (!rows || !rows.length) {
      const d = document.createElement("div");
      d.className = "muted small";
      d.textContent = "（无）";
      hoursEl.appendChild(d);
      return;
    }

    for (const row of rows) {
      const hh = String(row.hour).padStart(2, "0");
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.textContent = `${hh}:00 (${row.count})`;
      chip.title = `first=${row.first_time} | last=${row.last_time}`;

      chip.onclick = () => {
        startInput.value = `${day}T${hh}:00`;
        endInput.value = `${day}T${hh}:59`;
      };

      hoursEl.appendChild(chip);
    }
  }

  function buildParams() {
    const device = deviceInput.value.trim();
    const start = startInput.value;
    const end = endInput.value;

    if (!device) {
      alert("device 不能为空");
      return null;
    }

    if (!start || !end) {
      alert("start / end 不能为空");
      return null;
    }

    const from = new Date(start).toISOString();
    const to = new Date(end).toISOString();

    return { device, from, to };
  }

  async function listDays() {
    const device = deviceInput.value.trim();
    if (!device) {
      alert("device 不能为空");
      return null;
    }

    const url = `${apiBase}/api/dates?device=${encodeURIComponent(device)}`;
    console.log("[timescale] dates url =", url);
    setStatus("列出日期中...");

    try {
      const r = await fetch(url);
      const text = await r.text();

      if (!r.ok) throw new Error(`HTTP ${r.status} | ${text.slice(0, 200)}`);

      const data = JSON.parse(text);
      renderDates(data, async (day) => {
        await listHours(day);
      });
      setStatus(`共 ${data.length} 个日期`);
      return data;
    } catch (e) {
      console.error("[timescale] listDays failed:", e);
      setStatus(`列出日期失败: ${e.message}`);
      return null;
    }
  }

  async function listHours(day) {
    const device = deviceInput.value.trim();
    if (!device) {
      alert("device 不能为空");
      return null;
    }
    if (!day) return null;

    const url =
      `${apiBase}/api/hours?device=${encodeURIComponent(device)}` +
      `&day=${encodeURIComponent(day)}`;

    console.log("[timescale] hours url =", url);
    setStatus(`列出 ${day} 的小时中...`);

    try {
      const r = await fetch(url);
      const text = await r.text();

      if (!r.ok) throw new Error(`HTTP ${r.status} | ${text.slice(0, 200)}`);

      const data = JSON.parse(text);
      renderHours(data, day);
      setStatus(`${day} 共 ${data.length} 个小时段`);
      return data;
    } catch (e) {
      console.error("[timescale] listHours failed:", e);
      setStatus(`列出小时失败: ${e.message}`);
      return null;
    }
  }

  async function query() {
    const p = buildParams();
    if (!p) return null;

    const url =
      `${apiBase}/api/query?device=${encodeURIComponent(p.device)}` +
      `&from=${encodeURIComponent(p.from)}` +
      `&to=${encodeURIComponent(p.to)}` +
      `&limit=5000`;

    console.log("[timescale] query url =", url);
    setStatus("查询中...");

    try {
      const r = await fetch(url);
      const text = await r.text();

      if (!r.ok) {
        throw new Error(`HTTP ${r.status} | ${text.slice(0, 200)}`);
      }

      const data = JSON.parse(text);
      setStatus(`返回 ${data.length} 条数据`);
      return data;
    } catch (e) {
      console.error("[timescale] query failed:", e);
      setStatus(`查询失败: ${e.message}`);
      return null;
    }
  }

  function exportCsv() {
    const p = buildParams();
    if (!p) return;

    const url =
      `${apiBase}/api/export.csv?device=${encodeURIComponent(p.device)}` +
      `&from=${encodeURIComponent(p.from)}` +
      `&to=${encodeURIComponent(p.to)}`;

    console.log("[timescale] export url =", url);
    window.open(url, "_blank");
    setStatus("已请求 CSV 下载");
  }

  return {
    listDays,
    listHours,
    query,
    exportCsv,
    setStatus,
    clearDates,
    clearHours,
    renderDates,
    renderHours
  };
}