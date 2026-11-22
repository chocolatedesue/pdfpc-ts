# pdfpc-ts (acam-infra Enhanced Edition)

在浏览器与命令行（Bun / Node.js CLI）中实现高性能带演讲者视图的 PDF 幻灯片放映、讲稿提词复制与排练录制工作台，类似 [Pympress](https://github.com/Cimbali/pympress) 和 [pdfpc](https://pdfpc.github.io/)，但基于 WebAssembly (`@hyzyla/pdfium` + Rust `bitmap_to_png`)、Solid 2.0 多窗口响应式同步与零延迟纯前端架构，开箱即用。

## 🌐 在线直接使用（GitHub Pages 免安装版）

别人无需安装任何环境，直接在浏览器打开以下任一 GitHub Pages 地址即可上传本地 PDF 或通过 URL 参数直接放映（所有 PDF 解析均在浏览器本地 WebAssembly 内存中完成，文件绝不上传服务器）：

- **`acam-infra` 组织版在线工作台**：[**https://acam-infra.github.io/pdfpc-ts/**](https://acam-infra.github.io/pdfpc-ts/)
  - 体验 **32:9 双屏带讲稿全功能示例**（8 页中英双语 + 架构图/公式/基准表/提词稿）：[`https://acam-infra.github.io/pdfpc-ts/?file=./example.pdf&mode=notes-right&duration=15`](https://acam-infra.github.io/pdfpc-ts/?file=./example.pdf&mode=notes-right&duration=15)
  - 体验 **16:9 标准单屏学术汇报示例**：[`https://acam-infra.github.io/pdfpc-ts/?file=./example-16x9.pdf&mode=no-notes&duration=15`](https://acam-infra.github.io/pdfpc-ts/?file=./example-16x9.pdf&mode=no-notes&duration=15)
- **`chocolatedesue` 个人版在线工作台**：[**https://chocolatedesue.github.io/pdfpc-ts/**](https://chocolatedesue.github.io/pdfpc-ts/)
  - 体验 **32:9 双屏带讲稿全功能示例**：[`https://chocolatedesue.github.io/pdfpc-ts/?file=./example.pdf&mode=notes-right&duration=15`](https://chocolatedesue.github.io/pdfpc-ts/?file=./example.pdf&mode=notes-right&duration=15)
  - 体验 **16:9 标准单屏学术汇报示例**：[`https://chocolatedesue.github.io/pdfpc-ts/?file=./example-16x9.pdf&mode=no-notes&duration=15`](https://chocolatedesue.github.io/pdfpc-ts/?file=./example-16x9.pdf&mode=no-notes&duration=15)

> **源码仓库**：[`acam-infra/pdfpc-ts`](https://github.com/acam-infra/pdfpc-ts)（同步镜像：[`chocolatedesue/pdfpc-ts`](https://github.com/chocolatedesue/pdfpc-ts)，上游：[`Master-Hash/pdfpc-ts`](https://github.com/Master-Hash/pdfpc-ts)）

## 核心特性与 UI / 复制交互体验

1. **多维度丝滑复制与底部可交互提词器 (`Teleprompter & Smart Copy`)**：
   - **底部可折叠提词与分段复制抽屉 (`T`)**：自动按阅读顺序（自上而下、从左到右）将每页 PDF 文本聚合成清晰易读的段落列表，支持切换「**右侧演讲备注 (`Notes`)**」、「**左侧幻灯片正稿 (`Slide`)**」与「**全页合并文本**」三栏，支持 `A-` / `A+` 自由调节提词字号，**鼠标单击任意一行段落即可直接复制该段**。
   - **画面直接划词浮窗 & 双击词块复制**：在幻灯片或备注画面上直接用鼠标拖选任意文字，顶部自动弹出「**一键复制选中**」胶囊浮窗；双击画面上的任意文字块即可秒复制该句。
   - **顶部与底栏全方位复制导出**：支持**复制本页 (`C`)**、**复制全篇所有页讲稿**、**一键导出整份 PDF 全量讲稿为结构化 Markdown (`M`)**，以及在 `Tab` 概览网格下悬停任意缩略图直接复制该页文本。
2. **现代化工作台首页 (`Studio Landing Page`)**：
   - 直观的 **16:9 标准单屏** 与 **32:9 左右分屏备注（Touying / Pympress）** 可视化示意拖拽卡片。
   - 内置 **远程 PDF URL 加载器**（支持任意开启 CORS 的 PDF 直链）与「**一键体验 Touying 示例 PDF**」按钮。
3. **16:9 标准与 32:9 双屏备注自适应/一键切换 (`N`)**：
   - 自动根据首帧宽高比（`> 2.5`）识别 Typst + Touying 生成的 32:9 左右分屏带讲稿 PDF（左半屏正稿投影给观众，右半屏提示展示给演讲者），放映中按 `N` 键或顶部按钮可随时切换。
4. **现场演讲控场增强（黑屏、双屏同步激光笔、跳页、目标时长倒计时）**：
   - **黑屏控场 (`B` / `.`)**：一键将观众投影窗口切为纯黑屏，演讲者主控台保持半透明预览提示。
   - **双屏同步激光笔 (`L`)**：在演讲者主控台移动鼠标，观众投影窗口实时同步高亮红色激光指示点。
   - **快速跳页与倒计时 (`G` / `P` / `R`)**：按 `G` 输入目标页码或设定目标演讲时长（分钟），超时或剩余不足 2 分钟时自动变色闪烁提醒；按 `P` 暂停/继续计时，按 `R` 重置计时。
5. **内置高清排练录制与复盘 (`Recorder`)**：
   - 支持 **1080p/720p 纯净幻灯片画布录制**（事件驱动离屏缓存 + 摄像头右下角圆角画中画 PiP + 48kHz 单声道降噪麦克风）与 **屏幕捕获录制**，结束录制后立即弹出复盘播放器（支持 `0.75x ~ 2.0x` 倍速与 `.webm`/`.mp4` 下载）。
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
pnpm run build:all
./bin/pdfpc --watch presentation.pdf
```

## 键盘快捷键

| 快捷键 | 功能说明 |
| :--- | :--- |
| `→` / `Space` / `PageDown` / `J` | 下一页（首次翻页自动启动计时器） |
| `←` / `PageUp` / `K` | 上一页 |
| `Home` / `End` | 跳转到第一页 / 最后一页 |
| `G` | 弹出页码跳转与目标演讲时长（倒计时）设置框 |
| `Tab` | 在「概览网格模式」与「演讲者视图」之间无缝切换 |
| `N` | 实时切换 `16:9 标准模式` 与 `32:9 右侧备注模式` |
| `T` | 展开 / 收起底部可交互文本提词与分段复制抽屉 |
| `C` / `Ctrl+C` | 复制当前划词选中文本；若未选中则一键复制当前页讲稿/文本 |
| `M` | 一键导出整份 PDF 所有页面的讲稿为 Markdown 文件 |
| `B` / `.` | 观众投影窗口黑屏开关（Blackout） |
| `L` | 开启/关闭双屏同步红色激光笔指示（Laser Pointer） |
| `P` / `R` | 暂停/继续计时器 (`P`) · 重置计时器 (`R`) |
| `F` | 切换全屏显示 |
| `?` / `H` | 打开/关闭快捷键帮助面板 |
| `Escape` | 依次取消文本选中、关闭弹窗、退出黑屏或关闭观众投影窗口 |
