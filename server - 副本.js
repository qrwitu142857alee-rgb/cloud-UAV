import http from "http";
import fs from "fs";
import path from "path";
import { WebSocketServer } from "ws";

const webRoot = path.resolve("./web");

// 简单静态文件服务器：用于打开网页
const server = http.createServer((req, res) => {
  const urlPath = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(webRoot, urlPath);

  if (!filePath.startsWith(webRoot)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200);
    res.end(data);
  });
});

server.listen(3000, () => {
  console.log("HTTP: http://127.0.0.1:3000");
});

// WebSocket 服务：推送实时数据
const wss = new WebSocketServer({ port: 8080 });
console.log("WS: ws://127.0.0.1:8080");

// 每 1 秒广播一次“假数据”
setInterval(() => {
  const msg = JSON.stringify({
    type: "telemetry",
    data: {
      ts: Date.now(),
      device: "sim",
      sensors: {
        co2: Math.round(400 + Math.random() * 800),
        temp: Math.round((20 + Math.random() * 8) * 10) / 10,
        rh: Math.round((40 + Math.random() * 30) * 10) / 10
      }
    }
  });

  for (const c of wss.clients) {
    if (c.readyState === 1) c.send(msg);
  }
}, 1000);
