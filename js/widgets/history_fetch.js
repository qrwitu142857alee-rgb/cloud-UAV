// history_fetch.js
// 通过 HiveMQ 的 MQTT RPC：向田边电脑请求 CSV 或日期列表，然后在浏览器端拼接下载

function makeReqId() {
  return Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-6);
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function createHistoryFetcher({
  // ui
  histDeviceSel,
  histDateInput,
  btnFetchCsv,
  btnListDates,
  barEl,
  statusEl,
  datesEl,

  // getters
  getClient,          // () => mqtt client
  getConnectedId,     // () => clientId string (for reply topic uniqueness)
}) {
  let activeHandler = null;

  function setProgress(pct) {
    const v = Math.max(0, Math.min(100, pct));
    barEl.style.width = `${v}%`;
  }

  function setStatus(s) {
    statusEl.textContent = s;
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
      chip.title = "点击填入日期";
      chip.onclick = () => {
        histDateInput.value = day;
      };
      datesEl.appendChild(chip);
    }
  }

  function ensureClient() {
    const client = getClient();
    if (!client) throw new Error("MQTT 未连接：请先 Connect");
    return client;
  }

  function cleanup(client) {
    if (activeHandler) {
      client.removeListener("message", activeHandler);
      activeHandler = null;
    }
  }

  async function fetchCsv() {
    const client = ensureClient();
    cleanup(client);
    clearDates();

    const device = histDeviceSel.value;
    const date = histDateInput.value; // YYYY-MM-DD
    if (!device) { alert("请选择 device"); return; }
    if (!date) { alert("请选择 date"); return; }

    const reqId = makeReqId();
    const replyTo = `cloud/uav/rpc/history/reply/${getConnectedId()}`;

    // 订阅回包
    client.subscribe(replyTo);

    let expected = null;
    let received = 0;
    let filename = `${device}_${date}.csv`;
    let chunkArr = [];

    setProgress(0);
    setStatus(`请求中：${device} ${date}`);

    const handler = (t, payload) => {
      if (t !== replyTo) return;

      let msg;
      try { msg = JSON.parse(payload.toString()); } catch { return; }
      if (!msg || msg.reqId !== reqId) return;

      if (msg.type === "error") {
        setProgress(0);
        setStatus(`失败：${msg.message}${msg.file ? " | " + msg.file : ""}`);
        cleanup(client);
        return;
      }

      if (msg.type === "start") {
        expected = msg.totalChunks;
        filename = msg.filename || filename;
        chunkArr = new Array(expected);
        received = 0;
        setProgress(1);
        setStatus(`开始传输：chunks=${expected}`);
        return;
      }

      if (msg.type === "chunk") {
        if (expected === null) return; // 还没 start
        if (typeof msg.i !== "number") return;
        if (!chunkArr[msg.i]) {
          chunkArr[msg.i] = msg.dataB64 || "";
          received++;
          const pct = expected ? Math.floor((received / expected) * 100) : 1;
          setProgress(pct);
          setStatus(`接收中：${received}/${expected}`);
        }
        return;
      }

      if (msg.type === "end") {
        if (expected === null) {
          setStatus("结束：未收到 start（忽略）");
          cleanup(client);
          return;
        }

        // 拼接并下载
        try {
          const bytesList = chunkArr.map(b64ToBytes);
          const totalLen = bytesList.reduce((a, b) => a + b.length, 0);
          const merged = new Uint8Array(totalLen);
          let off = 0;
          for (const b of bytesList) { merged.set(b, off); off += b.length; }

          setProgress(100);
          setStatus(`完成：${filename}（${totalLen} bytes）`);
          downloadBytes(merged, filename);
        } catch (e) {
          setProgress(0);
          setStatus(`拼接失败：${e.message}`);
        } finally {
          cleanup(client);
        }
      }
    };

    activeHandler = handler;
    client.on("message", handler);

    // 发请求
    client.publish("cloud/uav/rpc/history/request", JSON.stringify({
      reqId,
      device,
      date,
      replyTo
    }));
  }

  // 列出某设备可用日期：需要田边端支持一个 list-dates RPC
  // 如果你田边端还没加这个功能，会返回失败（我们会提示你下一步怎么加）
  async function listDates() {
    const client = ensureClient();
    cleanup(client);

    const device = histDeviceSel.value;
    if (!device) { alert("请选择 device"); return; }

    const reqId = makeReqId();
    const replyTo = `cloud/uav/rpc/history/reply/${getConnectedId()}`;

    client.subscribe(replyTo);

    setProgress(0);
    setStatus(`请求日期列表：${device} ...`);
    clearDates();

    const handler = (t, payload) => {
      if (t !== replyTo) return;

      let msg;
      try { msg = JSON.parse(payload.toString()); } catch { return; }
      if (!msg || msg.reqId !== reqId) return;

      if (msg.type === "error") {
        setStatus(`失败：${msg.message}（如果你还没实现 list-dates RPC，这是正常的）`);
        cleanup(client);
        return;
      }

      if (msg.type === "dates") {
        const dates = Array.isArray(msg.dates) ? msg.dates : [];
        setStatus(`日期列表：${device}（${dates.length}）`);
        renderDates(dates);
        cleanup(client);
      }
    };

    activeHandler = handler;
    client.on("message", handler);

    // 发请求（田边端需实现）
    client.publish("cloud/uav/rpc/history/request", JSON.stringify({
      reqId,
      device,
      action: "list_dates",
      replyTo
    }));
  }

  btnFetchCsv.onclick = fetchCsv;
  btnListDates.onclick = listDates;

  return {
    setStatus,
    setProgress,
    renderDates,
    clearDates
  };
}
