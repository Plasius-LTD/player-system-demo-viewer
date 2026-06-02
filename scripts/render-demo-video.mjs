#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultSequence =
  "missions-quests:quest-starfall-archive,missions-quests:quest-ember-courier,mcc-core:mcc-intent-router,mcc-core:mcc-safety-governor,spell-creation:spell-arc-lance,spell-creation:spell-veil-step";
const defaultConfig = Object.freeze({
  output: "demo/system-demo.mp4",
  width: 1280,
  height: 720,
  fps: 60,
  duration: 14,
  port: 5179,
  stepMs: 2200,
  sequence: defaultSequence,
  quality: "ultra",
  resolution: "720p",
  renderScale: 1,
  presentation: "ray",
  rayDebug: "off",
  raySamples: "auto",
  format: "mp4",
  crf: 14,
  ffmpeg: "ffmpeg",
  settleFrames: 4,
  captureDelayMs: 80,
  keepFrames: false,
  skipBuild: false,
  headful: false,
});
const homeDir = process.env.HOME ?? "";
const chromeCandidates = Object.freeze([
  path.join(
    homeDir,
    "Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
  ),
  path.join(
    homeDir,
    "Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell"
  ),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
]);

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${token}`);
    }

    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = "true";
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: npm run render:video -- [options]

Options:
  --output <path>         Output video path. Default: ${defaultConfig.output}.
  --out <path>            Alias for --output.
  --url <url>             Existing app URL to capture instead of starting Vite preview.
  --frames <count>        Number of simulation frames to render.
  --duration <seconds>    Video duration when --frames is omitted. Default: ${defaultConfig.duration}.
  --fps <number>          Output video frame rate and simulation step. Default: ${defaultConfig.fps}.
  --width <px>            Browser capture viewport width. Default: ${defaultConfig.width}.
  --height <px>           Browser capture viewport height. Default: ${defaultConfig.height}.
  --output-width <px>     Final video/still width after FFmpeg downscale. Default: capture width.
  --output-height <px>    Final video/still height after FFmpeg downscale. Default: capture height.
  --downscale-width <px>  Alias for --output-width.
  --downscale-height <px> Alias for --output-height.
  --port <number>         Preferred local Vite preview port. Default: ${defaultConfig.port}.
  --step-ms <number>      Menu timeline step duration. Default: ${defaultConfig.stepMs}.
  --sequence <items>      Comma-separated module:selection capture sequence.
  --quality <mode>        Capture quality query param. Default: ${defaultConfig.quality}.
  --resolution <name>     Capture resolution query param. Default: ${defaultConfig.resolution}.
  --render-scale <number> Capture render scale query param. Default: ${defaultConfig.renderScale}.
  --presentation <mode>   Presentation mode: geometry or ray. Default: ${defaultConfig.presentation}.
  --ray-resolve           Alias for --presentation ray.
  --ray-debug <mode>      Ray visualization: off, solid, or hits. Default: ${defaultConfig.rayDebug}.
  --ray-samples <n>       Camera rays per pixel, 1-8 or auto. Default: ${defaultConfig.raySamples}.
  --require-ray           Fail unless the page is using ray-traced presentation. Enabled by default for ray presentation.
  --format <mp4|mpeg>     Encoder format. Default: ${defaultConfig.format}.
  --crf <number>          libx264 CRF for MP4 output. Default: ${defaultConfig.crf}.
  --screenshot <path>     Capture one PNG still frame instead of encoding a video.
  --still <path>          Alias for --screenshot.
  --seek-ms <number>      Timeline position for --screenshot. Default: 0.
  --settle-frames <count> Re-submit and wait this many same-time frames before capture. Default: ${defaultConfig.settleFrames}.
  --present-frames <n>    Alias for --settle-frames.
  --capture-delay-ms <ms> Extra delay after settled frames before capture. Default: ${defaultConfig.captureDelayMs}.
  --allow-fallback        Permit Canvas fallback capture when WebGPU is unavailable.
  --ffmpeg <path>         FFmpeg executable. Default: ${defaultConfig.ffmpeg}.
  --chrome-path <path>    Chrome/Chromium executable path.
  --frames-dir <path>     Directory for temporary PNG frames.
  --keep-frames           Keep PNG frames after encoding.
  --skip-build            Skip npm run build:web before local preview.
  --headful               Launch Chrome with a visible window.
`);
}

function readPositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

function readPositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function readNonNegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function readBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }
  return value === "true" || value === "1";
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/gu, "-");
}

function resolveOutputDimensions({ width, height, outputWidth, outputHeight }) {
  let resolvedWidth =
    outputWidth === undefined ? undefined : readPositiveInteger(outputWidth, width);
  let resolvedHeight =
    outputHeight === undefined ? undefined : readPositiveInteger(outputHeight, height);

  if (resolvedWidth !== undefined && resolvedHeight === undefined) {
    resolvedHeight = Math.round(height * (resolvedWidth / width));
  }
  if (resolvedHeight !== undefined && resolvedWidth === undefined) {
    resolvedWidth = Math.round(width * (resolvedHeight / height));
  }

  resolvedWidth ??= width;
  resolvedHeight ??= height;

  if (resolvedWidth > width || resolvedHeight > height) {
    throw new Error(
      "--output-width/--output-height cannot exceed --width/--height; the recorder will downscale but not upscale."
    );
  }
  if (resolvedWidth % 2 !== 0 || resolvedHeight % 2 !== 0) {
    throw new Error("Output width and height must be even for yuv420p output.");
  }

  return { outputWidth: resolvedWidth, outputHeight: resolvedHeight };
}

function createConfig(args) {
  const fps = readPositiveNumber(args.fps, defaultConfig.fps);
  const duration = readPositiveNumber(args.duration, defaultConfig.duration);
  const frames = args.frames
    ? readPositiveInteger(args.frames, Math.max(1, Math.round(duration * fps)))
    : Math.max(1, Math.round(duration * fps));
  const width = readPositiveInteger(args.width, defaultConfig.width);
  const height = readPositiveInteger(args.height, defaultConfig.height);

  if (width % 2 !== 0 || height % 2 !== 0) {
    throw new Error("Capture width and height must be even for deterministic video/still output.");
  }
  const { outputWidth, outputHeight } = resolveOutputDimensions({
    width,
    height,
    outputWidth: args.outputWidth ?? args.downscaleWidth,
    outputHeight: args.outputHeight ?? args.downscaleHeight,
  });

  const presentation = readBoolean(args.rayResolve, false)
    ? "ray"
    : String(args.presentation ?? defaultConfig.presentation);
  if (presentation !== "ray" && presentation !== "geometry") {
    throw new Error("--presentation must be either geometry or ray.");
  }
  const rayDebug = String(args.rayDebug ?? defaultConfig.rayDebug).toLowerCase();
  if (rayDebug !== "off" && rayDebug !== "none" && rayDebug !== "solid" && rayDebug !== "hits") {
    throw new Error("--ray-debug must be off, solid, or hits.");
  }
  const rawRaySamples = String(args.raySamples ?? defaultConfig.raySamples).toLowerCase();
  const raySamples =
    rawRaySamples === "auto"
      ? "auto"
      : readPositiveInteger(rawRaySamples, 0);
  if (raySamples !== "auto" && (raySamples < 1 || raySamples > 8)) {
    throw new Error("--ray-samples must be auto or an integer from 1 to 8.");
  }

  return {
    output: path.resolve(repoRoot, args.output ?? args.out ?? defaultConfig.output),
    url: args.url,
    frames,
    fps,
    width,
    height,
    outputWidth,
    outputHeight,
    port: readPositiveInteger(args.port, defaultConfig.port),
    stepMs: readPositiveNumber(args.stepMs, defaultConfig.stepMs),
    sequence: String(args.sequence ?? defaultConfig.sequence),
    quality: String(args.quality ?? defaultConfig.quality),
    resolution: String(args.resolution ?? defaultConfig.resolution),
    renderScale: readPositiveNumber(args.renderScale, defaultConfig.renderScale),
    presentation,
    rayDebug: rayDebug === "none" ? "off" : rayDebug,
    raySamples,
    requireRay: readBoolean(args.requireRay, presentation === "ray"),
    format: String(args.format ?? defaultConfig.format).toLowerCase() === "mpeg" ? "mpeg" : "mp4",
    crf: readPositiveInteger(args.crf, defaultConfig.crf),
    ffmpeg: String(args.ffmpeg ?? defaultConfig.ffmpeg),
    chromePath: args.chromePath,
    framesDir: args.framesDir
      ? path.resolve(repoRoot, args.framesDir)
      : path.join(tmpdir(), "plasius-system-captures", `frames-${timestampSlug()}`),
    screenshot: args.screenshot ?? args.still
      ? path.resolve(repoRoot, args.screenshot ?? args.still)
      : undefined,
    seekMs: readPositiveNumber(args.seekMs, 0),
    settleFrames: readPositiveInteger(
      args.settleFrames ?? args.presentFrames,
      defaultConfig.settleFrames
    ),
    captureDelayMs: readNonNegativeNumber(args.captureDelayMs, defaultConfig.captureDelayMs),
    allowFallback: readBoolean(args.allowFallback, false),
    keepFrames: readBoolean(args.keepFrames, defaultConfig.keepFrames),
    skipBuild: readBoolean(args.skipBuild, defaultConfig.skipBuild),
    headful: readBoolean(args.headful, defaultConfig.headful),
  };
}

