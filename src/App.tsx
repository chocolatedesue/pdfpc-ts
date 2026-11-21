import { render } from "@solidjs/web";
import type { JSX } from "@solidjs/web";
import { cx } from "classix";
import { proxy, transfer, wrap } from "comlink";
import { createSignal, For, onSettled, Show } from "solid-js";

import { DropZone } from "./DropZone.tsx";
import { Recorder } from "./Recorder.tsx";
import type { obj } from "./pdfium-worker.ts";

import _styles from "./main.css?inline";

const mainStyles = new window.CSSStyleSheet();
mainStyles.replaceSync(_styles);
window.document.adoptedStyleSheets.push(mainStyles);

const _worker = new Worker(new URL("./pdfium-worker.ts", import.meta.url), {
  type: "module",
  name: "pdfium-worker",
});

function isSafari(): boolean {
  const ua = navigator.userAgent;
  return /^((?!chrome|android).)*safari/i.test(ua);
}

if (isSafari()) {
  // @ts-ignore
  document.startViewTransition = (fn) => {
    // @ts-ignore
    fn();
  };
}

const worker = wrap<typeof obj>(_worker);

const initialSearchParams = new URLSearchParams(window.location.search);
const initialPageParam = Math.max(
  1,
  parseInt(initialSearchParams.get("page") || "1", 10) || 1,
);
const initialDurationMins =
  parseFloat(initialSearchParams.get("duration") || "0") || 0;

// Cross-window reactive state via Solid signals
const [globalCount, setGlobalCount] = createSignal(initialPageParam - 1);

let intervalId: number | null = null;
const [timer, setTimer] = createSignal<number>(0);
const [timerRunning, setTimerRunning] = createSignal<boolean>(false);
const [targetDurationSecs, setTargetDurationSecs] = createSignal<number>(
  Math.round(initialDurationMins * 60),
);

const stopTimerInterval = () => {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  setTimerRunning(false);
};

const resetTimer = () => {
  stopTimerInterval();
  setTimer(0);
};

const startTimer = () => {
  if (intervalId !== null) {
    return;
  }
  setTimerRunning(true);
  intervalId = window.setInterval(() => {
    setTimer((prev) => prev + 1);
  }, 1000);
};

const toggleTimer = () => {
  if (timerRunning()) {
    stopTimerInterval();
  } else {
    startTimer();
  }
};

