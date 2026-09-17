#!/usr/bin/env bun
/**
 * pdfpc-ts CLI
 * Direct presenter-mode launcher for PDF presentations via Chrome.
 * Works seamlessly with Bun or Node.js.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CliOptions {
  pdfPath: string;
  mode?: "no-notes" | "notes-right";
  port: number;
  useRemote: boolean;
  appMode: boolean;
  fullscreen: boolean;
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
\x1b[1m\x1b[36mpdfpc-ts CLI\x1b[0m — Direct PDF Presenter Launcher via Chrome

\x1b[1mUSAGE:\x1b[0m
  pdfpc [options] <path-to-pdf>
  bun run cli.ts [options] <path-to-pdf>

\x1b[1mOPTIONS:\x1b[0m
  -m, --mode <mode>        Layout mode: "no-notes" (16:9) or "notes-right" (32:9)
                           (default: auto-detect by aspect ratio)
      --notes              Shortcut for --mode notes-right
      --no-notes           Shortcut for --mode no-notes
  -p, --port <number>      HTTP port to serve the PDF (default: random available port)
      --remote             Use Cloudflare remote app (https://pdfpc.l3j.pw) instead of local dist
      --local              Force local static serving from dist/ (default if dist/ exists)
      --chrome <path>      Explicit path to Chrome/Chromium binary
      --no-app             Open in regular browser tab instead of Chrome standalone app window
  -f, --fullscreen         Launch Chrome in fullscreen mode
  -v, --version            Display version info
  -h, --help               Display this help message

\x1b[1mEXAMPLES:\x1b[0m
  bun run cli.ts presentation.pdf
  bun run cli.ts --fullscreen NetLoom-APSys26-talk-handout.pdf
  bun run cli.ts --notes NetLoom-APSys26-talk-notes.pdf
`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    pdfPath: "",
    port: 0,
    useRemote: false,
    appMode: true,
    fullscreen: false,
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
      if (val === "no-notes" || val === "notes-right") {
        options.mode = val;
      } else {
        console.error(`\x1b[31mError:\x1b[0m Invalid mode "${val}". Must be "no-notes" or "notes-right".`);
        process.exit(1);
      }
    } else if (arg === "--notes") {
      options.mode = "notes-right";
    } else if (arg === "--no-notes") {
      options.mode = "no-notes";
    } else if (arg === "-p" || arg === "--port") {
      options.port = parseInt(args[++i], 10) || 0;
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

function findChromeBinary(customPath?: string): string | null {
  if (customPath) {
    if (fs.existsSync(customPath)) return customPath;
    console.warn(`\x1b[33mWarning:\x1b[0m Custom browser "${customPath}" not found.`);
  }

  const platform = os.platform();

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

function startServer(pdfAbsPath: string, distDir: string | null, requestedPort: number): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url || "/", "http://127.0.0.1");
      const pathname = parsedUrl.pathname;

      // Add CORS headers so web app can fetch PDF without restriction
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "*");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
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
          });
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
        let filePath = path.join(distDir, pathname === "/" ? "index.html" : pathname);
        
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
            "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
          });
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

    server.listen(requestedPort, "127.0.0.1", () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : requestedPort;
      resolve({ server, port: actualPort });
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
    console.log("pdfpc-ts CLI v1.0.0");
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
  console.log(`\x1b[1m\x1b[36m[pdfpc]\x1b[0m Loading: \x1b[1m${path.basename(pdfAbsPath)}\x1b[0m (${fileSizeMb} MB)`);

  // Detect whether to use local dist/ (offline mode) or remote deployment
  const distDirCandidate = path.resolve(__dirname, "dist");
  const hasLocalDist = fs.existsSync(distDirCandidate) && fs.existsSync(path.join(distDirCandidate, "index.html"));

  const isLocalMode = !options.useRemote && hasLocalDist;
  const distDirToServe = isLocalMode ? distDirCandidate : null;

  console.log(`\x1b[1m\x1b[36m[pdfpc]\x1b[0m Engine: ${isLocalMode ? "\x1b[32mLocal offline mode\x1b[0m (zero network latency)" : "\x1b[33mRemote mode\x1b[0m (https://pdfpc.l3j.pw)"}`);

  const { server, port } = await startServer(pdfAbsPath, distDirToServe, options.port);
  console.log(`\x1b[1m\x1b[36m[pdfpc]\x1b[0m Local server ready on \x1b[4mhttp://127.0.0.1:${port}\x1b[0m`);

  // Build target URL
  let targetUrl: string;
  const modeQuery = options.mode ? `&mode=${options.mode}` : "";

  if (isLocalMode) {
    targetUrl = `http://127.0.0.1:${port}/?file=/slide.pdf${modeQuery}`;
  } else {
    targetUrl = `https://pdfpc.l3j.pw/?file=http://127.0.0.1:${port}/slide.pdf${modeQuery}`;
  }

  // Find Chrome binary
  const chromeBin = findChromeBinary(options.customBrowser);
  const tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdfpc-chrome-profile-"));

  let chromeProcess: any = null;

  const cleanup = () => {
    console.log("\n\x1b[1m\x1b[36m[pdfpc]\x1b[0m Shutting down...");
    try {
      if (chromeProcess && !chromeProcess.killed) {
        chromeProcess.kill();
      }
    } catch {}
    try {
      server.close();
    } catch {}
    try {
      if (fs.existsSync(tempProfileDir)) {
        fs.rmSync(tempProfileDir, { recursive: true, force: true });
      }
    } catch {}
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  if (chromeBin) {
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

    console.log(`\x1b[1m\x1b[36m[pdfpc]\x1b[0m Launching Chrome presenter window: \x1b[2m${chromeBin}\x1b[0m`);
    
    chromeProcess = spawn(chromeBin, chromeArgs, {
      stdio: "ignore",
      detached: false,
    });

    chromeProcess.on("exit", (code: number) => {
      console.log(`\x1b[1m\x1b[36m[pdfpc]\x1b[0m Presentation window closed.`);
      cleanup();
    });
  } else {
    console.log(`\x1b[33m[pdfpc]\x1b[0m Note: No Chrome browser binary found on this system.`);
    console.log(`\x1b[1m\x1b[32m[pdfpc]\x1b[0m Open the following URL in any browser on this machine or over SSH tunnel:\n`);
    console.log(`       \x1b[1m\x1b[4m${targetUrl}\x1b[0m\n`);
  }

  console.log(`\x1b[2m[pdfpc] Press Ctrl+C at any time to exit and stop the server.\x1b[0m`);
}

main().catch((err) => {
  console.error("\x1b[31m[pdfpc] Fatal error:\x1b[0m", err);
  process.exit(1);
});
