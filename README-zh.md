# pdfpc-ts (acam-infra Enhanced Edition)

在浏览器与命令行（Bun / Node.js CLI）中实现高性能带演讲者视图的 PDF 幻灯片放映与排练录制工具，类似 [Pympress](https://github.com/Cimbali/pympress) 和 [pdfpc](https://pdfpc.github.io/)，但基于 WebAssembly (`@hyzyla/pdfium` + Rust `bitmap_to_png`)、Solid 2.0 多窗口响应式同步与零延迟本地离线架构，具备更佳的翻页流畅度、开发热重载体验与远程无头服务能力。

> **仓库地址**：[`acam-infra/pdfpc-ts`](https://github.com/acam-infra/pdfpc-ts)（Fork 自 [`chocolatedesue/pdfpc-ts`](https://github.com/chocolatedesue/pdfpc-ts)，上游 [`Master-Hash/pdfpc-ts`](https://github.com/Master-Hash/pdfpc-ts)）

## 核心特性与工程增强

1. **16:9 标准与 32:9 双屏备注自适应/一键切换**：
   - 自动根据首帧宽高比（`> 2.5`）识别 Typst + Touying 生成的 32:9 左右分屏带讲稿 PDF（左半屏正稿投影给观众，右半屏提示展示给演讲者）。
   - 支持通过 CLI `--mode no-notes | notes-right | auto` 或放映过程中按 `N` 键随时切换。
2. **首屏优先渲染与大体积 PDF 内存零泄漏**：
   - 打开或跳转至任意页码（`--page <N>`）时，优先渲染当前页与下一页以实现毫秒级起播，后台渐进渲染其余页面。
   - 重载 PDF 时自动销毁旧 `PDFiumDocument` 实例并回收全部 `Blob URL`（`URL.revokeObjectURL`），支持超过 100 页的超长学术汇报平稳运行。
3. **PDFium 透明文本选择层与一键复制/导出讲稿**：
   - 基于 PDFium `_FPDFText_*` 原生接口提取每页文本与坐标框，支持在幻灯片或右侧备注区直接鼠标划词复制。
   - 按 `C` 键一键复制当前页讲稿/文本；按 `M` 键一键将整份 PDF 的所有页面讲稿导出为结构化 Markdown（`<deck>-notes.md`）。
4. **现场演讲控场增强（黑屏、双屏同步激光笔、跳页、目标时长倒计时）**：
   - **黑屏控场 (`B` / `.`)**：一键将观众投影窗口切为纯黑屏，演讲者主控台保持半透明预览提示。
   - **双屏同步激光笔 (`L`)**：在演讲者主控台移动鼠标，观众投影窗口实时同步高亮红色激光指示点。
   - **快速跳页与倒计时 (`G` / `P` / `R`)**：按 `G` 输入目标页码或设定目标演讲时长（分钟），超时或剩余不足 2 分钟时自动变色闪烁提醒；按 `P` 暂停/继续计时，按 `R` 重置计时。
   - **快捷键速查面板 (`?` / `H`)**：随时呼出完整键盘操作指南。
5. **内置高清排练录制与复盘 (`Recorder`)**：
   - 支持 **1080p/720p 纯净幻灯片画布录制**（事件驱动离屏缓存 + 摄像头右下角圆角画中画 PiP + 48kHz 单声道降噪麦克风）与 **屏幕捕获录制**。
   - 结束录制后立即弹出复盘播放器，支持 `0.75x ~ 2.0x` 倍速回放、统计已演练页码并一键下载 `.webm` / `.mp4` 录像。
6. **Bun CLI 启动器、Typst 实时监听热重载 (`--watch`) 与 Next Terminal / Tailscale 远程开发支持**：
   - **本地单文件启动**：`pdfpc deck.pdf` 自动拉起本地静态服务与独立 Chrome App 演讲者窗口。
   - **实时监听热重载 (`-w` / `--watch`)**：配合 `typst watch` 编写幻灯片时，PDF 每次重编译完成后浏览器通过 SSE (`/__pdfpc_events`) 自动无感热重载并保持当前所在页码。
   - **Next Terminal / Tailscale 远程无头服务 (`--tailscale` / `--headless`)**：在无 GUI 的远程 Linux 服务器（如 Next Terminal 纳管节点 `qzlab`）上自动进入无头常驻模式，监听 `0.0.0.0` 并直接输出 Tailscale (`100.x.y.z`) 与局域网访问链接。

## 命令行 CLI 用法

```bash
# 1. 本地直接打开 PDF 放映（自动检测 16:9 或 32:9 备注模式）
bun run cli.ts presentation.pdf

# 2. 配合 Typst 编写幻灯片：开启 --watch 实时热重载，指定 15 分钟倒计时并从第 3 页开始
bun run cli.ts --watch --duration 15 --page 3 NetLoom-APSys26-talk-notes.pdf

# 3. 在 Next Terminal 远程节点 (如 qzlab) 上启动 Tailscale 远程预览与热重载服务
bun run cli.ts --tailscale --watch --port 8765 presentation.pdf

# 4. 编译跨平台独立可执行二进制文件（配合 dist/ 离线运行）
pnpm run build && pnpm run build:cli
./bin/pdfpc --watch presentation.pdf
```

### CLI 参数一览

| 参数 | 说明 |
| :--- | :--- |
| `-m, --mode <mode>` | 布局模式：`auto`（默认自动检测宽高比）、`no-notes` (16:9) 或 `notes-right` (32:9) |
| `--notes` / `--no-notes` | `--mode notes-right` / `--mode no-notes` 的快捷开关 |
| `-w, --watch` | 监听 PDF 文件变化（如 Typst 重编译），通过 SSE 自动热重载并保留当前页码 |
| `-P, --page <number>` | 指定初始打开的页码（从 1 开始，默认 `1`） |
| `-d, --duration <mins>` | 设定目标演讲时长（分钟），用于顶部状态栏倒计时提醒 |
| `-p, --port <number>` | 指定 HTTP 监听端口（默认自动分配空闲端口，`--tailscale` 下默认 `8765`） |
| `-H, --host <address>` | 指定监听地址（默认 `127.0.0.1`） |
| `--tailscale`, `--lan` | 绑定 `0.0.0.0` 并自动打印 Tailscale (`100.x.y.z`) 与 LAN 访问地址 |
| `--no-open`, `--headless` | 仅启动 HTTP/SSE 服务，不拉起本地 Chrome 窗口（无 `DISPLAY` 的 Linux 节点自动启用） |
| `-f, --fullscreen` | 启动 Chrome 时直接进入全屏模式 |
| `--no-app` | 使用普通浏览器标签页打开，而非 Chrome 独立 `--app` 窗口 |
| `--chrome <path>` | 手动指定 Chrome / Chromium / Edge 可执行文件路径 |
| `--remote` / `--local` | 强制使用云端前端（`https://pdfpc.l3j.pw`）或本地 `dist/` 离线资源 |

## 键盘快捷键

| 快捷键 | 功能说明 |
| :--- | :--- |
| `→` / `Space` / `PageDown` / `J` | 下一页（首次翻页自动启动计时器） |
| `←` / `PageUp` / `K` | 上一页 |
| `Home` / `End` | 跳转到第一页 / 最后一页 |
| `G` | 弹出页码跳转与目标演讲时长（倒计时）设置框 |
| `Tab` | 在「概览网格模式」与「演讲者视图」之间无缝切换 |
| `N` | 实时切换 `16:9 标准模式` 与 `32:9 右侧备注模式` |
| `B` / `.` | 观众投影窗口黑屏开关（Blackout） |
| `L` | 开启/关闭双屏同步红色激光笔指示（Laser Pointer） |
| `P` / `R` | 暂停/继续计时器 (`P`) · 重置计时器 (`R`) |
| `C` | 一键复制当前页讲稿/文本到剪贴板 |
| `M` | 一键导出整份 PDF 所有页面的讲稿为 Markdown 文件 |
| `F` | 切换全屏显示 |
| `?` / `H` | 打开/关闭快捷键帮助面板 |
| `Escape` | 依次关闭弹窗、退出黑屏或关闭观众投影窗口 |

## Next Terminal 远程节点开发与维护指南

项目已在 Next Terminal 纳管主力开发节点 `qzlab` (`100.99.0.3`, 用户 `ccds`) 配置就绪：

- **工作目录**：`/home/ccds/src/pdfpc-ts-acam`
- **Git 远端**：
  - `origin` → `https://github.com/acam-infra/pdfpc-ts.git`
  - `chocolatedesue` → `https://github.com/chocolatedesue/pdfpc-ts.git`
  - `upstream` → `https://github.com/Master-Hash/pdfpc-ts.git`
- **常用开发命令**：
  ```bash
  cd ~/src/pdfpc-ts-acam
  pnpm run dev                 # 启动 Vite 开发服务器
  pnpm run build               # 构建生产级前端静态包 dist/
  pnpm run build:cli           # 使用 Bun 编译独立 CLI 二进制至 bin/pdfpc
  ./bin/pdfpc --tailscale -w public/example.pdf
  ```
