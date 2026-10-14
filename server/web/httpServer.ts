import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import type { App } from "../app.ts";
import { WEB_DIR } from "../paths.ts";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
};
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

function page(title: string, message: string): string {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>`
    + `<body style="font:16px system-ui;background:#0d0f14;color:#e8e9ee;display:grid;place-items:center;height:100vh;margin:0">`
    + `<p>${message.replace(/</g, "&lt;")}</p>`;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) {
        req.destroy(new Error("plik za duży"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function createHttpServer(app: App): Server {
  const routes = new Map(app.integrations.flatMap((i) => Object.entries(i.routes)));

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const route = routes.get(url.pathname);
    if (route && req.method === "GET") {
      try {
        res.writeHead(200, { "Content-Type": MIME[".html"] }).end(page("TTRPG Listener", await route(url)));
      } catch (error) {
        const message = (error as Error).message;
        app.log.emit("error", `${url.pathname}: ${message}`);
        res.writeHead(500, { "Content-Type": MIME[".html"] }).end(page("Błąd", message));
      }
      return;
    }

    if (url.pathname === "/api/transcribe" && req.method === "POST") {
      // Body: 16 kHz mono PCM16, already decoded and resampled by the browser.
      try {
        const body = await readBody(req);
        const pcm = new Int16Array(new Uint8Array(body).buffer, 0, body.length >> 1);
        res.writeHead(202).end();
        await app.speech.transcribeFile(pcm, url.searchParams.get("name") ?? "plik");
      } catch (error) {
        app.log.emit("error", `Transkrypcja pliku: ${(error as Error).message}`);
        if (!res.headersSent) {
          res.writeHead(500).end((error as Error).message);
        }
      }
      return;
    }

    let file = url.pathname === "/" ? "index.html" : url.pathname === "/projector" ? "projector.html" : url.pathname.slice(1);
    file = normalize(file);
    const path = join(WEB_DIR, file);
    if (file.startsWith("..") || !existsSync(path) || !statSync(path).isFile()) {
      const missingBuild = !existsSync(join(WEB_DIR, "index.html"));
      res.writeHead(404, { "Content-Type": MIME[".html"] })
        .end(page("404", missingBuild ? "Brak zbudowanego panelu — uruchom „npm start” albo „npm run dev:web”." : "Nie znaleziono"));
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[extname(path)] ?? "application/octet-stream",
      "Cache-Control": file.startsWith("assets") ? "public, max-age=31536000, immutable" : "no-cache",
    });
    createReadStream(path).pipe(res);
  });
}