const secondsToMMSS = (seconds: number): string => {
  const abs = Math.abs(seconds);
  const mins = Math.floor(abs / 60);
  const secs = abs % 60;
  const prefix = seconds < 0 ? "-" : "";
  return `${prefix}${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
};

const [filePageCount, setFilePageCount] = createSignal(-1);
const [currentFileName, setCurrentFileName] = createSignal<string>("");
const [docImages, setDocImages] = createSignal<Array<string | undefined>>([]);
const [renderedCount, setRenderedCount] = createSignal(0);
const [isReady, setIsReady] = createSignal(false);
const [w, setW] = createSignal<WindowProxy | null>(null);

export interface PageTextRect {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PageTextData {
  text: string;
  rects: PageTextRect[];
}

const OVERVIEW = 0,
  PRESENTER = 1;

const [viewMode, setViewMode] = createSignal(OVERVIEW);
const [hasNotes, setHasNotes] = createSignal(false);
const [modeOverride, setModeOverride] = createSignal<
  "auto" | "no-notes" | "notes-right"
>("auto");
const [docTexts, setDocTexts] = createSignal<Array<PageTextData | undefined>>(
  [],
);
const [copyToast, setCopyToast] = createSignal<string | null>(null);

// Presenter operator enhancements: Blackout, Laser Pointer, Jump Dialog, Help Modal
const [isBlackout, setIsBlackout] = createSignal(false);
const [laserActive, setLaserActive] = createSignal(false);
const [laserPos, setLaserPos] = createSignal<{ x: number; y: number } | null>(
  null,
);
const [showHelpModal, setShowHelpModal] = createSignal(false);
const [showJumpModal, setShowJumpModal] = createSignal(false);
const [jumpInput, setJumpInput] = createSignal("");
const [watchConnected, setWatchConnected] = createSignal(false);

let currentLoadGen = 0;

function showToast(msg: string) {
  setCopyToast(msg);
  setTimeout(() => {
    setCopyToast((prev) => (prev === msg ? null : prev));
  }, 2200);
}

export function setDocImagesWrapper(
  index: number,
  url: string,
  text?: string,
  rects?: PageTextRect[],
) {
  setDocImages((prev) => {
    const newArr = [...prev];
    const oldUrl = newArr[index];
    if (oldUrl && oldUrl !== url) {
      try {
        URL.revokeObjectURL(oldUrl);
      } catch {}
    }
    newArr[index] = url;
    return newArr;
  });
  setRenderedCount((prev) => prev + 1);

  if (text !== undefined || rects !== undefined) {
    setDocTexts((prev) => {
      const newArr = [...prev];
      newArr[index] = { text: text || "", rects: rects || [] };
      return newArr;
    });
  }
  if (index === 0) {
    const img = new Image();
    img.onload = () => {
      const isDualRatio = img.naturalWidth / img.naturalHeight > 2.5;
      if (modeOverride() === "notes-right") {
        setHasNotes(true);
      } else if (modeOverride() === "no-notes") {
        setHasNotes(false);
      } else {
        setHasNotes(isDualRatio);
      }
    };
    img.src = url;
  }
}

const getSlideNotesText = (pageIdx: number): string => {
  const current = docTexts()[pageIdx];
  if (!current || !current.text) return "";
  if (hasNotes()) {
    const rightRects = current.rects.filter((r) => r.left >= 50);
    if (rightRects.length > 0) {
      return rightRects.map((r) => r.text).join("\n");
    }
  }
  return current.text;
};

const copyCurrentText = async () => {
  const textToCopy = getSlideNotesText(globalCount());

  if (!textToCopy.trim()) {
    showToast("当前页无文本");
    return;
  }

  try {
    await navigator.clipboard.writeText(textToCopy);
    showToast("已复制当前页文本！");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = textToCopy;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast("已复制当前页文本！");
  }
};

const exportAllNotesMarkdown = () => {
  const total = filePageCount();
  if (total <= 0) return;
  const lines: string[] = [
    `# ${currentFileName() || "Presentation"} — Speaker Notes & Slide Text`,
    "",
  ];
  for (let i = 0; i < total; i++) {
    const txt = getSlideNotesText(i).trim();
    lines.push(`## Slide ${i + 1}`);
    lines.push(txt || "_No extracted text on this slide._");
    lines.push("");
  }
  const blob = new Blob([lines.join("\n")], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const baseName = (currentFileName() || "presentation").replace(/\.pdf$/i, "");
  a.download = `${baseName}-notes.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("已导出全量讲稿 Markdown！");
};

function TextLayer(props: {
  rects?: PageTextRect[];
  half?: "all" | "left" | "right";
  class?: string;
}) {
  const activeRects = () => props.rects || [];

  return (
    <div
      class={cx(
        "absolute inset-0 z-10 overflow-hidden select-text pointer-events-auto",
        props.class,
      )}
      style={{ "user-select": "text", "-webkit-user-select": "text" }}
    >
      <For each={activeRects()}>
        {(r) => {
          let left = r.left;
          let width = r.width;
          if (props.half === "left") {
            if (r.left >= 50) return null;
            left = r.left * 2;
            width = r.width * 2;
          } else if (props.half === "right") {
            if (r.left + r.width <= 50) return null;
            left = (r.left - 50) * 2;
            width = r.width * 2;
          }

          return (
            <span
              class="absolute cursor-text whitespace-pre text-transparent selection:bg-cat-teal/40 selection:text-cat-text"
              style={{
                left: `${left}%`,
                top: `${r.top}%`,
                width: `${width}%`,
                height: `${r.height}%`,
                "font-size": `calc(${r.height}cqh * 0.9)`,
                "line-height": "1",
                display: "inline-block",
              }}
              title={r.text}
            >
              {r.text}
            </span>
          );
        }}
      </For>
    </div>
  );
}

function LaserDot() {
  return (
    <Show when={laserActive() && laserPos()}>
      <div
        class="pointer-events-none absolute z-30 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 shadow-[0_0_14px_5px_rgba(239,68,68,0.85)] ring-2 ring-white/90"
        style={{
          left: `${laserPos()!.x}%`,
          top: `${laserPos()!.y}%`,
        }}
      />
    </Show>
  );
}

_worker.addEventListener("message", (event) => {
  if (event.data.type === "worker-ready") {
    setIsReady(true);
  }
});

const data = await fetchPDF();

const toggleFullscreen = () => {
  const targetDoc = w()?.document || document;
  if (!targetDoc.fullscreenElement) {
    void targetDoc.documentElement.requestFullscreen?.();
  } else {
    void targetDoc.exitFullscreen?.();
  }
};

const goToPage = (pageIndex: number) => {
  if (filePageCount() <= 0) return;
  const clamped = Math.max(0, Math.min(pageIndex, filePageCount() - 1));
  document.startViewTransition?.(() => {
    setGlobalCount(clamped);
  }) ?? setGlobalCount(clamped);
};

const handler = (e: KeyboardEvent) => {
  const activeTag = document.activeElement?.tagName;
  if (activeTag === "INPUT" || activeTag === "TEXTAREA") {
    if (e.key === "Escape") {
      setShowJumpModal(false);
    }
    return;
  }

  switch (e.key) {
    case "ArrowRight":
    case "ArrowDown":
    case " ":
    case "PageDown":
    case "j":
    case "J":
      e.preventDefault();
      nextPage();
      break;
    case "ArrowLeft":
    case "ArrowUp":
    case "PageUp":
    case "k":
    case "K":
      e.preventDefault();
      previousPage();
      break;
    case "Home":
      e.preventDefault();
      goToPage(0);
      break;
    case "End":
      e.preventDefault();
      goToPage(filePageCount() - 1);
      break;
    case "Tab":
      e.preventDefault();
      document.startViewTransition?.(() => {
        setViewMode((prev) => (prev === OVERVIEW ? PRESENTER : OVERVIEW));
      }) ?? setViewMode((prev) => (prev === OVERVIEW ? PRESENTER : OVERVIEW));
      break;
    case "b":
    case "B":
    case ".":
      e.preventDefault();
      setIsBlackout((prev) => !prev);
      showToast(isBlackout() ? "已开启黑屏 (B)" : "已恢复画面");
      break;
    case "l":
    case "L":
      e.preventDefault();
      setLaserActive((prev) => !prev);
      if (!laserActive()) setLaserPos(null);
      showToast(laserActive() ? "激光笔已开启 (L)" : "激光笔已关闭");
      break;
    case "n":
    case "N":
      e.preventDefault();
      setHasNotes((prev) => !prev);
      showToast(hasNotes() ? "已切换为 32:9 备注模式" : "已切换为 16:9 标准模式");
      break;
    case "f":
    case "F":
      e.preventDefault();
      toggleFullscreen();
      break;
    case "p":
    case "P":
      e.preventDefault();
      toggleTimer();
      showToast(timerRunning() ? "计时器已继续" : "计时器已暂停");
      break;
    case "r":
    case "R":
      e.preventDefault();
      resetTimer();
      showToast("计时器已重置");
      break;
    case "g":
    case "G":
      e.preventDefault();
      setJumpInput(String(globalCount() + 1));
      setShowJumpModal(true);
      break;
    case "?":
    case "h":
    case "H":
      e.preventDefault();
      setShowHelpModal((prev) => !prev);
      break;
    case "Escape":
      if (showHelpModal()) {
        setShowHelpModal(false);
      } else if (showJumpModal()) {
        setShowJumpModal(false);
      } else if (isBlackout()) {
        setIsBlackout(false);
      } else if (w()) {
        closePopup();
      }
      break;
    case "c":
    case "C":
      if (!window.getSelection()?.toString()) {
        void copyCurrentText();
      }
      break;
    case "m":
    case "M":
      e.preventDefault();
      exportAllNotesMarkdown();
      break;
    default:
      break;
  }
};

function PopupRoot() {
  onSettled(() => {
    w()?.window.addEventListener("keydown", handler);
    return () => w()?.window.removeEventListener("keydown", handler);
  });
  return (
    <div class="grid h-screen w-screen place-items-center overflow-hidden bg-black select-none">
      <Show
        when={!isBlackout()}
        fallback={<div class="h-screen w-screen bg-black" />}
      >
        <div class="relative h-[min(100vh,calc(100vw*9/16))] w-[min(100vw,calc(100vh*16/9))] overflow-hidden">
          <Show when={docImages()[globalCount()]}>
            <img
              src={docImages()[globalCount()]}
              alt="slide"
              class={cx(
                "h-full w-auto object-cover",
                hasNotes() ? "object-left" : "object-center",
              )}
            />
            <LaserDot />
          </Show>
        </div>
      </Show>
    </div>
  );
}

const handleFileSelect =
  (
    type: "no-notes" | "notes-right" | "auto",
    preservePage = false,
  ) =>
  async (selectedFile: File) => {
    const gen = ++currentLoadGen;
    setCurrentFileName(selectedFile.name);
    setModeOverride(type);
    if (type === "notes-right") {
      setHasNotes(true);
    } else if (type === "no-notes") {
      setHasNotes(false);
    }

    const u =
      "bytes" in Blob.prototype
        ? await selectedFile.bytes()
        : await selectedFile.arrayBuffer().then((buf) => new Uint8Array(buf));

    try {
      await worker.loadPDF(transfer(u, [u.buffer]));
      if (gen !== currentLoadGen) return;

      const c = await worker.pageCount();
      const targetStartPage = preservePage
        ? Math.max(0, Math.min(globalCount(), c - 1))
        : Math.max(0, Math.min(initialPageParam - 1, c - 1));

      setRenderedCount(0);
      setFilePageCount(c);
      setGlobalCount(targetStartPage);
      setViewMode(PRESENTER);

      // Priority-render the active slide and next slide first for instant startup
      const order: number[] = [];
      const seen = new Set<number>();
      for (const p of [0, targetStartPage, targetStartPage + 1]) {
        if (p >= 0 && p < c && !seen.has(p)) {
          seen.add(p);
          order.push(p);
        }
      }
      for (let i = 0; i < c; i++) {
        if (!seen.has(i)) {
          seen.add(i);
          order.push(i);
        }
      }

      for (const pageIdx of order) {
        if (gen !== currentLoadGen) return;
        await worker.renderPDF(pageIdx, proxy(setDocImagesWrapper));
      }
    } catch (error) {
      console.error("Failed to process PDF:", error);
      showToast("PDF 解析失败");
    }
  };

const nextPage = () => {
  if (filePageCount() <= 0) return;
  if (!timerRunning() && timer() === 0) {
    startTimer();
  }
  const update = () => {
    setGlobalCount((prev) => Math.min(prev + 1, filePageCount() - 1));
  };
  document.startViewTransition?.(update) ?? update();
};

const previousPage = () => {
  if (filePageCount() <= 0) return;
  const update = () => {
    setGlobalCount((prev) => Math.max(0, prev - 1));
  };
  document.startViewTransition?.(update) ?? update();
};

const handleLaserMouseMove = (e: MouseEvent) => {
  if (!laserActive()) return;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
  const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
  setLaserPos({ x, y });
};

function popup() {
  const _w = window.open("", "", "left=100,top=100,width=960,height=540");
  if (!_w) {
    showToast("弹窗被浏览器拦截，请允许弹出窗口");
    return;
  }
  setW(_w);

  // @ts-expect-error CSSStyleSheet on popup window
  const styles = new _w.CSSStyleSheet();
  styles.replaceSync(_styles);
  _w?.document.adoptedStyleSheets?.push(styles);
  _w.document.title = `${currentFileName() || "pdfpc-ts"} — Audience View`;
  _w?.addEventListener("beforeunload", () => {
    setW(null);
  });
  if (!timerRunning()) {
    startTimer();
  }
  render(() => <PopupRoot />, _w!.document!.querySelector("body")!);
}

function closePopup() {
  w()?.close();
  setW(null);
}

// Setup live SSE connection when served via `cli.ts --watch`
function setupLiveWatch() {
  const params = new URLSearchParams(window.location.search);
  const fileUrl = params.get("file") || params.get("pdf");
  const watchFlag = params.get("watch");
  if (!fileUrl && !watchFlag) return;

  try {
    const es = new EventSource("/__pdfpc_events");
    es.onmessage = async (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "connected" && msg.watch) {
          setWatchConnected(true);
        } else if (msg.type === "reload") {
          showToast("检测到 PDF 更新，正在热重载...");
          const refreshed = await fetchPDF(
            `/?file=${encodeURIComponent(fileUrl || "/slide.pdf")}&_t=${Date.now()}`,
          );
          if (refreshed) {
            await handleFileSelect(modeOverride(), true)(refreshed);
            showToast("PDF 热重载完成！");
          }
        }
      } catch {}
    };
    es.onerror = () => {
      setWatchConnected(false);
      es.close();
    };
  } catch {}
}

function App() {
  onSettled(() => {
    window.addEventListener("keydown", handler);
    setupLiveWatch();
    return () => window.removeEventListener("keydown", handler);
  });

  const slideProgressPct = () => {
    const total = filePageCount();
    if (total <= 1) return 100;
    return Math.round(((globalCount() + 1) / total) * 100);
  };

  const remainingDurationSecs = () => {
    const target = targetDurationSecs();
    if (target <= 0) return null;
    return target - timer();
  };

  return (
    <Layout>
      <Show when={filePageCount() > 0} fallback={<SelectFile />}>
        {/* Top Progress Bar */}
        <div class="fixed top-0 left-0 right-0 z-40 h-1 bg-cat-surface0/60">
          <div
            class="h-full bg-cat-teal transition-all duration-300"
            style={{ width: `${slideProgressPct()}%` }}
          />
        </div>

        <Show
          when={viewMode() === PRESENTER}
          fallback={
            <div class="mb-20 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
              <For each={Array(filePageCount()).fill(0)}>
                {(_, index) => (
                  <div
                    class={cx(
                      "group relative aspect-video cursor-pointer overflow-hidden rounded-lg outline transition-all",
                      index() === globalCount() &&
                        "outline-4 outline-cat-teal shadow-lg",
                      index() !== globalCount() &&
                        "outline-cat-surface2 hover:outline-4",
                    )}
                    onClick={() => {
                      setGlobalCount(index());
                      setViewMode(PRESENTER);
                    }}
                  >
                    <Show
                      when={docImages()[index()]}
                      fallback={
                        <div class="grid h-full w-full place-items-center bg-cat-surface0/40 font-mono text-xs text-cat-subtext0">
                          Rendering #{index() + 1}...
                        </div>
                      }
                    >
                      <img
                        src={docImages()[index()]}
                        class={cx(
                          "h-full object-cover",
                          hasNotes() ? "object-left" : "object-center",
                        )}
                        style={{
                          "view-transition-name": `left-${index()}`,
                        }}
                      />
                    </Show>
                    <div class="absolute bottom-1.5 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-xs text-white">
                      {index() + 1}
                    </div>
                  </div>
                )}
              </For>
            </div>
          }
        >
          {/* Presenter Dual-Column View */}
          <div class="grid h-full grid-cols-21 gap-4">
            <div class="col-span-13 flex flex-col items-center justify-center">
              <div
                class={cx(
                  "relative aspect-video w-full rounded-lg overflow-hidden border border-cat-surface1 shadow-lg",
                  laserActive() && "cursor-crosshair",
                )}
                onMouseMove={handleLaserMouseMove}
                onMouseLeave={() => setLaserPos(null)}
              >
                <Show when={docImages()[globalCount()]}>
                  <img
                    src={docImages()[globalCount()]}
                    alt={hasNotes() ? "current slide note" : "current slide"}
                    class={cx(
                      "aspect-video h-full object-cover",
                      hasNotes() ? "object-right" : "object-center",
                      isBlackout() && "opacity-25 grayscale",
                    )}
                  />
                  <Show when={!laserActive()}>
                    <TextLayer
                      rects={docTexts()[globalCount()]?.rects}
                      half={hasNotes() ? "right" : "all"}
                    />
                  </Show>
                  <Show when={!hasNotes()}>
                    <LaserDot />
                  </Show>
                  <Show when={isBlackout()}>
                    <div class="pointer-events-none absolute inset-0 grid place-items-center bg-black/60">
                      <span class="rounded-full bg-cat-red/90 px-4 py-1.5 font-mono text-sm font-bold text-white shadow-lg">
                        投影黑屏中 (按 B 恢复)
                      </span>
                    </div>
                  </Show>
                </Show>
              </div>

              {/* Top status bar right above/below main view */}
              <div class="mt-3 flex w-full flex-wrap items-center justify-between gap-2 font-mono text-sm">
                <div class="flex items-center gap-2">
                  <button
                    onClick={toggleTimer}
                    title={timerRunning() ? "暂停计时 (P)" : "启动计时 (P)"}
                    class={cx(
                      "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold transition-all cursor-pointer",
                      timerRunning()
                        ? "border-cat-teal/60 bg-cat-teal/15 text-cat-teal"
                        : "border-cat-surface2 bg-cat-surface0/80 text-cat-subtext0 hover:text-cat-text",
                    )}
                  >
                    <span
                      class={
                        timerRunning()
                          ? "icon-[fluent--pause-16-filled]"
                          : "icon-[fluent--play-16-filled]"
                      }
                    />
                    <span>{secondsToMMSS(timer())}</span>
                  </button>
                  <button
                    onClick={resetTimer}
                    title="重置计时器 (R)"
                    class="rounded-md border border-cat-surface2 bg-cat-surface0/80 px-2 py-1 text-xs text-cat-subtext0 hover:bg-cat-surface1 hover:text-cat-text cursor-pointer"
                  >
                    重置
                  </button>
                  <Show when={remainingDurationSecs() !== null}>
                    <span
                      class={cx(
                        "rounded-md px-2 py-1 text-xs font-bold",
                        remainingDurationSecs()! < 0
                          ? "bg-cat-red/20 text-cat-red animate-pulse"
                          : remainingDurationSecs()! <= 120
                            ? "bg-cat-yellow/20 text-cat-yellow"
                            : "bg-cat-surface0 text-cat-subtext0",
                      )}
                      title="剩余演讲时间"
                    >
                      剩余 {secondsToMMSS(remainingDurationSecs()!)}
                    </span>
                  </Show>
                  <Show when={watchConnected()}>
                    <span
                      class="flex items-center gap-1 rounded-full bg-cat-green/15 px-2.5 py-0.5 text-[11px] font-sans text-cat-green"
                      title="CLI --watch 已连接，PDF 重编译将自动热更新"
                    >
                      <span class="h-1.5 w-1.5 rounded-full bg-cat-green animate-ping" />
                      Live Watch
                    </span>
                  </Show>
                  <Show when={renderedCount() < filePageCount()}>
                    <span class="text-xs text-cat-subtext0 font-sans">
                      渲染进度 {renderedCount()}/{filePageCount()}
                    </span>
                  </Show>
                </div>

                <div class="flex items-center gap-2">
                  <Show when={copyToast()}>
                    <span class="rounded bg-cat-teal/20 px-2 py-0.5 text-xs text-cat-teal font-sans">
                      {copyToast()}
                    </span>
                  </Show>
                  <button
                    onClick={() => setHasNotes((prev) => !prev)}
                    title="切换 16:9 标准 / 32:9 双屏备注模式 (快捷键: N)"
                    class={cx(
                      "flex items-center gap-1 rounded px-2 py-1 text-xs border transition-all cursor-pointer font-sans",
                      hasNotes()
                        ? "border-cat-teal bg-cat-teal/15 text-cat-teal"
                        : "border-cat-surface2 bg-cat-surface0/80 text-cat-subtext0 hover:text-cat-text",
                    )}
                  >
                    <span>{hasNotes() ? "32:9 备注视图" : "16:9 标准视图"}</span>
                  </button>
                  <button
                    onClick={copyCurrentText}
                    title="复制当前页面文本 (快捷键: C)"
                    class="flex items-center gap-1 rounded px-2 py-1 text-xs bg-cat-surface0/80 hover:bg-cat-surface1 border border-cat-surface2 text-cat-subtext0 hover:text-cat-text transition-all cursor-pointer font-sans"
                  >
                    <span class="icon-[fluent--copy-16-regular] text-sm" />
                    <span>复制本页</span>
                  </button>
                  <button
                    onClick={exportAllNotesMarkdown}
                    title="导出全部页面讲稿为 Markdown (快捷键: M)"
                    class="flex items-center gap-1 rounded px-2 py-1 text-xs bg-cat-surface0/80 hover:bg-cat-surface1 border border-cat-surface2 text-cat-subtext0 hover:text-cat-text transition-all cursor-pointer font-sans"
                  >
                    <span class="icon-[fluent--arrow-download-16-regular] text-sm" />
                    <span>导出讲稿</span>
                  </button>
                  <button
                    onClick={() => {
                      setJumpInput(String(globalCount() + 1));
                      setShowJumpModal(true);
                    }}
                    title="点击跳转页码 (快捷键: G)"
                    class="rounded border border-cat-surface2 bg-cat-surface0/80 px-2.5 py-1 font-mono text-xs font-bold text-cat-text hover:border-cat-teal cursor-pointer"
                  >
                    {globalCount() + 1} / {filePageCount()}
                  </button>
                </div>
              </div>
            </div>

            <div class="col-span-8 flex flex-col items-center justify-center gap-4">
              <Show
                when={hasNotes()}
                fallback={
                  <div class="flex flex-col items-center justify-center gap-2 w-full">
                    <div class="w-full flex items-center justify-between text-xs font-mono text-cat-subtext0">
                      <span>
                        NEXT SLIDE (
                        {globalCount() + 2 > filePageCount()
                          ? "END"
                          : `${globalCount() + 2}/${filePageCount()}`}
                        )
                      </span>
                      <span>按 N 切 32:9 · 按 ? 查看快捷键</span>
                    </div>
                    <div class="aspect-video w-full overflow-hidden rounded-lg border border-cat-surface1">
                      <Show
                        when={docImages()[globalCount() + 1]}
                        fallback={
                          <div class="flex h-full w-full items-center justify-center text-cat-subtext0 bg-cat-surface0/30 font-mono">
                            End of presentation
                          </div>
                        }
                      >
                        <img
                          src={docImages()[globalCount() + 1]}
                          alt="next slide"
                          class="aspect-video h-full cursor-pointer object-cover object-center opacity-70 hover:opacity-100 transition-opacity"
                          style={{
                            "view-transition-name": `left-${globalCount() + 1}`,
                          }}
                          onClick={nextPage}
                        />
                      </Show>
                    </div>
                  </div>
                }
              >
                <div
                  class={cx(
                    "relative aspect-video w-full overflow-hidden rounded-lg border border-cat-surface1",
                    laserActive() && "cursor-crosshair",
                  )}
                  onMouseMove={handleLaserMouseMove}
                  onMouseLeave={() => setLaserPos(null)}
                >
                  <Show when={docImages()[globalCount()]}>
                    <img
                      src={docImages()[globalCount()]}
                      alt="current slide"
                      id="presenter-current-left"
                      class="aspect-video h-full object-cover object-left"
                      style={{
                        "view-transition-name": `left-${globalCount()}`,
                      }}
                    />
                    <Show when={!laserActive()}>
                      <TextLayer
                        rects={docTexts()[globalCount()]?.rects}
                        half="left"
                      />
                    </Show>
                    <LaserDot />
                  </Show>
                </div>
                <div class="aspect-video w-full overflow-hidden rounded-lg border border-cat-surface1">
                  <Show
                    when={docImages()[globalCount() + 1]}
                    fallback={
                      <div class="flex h-full w-full items-center justify-center text-cat-subtext0 bg-cat-surface0/30 font-mono text-xs">
                        End of presentation
                      </div>
                    }
                  >
                    <img
                      src={docImages()[globalCount() + 1]}
                      alt="next slide"
                      class="aspect-video h-full cursor-pointer object-cover object-left opacity-55 hover:opacity-85 transition-opacity"
                      style={{
                        "view-transition-name": `left-${globalCount() + 1}`,
                      }}
                      onClick={nextPage}
                    />
                  </Show>
                </div>
              </Show>
            </div>
          </div>
        </Show>

        {/* Bottom Floating Control Bar */}
        <div class="pointer-events-none fixed bottom-4 left-4 flex flex-wrap items-center gap-4 p-4 [view-transition-name:anything]">
          <CircleButton
            onClick={previousPage}
            classIcon="icon-[fluent--arrow-left-24-regular]"
            title="上一页 (← / PageUp / K)"
          />
          <CircleButton
            onClick={nextPage}
            classIcon="icon-[fluent--arrow-right-24-regular]"
            title="下一页 (→ / Space / PageDown / J)"
          />
          <div
            class="pointer-events-auto relative flex h-8 w-20 cursor-pointer place-content-between place-items-center rounded-full bg-cat-surface0/50 text-cat-subtext0/50 outline outline-cat-subtext0/50 transition-all hover:bg-cat-surface0/80 hover:outline-cat-subtext0 dark:bg-cat-surface0/70"
            title="切换概览网格 / 演讲者视图 (Tab)"
            onClick={() => {
              const toggle = () => {
                setViewMode((prev) =>
                  prev === OVERVIEW ? PRESENTER : OVERVIEW,
                );
              };
              document.startViewTransition?.(toggle) ?? toggle();
            }}
          >
            <div
              class={cx(
                "z-20 grid aspect-square h-full place-items-center rounded-full",
                viewMode() === OVERVIEW &&
                  "text-cat-surface0/70 hover:text-cat-surface0 hover:outline-cat-subtext0",
              )}
            >
              <button class="pointer-events-none icon-[fluent--grid-24-filled] aspect-square h-full" />
            </div>
            <div
              class={cx(
                "z-20 grid aspect-square h-full place-items-center rounded-full",
                viewMode() !== OVERVIEW &&
                  "text-cat-surface0/70 hover:text-cat-surface0 hover:outline-cat-subtext0",
              )}
            >
              <button class="pointer-events-none icon-[fluent--content-view-gallery-24-filled] aspect-square h-full" />
            </div>
            <div
              class={cx(
                "absolute z-10 aspect-square h-full w-8 rounded-full border-4 border-transparent bg-cat-subtext0/50 bg-clip-padding text-cat-surface0/70 transition-all ease-in hover:bg-cat-subtext0/80",
                viewMode() === OVERVIEW ? "left-0" : "left-0 translate-x-12",
              )}
            />
          </div>
          <CircleButton
            onClick={() => {
              if (!w()) {
                popup();
              } else {
                closePopup();
              }
            }}
            classIcon="icon-[mdi--projector] scale-125"
            toggled={!!w()}
            title="打开观众投影窗口"
            toggledTitle="关闭观众投影窗口"
          />
          <CircleButton
            onClick={() => setIsBlackout((prev) => !prev)}
            classIcon="icon-[fluent--eye-off-24-regular]"
            toggled={isBlackout()}
            title="观众投影黑屏 (快捷键: B / .)"
            toggledTitle="恢复观众投影画面 (快捷键: B / .)"
          />
          <CircleButton
            onClick={() => {
              setLaserActive((prev) => !prev);
              if (!laserActive()) setLaserPos(null);
            }}
            classIcon="icon-[fluent--target-24-regular]"
            toggled={laserActive()}
            title="开启激光笔同步指示 (快捷键: L)"
            toggledTitle="关闭激光笔 (快捷键: L)"
          />
          <Recorder
            globalCount={globalCount}
            filePageCount={filePageCount}
            docImages={docImages}
          />
          <CircleButton
            onClick={() => setShowHelpModal((prev) => !prev)}
            classIcon="icon-[fluent--question-circle-24-regular]"
            toggled={showHelpModal()}
            title="快捷键与操作指南 (快捷键: ? / H)"
            toggledTitle="关闭操作指南"
          />
        </div>

        {/* Page Jump Modal (G) */}
        <Show when={showJumpModal()}>
          <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs"
            onClick={() => setShowJumpModal(false)}
          >
            <div
              class="w-80 rounded-2xl border border-cat-surface1 bg-cat-mantle p-5 text-cat-text shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 class="text-sm font-bold mb-3">
                跳转到指定页码 (1 – {filePageCount()})
              </h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const num = parseInt(jumpInput(), 10);
                  if (!Number.isNaN(num) && num >= 1 && num <= filePageCount()) {
                    goToPage(num - 1);
                    setShowJumpModal(false);
                  }
                }}
                class="flex gap-2"
              >
                <input
                  type="number"
                  min={1}
                  max={filePageCount()}
                  value={jumpInput()}
                  autofocus
                  onInput={(e) => setJumpInput(e.currentTarget.value)}
                  class="flex-1 rounded-lg border border-cat-surface2 bg-cat-base px-3 py-1.5 font-mono text-sm text-cat-text focus:border-cat-teal focus:outline-none"
                />
                <button
                  type="submit"
                  class="rounded-lg bg-cat-teal px-4 py-1.5 text-xs font-bold text-cat-base hover:bg-cat-teal/90 cursor-pointer"
                >
                  跳转
                </button>
              </form>
              <div class="mt-3 flex items-center justify-between text-xs text-cat-subtext0">
                <span>目标演讲时长 (分钟):</span>
                <input
                  type="number"
                  min={0}
                  max={300}
                  value={Math.round(targetDurationSecs() / 60)}
                  onInput={(e) => {
                    const mins = parseFloat(e.currentTarget.value) || 0;
                    setTargetDurationSecs(Math.max(0, Math.round(mins * 60)));
                  }}
                  class="w-20 rounded border border-cat-surface2 bg-cat-base px-2 py-1 font-mono text-xs text-cat-text"
                />
              </div>
            </div>
          </div>
        </Show>

        {/* Keyboard Shortcuts & Operator Help Modal (? / H) */}
        <Show when={showHelpModal()}>
          <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
            onClick={() => setShowHelpModal(false)}
          >
            <div
              class="w-full max-w-lg rounded-2xl border border-cat-surface1 bg-cat-mantle p-6 text-cat-text shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div class="mb-4 flex items-center justify-between border-b border-cat-surface0 pb-3">
                <h2 class="text-base font-bold">⌨️ pdfpc-ts 演讲者快捷键与操作面板</h2>
                <button
                  onClick={() => setShowHelpModal(false)}
                  class="rounded-full bg-cat-surface0 px-2.5 py-0.5 text-xs text-cat-subtext0 hover:text-cat-text cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div class="grid grid-cols-2 gap-x-6 gap-y-2.5 text-xs">
                <div class="flex justify-between">
                  <span class="text-cat-subtext0">下一页</span>
                  <kbd class="font-mono font-bold text-cat-teal">→ / Space / J</kbd>
                </div>
                <div class="flex justify-between">
                  <span class="text-cat-subtext0">上一页</span>
                  <kbd class="font-mono font-bold text-cat-teal">← / PageUp / K</kbd>
                </div>
                <div class="flex justify-between">
                  <span class="text-cat-subtext0">首页 / 末页</span>
                  <kbd class="font-mono font-bold text-cat-teal">Home / End</kbd>
                </div>
                <div class="flex justify-between">
                  <span class="text-cat-subtext0">跳转指定页 & 设倒计时</span>
                  <kbd class="font-mono font-bold text-cat-teal">G</kbd>
                </div>
                <div class="flex justify-between">
                  <span class="text-cat-subtext0">概览网格 / 演讲视图</span>
                  <kbd class="font-mono font-bold text-cat-teal">Tab</kbd>
                </div>
                <div class="flex justify-between">
                  <span class="text-cat-subtext0">切换 16:9 / 32:9 备注</span>
                  <kbd class="font-mono font-bold text-cat-teal">N</kbd>
                </div>
                <div class="flex justify-between">
                  <span class="text-cat-subtext0">观众投影黑屏开关</span>
                  <kbd class="font-mono font-bold text-cat-teal">B / .</kbd>
                </div>
                <div class="flex justify-between">
                  <span class="text-cat-subtext0">激光笔双屏同步指示</span>
                  <kbd class="font-mono font-bold text-cat-teal">L</kbd>
                </div>
                <div class="flex justify-between">
                  <span class="text-cat-subtext0">暂停 / 继续计时器</span>
                  <kbd class="font-mono font-bold text-cat-teal">P</kbd>
                </div>
                <div class="flex justify-between">
                  <span class="text-cat-subtext0">重置计时器</span>
                  <kbd class="font-mono font-bold text-cat-teal">R</kbd>
                </div>
                <div class="flex justify-between">
                  <span class="text-cat-subtext0">复制本页讲稿/文本</span>
                  <kbd class="font-mono font-bold text-cat-teal">C</kbd>
                </div>
                <div class="flex justify-between">
                  <span class="text-cat-subtext0">导出全量讲稿 Markdown</span>
                  <kbd class="font-mono font-bold text-cat-teal">M</kbd>
                </div>
                <div class="flex justify-between">
                  <span class="text-cat-subtext0">全屏切换</span>
                  <kbd class="font-mono font-bold text-cat-teal">F</kbd>
                </div>
                <div class="flex justify-between">
                  <span class="text-cat-subtext0">显示/隐藏本帮助</span>
                  <kbd class="font-mono font-bold text-cat-teal">? / H</kbd>
                </div>
              </div>
            </div>
          </div>
        </Show>
      </Show>
    </Layout>
  );
}

function Loading() {
  onSettled(() => {
    return () => {
      if (data) {
        const params = new URLSearchParams(window.location.search);
        const rawMode = params.get("mode");
        const mode: "no-notes" | "notes-right" | "auto" =
          rawMode === "notes-right"
            ? "notes-right"
            : rawMode === "no-notes"
              ? "no-notes"
              : "auto";
        void handleFileSelect(mode)(data);
      }
    };
  });
  return <p>Loading...</p>;
}

function Layout(props: { children: JSX.Element }) {
  return (
    <Show when={isReady()} fallback={<Loading />}>
      <header></header>
      <main class="mx-10 my-10">{props.children}</main>
      <footer></footer>
    </Show>
  );
}

async function fetchPDF(url?: string): Promise<File | undefined> {
  const params = url
    ? new URLSearchParams(new URL(url, window.location.href).search)
    : new URLSearchParams(window.location.search);
  const fileUrl = params.get("file") || params.get("pdf");
  if (fileUrl) {
    try {
      const res = await fetch(fileUrl, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to fetch file: ${res.status} ${res.statusText}`);
      }
      const blob = await res.blob();
      const headerName = res.headers.get("X-Pdf-Filename");
      const rawName = headerName
        ? decodeURIComponent(headerName)
        : fileUrl.split("/").pop()?.split("?")[0] || "presentation.pdf";
      const fileName = rawName.toLowerCase().endsWith(".pdf")
        ? rawName
        : `${rawName}.pdf`;
      return new File([blob], fileName, { type: "application/pdf" });
    } catch (err) {
      console.error("fetchPDF error:", err);
      return undefined;
    }
  }
}