function resolveChromePaths(value) {
  if (value) {
    const resolved = path.resolve(repoRoot, value);
    if (existsSync(value)) {
      return [value];
    }
    if (existsSync(resolved)) {
      return [resolved];
    }
    throw new Error(`Chrome or Chromium was not found at ${value}.`);
  }

  const candidates = chromeCandidates.filter((entry, index, list) => {
    return entry && list.indexOf(entry) === index && existsSync(entry);
  });
  if (candidates.length === 0) {
    throw new Error("Chrome or Chromium was not found. Pass --chrome-path to a browser executable.");
  }
  return candidates;
}

function withCaptureParams(rawUrl, config) {
  const url = new URL(rawUrl);
  url.searchParams.set("capture", "1");
  url.searchParams.set("loop", "0");
  url.searchParams.set("stepMs", String(config.stepMs));
  url.searchParams.set("sequence", config.sequence);
  url.searchParams.set("quality", config.quality);
  url.searchParams.set("resolution", config.resolution);
  url.searchParams.set("renderScale", String(config.renderScale));
  url.searchParams.set("presentation", config.presentation);
  if (config.raySamples !== "auto") {
    url.searchParams.set("raySamples", String(config.raySamples));
  }
  if (config.rayDebug !== "off") {
    url.searchParams.set("rayDebug", config.rayDebug);
  }
  url.searchParams.set("frameExport", "1");
  if (config.allowFallback) {
    url.searchParams.set("allowFallback", "1");
  }
  return url.href;
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, options, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error(`HTTP ${response.statusCode}: ${body}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.end();
  });
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        PATH: `${homeDir}/.nvm/versions/node/v24.14.0/bin:${process.env.PATH}`,
      },
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

async function findFreePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function isPortAvailable(port) {
  const server = net.createServer();
  return await new Promise((resolve) => {
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function choosePreviewPort(preferredPort) {
  if (await isPortAvailable(preferredPort)) {
    return preferredPort;
  }
  const fallbackPort = await findFreePort();
  console.log(`Port ${preferredPort} is busy; using ${fallbackPort} for Vite preview.`);
  return fallbackPort;
}

async function waitForServer(baseUrl) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 20_000) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Vite preview is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`Timed out waiting for ${baseUrl}`);
}

function startPreviewServer(port) {
  const viteBin = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
  const child = spawn(
    process.execPath,
    [viteBin, "preview", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${homeDir}/.nvm/versions/node/v24.14.0/bin:${process.env.PATH}`,
      },
    }
  );

  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));

  return {
    close: () => {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    },
  };
}

