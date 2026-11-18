import http from "node:http";

// Only expose the ClassIn callback, never the administration API.
http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/api/webhooks/classin") {
    res.writeHead(404).end();
    return;
  }
  const upstream = http.request({
    hostname: "127.0.0.1", port: 3011, path: "/api/webhooks/classin",
    method: "POST", headers: { "content-type": "application/json" },
  }, response => {
    res.writeHead(response.statusCode, { "content-type": "application/json" });
    response.pipe(res);
  });
  upstream.on("error", () => res.writeHead(502).end());
  req.pipe(upstream);
}).listen(3012, "127.0.0.1", () => console.log("ClassIn callback proxy: 127.0.0.1:3012"));
