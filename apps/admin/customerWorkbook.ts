import { createReadStream, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

// The source workbook stays outside the public directory and production build.
export function customerWorkbook(): Plugin {
  const file = fileURLToPath(
    new URL("../../../docs/新材料/学生信息表.xlsx", import.meta.url),
  );
  return {
    name: "local-student-workbook",
    configureServer(server) {
      server.middlewares.use("/api/demo-student-workbook", (req, res) => {
        const addr = req.socket.remoteAddress,
          host = req.headers.host?.split(":")[0];
        if (
          req.method !== "GET" ||
          !["localhost", "127.0.0.1"].includes(host || "") ||
          !["::1", "127.0.0.1", "::ffff:127.0.0.1"].includes(addr || "") ||
          req.headers["sec-fetch-site"] === "cross-site" ||
          !existsSync(file)
        ) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("Cache-Control", "no-store");
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        createReadStream(file)
          .on("error", () => res.destroy())
          .pipe(res);
      });
    },
  };
}
