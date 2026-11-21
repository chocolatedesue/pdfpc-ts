#!/usr/bin/env bun
/**
 * pdfpc-ts CLI
 * Direct presenter-mode launcher & remote development server for PDF presentations.
 * Works seamlessly with Bun or Node.js, local Chrome, or Next Terminal / Tailscale remote nodes.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CliOptions {
  pdfPath: string;
  mode?: "no-notes" | "notes-right" | "auto";
  port: number;
  host: string;
  useRemote: boolean;
  appMode: boolean;
  fullscreen: boolean;
  noOpen: boolean;
  watch: boolean;
  initialPage: number;
  durationMinutes?: number;
  customBrowser?: string;
  help: boolean;
  version: boolean;
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".ico": "image/x-icon",
};

function printHelp() {
  console.log(`
\x1b[1m\x1b[36mpdfpc-ts CLI\x1b[0m — Direct PDF Presenter Launcher & Remote Dev Server

\x1b[1mUSAGE:\x1b[0m
  pdfpc [options] <path-to-pdf>
  bun run cli.ts [options] <path-to-pdf>

\x1b[1mOPTIONS:\x1b[0m
  -m, --mode <mode>        Layout mode: "auto", "no-notes" (16:9), or "notes-right" (32:9)
                           (default: "auto" — auto-detects 32:9 dual-screen notes)
      --notes              Shortcut for --mode notes-right
      --no-notes           Shortcut for --mode no-notes
  -P, --page <number>      Initial 1-based slide page number to open (default: 1)
  -d, --duration <mins>    Target talk duration in minutes for countdown/pacing alerts
  -w, --watch              Watch PDF file for changes (e.g. Typst/Touying live recompile)
                           and hot-reload slides in the browser automatically via SSE
  -p, --port <number>      HTTP port to serve the PDF (default: random available port)
  -H, --host <address>     Bind address (default: 127.0.0.1)
      --tailscale, --lan   Bind to 0.0.0.0 and print Tailscale / LAN URLs (auto-enables
                           headless server persistence for Next Terminal remote nodes)
      --no-open, --headless
                           Start the presentation HTTP/SSE server without launching Chrome
      --remote             Use Cloudflare remote app (https://pdfpc.l3j.pw) instead of local dist
      --local              Force local static serving from dist/ (default if dist/ exists)
      --chrome <path>      Explicit path to Chrome/Chromium binary
      --no-app             Open in regular browser tab instead of Chrome standalone app window
  -f, --fullscreen         Launch Chrome in fullscreen mode
  -v, --version            Display version info
  -h, --help               Display this help message

\x1b[1mEXAMPLES:\x1b[0m
  bun run cli.ts presentation.pdf
  bun run cli.ts --watch --notes NetLoom-APSys26-talk-notes.pdf
  bun run cli.ts --tailscale --watch --port 8765 deck.pdf
  bun run cli.ts --fullscreen --duration 15 talk-handout.pdf
`);
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    pdfPath: "",
    port: 0,
    host: "127.0.0.1",
    useRemote: false,
    appMode: true,
    fullscreen: false,
    noOpen: false,
    watch: false,
    initialPage: 1,
    help: false,
    version: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "-v" || arg === "--version") {
      options.version = true;
    } else if (arg === "-m" || arg === "--mode") {
      const val = args[++i];
      if (val === "no-notes" || val === "notes-right" || val === "auto") {
        options.mode = val;
      } else {
        console.error(
          `\x1b[31mError:\x1b[0m Invalid mode "${val}". Must be "auto", "no-notes", or "notes-right".`,
        );
        process.exit(1);
      }
    } else if (arg === "--notes") {
      options.mode = "notes-right";
    } else if (arg === "--no-notes") {
      options.mode = "no-notes";
    } else if (arg === "-p" || arg === "--port") {
      options.port = parseInt(args[++i], 10) || 0;
    } else if (arg === "-H" || arg === "--host") {
      options.host = args[++i] || "127.0.0.1";
    } else if (arg === "--tailscale" || arg === "--lan") {
      options.host = "0.0.0.0";
      if (!options.port) options.port = 8765;
    } else if (arg === "--no-open" || arg === "--headless") {
      options.noOpen = true;
    } else if (arg === "-w" || arg === "--watch") {
      options.watch = true;
    } else if (arg === "-P" || arg === "--page") {
      const p = parseInt(args[++i], 10);
      if (p && p > 0) options.initialPage = p;
    } else if (arg === "-d" || arg === "--duration") {
      const d = parseFloat(args[++i]);
      if (d && d > 0) options.durationMinutes = d;
    } else if (arg === "--remote") {
      options.useRemote = true;
    } else if (arg === "--local") {
      options.useRemote = false;
    } else if (arg === "--no-app") {
      options.appMode = false;
    } else if (arg === "-f" || arg === "--fullscreen") {
      options.fullscreen = true;
    } else if (arg === "--chrome") {
      options.customBrowser = args[++i];
    } else if (!arg.startsWith("-") && !options.pdfPath) {
      options.pdfPath = arg;
    }
    i++;
  }

  return options;
}

function getNetworkAddresses(): { name: string; ip: string; isTailscale: boolean }[] {
  const interfaces = os.networkInterfaces();
  const results: { name: string; ip: string; isTailscale: boolean }[] = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal) {
        const isTailscale =
          name.toLowerCase().includes("tailscale") ||
          name.toLowerCase().startsWith("utun") ||
          addr.address.startsWith("100.");
        results.push({ name, ip: addr.address, isTailscale });
      }
    }
  }
  return results.sort((a, b) => Number(b.isTailscale) - Number(a.isTailscale));
}

function findChromeBinary(customPath?: string): string | null {
  if (customPath) {
    if (fs.existsSync(customPath)) return customPath;
    console.warn(`\x1b[33mWarning:\x1b[0m Custom browser "${customPath}" not found.`);
  }

  const platform = os.platform();

  // On Linux without a graphical DISPLAY or WAYLAND_DISPLAY (e.g. Next Terminal SSH node),
  // skip launching a local desktop browser unless explicitly requested.
  if (
    platform === "linux" &&
    !process.env.DISPLAY &&
    !process.env.WAYLAND_DISPLAY &&
    !customPath
  ) {
    return null;
  }

  if (platform === "darwin") {
    const macPaths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      path.join(os.homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    ];
    for (const p of macPaths) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  if (platform === "linux") {
    const linuxBins = [
      "google-chrome-stable",
      "google-chrome",
      "chromium-browser",
      "chromium",
      "brave-browser",
      "microsoft-edge-stable",
    ];
    for (const bin of linuxBins) {
      try {
        const p = execSync(`which ${bin} 2>/dev/null`, { encoding: "utf-8" }).trim();
        if (p && fs.existsSync(p)) return p;
      } catch {}
    }
    return null;
  }

  if (platform === "win32") {
    const winPaths = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(os.homedir(), "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"),
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ];
    for (const p of winPaths) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  return null;
}

function findDistDir(): string | null {
  const candidates = [
    path.resolve(__dirname, "dist"),
    path.resolve(path.dirname(process.execPath), "dist"),
    path.resolve(process.cwd(), "dist"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.existsSync(path.join(dir, "index.html"))) {
      return dir;
    }
  }
  return null;
}

function startServer(
  pdfAbsPath: string,
  distDir: string | null,
  host: string,
  requestedPort: number,
  watchEnabled: boolean,
): Promise<{ server: http.Server; port: number; closeWatcher: () => void }> {
  return new Promise((resolve, reject) => {
    const sseClients = new Set<http.ServerResponse>();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastMtimeMs = 0;

    try {
      lastMtimeMs = fs.statSync(pdfAbsPath).mtimeMs;
    } catch {}

    const notifyReload = () => {
      try {
        const stat = fs.statSync(pdfAbsPath);
        if (stat.size === 0) return; // Wait until atomic write finishes
        if (stat.mtimeMs === lastMtimeMs) return;
        lastMtimeMs = stat.mtimeMs;
        const payload = JSON.stringify({
          type: "reload",
          mtime: stat.mtimeMs,
          size: stat.size,
        });
        console.log(
          `\x1b[1m\x1b[35m[pdfpc:watch]\x1b[0m PDF updated (${(stat.size / (1024 * 1024)).toFixed(2)} MB) → broadcasting hot-reload to ${sseClients.size} client(s)`,
        );
        for (const client of sseClients) {
          client.write(`data: ${payload}\n\n`);
        }
      } catch {}
    };

    let watcher: fs.FSWatcher | null = null;
    if (watchEnabled) {
      const parentDir = path.dirname(pdfAbsPath);
      const targetBase = path.basename(pdfAbsPath);
      try {
        watcher = fs.watch(parentDir, (_eventType, filename) => {
          if (!filename || filename === targetBase) {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(notifyReload, 180);
          }
        });
      } catch (err) {
        console.warn(`\x1b[33m[pdfpc:watch]\x1b[0m Warning: fs.watch failed:`, err);
      }
    }

    const closeWatcher = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (watcher) {
        try {
          watcher.close();
        } catch {}
      }
      for (const client of sseClients) {
        try {
          client.end();
        } catch {}
      }
      sseClients.clear();
    };

    const server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
      const pathname = parsedUrl.pathname;

      // CORS & Cross-Origin isolation headers for WASM / Worker performance
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "*");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      // Server-Sent Events endpoint for live PDF reload (--watch)
      if (pathname === "/__pdfpc_events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        });
        res.write(
          `data: ${JSON.stringify({
            type: "connected",
            watch: watchEnabled,
            fileName: path.basename(pdfAbsPath),
          })}\n\n`,
        );
        sseClients.add(res);
        req.on("close", () => {
          sseClients.delete(res);
        });
        return;
      }

      // Metadata API endpoint for CLI status inspection
      if (pathname === "/__pdfpc_meta") {
        try {
          const stat = fs.statSync(pdfAbsPath);
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(
            JSON.stringify({
              fileName: path.basename(pdfAbsPath),
              size: stat.size,
              mtimeMs: stat.mtimeMs,
              watch: watchEnabled,
            }),
          );
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      // Serve the target presentation PDF
      if (pathname === "/slide.pdf") {
        try {
          const stat = fs.statSync(pdfAbsPath);
          res.writeHead(200, {
            "Content-Type": "application/pdf",
            "Content-Length": stat.size,
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "X-Pdf-Filename": encodeURIComponent(path.basename(pdfAbsPath)),
          });
          if (req.method === "HEAD") {
            res.end();
            return;
          }
          const stream = fs.createReadStream(pdfAbsPath);
          stream.pipe(res);
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end(`Error reading PDF: ${err.message}`);
        }
        return;
      }

      // Serve static frontend assets from distDir if available
      if (distDir && fs.existsSync(distDir)) {
        const relPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
        const filePath = path.resolve(distDir, relPath);

        // Security check: prevent directory traversal
        if (!filePath.startsWith(distDir)) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const contentType = MIME_TYPES[ext] || "application/octet-stream";
          res.writeHead(200, {
            "Content-Type": contentType,
            "Cache-Control":
              ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
          });
          if (req.method === "HEAD") {
            res.end();
            return;
          }
          fs.createReadStream(filePath).pipe(res);
          return;
        }

        // SPA fallback to index.html
        const indexPath = path.join(distDir, "index.html");
        if (fs.existsSync(indexPath)) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          fs.createReadStream(indexPath).pipe(res);
          return;
        }
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    });

    server.on("error", reject);

    server.listen(requestedPort, host, () => {
      const address = server.address();
      const actualPort =
        typeof address === "object" && address ? address.port : requestedPort;
      resolve({ server, port: actualPort, closeWatcher });
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (options.version) {
    console.log("pdfpc-ts CLI v1.1.0");
    process.exit(0);
  }

  if (!options.pdfPath) {
    console.error("\x1b[31mError:\x1b[0m No PDF file specified.\n");
    printHelp();
    process.exit(1);
  }

  const pdfAbsPath = path.resolve(process.cwd(), options.pdfPath);
  if (!fs.existsSync(pdfAbsPath)) {
    console.error(`\x1b[31mError:\x1b[0m File not found: ${pdfAbsPath}`);
    process.exit(1);
  }

  const stat = fs.statSync(pdfAbsPath);
  if (!stat.isFile()) {
    console.error(`\x1b[31mError:\x1b[0m Specified path is not a file: ${pdfAbsPath}`);
    process.exit(1);
  }

  const fileSizeMb = (stat.size / (1024 * 1024)).toFixed(2);
  console.log(
    `\x1b[1m\x1b[36m[pdfpc]\x1b[0m Loading: \x1b[1m${path.basename(pdfAbsPath)}\x1b[0m (${fileSizeMb} MB)`,
  );

  const distDirCandidate = findDistDir();
  const isLocalMode = !options.useRemote && distDirCandidate !== null;
  const distDirToServe = isLocalMode ? distDirCandidate : null;

  console.log(
    `\x1b[1m\x1b[36m[pdfpc]\x1b[0m Engine: ${
      isLocalMode
        ? `\x1b[32mLocal offline mode\x1b[0m (${distDirToServe})`
        : "\x1b[33mRemote mode\x1b[0m (https://pdfpc.l3j.pw)"
    }`,
  );
  if (options.watch) {
    console.log(
      `\x1b[1m\x1b[35m[pdfpc]\x1b[0m Live watch enabled: changes to \x1b[1m${path.basename(pdfAbsPath)}\x1b[0m will auto-reload slides`,
    );
  }

  const { server, port, closeWatcher } = await startServer(
    pdfAbsPath,
    distDirToServe,
    options.host,
    options.port,
    options.watch,
  );

  // Build query parameters
  const queryParts: string[] = [];
  if (options.mode) queryParts.push(`mode=${encodeURIComponent(options.mode)}`);
  if (options.initialPage > 1) queryParts.push(`page=${options.initialPage}`);
  if (options.durationMinutes) queryParts.push(`duration=${options.durationMinutes}`);
  if (options.watch) queryParts.push(`watch=1`);
  const extraQuery = queryParts.length > 0 ? `&${queryParts.join("&")}` : "";

  const displayHost = options.host === "0.0.0.0" ? "127.0.0.1" : options.host;
  const targetUrl = isLocalMode
    ? `http://${displayHost}:${port}/?file=/slide.pdf${extraQuery}`
    : `https://pdfpc.l3j.pw/?file=http://${displayHost}:${port}/slide.pdf${extraQuery}`;

  console.log(
    `\x1b[1m\x1b[36m[pdfpc]\x1b[0m Local URL:   \x1b[1m\x1b[4m${targetUrl}\x1b[0m`,
  );

  if (options.host === "0.0.0.0") {
    const netAddrs = getNetworkAddresses();
    for (const addr of netAddrs) {
      const label = addr.isTailscale ? `\x1b[32mTailscale (${addr.name})\x1b[0m` : `LAN (${addr.name})`;
      const netUrl = isLocalMode
        ? `http://${addr.ip}:${port}/?file=/slide.pdf${extraQuery}`
        : `https://pdfpc.l3j.pw/?file=http://${addr.ip}:${port}/slide.pdf${extraQuery}`;
      console.log(`\x1b[1m\x1b[36m[pdfpc]\x1b[0m ${label}: \x1b[1m\x1b[4m${netUrl}\x1b[0m`);
    }
  }

  const chromeBin = options.noOpen ? null : findChromeBinary(options.customBrowser);
  let tempProfileDir: string | null = null;
  let chromeProcess: any = null;

  const cleanup = () => {
    console.log("\n\x1b[1m\x1b[36m[pdfpc]\x1b[0m Shutting down...");
    closeWatcher();
    try {
      if (chromeProcess && !chromeProcess.killed) {
        chromeProcess.kill();
      }
    } catch {}
    try {
      server.close();
    } catch {}
    try {
      if (tempProfileDir && fs.existsSync(tempProfileDir)) {
        fs.rmSync(tempProfileDir, { recursive: true, force: true });
      }
    } catch {}
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  if (chromeBin) {
    tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdfpc-chrome-profile-"));
    const chromeArgs: string[] = [
      `--user-data-dir=${tempProfileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-sync",
      "--disable-extensions",
      "--disable-background-networking",
    ];

    if (options.appMode) {
      chromeArgs.push(`--app=${targetUrl}`);
    } else {
      chromeArgs.push(targetUrl);
    }

    if (options.fullscreen) {
      chromeArgs.push("--start-fullscreen");
    }

    console.log(
      `\x1b[1m\x1b[36m[pdfpc]\x1b[0m Launching Chrome presenter window: \x1b[2m${chromeBin}\x1b[0m`,
    );

    chromeProcess = spawn(chromeBin, chromeArgs, {
      stdio: "ignore",
      detached: false,
    });

    chromeProcess.on("exit", () => {
      console.log(`\x1b[1m\x1b[36m[pdfpc]\x1b[0m Presentation window closed.`);
      cleanup();
    });
  } else {
    if (!options.noOpen) {
      console.log(
        `\x1b[33m[pdfpc]\x1b[0m Headless / remote environment detected (no local GUI browser launched).`,
      );
    }
    console.log(
      `\x1b[1m\x1b[32m[pdfpc]\x1b[0m Open the URL above in your local browser (direct Tailscale IP or SSH port forward).`,
    );
  }

  console.log(`\x1b[2m[pdfpc] Press Ctrl+C at any time to exit and stop the server.\x1b[0m`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("\x1b[31m[pdfpc] Fatal error:\x1b[0m", err);
    process.exit(1);
  });
}
