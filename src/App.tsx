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
const [copiedKey, setCopiedKey] = createSignal<string | null>(null);

// Interactive Copy & Text Teleprompter Drawer State
const [showTextPanel, setShowTextPanel] = createSignal(true);
const [textTab, setTextTab] = createSignal<"notes" | "slide" | "all">("notes");
const [notesFontSize, setNotesFontSize] = createSignal(15);
const [selectedSnippet, setSelectedSnippet] = createSignal<string>("");

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

function showToast(msg: string, badgeKey?: string) {
  setCopyToast(msg);
  if (badgeKey) {
    setCopiedKey(badgeKey);
  }
  setTimeout(() => {
    setCopyToast((prev) => (prev === msg ? null : prev));
    if (badgeKey) {
      setCopiedKey((prev) => (prev === badgeKey ? null : prev));
    }
  }, 2200);
}

async function writeToClipboard(text: string, label: string, badgeKey?: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    showToast("当前内容为空，无可复制文本", badgeKey);
    return;
  }
  try {
    await navigator.clipboard.writeText(trimmed);
    showToast(`✓ 已复制${label}（${trimmed.length} 字符）`, badgeKey);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = trimmed;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast(`✓ 已复制${label}（${trimmed.length} 字符）`, badgeKey);
  }
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
      let resolvedNotes = isDualRatio;
      if (modeOverride() === "notes-right") {
        resolvedNotes = true;
      } else if (modeOverride() === "no-notes") {
        resolvedNotes = false;
      }
      setHasNotes(resolvedNotes);
      setTextTab(resolvedNotes ? "notes" : "slide");
    };
    img.src = url;
  }
}

// Sort rects in natural reading order (top-to-bottom, left-to-right) and group lines
function extractHalfText(
  pageData: PageTextData | undefined,
  half: "left" | "right" | "all",
): string {
  if (!pageData) return "";
  if (half === "all" || !pageData.rects || pageData.rects.length === 0) {
    return (pageData.text || "").trim();
  }
  const filtered = pageData.rects.filter((r) =>
    half === "right" ? r.left >= 49.5 : r.left + r.width <= 50.5,
  );
  if (filtered.length === 0) {
    return half === "left" ? (pageData.text || "").trim() : "";
  }
  const sorted = [...filtered].sort((a, b) => {
    if (Math.abs(a.top - b.top) > 1.8) return a.top - b.top;
    return a.left - b.left;
  });
  const lines: string[] = [];
  let currentLine = "";
  let lastTop: number | null = null;
  for (const r of sorted) {
    const piece = r.text.replace(/\s+/g, " ").trim();
    if (!piece) continue;
    if (lastTop === null || Math.abs(r.top - lastTop) <= 1.8) {
      currentLine = currentLine ? `${currentLine} ${piece}` : piece;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = piece;
    }
    lastTop = r.top;
  }
  if (currentLine) lines.push(currentLine);
  return lines.join("\n").trim();
}

const getSlideNotesText = (pageIdx: number): string => {
  const current = docTexts()[pageIdx];
  if (!current) return "";
  if (hasNotes()) {
    const rightTxt = extractHalfText(current, "right");
    return rightTxt || extractHalfText(current, "all");
  }
  return extractHalfText(current, "all");
};

const getSlideMainText = (pageIdx: number): string => {
  const current = docTexts()[pageIdx];
  if (!current) return "";
  if (hasNotes()) {
    return extractHalfText(current, "left");
  }
  return extractHalfText(current, "all");
};

const getActivePanelText = (pageIdx: number): string => {
  const tab = textTab();
  const data = docTexts()[pageIdx];
  if (!data) return "";
  if (tab === "notes") {
    return hasNotes()
      ? extractHalfText(data, "right")
      : extractHalfText(data, "all");
  }
  if (tab === "slide") {
    return hasNotes()
      ? extractHalfText(data, "left")
      : extractHalfText(data, "all");
  }
  return extractHalfText(data, "all");
};

const getActiveParagraphs = (pageIdx: number): string[] => {
  const raw = getActivePanelText(pageIdx);
  if (!raw) return [];
  return raw
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
};

const copyCurrentText = async () => {
  const txt = getActivePanelText(globalCount()) || getSlideNotesText(globalCount());
  const label =
    textTab() === "notes" && hasNotes()
      ? "本页备注讲稿"
      : textTab() === "slide" && hasNotes()
        ? "本页正稿文本"
        : "本页全部文本";
  await writeToClipboard(txt, label, "current-page");
};

const buildAllDeckText = (): string => {
  const total = filePageCount();
  if (total <= 0) return "";
  const sections: string[] = [];
  for (let i = 0; i < total; i++) {
    const notesTxt = hasNotes()
      ? extractHalfText(docTexts()[i], "right")
      : extractHalfText(docTexts()[i], "all");
    const slideTxt = hasNotes() ? extractHalfText(docTexts()[i], "left") : "";
    const parts: string[] = [`## Slide ${i + 1}`];
    if (hasNotes()) {
      if (notesTxt) {
        parts.push(`### 演讲备注 (Notes)\n${notesTxt}`);
      }
      if (slideTxt) {
        parts.push(`### 幻灯片正稿 (Slide)\n${slideTxt}`);
      }
      if (!notesTxt && !slideTxt) {
        parts.push("_（本页无文本）_");
      }
    } else {
      parts.push(notesTxt || "_（本页无文本）_");
    }
    sections.push(parts.join("\n\n"));
  }
  return sections.join("\n\n---\n\n");
};