async function waitForBrowser(port, timeoutMs = 12_000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      return await requestJson(`http://127.0.0.1:${port}/json/version`);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Chrome did not expose a debugging endpoint: ${lastError?.message ?? "timeout"}`);
}

async function launchChrome({ chromePath, port, width, height, headful }) {
  const userDataDir = await mkdtemp(path.join(tmpdir(), "plasius-system-chrome-"));
  let stderr = "";
  const chrome = spawn(
    chromePath,
    [
      headful ? undefined : "--headless=new",
      "--enable-unsafe-webgpu",
      "--ignore-gpu-blocklist",
      "--no-sandbox",
      "--disable-gpu-sandbox",
      "--disable-breakpad",
      "--disable-crash-reporter",
      "--disable-crashpad",
      "--disable-features=Crashpad",
      "--disable-component-update",
      "--disable-extensions",
      "--disable-sync",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "--autoplay-policy=no-user-gesture-required",
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      `--remote-debugging-address=127.0.0.1`,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      `--crash-dumps-dir=${path.join(userDataDir, "crashes")}`,
      `--window-size=${width},${height}`,
      "about:blank",
    ].filter(Boolean),
    {
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        ...process.env,
        HOME: userDataDir,
        TMPDIR: userDataDir,
      },
    }
  );
  chrome.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    const version = await waitForBrowser(port);
    return { chrome, userDataDir, version };
  } catch (error) {
    chrome.kill();
    await rm(userDataDir, { recursive: true, force: true });
    const stderrSummary = stderr.trim().split(/\r?\n/gu).slice(-6).join("\n");
    throw new Error(
      `${chromePath} did not expose a debugging endpoint: ${error.message}${
        stderrSummary ? `\n${stderrSummary}` : ""
      }`,
      { cause: error }
    );
  }
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }

  async connect() {
    this.socket = new WebSocket(this.webSocketUrl);
    this.socket.addEventListener("message", (event) => this.handleMessage(event.data));
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
  }

  handleMessage(data) {
    const message = JSON.parse(String(data));
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        reject(new Error(`${message.error.message}: ${message.error.data ?? ""}`));
      } else {
        resolve(message.result ?? {});
      }
      return;
    }
    this.events.push(message);
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = { id, method, params };
    if (sessionId) {
      payload.sessionId = sessionId;
    }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(payload));
    });
  }

  close() {
    this.socket?.close();
  }
}

function formatRuntimeException(result) {
  if (!result.exceptionDetails) {
    return null;
  }
  return (
    result.exceptionDetails.exception?.description ??
    result.exceptionDetails.text ??
    "Runtime evaluation failed"
  );
}

async function evaluate(client, sessionId, expression, options = {}) {
  const result = await client.send(
    "Runtime.evaluate",
    {
      expression,
      awaitPromise: options.awaitPromise === true,
      returnByValue: true,
      userGesture: true,
    },
    sessionId
  );
  const exception = formatRuntimeException(result);
  if (exception) {
    throw new Error(exception);
  }
  return result.result?.value;
}

async function waitForPageReady(client, sessionId, options = {}) {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    const status = await evaluate(
      client,
      sessionId,
      `(() => ({
        ready: Boolean(window.__plasiusCaptureFrame && window.playerSystemDemoCapture?.ready === true && document.querySelector("#system-scene")),
        error: window.playerSystemDemoCapture?.error ?? null,
        rendererMode: window.playerSystemDemoCapture?.getRendererMode?.() ?? "pending",
        presentationMode: window.playerSystemDemoCapture?.getPresentationMode?.() ?? "pending",
        diagnostics: window.playerSystemDemoCapture?.getSceneDiagnostics?.() ?? null
      }))()`
    );

    if (status?.error) {
      throw new Error(`Capture app failed to initialize: ${status.error}`);
    }
    if (status?.ready) {
      if (!options.allowFallback && status.rendererMode !== "webgpu") {
        throw new Error(
          `Capture app initialized with ${status.rendererMode} renderer; refusing to capture fallback output. Pass --allow-fallback only for fallback QA.`
        );
      }
      if (status.presentationMode !== "geometry" && status.presentationMode !== "ray-traced") {
        throw new Error(`Capture app initialized with unknown presentation mode: ${status.presentationMode}`);
      }
      if (options.requireRay && status.presentationMode !== "ray-traced") {
        throw new Error(
          `Capture app initialized with ${status.presentationMode} presentation; --require-ray needs --presentation ray or --ray-resolve.`
        );
      }
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for the System demo capture hook.");
}

async function waitForAnimationFrames(client, sessionId, frameCount) {
  await evaluate(
    client,
    sessionId,
    `new Promise((resolve) => {
      let remaining = ${JSON.stringify(Math.max(1, frameCount))};
      const step = () => {
        remaining -= 1;
        if (remaining <= 0) {
          resolve();
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    })`,
    { awaitPromise: true }
  );
}

async function waitForCaptureSettle({
  client,
  sessionId,
  settleFrames,
  captureDelayMs,
  rerenderExpression,
}) {
  const boundedSettleFrames = Math.max(1, settleFrames);
  for (let index = 0; index < boundedSettleFrames; index += 1) {
    if (index > 0 && rerenderExpression) {
      await evaluate(client, sessionId, rerenderExpression, { awaitPromise: true });
    }
    await waitForAnimationFrames(client, sessionId, 1);
  }

  if (captureDelayMs > 0) {
    await evaluate(
      client,
      sessionId,
      `new Promise((resolve) => setTimeout(resolve, ${JSON.stringify(captureDelayMs)}))`,
      { awaitPromise: true }
    );
  }
}

async function readCaptureStatus(client, sessionId) {
  return await evaluate(
    client,
    sessionId,
    `(() => ({
      rendererMode: window.playerSystemDemoCapture?.getRendererMode?.() ?? "pending",
      presentationMode: window.playerSystemDemoCapture?.getPresentationMode?.() ?? "pending",
      revealStage: window.playerSystemDemoCapture?.getRevealStage?.() ?? "pending",
      state: window.playerSystemDemoCapture?.getState?.() ?? null,
      diagnostics: window.playerSystemDemoCapture?.getSceneDiagnostics?.() ?? null
    }))()`
  );
}

function formatCaptureStatus(status) {
  const state = status?.state ?? {};
  const diagnostics = status?.diagnostics ?? {};
  const canvasSummary =
    Number.isFinite(diagnostics.canvasWidth) && Number.isFinite(diagnostics.canvasHeight)
      ? `canvas=${diagnostics.canvasWidth}x${diagnostics.canvasHeight}@${Number(diagnostics.pixelRatio ?? 1).toFixed(3)}`
      : undefined;
  const cssSummary =
    Number.isFinite(diagnostics.cssWidth) && Number.isFinite(diagnostics.cssHeight)
      ? `css=${Math.round(diagnostics.cssWidth)}x${Math.round(diagnostics.cssHeight)}`
      : undefined;
  return [
    `renderer=${status?.rendererMode ?? "n/a"}`,
    `presentation=${status?.presentationMode ?? "n/a"}`,
    `reveal=${status?.revealStage ?? "n/a"}`,
    `module=${state.activeModuleId ?? "n/a"}`,
    `selection=${state.activeSelectionId ?? "n/a"}`,
    `rayDebug=${diagnostics.rayDebugMode ?? "off"}`,
    Number.isFinite(diagnostics.raySampleCount)
      ? `raySamples=${diagnostics.raySampleCount}`
      : undefined,
    canvasSummary,
    cssSummary,
    Number.isFinite(diagnostics.maxTextureDimension2D)
      ? `maxTexture=${diagnostics.maxTextureDimension2D}`
      : undefined,
    `panels=${diagnostics.panelRasterCount ?? "n/a"}`,
    `traceTriangles=${diagnostics.traceTriangleCount ?? "n/a"}`,
    `traceNodes=${diagnostics.traceNodeCount ?? "n/a"}`,
    diagnostics.gpuError ? `gpuError=${JSON.stringify(diagnostics.gpuError)}` : undefined,
    Array.isArray(diagnostics.shaderDiagnostics) && diagnostics.shaderDiagnostics.length > 0
      ? `shaderDiagnostics=${JSON.stringify(diagnostics.shaderDiagnostics.slice(0, 4))}`
      : undefined,
  ].filter(Boolean).join(" ");
}

async function captureFrames({
  client,
  sessionId,
  framesDir,
  frames,
  stepMs,
  settleFrames,
  captureDelayMs,
}) {
  await mkdir(framesDir, { recursive: true });
  const padWidth = Math.max(5, String(frames).length);

  for (let index = 0; index < frames; index += 1) {
    await evaluate(
      client,
      sessionId,
      `window.__plasiusCaptureFrame({ stepMs: ${index === 0 ? 0 : stepMs} })`,
      { awaitPromise: true }
    );
    await waitForCaptureSettle({
      client,
      sessionId,
      settleFrames,
      captureDelayMs,
      rerenderExpression: "window.__plasiusCaptureFrame({ stepMs: 0 })",
    });
    const screenshot = await client.send(
      "Page.captureScreenshot",
      {
        format: "png",
        fromSurface: true,
      },
      sessionId
    );
    const filename = `frame-${String(index).padStart(padWidth, "0")}.png`;
    await writeFile(path.join(framesDir, filename), Buffer.from(screenshot.data, "base64"));

    if (index === 0 || (index + 1) % 30 === 0 || index + 1 === frames) {
      const status = await readCaptureStatus(client, sessionId);
      console.log(`Captured frame ${index + 1}/${frames}; ${formatCaptureStatus(status)}`);
    }
  }

  return path.join(framesDir, `frame-%0${padWidth}d.png`);
}

async function captureStillFrame({
  client,
  sessionId,
  output,
  seekMs,
  settleFrames,
  captureDelayMs,
  captureWidth,
  captureHeight,
  outputWidth,
  outputHeight,
  ffmpeg,
}) {
  await mkdir(path.dirname(output), { recursive: true });
  await evaluate(
    client,
    sessionId,
    `window.__plasiusCaptureFrame({ seekMs: ${JSON.stringify(seekMs)} })`,
    { awaitPromise: true }
  );
  await waitForCaptureSettle({
    client,
    sessionId,
    settleFrames,
    captureDelayMs,
    rerenderExpression: `window.__plasiusCaptureFrame({ seekMs: ${JSON.stringify(seekMs)} })`,
  });
  const status = await readCaptureStatus(client, sessionId);
  console.log(`Capture frame ready: ${formatCaptureStatus(status)}`);
  const screenshot = await client.send(
    "Page.captureScreenshot",
    {
      format: "png",
      fromSurface: true,
    },
    sessionId
  );
  const png = Buffer.from(screenshot.data, "base64");
  if (captureWidth === outputWidth && captureHeight === outputHeight) {
    await writeFile(output, png);
    console.log(`Screenshot written: ${output}`);
    return;
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "plasius-system-still-"));
  const rawOutput = path.join(tempDir, "capture.png");
  try {
    await writeFile(rawOutput, png);
    await downscaleImage({
      input: rawOutput,
      output,
      width: outputWidth,
      height: outputHeight,
      ffmpeg,
    });
    console.log(
      `Screenshot written: ${output} (downscaled ${captureWidth}x${captureHeight} -> ${outputWidth}x${outputHeight})`
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function downscaleImage({ input, output, width, height, ffmpeg }) {
  await mkdir(path.dirname(output), { recursive: true });
  await new Promise((resolve, reject) => {
    const child = spawn(
      ffmpeg,
      [
        "-y",
        "-i",
        input,
        "-vf",
        `scale=${width}:${height}:flags=lanczos`,
        "-frames:v",
        "1",
        "-update",
        "1",
        output,
      ],
      { stdio: "inherit" }
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${ffmpeg} exited with code ${code}`));
      }
    });
  });
}

