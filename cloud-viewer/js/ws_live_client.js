export function connectWsLive({ url, onStatus = () => {}, onMessage = () => {} }) {
  let ws = null;
  let closedByUser = false;
  let retry = 0;
  let timer = null;

  const set = (ok, msg) => onStatus(ok, msg);

  function open() {
    if (closedByUser) return;

    set(false, "connecting...");
    try {
      ws = new WebSocket(url);
    } catch (e) {
      set(false, "invalid url");
      scheduleRetry();
      return;
    }

    ws.onopen = () => {
      retry = 0;
      set(true, "connected");
    };

    ws.onmessage = (ev) => {
      try {
        onMessage(JSON.parse(ev.data));
      } catch {
        // ignore non-json
      }
    };

    ws.onerror = () => {
      // close 会触发 retry
    };

    ws.onclose = (ev) => {
      if (closedByUser) return;
      set(false, `disconnected (${ev.code}) retrying...`);
      scheduleRetry();
    };
  }

  function scheduleRetry() {
    const backoff = Math.min(8000, 500 * Math.pow(2, retry++));
    timer = setTimeout(open, backoff);
  }

  open();

  return {
    end() {
      closedByUser = true;
      if (timer) clearTimeout(timer);
      timer = null;
      if (ws && ws.readyState <= 1) ws.close();
      ws = null;
      set(false, "closed");
    }
  };
}