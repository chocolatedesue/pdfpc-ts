import { createSignal, onCleanup, createEffect, Show, For } from "solid-js";
import { cx } from "classix";

interface RecorderProps {
  globalCount: () => number;
  filePageCount: () => number;
  docImages: () => Array<string | undefined>;
}

export function Recorder(props: RecorderProps) {
  const [isRecording, setIsRecording] = createSignal(false);
  const [recordingSeconds, setRecordingSeconds] = createSignal(0);
  const [showSettings, setShowSettings] = createSignal(false);
  const [showReviewModal, setShowReviewModal] = createSignal(false);
  const [useCamera, setUseCamera] = createSignal(false);
  const [recordMode, setRecordMode] = createSignal<"slide" | "screen">("slide");
  const [quality, setQuality] = createSignal<"1080p" | "720p">("1080p");
  const [recordedVideoUrl, setRecordedVideoUrl] = createSignal<string | null>(null);
  const [lastDuration, setLastDuration] = createSignal(0);
  const [lastExt, setLastExt] = createSignal("webm");
  const [visitedSlides, setVisitedSlides] = createSignal<number[]>([]);
  const [playbackSpeed, setPlaybackSpeed] = createSignal(1);

  let mediaRecorder: MediaRecorder | null = null;
  let timerInterval: number | null = null;
  let heartbeatInterval: number | null = null;
  let animFrameId: number | null = null;
  let activeStreams: MediaStream[] = [];
  let videoPlayerRef: HTMLVideoElement | null = null;
  let cameraVideoEl: HTMLVideoElement | null = null;
  let currentBlobUrl: string | null = null;

  // Offscreen slide canvas (cached slide render, avoids downsampling 60fps)
  let offscreenCanvas: HTMLCanvasElement | null = null;
  let mainCanvas: HTMLCanvasElement | null = null;
  let mainCtx: CanvasRenderingContext2D | null = null;

  // Cached HTMLImageElements
  const imageCache = new Map<number, HTMLImageElement>();

  function getSlideImg(index: number): HTMLImageElement | null {
    const url = props.docImages()[index];
    if (!url) return null;
    let img = imageCache.get(index);
    if (!img || img.src !== url) {
      img = new Image();
      img.onload = () => {
        if (isRecording() && props.globalCount() === index) {
          renderSlideToOffscreen();
          blitMainCanvas();
        }
      };
      img.src = url;
      imageCache.set(index, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  function getResolution(): { width: number; height: number; bitrate: number } {
    if (quality() === "720p") {
      return { width: 1280, height: 720, bitrate: 1_200_000 }; // 1.2 Mbps
    }
    return { width: 1920, height: 1080, bitrate: 2_200_000 }; // 2.2 Mbps
  }

  function getMimeInfo(): { mime: string; ext: string } {
    const candidates = [
      { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
      { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
      { mime: "video/webm", ext: "webm" },
      { mime: "video/mp4;codecs=avc1,mp4a.40.2", ext: "mp4" },
      { mime: "video/mp4", ext: "mp4" },
    ];
    for (const c of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mime)) {
        return c;
      }
    }
    return { mime: "", ext: "webm" };
  }

  function formatTime(totalSecs: number): string {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  // Pre-render the current slide onto the offscreen canvas ONCE per slide transition
  function renderSlideToOffscreen() {
    if (!offscreenCanvas) return;
    const offCtx = offscreenCanvas.getContext("2d");
    if (!offCtx) return;

    const { width, height } = getResolution();
    offCtx.fillStyle = "#0F2744"; // DEEP navy ground
    offCtx.fillRect(0, 0, width, height);

    const currentIdx = props.globalCount();
    const img = getSlideImg(currentIdx);
    if (img) {
      const isDoubleWide = img.naturalWidth / img.naturalHeight > 2.5;
      const srcW = isDoubleWide ? img.naturalWidth / 2 : img.naturalWidth;
      const srcH = img.naturalHeight;
      offCtx.drawImage(img, 0, 0, srcW, srcH, 0, 0, width, height);
    }
  }

  // Draw camera PiP
  function drawCamera(ctx: CanvasRenderingContext2D, width: number, height: number) {
    if (!cameraVideoEl || cameraVideoEl.readyState < 2) return;

    const pipW = Math.round(width * 0.18); // ~345px on 1080p
    const pipH = Math.round(pipW * 0.65);
    const pipX = width - pipW - Math.round(width * 0.02);
    const pipY = height - pipH - Math.round(height * 0.03);
    const rad = 12;

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;

    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(pipX, pipY, pipW, pipH, rad);
    } else {
      ctx.rect(pipX, pipY, pipW, pipH);
    }
    ctx.fillStyle = "#000000";
    ctx.fill();
    ctx.clip();

    ctx.drawImage(cameraVideoEl, pipX, pipY, pipW, pipH);
    ctx.restore();

    // Subtle outline border
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(pipX, pipY, pipW, pipH, rad);
    } else {
      ctx.rect(pipX, pipY, pipW, pipH);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Update canvas: Fast GPU blit from offscreen canvas + camera PiP
  function blitMainCanvas() {
    if (!mainCanvas || !mainCtx || !offscreenCanvas) return;
    const { width, height } = getResolution();
    mainCtx.drawImage(offscreenCanvas, 0, 0, width, height);

    if (useCamera()) {
      drawCamera(mainCtx, width, height);
    }
  }

  // Track slide visits and trigger canvas redraw on slide change
  createEffect(
    () => ({ idx: props.globalCount(), recording: isRecording() }),
    ({ idx, recording }) => {
      if (recording) {
        setVisitedSlides((prev) => {
          if (!prev.includes(idx + 1)) {
            return [...prev, idx + 1].sort((a, b) => a - b);
          }
          return prev;
        });

        renderSlideToOffscreen();
        blitMainCanvas();
      }
    }
  );

  async function startRecording() {
    if (props.filePageCount() <= 0) {
      alert("请先加载演示文稿 PDF 文件");
      return;
    }

    try {
      activeStreams = [];
      const initialSlide = props.globalCount() + 1;
      setVisitedSlides([initialSlide]);

      const { width, height, bitrate } = getResolution();

      // Revoke any previous recording URL to free memory
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
      }

      let recordStream: MediaStream;

      if (recordMode() === "screen") {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30 } },
          audio: true,
        });
        activeStreams.push(displayStream);

        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1, // Mono audio saves memory and clarifies voice
            sampleRate: 48000,
          },
        });
        activeStreams.push(micStream);

        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const dest = audioCtx.createMediaStreamDestination();
        const micSource = audioCtx.createMediaStreamSource(micStream);
        micSource.connect(dest);

        if (displayStream.getAudioTracks().length > 0) {
          const sysSource = audioCtx.createMediaStreamSource(
            new MediaStream([displayStream.getAudioTracks()[0]])
          );
          sysSource.connect(dest);
        }

        recordStream = new MediaStream([
          displayStream.getVideoTracks()[0],
          dest.stream.getAudioTracks()[0],
        ]);

        displayStream.getVideoTracks()[0].onended = () => {
          stopRecording();
        };
      } else {
        // High-definition slide canvas mode
        offscreenCanvas = document.createElement("canvas");
        offscreenCanvas.width = width;
        offscreenCanvas.height = height;

        mainCanvas = document.createElement("canvas");
        mainCanvas.width = width;
        mainCanvas.height = height;
        mainCtx = mainCanvas.getContext("2d", { alpha: false, desynchronized: true });
        if (!mainCtx) throw new Error("无法初始化画布渲染上下文");

        // High quality microphone capture
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: 48000,
          },
        });
        activeStreams.push(micStream);

        // Optional Camera PiP
        cameraVideoEl = null;
        if (useCamera()) {
          try {
            const camStream = await navigator.mediaDevices.getUserMedia({
              video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
            });
            activeStreams.push(camStream);
            cameraVideoEl = document.createElement("video");
            cameraVideoEl.srcObject = camStream;
            cameraVideoEl.muted = true;
            cameraVideoEl.playsInline = true;
            await cameraVideoEl.play();
          } catch (camErr) {
            console.warn("摄像头启动失败，继续使用纯音频录制:", camErr);
          }
        }

        // 1. Initial draw BEFORE starting recorder (prevents first-frame sync lag)
        renderSlideToOffscreen();
        blitMainCanvas();

        // 2. Optimized rendering strategy:
        // If camera is ON: runs requestAnimationFrame to smoothly animate camera PiP at 30fps
        // If camera is OFF: relies on event-driven slide changes + 1fps heartbeat to avoid CPU burn
        if (useCamera()) {
          const animLoop = () => {
            blitMainCanvas();
            animFrameId = requestAnimationFrame(animLoop);
          };
          animFrameId = requestAnimationFrame(animLoop);
        } else {
          // Low overhead heartbeat (1 frame every 500ms) to ensure stream timestamps advance
          heartbeatInterval = window.setInterval(() => {
            blitMainCanvas();
          }, 500);
        }

        // FPS for canvas capture: 30 if camera is on, 20 if pure slides
        const targetFps = useCamera() ? 30 : 20;
        const canvasStream = mainCanvas.captureStream(targetFps);

        recordStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...micStream.getAudioTracks(),
        ]);
      }

      const mimeInfo = getMimeInfo();
      const recorderOptions: MediaRecorderOptions = {
        mimeType: mimeInfo.mime || undefined,
        videoBitsPerSecond: bitrate,
        audioBitsPerSecond: 128_000, // 128 kbps voice
      };

      const recorder = new MediaRecorder(recordStream, recorderOptions);
      mediaRecorder = recorder;
      let chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        if (animFrameId !== null) {
          cancelAnimationFrame(animFrameId);
          animFrameId = null;
        }
        if (heartbeatInterval !== null) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        if (timerInterval !== null) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
        for (const st of activeStreams) {
          st.getTracks().forEach((t) => t.stop());
        }
        activeStreams = [];

        // Build blob and clean up chunks
        const finalBlob = new Blob(chunks, { type: mimeInfo.mime || "video/webm" });
        chunks = []; // Release memory chunk array

        currentBlobUrl = URL.createObjectURL(finalBlob);
        setLastDuration(recordingSeconds());
        setLastExt(mimeInfo.ext);
        setRecordedVideoUrl(currentBlobUrl);
        setIsRecording(false);
        setShowReviewModal(true);
      };

      // 1-second timeslice periodically flushes buffers
      recorder.start(1000);
      setIsRecording(true);
      setRecordingSeconds(0);
      setShowSettings(false);

      timerInterval = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("启动录制失败:", err);
      alert(`无法启动录制: ${err instanceof Error ? err.message : String(err)}`);
      stopRecording();
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    } else {
      setIsRecording(false);
      if (timerInterval !== null) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      if (heartbeatInterval !== null) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      for (const st of activeStreams) {
        st.getTracks().forEach((t) => t.stop());
      }
      activeStreams = [];
    }
  }

  function downloadVideo() {
    const url = recordedVideoUrl();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = `${now.getHours().toString().padStart(2, "0")}${now.getMinutes().toString().padStart(2, "0")}${now.getSeconds().toString().padStart(2, "0")}`;
    a.download = `rehearsal-${dateStr}-${timeStr}.${lastExt()}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function setSpeed(rate: number) {
    setPlaybackSpeed(rate);
    if (videoPlayerRef) {
      videoPlayerRef.playbackRate = rate;
    }
  }

  onCleanup(() => {
    stopRecording();
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = null;
    }
  });

  return (
    <>
      {/* 1. Control Button and Settings Popover */}
      <div class="pointer-events-auto relative flex items-center gap-2">
        <button
          onClick={() => {
            if (isRecording()) {
              stopRecording();
            } else {
              void startRecording();
            }
          }}
          title={isRecording() ? "结束录制并复盘" : "开始排练录制"}
          class={cx(
            "grid h-8 w-8 cursor-pointer place-items-center rounded-full outline transition-all",
            isRecording()
              ? "animate-pulse bg-cat-red text-white outline-cat-red hover:bg-cat-red/90"
              : "bg-cat-surface0/50 text-cat-subtext0/50 outline-cat-subtext0/50 hover:bg-cat-surface0/80 hover:text-cat-subtext0 hover:outline-cat-subtext0 dark:bg-cat-surface0/70"
          )}
        >
          <span
            class={cx(
              isRecording()
                ? "icon-[fluent--square-16-filled] text-base"
                : "icon-[mdi--record-circle-outline] text-xl"
            )}
          />
        </button>

        {/* Settings gear toggle */}
        <button
          onClick={() => setShowSettings((prev) => !prev)}
          title="排练录制设置"
          class={cx(
            "grid h-8 w-8 cursor-pointer place-items-center rounded-full outline transition-all",
            showSettings()
              ? "bg-cat-subtext0/50 text-cat-surface0/70 outline-cat-subtext0/50 hover:bg-cat-subtext0/80 hover:text-cat-surface0 hover:outline-cat-subtext0"
              : "bg-cat-surface0/50 text-cat-subtext0/50 outline-cat-subtext0/50 hover:bg-cat-surface0/80 hover:text-cat-subtext0 hover:outline-cat-subtext0 dark:bg-cat-surface0/70"
          )}
        >
          <span class="icon-[fluent--settings-24-regular] text-lg" />
        </button>

        {/* Review last recording button if available */}
        <Show when={recordedVideoUrl() && !isRecording()}>
          <button
            onClick={() => setShowReviewModal(true)}
            title="查看最近一次排练录像"
            class="grid h-8 w-8 cursor-pointer place-items-center rounded-full bg-cat-surface0/50 text-cat-subtext0/50 outline outline-cat-subtext0/50 transition-all hover:bg-cat-surface0/80 hover:text-cat-subtext0 hover:outline-cat-subtext0 dark:bg-cat-surface0/70"
          >
            <span class="icon-[fluent--play-circle-24-regular] text-xl text-cat-teal" />
          </button>
        </Show>

        {/* Settings dropdown card */}
        <Show when={showSettings()}>
          <div class="absolute bottom-12 left-0 z-50 w-72 rounded-xl border border-cat-surface1 bg-cat-mantle p-4 text-cat-text shadow-2xl backdrop-blur-md">
            <div class="mb-3 flex items-center justify-between border-b border-cat-surface0 pb-2">
              <span class="text-sm font-bold">🎬 排练录制配置</span>
              <button
                onClick={() => setShowSettings(false)}
                class="cursor-pointer text-xs text-cat-subtext0 hover:text-cat-text"
              >
                ✕
              </button>
            </div>

            <div class="space-y-3 text-xs">
              {/* Mode Selection */}
              <div>
                <label class="mb-1 block text-cat-subtext0 font-medium">录制源</label>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setRecordMode("slide")}
                    class={cx(
                      "cursor-pointer rounded-lg border px-2 py-1.5 text-center font-medium transition-all",
                      recordMode() === "slide"
                        ? "border-cat-teal bg-cat-teal/20 text-cat-teal"
                        : "border-cat-surface1 bg-cat-surface0/50 text-cat-subtext0 hover:border-cat-surface2"
                    )}
                  >
                    📽️ 纯净幻灯片
                  </button>
                  <button
                    onClick={() => setRecordMode("screen")}
                    class={cx(
                      "cursor-pointer rounded-lg border px-2 py-1.5 text-center font-medium transition-all",
                      recordMode() === "screen"
                        ? "border-cat-teal bg-cat-teal/20 text-cat-teal"
                        : "border-cat-surface1 bg-cat-surface0/50 text-cat-subtext0 hover:border-cat-surface2"
                    )}
                  >
                    🖥️ 屏幕录制
                  </button>
                </div>
                <p class="mt-1 text-[10px] text-cat-overlay1">
                  {recordMode() === "slide"
                    ? "以纯净画布录制幻灯片，无弹窗与杂边干扰"
                    : "捕获外接屏幕或独立投影窗口，包含鼠标轨迹"}
                </p>
              </div>

              {/* Quality Selection */}
              <Show when={recordMode() === "slide"}>
                <div>
                  <label class="mb-1 block text-cat-subtext0 font-medium">清晰度 / 性能</label>
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setQuality("1080p")}
                      class={cx(
                        "cursor-pointer rounded-lg border px-2 py-1 text-center font-medium transition-all",
                        quality() === "1080p"
                          ? "border-cat-teal bg-cat-teal/20 text-cat-teal"
                          : "border-cat-surface1 bg-cat-surface0/50 text-cat-subtext0 hover:border-cat-surface2"
                      )}
                    >
                      1080p (高清)
                    </button>
                    <button
                      onClick={() => setQuality("720p")}
                      class={cx(
                        "cursor-pointer rounded-lg border px-2 py-1 text-center font-medium transition-all",
                        quality() === "720p"
                          ? "border-cat-teal bg-cat-teal/20 text-cat-teal"
                          : "border-cat-surface1 bg-cat-surface0/50 text-cat-subtext0 hover:border-cat-surface2"
                      )}
                    >
                      720p (轻量)
                    </button>
                  </div>
                </div>
              </Show>

              {/* Camera Option */}
              <Show when={recordMode() === "slide"}>
                <div class="flex items-center justify-between pt-1">
                  <div>
                    <span class="font-medium">📷 摄像头画中画</span>
                    <p class="text-[10px] text-cat-overlay1">在右下角嵌入人像便于观察肢体语言</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={useCamera()}
                    onChange={(e) => setUseCamera(e.currentTarget.checked)}
                    class="h-4 w-4 cursor-pointer accent-cat-teal"
                  />
                </div>
              </Show>

              {/* Mic note */}
              <div class="flex items-center justify-between border-t border-cat-surface0 pt-2 text-cat-subtext0">
                <span>🎙️ 麦克风口播</span>
                <span class="text-cat-teal font-medium">单声道降噪</span>
              </div>

              {/* Start Button */}
              <button
                onClick={() => void startRecording()}
                disabled={isRecording()}
                class="mt-2 w-full cursor-pointer rounded-lg bg-cat-teal py-2 text-center font-bold text-cat-base shadow transition-all hover:bg-cat-teal/90 disabled:opacity-50"
              >
                {isRecording() ? "正在录制中..." : "🔴 开始排练录制"}
              </button>
            </div>
          </div>
        </Show>
      </div>

      {/* 2. Floating Live Recording Badge (Top Center) */}
      <Show when={isRecording()}>
        <div class="fixed top-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-cat-red/40 bg-cat-mantle/95 px-4 py-1.5 text-xs text-cat-text shadow-2xl backdrop-blur-md">
          <span class="flex h-2.5 w-2.5 relative">
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-cat-red opacity-75"></span>
            <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-cat-red"></span>
          </span>
          <span class="font-mono font-bold text-cat-red">REC {formatTime(recordingSeconds())}</span>
          <span class="text-cat-overlay1">|</span>
          <span class="text-cat-subtext0">第 {props.globalCount() + 1} 页</span>
          <button
            onClick={stopRecording}
            class="ml-1 cursor-pointer rounded-full bg-cat-red px-2.5 py-0.5 font-bold text-white transition-all hover:bg-cat-red/90"
          >
            ⏹ 结束并复盘
          </button>
        </div>
      </Show>

      {/* 3. Rehearsal Review & Playback Modal */}
      <Show when={showReviewModal() && recordedVideoUrl()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm">
          <div class="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-cat-surface1 bg-cat-mantle p-6 text-cat-text shadow-2xl">
            {/* Header */}
            <div class="mb-4 flex items-center justify-between border-b border-cat-surface0 pb-3">
              <div>
                <h2 class="text-lg font-bold flex items-center gap-2">
                  <span class="icon-[fluent--video-clip-24-filled] text-cat-teal text-xl" />
                  排练录像复盘 (Rehearsal Review)
                </h2>
                <p class="text-xs text-cat-subtext0 mt-0.5">
                  时长: <span class="font-mono text-cat-teal font-bold">{formatTime(lastDuration())}</span> ·
                  演练页数: <span class="font-mono text-cat-teal font-bold">{visitedSlides().length} 页</span> (
                  {visitedSlides().join(", ")})
                </p>
              </div>
              <button
                onClick={() => setShowReviewModal(false)}
                class="grid h-8 w-8 cursor-pointer place-items-center rounded-full bg-cat-surface0 text-cat-subtext0 transition-all hover:bg-cat-surface1 hover:text-cat-text"
              >
                ✕
              </button>
            </div>

            {/* Video Player */}
            <div class="relative flex-1 overflow-hidden rounded-xl bg-black shadow-inner flex items-center justify-center">
              <video
                ref={(el) => (videoPlayerRef = el)}
                src={recordedVideoUrl()!}
                controls
                autoplay
                playsinline
                class="max-h-[58vh] w-full aspect-video object-contain"
              />
            </div>

            {/* Controls and Footer Actions */}
            <div class="mt-4 flex flex-wrap items-center justify-between gap-3 pt-2">
              {/* Playback speed options */}
              <div class="flex items-center gap-1.5 text-xs text-cat-subtext0">
                <span class="mr-1">播放倍速:</span>
                <For each={[0.75, 1.0, 1.25, 1.5, 2.0]}>
                  {(rate) => (
                    <button
                      onClick={() => setSpeed(rate)}
                      class={cx(
                        "cursor-pointer rounded px-2 py-0.5 font-mono text-xs font-semibold transition-all",
                        playbackSpeed() === rate
                          ? "bg-cat-teal text-cat-base"
                          : "bg-cat-surface0 hover:bg-cat-surface1 text-cat-text"
                      )}
                    >
                      {rate}x
                    </button>
                  )}
                </For>
              </div>

              {/* Action Buttons */}
              <div class="flex items-center gap-3">
                <button
                  onClick={downloadVideo}
                  class="flex cursor-pointer items-center gap-1.5 rounded-lg bg-cat-teal px-4 py-2 text-xs font-bold text-cat-base shadow transition-all hover:bg-cat-teal/90"
                >
                  <span class="icon-[fluent--arrow-download-24-filled] text-sm" />
                  下载录像 (. {lastExt()})
                </button>
                <button
                  onClick={() => {
                    setShowReviewModal(false);
                    void startRecording();
                  }}
                  class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-cat-surface1 bg-cat-surface0 px-3 py-2 text-xs font-medium text-cat-text transition-all hover:bg-cat-surface1"
                >
                  <span class="icon-[fluent--arrow-clockwise-24-filled] text-sm text-cat-teal" />
                  重新排练
                </button>
                <button
                  onClick={() => setShowReviewModal(false)}
                  class="cursor-pointer rounded-lg border border-cat-surface1 bg-transparent px-3 py-2 text-xs font-medium text-cat-subtext0 transition-all hover:bg-cat-surface0 hover:text-cat-text"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </>
  );
}