async function runFfmpeg({
  pattern,
  fps,
  format,
  output,
  crf,
  ffmpeg,
  captureWidth,
  captureHeight,
  outputWidth,
  outputHeight,
}) {
  await mkdir(path.dirname(output), { recursive: true });
  const scaleArgs =
    captureWidth === outputWidth && captureHeight === outputHeight
      ? []
      : ["-vf", `scale=${outputWidth}:${outputHeight}:flags=lanczos`];
  const args =
    format === "mpeg"
      ? [
          "-y",
          "-framerate",
          String(fps),
          "-i",
          pattern,
          ...scaleArgs,
          "-c:v",
          "mpeg2video",
          "-q:v",
          "2",
          "-r",
          String(fps),
          output,
        ]
      : [
          "-y",
          "-framerate",
          String(fps),
          "-i",
          pattern,
          ...scaleArgs,
          "-c:v",
          "libx264",
          "-preset",
          "slow",
          "-crf",
          String(crf),
          "-pix_fmt",
          "yuv420p",
          "-r",
          String(fps),
          output,
        ];

  await new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${ffmpeg} exited with code ${code}`));
      }
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printHelp();
    return;
  }

  if (typeof WebSocket !== "function") {
    throw new Error("This script requires Node.js with the global WebSocket API.");
  }

  const config = createConfig(args);
  const chromePaths = resolveChromePaths(config.chromePath);
  let server = null;
  let chrome = null;
  let client = null;
  let userDataDir = null;

  try {
    let baseUrl = config.url;
    if (!baseUrl) {
      if (!config.skipBuild) {
        await run("npm", ["run", "build:web"]);
      }
      const port = await choosePreviewPort(config.port);
      baseUrl = `http://127.0.0.1:${port}/`;
      server = startPreviewServer(port);
      await waitForServer(baseUrl);
    }

    const captureUrl = withCaptureParams(baseUrl, config);
    if (config.width !== config.outputWidth || config.height !== config.outputHeight) {
      console.log(
        `Capture viewport ${config.width}x${config.height}; FFmpeg downscale output ${config.outputWidth}x${config.outputHeight}.`
      );
    }
    let launch = null;
    const launchErrors = [];
    for (const chromePath of chromePaths) {
      try {
        const port = await findFreePort();
        launch = await launchChrome({
          chromePath,
          port,
          width: config.width,
          height: config.height,
          headful: config.headful,
        });
        console.log(`Using browser: ${chromePath}`);
        break;
      } catch (error) {
        launchErrors.push(error.message);
      }
    }

    if (!launch) {
      throw new Error(`Could not launch a capturable Chromium browser.\n${launchErrors.join("\n\n")}`);
    }

    chrome = launch.chrome;
    userDataDir = launch.userDataDir;
    client = new CdpClient(launch.version.webSocketDebuggerUrl);
    await client.connect();
    const { targetId } = await client.send("Target.createTarget", {
      url: "about:blank",
      newWindow: true,
    });
    const { sessionId } = await client.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    await client.send("Page.enable", {}, sessionId);
    await client.send("Runtime.enable", {}, sessionId);
    await client.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: config.width,
        height: config.height,
        deviceScaleFactor: 1,
        mobile: false,
        screenWidth: config.width,
        screenHeight: config.height,
      },
      sessionId
    );
    await client.send("Page.navigate", { url: captureUrl }, sessionId);
    const pageStatus = await waitForPageReady(client, sessionId, {
      allowFallback: config.allowFallback,
      requireRay: config.requireRay,
    });
    console.log(
      `Capture app ready: ${formatCaptureStatus(pageStatus)}`
    );

    if (config.screenshot) {
      console.log(
        `Capturing screenshot at ${config.seekMs}ms from ${captureUrl} after ${config.settleFrames} settled frames + ${config.captureDelayMs}ms`
      );
      await captureStillFrame({
        client,
        sessionId,
        output: config.screenshot,
        seekMs: config.seekMs,
        settleFrames: config.settleFrames,
        captureDelayMs: config.captureDelayMs,
        captureWidth: config.width,
        captureHeight: config.height,
        outputWidth: config.outputWidth,
        outputHeight: config.outputHeight,
        ffmpeg: config.ffmpeg,
      });
      return;
    }

    console.log(
      `Capturing ${config.frames} frames at ${config.fps} FPS from ${captureUrl} after ${config.settleFrames} settled frames + ${config.captureDelayMs}ms per frame`
    );
    const pattern = await captureFrames({
      client,
      sessionId,
      framesDir: config.framesDir,
      frames: config.frames,
      stepMs: 1000 / config.fps,
      settleFrames: config.settleFrames,
      captureDelayMs: config.captureDelayMs,
    });
    console.log(`Encoding ${config.output}`);
    await runFfmpeg({
      pattern,
      fps: config.fps,
      format: config.format,
      output: config.output,
      crf: config.crf,
      ffmpeg: config.ffmpeg,
      captureWidth: config.width,
      captureHeight: config.height,
      outputWidth: config.outputWidth,
      outputHeight: config.outputHeight,
    });
    console.log(`Video written: ${config.output}`);

    if (!config.keepFrames) {
      await rm(config.framesDir, { recursive: true, force: true });
    } else {
      console.log(`Frames kept: ${config.framesDir}`);
    }
  } finally {
    client?.close();
    chrome?.kill();
    server?.close();
    if (userDataDir) {
      await rm(userDataDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