function CircleButton(props: {
  onClick: () => void;
  classIcon: string;
  title: string;
  toggled?: boolean;
  toggledTitle?: string;
}) {
  return (
    <div
      class={cx(
        "pointer-events-auto grid h-8 w-8 cursor-pointer place-items-center rounded-full outline transition-all",
        props.toggled
          ? "bg-cat-subtext0/50 text-cat-surface0/70 outline-cat-subtext0/50 hover:bg-cat-subtext0/80 hover:text-cat-surface0 hover:outline-cat-subtext0"
          : "bg-cat-surface0/50 text-cat-subtext0/50 outline-cat-subtext0/50 hover:bg-cat-surface0/80 hover:text-cat-subtext0 hover:outline-cat-subtext0 dark:bg-cat-surface0/70",
      )}
      onClick={props.onClick}
    >
      <button
        class={cx(props.classIcon, "cursor-pointer")}
        title={props.toggled ? props.toggledTitle : props.title}
      />
    </div>
  );
}

function SelectFile() {
  return (
    <>
      <h1 class="text-4xl font-extrabold">PDF Presenter View</h1>
      <div class="mt-30 grid w-full grid-cols-2 gap-16 px-10 lg:px-20">
        <DropZone type="no-notes" onFileSelect={handleFileSelect("no-notes")} />
        <DropZone
          type="notes-right"
          onFileSelect={handleFileSelect("notes-right")}
        />
      </div>
      <div class="mt-8 px-10 lg:px-20">
        <p>Example:</p>
        <ul>
          <li class="ml-4 list-disc underline">
            <a
              href="/?file=example.pdf"
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey || e.button === 1) {
                  return;
                }
                e.preventDefault();
                void fetchPDF("/?file=example.pdf").then((file) => {
                  if (file) {
                    void handleFileSelect("auto")(file);
                  }
                });
              }}
            >
              Touying Metropolis demo
            </a>
          </li>
        </ul>
      </div>
    </>
  );
}

export default App;