const copyAllDeckText = async () => {
  const allTxt = buildAllDeckText();
  await writeToClipboard(allTxt, "全篇所有页讲稿", "all-deck");
};

const exportAllNotesMarkdown = () => {
  const total = filePageCount();
  if (total <= 0) return;
  const header = `# ${currentFileName() || "Presentation"} — Speaker Notes & Slide Text\n\n`;
  const content = header + buildAllDeckText() + "\n";
  const blob = new Blob([content], {
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
  showToast("✓ 已下载全篇讲稿 Markdown 文件", "export-md");
};

function TextLayer(props: {
  rects?: PageTextRect[];
  half?: "all" | "left" | "right";
  class?: string;
}) {
  const activeRects = () => props.rects || [];

  const handleMouseUp = () => {
    const sel = window.getSelection()?.toString().trim() || "";
    setSelectedSnippet(sel);
  };

  return (
    <div
      class={cx(
        "absolute inset-0 z-10 overflow-hidden select-text pointer-events-auto",
        props.class,
      )}
      style={{ "user-select": "text", "-webkit-user-select": "text" }}
      onMouseUp={handleMouseUp}
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
              class="absolute cursor-text whitespace-pre text-transparent selection:bg-cat-teal/45 selection:text-cat-base rounded-xs"
              style={{
                left: `${left}%`,
                top: `${r.top}%`,
                width: `${width}%`,
                height: `${r.height}%`,
                "font-size": `calc(${r.height}cqh * 0.9)`,
                "line-height": "1",
                display: "inline-block",
              }}
              title={`${r.text} (双击复制该词句)`}
              onDblClick={(e) => {
                e.stopPropagation();
                void writeToClipboard(r.text, "选中词句", "dblclick");
              }}
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
  setSelectedSnippet("");
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
      showToast(isBlackout() ? "已开启观众投影黑屏 (B)" : "已恢复投影画面");
      break;
    case "l":
    case "L":
      e.preventDefault();
      setLaserActive((prev) => !prev);
      if (!laserActive()) setLaserPos(null);
      showToast(laserActive() ? "双屏激光笔已开启 (L)" : "激光笔已关闭");
      break;
    case "n":
    case "N":
      e.preventDefault();
      setHasNotes((prev) => {
        const next = !prev;
        setTextTab(next ? "notes" : "slide");
        return next;
      });
      showToast(
        hasNotes() ? "已切换为 32:9 双屏备注模式" : "已切换为 16:9 标准单屏模式",
      );
      break;
    case "t":
    case "T":
      e.preventDefault();
      setShowTextPanel((prev) => !prev);
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
      showToast("计时器已重置为 00:00");
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
      } else if (selectedSnippet()) {
        window.getSelection()?.removeAllRanges();
        setSelectedSnippet("");
      } else if (isBlackout()) {
        setIsBlackout(false);
      } else if (w()) {
        closePopup();
      }
      break;
    case "c":
    case "C":
      if (e.metaKey || e.ctrlKey) {
        // Native Ctrl+C / Cmd+C selection copy
        const sel = window.getSelection()?.toString().trim();
        if (sel) {
          showToast(`✓ 已复制划词内容（${sel.length} 字符）`, "selection");
        }
        return;
      }
      if (window.getSelection()?.toString().trim()) {
        const sel = window.getSelection()!.toString().trim();
        void writeToClipboard(sel, "划词选中内容", "selection");
      } else {
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
      setTextTab("notes");
    } else if (type === "no-notes") {
      setHasNotes(false);
      setTextTab("slide");
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
      showToast("PDF 解析失败，请检查文件是否损坏");
    }
  };

const resetToHome = () => {
  currentLoadGen++;
  stopTimerInterval();
  setTimer(0);
  setFilePageCount(-1);
  setCurrentFileName("");
  setSelectedSnippet("");
};

const nextPage = () => {
  if (filePageCount() <= 0) return;
  if (!timerRunning() && timer() === 0) {
    startTimer();
  }
  setSelectedSnippet("");
  const update = () => {
    setGlobalCount((prev) => Math.min(prev + 1, filePageCount() - 1));
  };
  document.startViewTransition?.(update) ?? update();
};

const previousPage = () => {
  if (filePageCount() <= 0) return;
  setSelectedSnippet("");
  const update = () => {
    setGlobalCount((prev) => Math.max(0, prev - 1));
  };
  document.startViewTransition?.(update) ?? update();
};

const handleLaserMouseMove = (e: MouseEvent) => {
  if (!laserActive()) return;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const x = Math.max(
    0,
    Math.min(100, ((e.clientX - rect.left) / rect.width) * 100),
  );
  const y = Math.max(
    0,
    Math.min(100, ((e.clientY - rect.top) / rect.height) * 100),
  );
  setLaserPos({ x, y });
};

function popup() {
  const _w = window.open("", "", "left=100,top=100,width=960,height=540");
  if (!_w) {
    showToast("弹窗被浏览器拦截，请允许当前站点弹出窗口");
    return;
  }
  setW(_w);

  // @ts-expect-error CSSStyleSheet on popup window
  const styles = new _w.CSSStyleSheet();
  styles.replaceSync(_styles);
  _w?.document.adoptedStyleSheets?.push(styles);
  _w.document.title = `${currentFileName() || "pdfpc-ts"} — Audience Projection`;
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
          showToast("检测到 PDF 更新，正在无感热重载...");
          const refreshed = await fetchPDF(
            `/?file=${encodeURIComponent(fileUrl || "/slide.pdf")}&_t=${Date.now()}`,
          );
          if (refreshed) {
            await handleFileSelect(modeOverride(), true)(refreshed);
            showToast("✓ PDF 热重载完成！");
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
      {/* Global Top Toast Notification */}
      <Show when={copyToast()}>
        <div class="fixed top-4 right-6 z-50 flex items-center gap-2 rounded-xl border border-cat-teal/50 bg-cat-mantle/95 px-4 py-2 text-xs font-semibold text-cat-teal shadow-2xl backdrop-blur-md">
          <span class="icon-[fluent--checkmark-circle-16-filled] text-base" />
          <span>{copyToast()}</span>
        </div>
      </Show>

      {/* Floating Selection Quick-Copy Bar when user selects text on slide */}
      <Show when={selectedSnippet()}>
        <div class="fixed top-14 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-cat-teal/60 bg-cat-mantle/95 px-4 py-1.5 text-xs text-cat-text shadow-2xl backdrop-blur-md">
          <span class="max-w-xs truncate font-mono text-cat-subtext0">
            “{selectedSnippet()}”
          </span>
          <button
            onClick={() => {
              void writeToClipboard(selectedSnippet(), "划词选中内容", "selection");
              window.getSelection()?.removeAllRanges();
              setSelectedSnippet("");
            }}
            class="flex items-center gap-1 rounded-full bg-cat-teal px-3 py-0.5 font-bold text-cat-base hover:bg-cat-teal/90 cursor-pointer"
          >
            <span class="icon-[fluent--copy-16-filled]" />
            <span>一键复制选中</span>
          </button>
          <button
            onClick={() => {
              window.getSelection()?.removeAllRanges();
              setSelectedSnippet("");
            }}
            class="text-cat-subtext0 hover:text-cat-text cursor-pointer px-1"
            title="取消选择"
          >
            ✕
          </button>
        </div>
      </Show>

      <Show when={filePageCount() > 0} fallback={<SelectFile />}>
        {/* Top Progress Bar */}
        <div class="fixed top-0 left-0 right-0 z-40 h-1 bg-cat-surface0/60">
          <div
            class="h-full bg-cat-teal transition-all duration-300"
            style={{ width: `${slideProgressPct()}%` }}
          />
        </div>

        {/* Top Presenter Header Bar */}
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cat-surface1 bg-cat-mantle/80 px-4 py-2.5 shadow-sm backdrop-blur-md">
          {/* Left: File & Timer Controls */}
          <div class="flex flex-wrap items-center gap-2.5">
            <button
              onClick={resetToHome}
              title="返回首页更换 PDF 文件"
              class="flex items-center gap-1.5 rounded-lg border border-cat-surface2 bg-cat-surface0/70 px-2.5 py-1 text-xs font-medium text-cat-subtext0 hover:border-cat-teal hover:text-cat-text transition-colors cursor-pointer"
            >
              <span class="icon-[fluent--folder-open-16-regular] text-sm text-cat-teal" />
              <span class="max-w-44 truncate font-semibold text-cat-text">
                {currentFileName() || "换文件"}
              </span>
            </button>

            <div class="h-4 w-px bg-cat-surface1" />

            <button
              onClick={toggleTimer}
              title={timerRunning() ? "暂停计时 (快捷键: P)" : "启动计时 (快捷键: P)"}
              class={cx(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1 font-mono text-xs font-bold transition-all cursor-pointer",
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
              title="重置计时器 (快捷键: R)"
              class="rounded-lg border border-cat-surface2 bg-cat-surface0/70 px-2 py-1 text-xs text-cat-subtext0 hover:bg-cat-surface1 hover:text-cat-text cursor-pointer"
            >
              重置
            </button>

            <Show when={remainingDurationSecs() !== null}>
              <span
                class={cx(
                  "rounded-lg px-2.5 py-1 font-mono text-xs font-bold",
                  remainingDurationSecs()! < 0
                    ? "bg-cat-red/20 text-cat-red animate-pulse"
                    : remainingDurationSecs()! <= 120
                      ? "bg-cat-yellow/20 text-cat-yellow"
                      : "bg-cat-surface0 text-cat-subtext0",
                )}
                title="剩余演讲时间（点击页码按钮或按 G 可修改目标时长）"
              >
                剩余 {secondsToMMSS(remainingDurationSecs()!)}
              </span>
            </Show>

            <Show when={watchConnected()}>
              <span
                class="flex items-center gap-1.5 rounded-full bg-cat-green/15 px-2.5 py-0.5 text-[11px] font-semibold text-cat-green"
                title="CLI --watch 已连接，PDF 重编译将自动热更新"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-cat-green animate-ping" />
                Live Watch
              </span>
            </Show>

            <Show when={renderedCount() < filePageCount()}>
              <span class="rounded-md bg-cat-surface0/80 px-2 py-0.5 text-xs text-cat-subtext0">
                渲染中 {renderedCount()}/{filePageCount()}
              </span>
            </Show>
          </div>

          {/* Right: Quick Action & Copy Toolbar */}
          <div class="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setHasNotes((prev) => {
                  const next = !prev;
                  setTextTab(next ? "notes" : "slide");
                  return next;
                });
              }}
              title="切换 16:9 标准 / 32:9 双屏备注模式 (快捷键: N)"
              class={cx(
                "flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium border transition-all cursor-pointer",
                hasNotes()
                  ? "border-cat-mauve/70 bg-cat-mauve/15 text-cat-mauve"
                  : "border-cat-surface2 bg-cat-surface0/80 text-cat-subtext0 hover:text-cat-text",
              )}
            >
              <span>{hasNotes() ? "32:9 双屏备注" : "16:9 标准单屏"}</span>
            </button>

            <button
              onClick={copyCurrentText}
              title="一键复制当前页讲稿/文本 (快捷键: C)"
              class={cx(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold transition-all cursor-pointer",
                copiedKey() === "current-page"
                  ? "border-cat-green bg-cat-green/20 text-cat-green"
                  : "border-cat-teal/60 bg-cat-teal/15 text-cat-teal hover:bg-cat-teal/25",
              )}
            >
              <span
                class={
                  copiedKey() === "current-page"
                    ? "icon-[fluent--checkmark-16-filled]"
                    : "icon-[fluent--copy-16-regular]"
                }
              />
              <span>
                {copiedKey() === "current-page" ? "已复制本页" : "复制本页 (C)"}
              </span>
            </button>

            <button
              onClick={copyAllDeckText}
              title="一键复制整份 PDF 全部页面讲稿到剪贴板"
              class={cx(
                "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all cursor-pointer",
                copiedKey() === "all-deck"
                  ? "border-cat-green bg-cat-green/20 text-cat-green"
                  : "border-cat-surface2 bg-cat-surface0/80 text-cat-subtext0 hover:bg-cat-surface1 hover:text-cat-text",
              )}
            >
              <span class="icon-[fluent--document-copy-16-regular]" />
              <span>{copiedKey() === "all-deck" ? "已复制全篇" : "复制全篇"}</span>
            </button>

            <button
              onClick={exportAllNotesMarkdown}
              title="导出全部页面讲稿为 Markdown 文件 (快捷键: M)"
              class="flex items-center gap-1 rounded-lg border border-cat-surface2 bg-cat-surface0/80 px-2.5 py-1 text-xs font-medium text-cat-subtext0 hover:bg-cat-surface1 hover:text-cat-text transition-all cursor-pointer"
            >
              <span class="icon-[fluent--arrow-download-16-regular]" />
              <span>导出 .md</span>
            </button>

            <button
              onClick={() => setShowTextPanel((prev) => !prev)}
              title="展开/收起可交互文本提词与分段复制面板 (快捷键: T)"
              class={cx(
                "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all cursor-pointer",
                showTextPanel()
                  ? "border-cat-teal/60 bg-cat-teal/15 text-cat-teal"
                  : "border-cat-surface2 bg-cat-surface0/80 text-cat-subtext0 hover:text-cat-text",
              )}
            >
              <span class="icon-[fluent--text-align-left-16-regular]" />
              <span>提词栏 (T)</span>
            </button>

            <button
              onClick={() => {
                setJumpInput(String(globalCount() + 1));
                setShowJumpModal(true);
              }}
              title="点击跳转页码或设置演讲倒计时 (快捷键: G)"
              class="rounded-lg border border-cat-surface2 bg-cat-base px-3 py-1 font-mono text-xs font-bold text-cat-text hover:border-cat-teal cursor-pointer"
            >
              {globalCount() + 1} / {filePageCount()}
            </button>
          </div>
        </div>

        <Show
          when={viewMode() === PRESENTER}
          fallback={
            <div class="mb-20 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-2">
              <For each={Array(filePageCount()).fill(0)}>
                {(_, index) => (
                  <div
                    class={cx(
                      "group relative aspect-video cursor-pointer overflow-hidden rounded-xl outline transition-all",
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
                    <div class="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2.5 py-1.5 text-white">
                      <span class="font-mono text-xs font-bold">
                        #{index() + 1}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const txt = getSlideNotesText(index());
                          void writeToClipboard(
                            txt,
                            `第 ${index() + 1} 页文本`,
                            `grid-${index()}`,
                          );
                        }}
                        class="rounded bg-black/60 px-2 py-0.5 text-[10px] text-cat-teal opacity-0 group-hover:opacity-100 hover:bg-black transition-opacity cursor-pointer"
                        title="复制该页讲稿文本"
                      >
                        复制文本
                      </button>
                    </div>
                  </div>
                )}
              </For>
            </div>
          }
        >
          {/* Presenter Dual-Column Workspace */}
          <div class="grid h-full grid-cols-1 lg:grid-cols-21 gap-5 pb-16">
            {/* Left Column (13 cols): Main Slide / Notes Image + Interactive Text Teleprompter */}
            <div class="lg:col-span-13 flex flex-col gap-4">
              <div
                class={cx(
                  "relative aspect-video w-full rounded-xl overflow-hidden border border-cat-surface1 bg-black/20 shadow-xl",
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
                        观众投影黑屏中 (按 B 恢复)
                      </span>
                    </div>
                  </Show>
                </Show>
              </div>

              {/* Interactive Readable Teleprompter & Paragraph Copy Drawer */}
              <Show when={showTextPanel()}>
                <div class="flex flex-col rounded-xl border border-cat-surface1 bg-cat-mantle/90 p-4 shadow-md">
                  <div class="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-cat-surface0 pb-2.5">
                    {/* Source Tabs */}
                    <div class="flex items-center gap-1.5">
                      <span class="icon-[fluent--notepad-20-regular] text-cat-teal text-base mr-1" />
                      <Show when={hasNotes()}>
                        <button
                          onClick={() => setTextTab("notes")}
                          class={cx(
                            "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                            textTab() === "notes"
                              ? "bg-cat-teal text-cat-base"
                              : "bg-cat-surface0/70 text-cat-subtext0 hover:text-cat-text",
                          )}
                        >
                          右侧演讲备注 (Notes)
                        </button>
                        <button
                          onClick={() => setTextTab("slide")}
                          class={cx(
                            "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                            textTab() === "slide"
                              ? "bg-cat-teal text-cat-base"
                              : "bg-cat-surface0/70 text-cat-subtext0 hover:text-cat-text",
                          )}
                        >
                          左侧幻灯片正稿 (Slide)
                        </button>
                      </Show>
                      <button
                        onClick={() => setTextTab("all")}
                        class={cx(
                          "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                          textTab() === "all" || !hasNotes()
                            ? "bg-cat-teal text-cat-base"
                            : "bg-cat-surface0/70 text-cat-subtext0 hover:text-cat-text",
                        )}
                      >
                        {hasNotes() ? "全页合并文本" : "本页提取文本 (可点击段落复制)"}
                      </button>
                    </div>

                    {/* Font size & Copy controls */}
                    <div class="flex items-center gap-1.5 text-xs">
                      <span class="text-cat-overlay1 mr-1 hidden sm:inline">
                        点击任意段落即复制 ·
                      </span>
                      <button
                        onClick={() =>
                          setNotesFontSize((s) => Math.max(12, s - 2))
                        }
                        class="rounded border border-cat-surface2 bg-cat-surface0 px-2 py-0.5 font-mono text-cat-subtext0 hover:text-cat-text cursor-pointer"
                        title="缩小提词字号"
                      >
                        A-
                      </button>
                      <button
                        onClick={() =>
                          setNotesFontSize((s) => Math.min(28, s + 2))
                        }
                        class="rounded border border-cat-surface2 bg-cat-surface0 px-2 py-0.5 font-mono text-cat-subtext0 hover:text-cat-text cursor-pointer"
                        title="放大提词字号"
                      >
                        A+
                      </button>
                      <button
                        onClick={copyCurrentText}
                        class="ml-1 flex items-center gap-1 rounded-lg bg-cat-teal/20 border border-cat-teal/50 px-2.5 py-1 font-semibold text-cat-teal hover:bg-cat-teal/30 cursor-pointer"
                      >
                        <span class="icon-[fluent--copy-16-regular]" />
                        <span>复制当前栏</span>
                      </button>
                    </div>
                  </div>

                  {/* Paragraph List or Empty Fallback */}
                  <Show
                    when={getActiveParagraphs(globalCount()).length > 0}
                    fallback={
                      <div class="py-4 text-center text-xs text-cat-overlay1">
                        当前页在此分栏下未检测到嵌入文本（可能是纯位图或扫描件）。
                      </div>
                    }
                  >
                    <div
                      class="max-h-48 space-y-1.5 overflow-y-auto pr-1 select-text"
                      style={{ "font-size": `${notesFontSize()}px` }}
                    >
                      <For each={getActiveParagraphs(globalCount())}>
                        {(line, lineIdx) => (
                          <div
                            onClick={() => {
                              const sel = window.getSelection()?.toString().trim();
                              if (sel) return;
                              void writeToClipboard(
                                line,
                                `第 ${lineIdx() + 1} 行段落`,
                                `line-${lineIdx()}`,
                              );
                            }}
                            title="点击直接复制本段文本（也可直接拖选局部文字）"
                            class={cx(
                              "group flex items-start justify-between gap-3 rounded-lg px-3 py-1.5 leading-relaxed transition-colors cursor-pointer",
                              copiedKey() === `line-${lineIdx()}`
                                ? "bg-cat-green/15 text-cat-green"
                                : "hover:bg-cat-surface0/75 text-cat-text",
                            )}
                          >
                            <span class="flex-1 break-words">{line}</span>
                            <span class="mt-0.5 shrink-0 rounded bg-cat-surface1/80 px-1.5 py-0.5 font-sans text-[10px] text-cat-subtext0 opacity-0 group-hover:opacity-100 transition-opacity">
                              {copiedKey() === `line-${lineIdx()}`
                                ? "✓ 已复制"
                                : "复制此行"}
                            </span>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </Show>
            </div>

            {/* Right Column (8 cols): Current Audience Slide (in 32:9 mode) + Next Slide Preview */}
            <div class="lg:col-span-8 flex flex-col justify-start gap-4">
              <Show
                when={hasNotes()}
                fallback={
                  <div class="flex flex-col gap-2 w-full">
                    <div class="w-full flex items-center justify-between text-xs font-mono text-cat-subtext0">
                      <span class="font-bold">
                        NEXT SLIDE (
                        {globalCount() + 2 > filePageCount()
                          ? "END"
                          : `${globalCount() + 2}/${filePageCount()}`}
                        )
                      </span>
                      <span>点击画面翻页 · 按 ? 查看快捷键</span>
                    </div>
                    <div class="aspect-video w-full overflow-hidden rounded-xl border border-cat-surface1 bg-black/20 shadow-md">
                      <Show
                        when={docImages()[globalCount() + 1]}
                        fallback={
                          <div class="flex h-full w-full items-center justify-center text-cat-subtext0 bg-cat-surface0/30 font-mono text-sm">
                            End of presentation
                          </div>
                        }
                      >
                        <img
                          src={docImages()[globalCount() + 1]}
                          alt="next slide"
                          class="aspect-video h-full cursor-pointer object-cover object-center opacity-75 hover:opacity-100 transition-opacity"
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
                {/* In 32:9 Notes Mode: Top right is current Audience Slide, Bottom right is Next Slide */}
                <div class="flex flex-col gap-1.5">
                  <div class="flex items-center justify-between text-xs font-mono text-cat-subtext0">
                    <span class="font-bold text-cat-teal">
                      CURRENT AUDIENCE SLIDE ({globalCount() + 1}/{filePageCount()})
                    </span>
                    <button
                      onClick={() =>
                        void writeToClipboard(
                          getSlideMainText(globalCount()),
                          "本页左侧正稿文本",
                          "left-slide",
                        )
                      }
                      class="text-[11px] text-cat-subtext0 hover:text-cat-teal cursor-pointer"
                    >
                      复制正稿文字
                    </button>
                  </div>
                  <div
                    class={cx(
                      "relative aspect-video w-full overflow-hidden rounded-xl border border-cat-surface1 bg-black/20 shadow-md",
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
                </div>

                <div class="flex flex-col gap-1.5">
                  <div class="flex items-center justify-between text-xs font-mono text-cat-subtext0">
                    <span class="font-bold">
                      NEXT SLIDE (
                      {globalCount() + 2 > filePageCount()
                        ? "END"
                        : `${globalCount() + 2}/${filePageCount()}`}
                      )
                    </span>
                    <span>点击画面直接翻下一页</span>
                  </div>
                  <div class="aspect-video w-full overflow-hidden rounded-xl border border-cat-surface1 bg-black/20 shadow-md">
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
                        class="aspect-video h-full cursor-pointer object-cover object-left opacity-60 hover:opacity-90 transition-opacity"
                        style={{
                          "view-transition-name": `left-${globalCount() + 1}`,
                        }}
                        onClick={nextPage}
                      />
                    </Show>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        </Show>

        {/* Bottom Floating Control Dock */}
        <div class="pointer-events-none fixed bottom-4 left-4 flex flex-wrap items-center gap-3.5 rounded-2xl border border-cat-surface1/80 bg-cat-mantle/85 px-4 py-2.5 shadow-2xl backdrop-blur-md [view-transition-name:anything]">
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
            class="pointer-events-auto relative flex h-8 w-20 cursor-pointer place-content-between place-items-center rounded-full bg-cat-surface0/60 text-cat-subtext0/60 outline outline-cat-subtext0/40 transition-all hover:bg-cat-surface0/90 hover:outline-cat-subtext0"
            title="切换概览网格 / 演讲者视图 (快捷键: Tab)"
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
                  "text-cat-surface0/70 hover:text-cat-surface0",
              )}
            >
              <button class="pointer-events-none icon-[fluent--grid-24-filled] aspect-square h-full" />
            </div>
            <div
              class={cx(
                "z-20 grid aspect-square h-full place-items-center rounded-full",
                viewMode() !== OVERVIEW &&
                  "text-cat-surface0/70 hover:text-cat-surface0",
              )}
            >
              <button class="pointer-events-none icon-[fluent--content-view-gallery-24-filled] aspect-square h-full" />
            </div>
            <div
              class={cx(
                "absolute z-10 aspect-square h-full w-8 rounded-full border-4 border-transparent bg-cat-subtext0/60 bg-clip-padding text-cat-surface0/70 transition-all ease-in hover:bg-cat-subtext0/90",
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
            title="弹出独立观众投影窗口"
            toggledTitle="关闭观众投影窗口"
          />
          <CircleButton
            onClick={() => setIsBlackout((prev) => !prev)}
            classIcon="icon-[fluent--eye-off-24-regular]"
            toggled={isBlackout()}
            title="观众投影黑屏开关 (快捷键: B / .)"
            toggledTitle="恢复观众投影画面 (快捷键: B / .)"
          />
          <CircleButton
            onClick={() => {
              setLaserActive((prev) => !prev);
              if (!laserActive()) setLaserPos(null);
            }}
            classIcon="icon-[fluent--target-24-regular]"
            toggled={laserActive()}
            title="开启双屏同步激光笔 (快捷键: L)"
            toggledTitle="关闭激光笔 (快捷键: L)"
          />
          <CircleButton
            onClick={copyCurrentText}
            classIcon="icon-[fluent--copy-24-regular]"
            toggled={copiedKey() === "current-page"}
            title="复制当前页文本/讲稿 (快捷键: C)"
            toggledTitle="已复制！"
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

        {/* Page Jump & Countdown Settings Modal (G) */}
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
                <h2 class="text-base font-bold">
                  ⌨️ pdfpc-ts 演讲者快捷键与复制操作指南
                </h2>
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
                  <kbd class="font-mono font-bold text-cat-teal">
                    → / Space / J
                  </kbd>
                </div>
                <div class="flex justify-between">
                  <span class="text-cat-subtext0">上一页</span>
                  <kbd class="font-mono font-bold text-cat-teal">
                    ← / PageUp / K
                  </kbd>
                </div>
                <div class="flex justify-between">
                  <span class="text-cat-subtext0">首页 / 末页</span>
                  <kbd class="font-mono font-bold text-cat-teal">
                    Home / End
                  </kbd>
                </div>
                <div class="flex justify-between">
                  <span class="text-cat-subtext0">跳转页码 & 设倒计时</span>
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
                  <span class="text-cat-subtext0">展开/收起底部提词栏</span>
                  <kbd class="font-mono font-bold text-cat-teal">T</kbd>
                </div>
                <div class="flex justify-between">
                  <span class="text-cat-subtext0">复制选中或本页讲稿</span>
                  <kbd class="font-mono font-bold text-cat-teal">
                    C / Ctrl+C
                  </kbd>
                </div>
                <div class="flex justify-between">
                  <span class="text-cat-subtext0">导出全量讲稿 Markdown</span>
                  <kbd class="font-mono font-bold text-cat-teal">M</kbd>
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
                  <span class="text-cat-subtext0">暂停 / 重置计时器</span>
                  <kbd class="font-mono font-bold text-cat-teal">P / R</kbd>
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
              <p class="mt-4 rounded-lg bg-cat-surface0/60 p-2.5 text-[11px] text-cat-subtext0">
                💡 <b>复制技巧</b>：可以直接在幻灯片画面上<b>鼠标拖选任意文字</b>弹出「一键复制选中」浮窗，或<b>双击画面文字块</b>直接复制，也可以在下方的<b>提词栏点击任意段落</b>单行复制。
              </p>
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
  return (
    <div class="grid min-h-[70vh] place-items-center">
      <div class="flex flex-col items-center gap-3 text-cat-subtext0">
        <div class="h-8 w-8 animate-spin rounded-full border-3 border-cat-surface2 border-t-cat-teal" />
        <p class="font-mono text-sm">正在初始化 PDFium WebAssembly 引擎...</p>
      </div>
    </div>
  );
}

function Layout(props: { children: JSX.Element }) {
  return (
    <Show when={isReady()} fallback={<Loading />}>
      <header></header>
      <main class="mx-6 my-4 lg:mx-10">{props.children}</main>
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
      const resolvedUrl = new URL(fileUrl, window.location.href).href;
      const res = await fetch(resolvedUrl, { cache: "no-store" });
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
          ? "bg-cat-teal text-cat-base outline-cat-teal shadow-md"
          : "bg-cat-surface0/60 text-cat-subtext0/80 outline-cat-subtext0/40 hover:bg-cat-surface0 hover:text-cat-text hover:outline-cat-subtext0",
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
  const [remoteUrlInput, setRemoteUrlInput] = createSignal("");
  const [isLoadingDemo, setIsLoadingDemo] = createSignal(false);

  const loadRemoteOrDemo = async (
    targetFileUrl: string,
    mode: "auto" | "no-notes" | "notes-right" = "auto",
  ) => {
    setIsLoadingDemo(true);
    try {
      const file = await fetchPDF(
        `?file=${encodeURIComponent(targetFileUrl)}`,
      );
      if (file) {
        await handleFileSelect(mode)(file);
      } else {
        showToast("加载远程 PDF 失败，请确认 URL 支持 CORS 访问");
      }
    } finally {
      setIsLoadingDemo(false);
    }
  };

  return (
    <div class="mx-auto max-w-5xl py-6">
      {/* Studio Hero Header */}
      <div class="flex flex-wrap items-center justify-between gap-4 border-b border-cat-surface1 pb-6">
        <div>
          <div class="inline-flex items-center gap-2 rounded-full border border-cat-teal/40 bg-cat-teal/10 px-3 py-1 text-xs font-bold text-cat-teal mb-3">
            <span>⚡ WebAssembly PDFium + Rust SIMD 极速渲染</span>
          </div>
          <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight text-cat-text">
            pdfpc-ts · 浏览器端演讲者工作台
          </h1>
          <p class="mt-2 text-sm text-cat-subtext0 max-w-2xl">
            纯本地浏览器运行的双屏幻灯片放映、讲稿实时提词复制与高清排练录制工具。文件完全在本地内存中解析，绝不上传服务器。
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => void loadRemoteOrDemo("./example.pdf", "notes-right")}
            disabled={isLoadingDemo()}
            class="flex items-center gap-2 rounded-xl bg-cat-teal px-4 py-2.5 text-xs font-bold text-cat-base shadow-lg hover:bg-cat-teal/90 transition-all cursor-pointer disabled:opacity-50"
            title="加载 8 页中英双语 32:9 左右双屏带提词讲稿的全功能互动示例"
          >
            <span class="icon-[fluent--play-16-filled]" />
            <span>
              {isLoadingDemo() ? "正在加载示例..." : "体验 32:9 双屏带讲稿示例"}
            </span>
          </button>
          <button
            onClick={() => void loadRemoteOrDemo("./example-16x9.pdf", "no-notes")}
            disabled={isLoadingDemo()}
            class="flex items-center gap-1.5 rounded-xl border border-cat-teal/60 bg-cat-teal/15 px-3.5 py-2.5 text-xs font-bold text-cat-teal hover:bg-cat-teal/25 transition-all cursor-pointer disabled:opacity-50"
            title="加载 16:9 标准单屏学术汇报示例"
          >
            <span class="icon-[fluent--slide-text-16-regular]" />
            <span>体验 16:9 标准单屏示例</span>
          </button>
          <a
            href="https://github.com/acam-infra/pdfpc-ts"
            target="_blank"
            rel="noreferrer"
            class="flex items-center gap-1.5 rounded-xl border border-cat-surface2 bg-cat-mantle px-3.5 py-2.5 text-xs font-semibold text-cat-text hover:border-cat-teal transition-colors"
          >
            <span>GitHub 仓库</span>
          </a>
        </div>
      </div>

      {/* Dual DropZones */}
      <div class="mt-8 grid w-full grid-cols-1 md:grid-cols-2 gap-6">
        <DropZone type="no-notes" onFileSelect={handleFileSelect("no-notes")} />
        <DropZone
          type="notes-right"
          onFileSelect={handleFileSelect("notes-right")}
        />
      </div>

      {/* Remote URL Loader & Feature Highlights */}
      <div class="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 rounded-2xl border border-cat-surface1 bg-cat-mantle/70 p-5">
          <h3 class="text-sm font-bold text-cat-text flex items-center gap-2">
            <span class="icon-[fluent--globe-20-regular] text-cat-teal text-lg" />
            <span>从远程 URL 加载 PDF 演示文稿 (支持 CORS 直链)</span>
          </h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const u = remoteUrlInput().trim();
              if (u) {
                void loadRemoteOrDemo(u, "auto");
              }
            }}
            class="mt-3 flex flex-wrap sm:flex-nowrap gap-2.5"
          >
            <input
              type="url"
              placeholder="https://example.com/slides.pdf 或 ./example.pdf"
              value={remoteUrlInput()}
              onInput={(e) => setRemoteUrlInput(e.currentTarget.value)}
              class="flex-1 rounded-xl border border-cat-surface2 bg-cat-base px-3.5 py-2 text-xs text-cat-text placeholder:text-cat-overlay0 focus:border-cat-teal focus:outline-none"
            />
            <button
              type="submit"
              disabled={!remoteUrlInput().trim() || isLoadingDemo()}
              class="rounded-xl bg-cat-surface0 border border-cat-surface2 px-4 py-2 text-xs font-bold text-cat-text hover:border-cat-teal hover:text-cat-teal transition-colors cursor-pointer disabled:opacity-40"
            >
              加载 URL
            </button>
          </form>
          <p class="mt-2.5 text-[11px] text-cat-overlay1">
            也可以直接在网址后拼接参数分享给他人，例如：
            <code class="ml-1 rounded bg-cat-base px-1.5 py-0.5 font-mono text-cat-teal">
              ?file=./example.pdf&duration=15
            </code>
          </p>
        </div>

        <div class="rounded-2xl border border-cat-surface1 bg-cat-mantle/70 p-5 flex flex-col justify-between">
          <div>
            <h3 class="text-sm font-bold text-cat-text">✨ 快捷操作亮点</h3>
            <ul class="mt-2.5 space-y-1.5 text-xs text-cat-subtext0">
              <li>• <b>划词/分段复制</b>：画面直接划词、双击文字块或底部提词栏单行点击即复制</li>
              <li>• <b>双屏激光笔 & 黑屏</b>：按 <kbd class="font-mono text-cat-teal">L</kbd> 同步激光指示，按 <kbd class="font-mono text-cat-teal">B</kbd> 一键黑屏</li>
              <li>• <b>高清排练录像</b>：内置 1080p 画布 + 摄像头画中画 + 降噪麦克风录制复盘</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
