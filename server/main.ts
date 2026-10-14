import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import { App } from "./app.ts";
import { ClientHub } from "./web/clientHub.ts";
import { createHttpServer } from "./web/httpServer.ts";

// Fixed because it is part of the Spotify Redirect URI registered in the developer dashboard.
const PORT = 8888;
const lan = process.argv.includes("--lan");
const dev = process.argv.includes("--dev");

function openBrowser(url: string): void {
  const [command, args] = process.platform === "win32"
    ? ["cmd", ["/c", "start", "", url]]
    : [process.platform === "darwin" ? "open" : "xdg-open", [url]];
  spawn(command, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

const app = new App();
const server = createHttpServer(app);
new ClientHub(server, app);

server.listen(PORT, lan ? "0.0.0.0" : "127.0.0.1", () => {
  const local = `http://127.0.0.1:${PORT}`;
  console.log(`TTRPG Listener: ${local}`);
  if (lan) {
    const addresses = Object.values(networkInterfaces()).flat()
      .filter((a) => a && a.family === "IPv4" && !a.internal)
      .map((a) => `http://${a!.address}:${PORT}`);
    console.log(`W sieci lokalnej: ${addresses.join(", ")}`);
  }
  if (dev) {
    console.log("Tryb dev: panel z hot reload pod http://localhost:5173 (npm run dev:web)");
  } else {
    openBrowser(local);
  }
});
server.on("error", (error: NodeJS.ErrnoException) => {
  console.error(error.code === "EADDRINUSE" ? `Port ${PORT} jest zajęty — czy aplikacja już działa?` : error);
  process.exit(1);
});

app.start();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    app.shutdown();
    process.exit(0);
  });
}
