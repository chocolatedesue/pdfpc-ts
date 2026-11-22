// pdfpc-ts Interactive Product & Academic Showcase Deck
// Compile 32:9 Dual-Screen (Speaker Notes on Right):
//   typst compile --input mode=notes public/example.typ public/example.pdf
// Compile 16:9 Standard (Single Screen):
//   typst compile --input mode=standard public/example.typ public/example-16x9.pdf

#let mode = sys.inputs.at("mode", default: "notes")
#let is-dual = mode == "notes"

#let slide-w = 16cm
#let slide-h = 9cm
#let page-w = if is-dual { 32cm } else { 16cm }

// Color Palette (Editorial Academic Navy + Teal + Amber)
#let c-navy = rgb("#0f172a")
#let c-navy-mid = rgb("#1e293b")
#let c-teal = rgb("#0d9488")
#let c-teal-light = rgb("#ccfbf1")
#let c-teal-bg = rgb("#f0fdfa")
#let c-blue = rgb("#2563eb")
#let c-blue-bg = rgb("#eff6ff")
#let c-amber = rgb("#d97706")
#let c-amber-bg = rgb("#fffbeb")
#let c-purple = rgb("#7c3aed")
#let c-purple-bg = rgb("#f5f3ff")
#let c-bg = rgb("#f8fafc")
#let c-card = rgb("#ffffff")
#let c-border = rgb("#cbd5e1")
#let c-text = rgb("#0f172a")
#let c-muted = rgb("#475569")

// Right-half Teleprompter Dark/Slate Palette
#let c-note-bg = rgb("#111827")
#let c-note-header = rgb("#1f2937")
#let c-note-card = rgb("#1e293b")
#let c-note-border = rgb("#334155")
#let c-note-text = rgb("#f1f5f9")
#let c-note-muted = rgb("#94a3b8")
#let c-note-accent = rgb("#2dd4bf")

#set page(
  width: page-w,
  height: slide-h,
  margin: 0pt,
  fill: c-bg,
)

#set text(
  font: ("Noto Sans CJK SC", "Inter", "DejaVu Sans"),
  size: 10pt,
  fill: c-text,
  lang: "zh",
)

#set par(leading: 0.48em)

#let total-slides = 8

#let pill(label, bg: c-teal-light, fg: c-teal) = box(
  fill: bg,
  inset: (x: 5.5pt, y: 2pt),
  radius: 4pt,
  text(size: 7.5pt, weight: "bold", fill: fg, label),
)

#let kpi-card(title, val, sub, accent: c-teal) = rect(
  width: 100%,
  fill: c-card,
  stroke: (left: 3pt + accent, rest: 0.6pt + c-border),
  radius: 5pt,
  inset: (x: 6.5pt, y: 3.5pt),
)[
  #text(size: 7.2pt, weight: "bold", fill: c-muted, title)
  #v(1pt)
  #text(size: 11.5pt, weight: "bold", fill: accent, val)
  #v(1pt)
  #text(size: 6.8pt, fill: c-muted, sub)
]

#let render-slide(
  idx: 1,
  section: "",
  title: "",
  pacing: "01:30",
  slide-body,
  note-title: "",
  note-lines: (),
  note-tip: "",
) = {
  let left-panel = box(
    width: slide-w,
    height: slide-h,
    fill: c-bg,
  )[
    // Top Header Bar
    #rect(
      width: 100%,
      height: 1.15cm,
      fill: c-navy,
      inset: (x: 0.65cm, y: 0.16cm),
    )[
      #align(horizon)[
        #grid(
          columns: (1fr, auto),
          column-gutter: 8pt,
          [
            #text(size: 6.8pt, weight: "bold", fill: rgb("#2dd4bf"), tracking: 0.5pt, upper(section))
            #v(2pt)
            #text(size: 11.2pt, weight: "bold", fill: white, title)
          ],
          align(right + horizon)[
            #box(
              fill: rgb("#1e293b"),
              stroke: 0.5pt + rgb("#334155"),
              radius: 4pt,
              inset: (x: 6pt, y: 3pt),
              text(size: 7pt, font: "Noto Sans Mono CJK SC", fill: rgb("#94a3b8"))[
                pdfpc-ts · #if is-dual [32:9 Dual] else [16:9 Std]
              ],
            )
          ],
        )
      ]
    ]

    // Main Content Area
    #box(
      width: 100%,
      height: slide-h - 1.15cm - 0.52cm,
      inset: (x: 0.65cm, y: 0.2cm),
      slide-body,
    )

    // Bottom Footer & Progress Bar
    #place(bottom + left)[
      #rect(
        width: 100%,
        height: 0.52cm,
        fill: rgb("#e2e8f0"),
        inset: (x: 0.65cm, y: 0cm),
      )[
        #align(horizon)[
          #grid(
            columns: (1fr, auto, auto),
            column-gutter: 10pt,
            text(size: 7pt, fill: c-muted)[
              *acam-infra / pdfpc-ts* · Browser WebAssembly PDF Presenter & Rehearsal Studio
            ],
            text(size: 7pt, font: "Noto Sans Mono CJK SC", fill: c-teal, weight: "bold")[
              Target: #pacing
            ],
            text(size: 7.5pt, font: "Noto Sans Mono CJK SC", weight: "bold", fill: c-navy)[
              #idx / #total-slides
            ],
          )
        ]
      ]
      #place(bottom + left)[
        #rect(
          width: slide-w * (idx / total-slides),
          height: 2pt,
          fill: c-teal,
        )
      ]
    ]
  ]

  if is-dual {
    let right-panel = box(
      width: slide-w,
      height: slide-h,
      fill: c-note-bg,
    )[
      // Right Note Top Header
      #rect(
        width: 100%,
        height: 1.15cm,
        fill: c-note-header,
        stroke: (bottom: 1pt + c-note-border),
        inset: (x: 0.65cm, y: 0.16cm),
      )[
        #align(horizon)[
          #grid(
            columns: (1fr, auto),
            column-gutter: 8pt,
            [
              #text(size: 6.8pt, weight: "bold", fill: c-note-accent)[
                SPEAKER NOTES & TELEPROMPTER · 演讲者提词稿（仅主控台可见）
              ]
              #v(2pt)
              #text(size: 10.5pt, weight: "bold", fill: c-note-text, note-title)
            ],
            align(right + horizon)[
              #box(
                fill: rgb("#0f766e"),
                radius: 4pt,
                inset: (x: 6.5pt, y: 2.5pt),
                text(size: 7.5pt, weight: "bold", fill: white)[
                  Page #idx · 建议 #pacing
                ],
              )
            ],
          )
        ]
      ]

      // Right Note Body Paragraphs
      #box(
        width: 100%,
        height: slide-h - 1.15cm - 0.52cm,
        inset: (x: 0.65cm, y: 0.28cm),
      )[
        #stack(
          dir: ttb,
          spacing: 5pt,
          ..note-lines.enumerate().map(((i, line)) => rect(
            width: 100%,
            fill: c-note-card,
            stroke: (left: 2.5pt + c-note-accent, rest: 0.5pt + c-note-border),
            radius: 4pt,
            inset: (x: 8pt, y: 5pt),
          )[
            #text(size: 8.4pt, fill: c-note-text)[
              #text(weight: "bold", fill: c-note-accent)[[#(i + 1)]] #h(3pt) #line
            ]
          ]),
        )
        #if note-tip != "" [
          #v(5pt)
          #rect(
            width: 100%,
            fill: rgb("#1e1b4b"),
            stroke: 0.6pt + rgb("#4338ca"),
            radius: 4pt,
            inset: (x: 8pt, y: 4.5pt),
          )[
            #text(size: 7.6pt, fill: rgb("#c7d2fe"))[
              *💡 交互验证提示*：#note-tip
            ]
          ]
        ]
      ]

      // Right Note Bottom Bar
      #place(bottom + left)[
        #rect(
          width: 100%,
          height: 0.52cm,
          fill: c-note-header,
          inset: (x: 0.65cm, y: 0cm),
        )[
          #align(horizon)[
            #grid(
              columns: (1fr, auto),
              text(size: 7pt, fill: c-note-muted)[
                按 *C* 一键复制本页讲稿 · 按 *T* 在底部提词栏单击任意段落复制 · 按 *M* 导出全篇 Markdown
              ],
              text(size: 7pt, font: "Noto Sans Mono CJK SC", fill: c-note-accent)[
                NOTES PANE · #idx / #total-slides
              ],
            )
          ]
        ]
      ]
    ]

    grid(columns: (slide-w, slide-w), left-panel, right-panel)
  } else {
    left-panel
  }
  if idx < total-slides {
    pagebreak()
  }
}

// =========================================================================
// SLIDE 1: Hero Cover & Interactive Feature Tour
// =========================================================================
#render-slide(
  idx: 1,
  section: "01 · OVERVIEW & ARCHITECTURE",
  title: "pdfpc-ts：浏览器端高性能双屏演讲与排练工作台",
  pacing: "01:30",
  note-title: "开场白与项目核心价值定位（可直接点击下方提词栏复制）",
  note-lines: (
    "大家好！欢迎体验 pdfpc-ts 互动演示示例。这是一套完全运行在现代浏览器中的高性能 PDF 演讲者视图与排练录制工作台。",
    "痛点背景：传统桌面端 pdfpc 依赖 GTK3 在高分屏下翻页容易卡顿，而 Pympress 在跨平台安装和录屏复盘上不够轻便。",
    "核心突破：我们将 Google PDFium (C++) 与 Rust SIMD 图像编码编译为 WebAssembly，放入独立 Web Worker 中运行，实现零卡顿秒开与毫秒级翻页。",
    "隐私与安全：所有 PDF 解析、文本坐标提取与 1080p 排练录像均在本地浏览器内存中完成，文件绝不上传任何远程服务器。",
  ),
  note-tip: "试着在左侧或右侧画面上直接用鼠标拖选一段文字，或按键盘 C 键，体验秒级提取并复制当前页讲稿！",
)[
  #rect(
    width: 100%,
    fill: gradient.linear(rgb("#0f172a"), rgb("#1e293b"), angle: 15deg),
    radius: 6pt,
    inset: (x: 10pt, y: 5.5pt),
  )[
    #grid(
      columns: (1fr, auto),
      align(horizon)[
        #pill("WEBASSEMBLY + SOLID 2.0 + BUN CLI", bg: rgb("#134e4a"), fg: rgb("#2dd4bf"))
        #v(2pt)
        #text(size: 12pt, weight: "bold", fill: white)[
          Next-Gen Browser PDF Presenter & Rehearsal Studio
        ]
        #v(1.5pt)
        #text(size: 7.4pt, fill: rgb("#cbd5e1"))[
          支持 16:9 标准单屏与 32:9 左右分屏备注 · 原生透明文本划词复制 · 1080p 排练录制 · Tailscale 热重载
        ]
      ],
      align(right + horizon)[
        #rect(
          fill: rgb("#0d9488"),
          radius: 5pt,
          inset: (x: 8pt, y: 4.5pt),
        )[
          #align(center)[
            #text(size: 11.5pt, weight: "bold", fill: white)[60 FPS]
            #linebreak()
            #text(size: 6.5pt, fill: rgb("#ccfbf1"))[Zero-Lag Flip]
          ]
        ]
      ],
    )
  ]

  #v(2.5pt)

  #grid(
    columns: (1fr, 1fr, 1fr),
    column-gutter: 7pt,
    kpi-card(
      "渲染与解码管线",
      "PDFium + Rust",
      "Web Worker 异步光栅化 + SIMD PNG 编码，主线程零阻塞",
      accent: c-teal,
    ),
    kpi-card(
      "多维讲稿提词与复制",
      "4 种复制交互",
      "画面划词浮窗 / 双击词块 / 底部提词栏单行点选 / 全篇导出 .md",
      accent: c-blue,
    ),
    kpi-card(
      "排练录制与远程 CLI",
      "1080p + SSE",
      "纯净画布+摄像头画中画录制；CLI --watch 配合 Typst 实时热更新",
      accent: c-purple,
    ),
  )

  #v(2.5pt)

  #rect(
    width: 100%,
    fill: c-card,
    stroke: 0.6pt + c-border,
    radius: 5pt,
    inset: (x: 9pt, y: 5pt),
  )[
    #grid(
      columns: (auto, 1fr),
      column-gutter: 8pt,
      align: horizon,
      pill("立即试玩快捷键", bg: c-amber-bg, fg: c-amber),
      text(size: 7.8pt, fill: c-text)[
        按 *L* 开启双屏红色激光笔 · 按 *B* 切换观众投影黑屏 · 按 *T* 展开底部提词抽屉 · 按 *G* 跳页/设倒计时 · 按 *?* 查看帮助
      ],
    )
  ]
]

// =========================================================================
// SLIDE 2: 32:9 Dual-Screen Pipeline & Typst Touying Integration
// =========================================================================
#render-slide(
  idx: 2,
  section: "02 · DUAL-SCREEN WORKFLOW",
  title: "32:9 双屏备注架构：Typst + Touying 黄金搭档",
  pacing: "02:00",
  note-title: "为什么采用 32:9 左右拼接 PDF 以及如何自动分离？",
  note-lines: (
    "在 Typst 的 Touying 幻灯片框架中，只需一行配置 show-notes-on-second-screen: right，即可生成左半边正稿、右半边备注的 32:9 宽幅 PDF。",
    "pdfpc-ts 加载首帧时自动检测宽高比（Width / Height > 2.5），自动进入 32:9 备注模式，无需繁琐配置。",
    "左侧 0%~50% 坐标区：通过 CSS object-left 精准裁切，独立投射到观众投影窗口（Popup Window）及右侧小预览窗。",
    "右侧 50%~100% 坐标区：展示在演讲者主控台大屏，同时 PDFium 文本提取层自动以 X=50% 为分界线，将正稿文字与演讲备注精准分离！",
  ),
  note-tip: "你可以按键盘 N 键，实时观察工作台在『32:9 双屏备注模式』与『16:9 标准单屏模式』之间的无缝切换。",
)[
  #grid(
    columns: (1.05fr, 0.95fr),
    column-gutter: 9pt,
    [
      #rect(
        width: 100%,
        fill: c-card,
        stroke: 0.6pt + c-border,
        radius: 6pt,
        inset: 8.5pt,
      )[
        #text(size: 8.8pt, weight: "bold", fill: c-navy)[1. Typst Touying 一键导出 32:9 双屏 PDF]
        #v(2.5pt)
        #rect(
          width: 100%,
          fill: rgb("#0f172a"),
          radius: 4pt,
          inset: 7pt,
        )[
          #text(size: 7.4pt, font: "Noto Sans Mono CJK SC", fill: rgb("#e2e8f0"))[
            #text(fill: rgb("#38bdf8"))[\#import] "\@preview/touying:0.6.1": \* \
            #text(fill: rgb("#38bdf8"))[\#show]: metropolis-theme.with( \
            #h(8pt)aspect-ratio: #text(fill: rgb("#a7f3d0"))["16-9"], \
            #h(8pt)config-common( \
            #h(16pt)show-notes-on-second-screen: right \
            #h(8pt)), \
            ) \
            #text(fill: rgb("#f472b6"))[\#speaker-note]\[在这里编写仅自己可见的提词稿...\]
          ]
        ]
        #v(5pt)
        #text(size: 7.8pt, fill: c-muted)[
          • *零格式锁定*：即使更换电脑或借用会场机器，浏览器打开 GitHub Pages 即可完整还原双屏备注。\
          • *实时热更新*：本地执行 `typst watch` 配合 `pdfpc --watch`，保存即刷新。
        ]
      ]
    ],
    [
      #rect(
        width: 100%,
        fill: c-card,
        stroke: 0.6pt + c-border,
        radius: 6pt,
        inset: 8.5pt,
      )[
        #text(size: 8.8pt, weight: "bold", fill: c-navy)[2. 32:9 页面坐标与双窗口路由机制]
        #v(4pt)
        #grid(
          columns: (1fr, 1fr),
          column-gutter: 5pt,
          rect(
            width: 100%,
            fill: c-teal-bg,
            stroke: 0.8pt + c-teal,
            radius: 4pt,
            inset: 6pt,
          )[
            #text(size: 7.5pt, weight: "bold", fill: c-teal)[左半区 X ∈ [0%, 50%]]
            #v(2.5pt)
            #text(size: 7pt, fill: c-text)[
              • 观众投影窗口全屏展示\
              • 1080p 排练录像画布源\
              • 提词栏「左侧正稿」标签
            ]
          ],
          rect(
            width: 100%,
            fill: c-purple-bg,
            stroke: 0.8pt + c-purple,
            radius: 4pt,
            inset: 6pt,
          )[
            #text(size: 7.5pt, weight: "bold", fill: c-purple)[右半区 X ∈ [50%, 100%]]
            #v(2.5pt)
            #text(size: 7pt, fill: c-text)[
              • 演讲者主控台大屏展示\
              • 按 `C` 默认优先复制区\
              • 提词栏「右侧备注」标签
            ]
          ],
        )
        #v(5pt)
        #rect(
          width: 100%,
          fill: c-blue-bg,
          stroke: 0.6pt + c-blue,
          radius: 4pt,
          inset: 6pt,
        )[
          #text(size: 7.6pt, weight: "bold", fill: c-blue)[Solid 2.0 跨窗口 Signal 零延迟同步]
          #v(2pt)
          #text(size: 7pt, fill: c-muted)[
            主窗口与 `window.open()` 观众投影窗口共享同一组响应式 Signal（`globalCount`、`isBlackout`、`laserPos`），同步延迟 `< 1 ms`。
          ]
        ]
      ]
    ],
  )
]

// =========================================================================
// SLIDE 3: Smart Text Extraction & 4-Way Copy Experience
// =========================================================================
#render-slide(
  idx: 3,
  section: "03 · SMART TEXT EXTRACTION & COPY UX",
  title: "PDFium 原生文本层与四维丝滑复制体验",
  pacing: "02:00",
  note-title: "重点演示：如何在演讲或审稿时高效复制 PDF 中的文字与代码？",
  note-lines: (
    "原版基于位图渲染的幻灯片最大的痛点是『文字看得到却摸不着』，没法复制代码片段或讲稿。",
    "我们在 pdfium-worker.ts 中调用了底层的 _FPDFText_LoadPage、_FPDFText_CountRects 与 _FPDFText_GetBoundedText 接口。",
    "所有提取出的文本块不仅作为透明 DOM 覆盖在幻灯片上方支持鼠标直接拖选，还按垂直与水平坐标自动聚类为自然阅读段落。",
    "现在你可以用 4 种方式复制：1) 画面直接拖选弹出胶囊浮窗；2) 双击画面任意词块；3) 底部提词栏单击任意段落；4) 顶部一键复制本页/全篇或导出 Markdown。",
  ),
  note-tip: "请尝试双击本页左下角代码块中的命令，或者在下方提词栏里直接单击任意一行，感受零阻力复制体验！",
)[
  #grid(
    columns: (1fr, 1fr),
    column-gutter: 8pt,
    row-gutter: 6.5pt,
    rect(
      width: 100%,
      fill: c-card,
      stroke: (left: 3pt + c-teal, rest: 0.6pt + c-border),
      radius: 5pt,
      inset: 7pt,
    )[
      #grid(
        columns: (1fr, auto),
        text(size: 8.4pt, weight: "bold", fill: c-navy)[方式一：画面划词浮窗 & 双击秒复制],
        pill("Canvas Overlay", bg: c-teal-light, fg: c-teal),
      )
      #v(2.5pt)
      #text(size: 7.4pt, fill: c-muted)[
        在画面上拖选任意文字，顶部自动弹出「*一键复制选中*」胶囊按钮；*双击*任意文字块可直接复制整句。
      ]
      #v(2.5pt)
      #rect(
        width: 100%,
        fill: rgb("#0f172a"),
        radius: 4pt,
        inset: 5pt,
      )[
        #text(size: 7pt, font: "Noto Sans Mono CJK SC", fill: rgb("#4ade80"))[
          bun run cli.ts --tailscale --watch --duration 15 deck.pdf
        ]
      ]
    ],
    rect(
      width: 100%,
      fill: c-card,
      stroke: (left: 3pt + c-blue, rest: 0.6pt + c-border),
      radius: 5pt,
      inset: 7pt,
    )[
      #grid(
        columns: (1fr, auto),
        text(size: 8.4pt, weight: "bold", fill: c-navy)[方式二：底部提词栏单击段落复制],
        pill("Teleprompter (T)", bg: c-blue-bg, fg: c-blue),
      )
      #v(2.5pt)
      #text(size: 7.4pt, fill: c-muted)[
        按 `T` 展开底部提词栏，自动按阅读顺序聚合成段，支持切换「*右侧演讲备注*」、「*左侧幻灯片正稿*」与「*全页合并*」。
      ]
      #v(2.5pt)
      #rect(
        width: 100%,
        fill: c-blue-bg,
        radius: 4pt,
        inset: 5pt,
      )[
        #text(size: 7pt, fill: c-blue)[
          ✓ 支持 `A-` / `A+` 放大字号 · *鼠标单击任意一段*即刻复制该段
        ]
      ]
    ],
    rect(
      width: 100%,
      fill: c-card,
      stroke: (left: 3pt + c-purple, rest: 0.6pt + c-border),
      radius: 5pt,
      inset: 7pt,
    )[
      #grid(
        columns: (1fr, auto),
        text(size: 8.4pt, weight: "bold", fill: c-navy)[方式三：一键复制本页 (C) 与复制全篇],
        pill("One-Click Batch", bg: c-purple-bg, fg: c-purple),
      )
      #v(2.5pt)
      #text(size: 7.4pt, fill: c-muted)[
        按 `C` 键或点顶部「*复制本页*」，32:9 下智能复制右侧讲稿；点「*复制全篇*」将所有页讲稿一次性复制到剪贴板，方便发给 LLM 总结润色。
      ]
    ],
    rect(
      width: 100%,
      fill: c-card,
      stroke: (left: 3pt + c-amber, rest: 0.6pt + c-border),
      radius: 5pt,
      inset: 7pt,
    )[
      #grid(
        columns: (1fr, auto),
        text(size: 8.4pt, weight: "bold", fill: c-navy)[方式四：导出 Markdown (M) & 概览复制],
        pill("Markdown Export", bg: c-amber-bg, fg: c-amber),
      )
      #v(2.5pt)
      #text(size: 7.4pt, fill: c-muted)[
        按 `M` 键一键下载 `<文件名>-notes.md`，按 `## Slide 1..N` 自动分节整理备注与正稿；在 `Tab` 概览网格悬停缩略图也可直接复制该页。
      ]
    ],
  )
]

// =========================================================================
// SLIDE 4: Academic Math, Algorithms & Quantitative Benchmark Table
// =========================================================================
#render-slide(
  idx: 4,
  section: "04 · ACADEMIC BENCHMARK & FORMULAS",
  title: "学术汇报场景展示：数学公式、算法与性能对比表",
  pacing: "02:30",
  note-title: "学术汇报示例：星间协同推理模型与渲染性能实测数据解读",
  note-lines: (
    "这一页展示了学术论文答辩中最常见的两类元素：复杂数学公式推导与多维定量基准对比表。",
    "左侧公式展示了带热-算-网联合约束的时隙迁移收益目标函数，在 3x DPI (216 DPI) 超采样渲染下，上下标与求和号边缘依然锐利清晰。",
    "右侧表格对比了原生 GTK3 pdfpc、Python Pympress 与本项目 pdfpc-ts 在 50 页高分辨率学术幻灯片上的表现。",
    "得益于当前页+下一页优先渲染策略以及 WASM 内存主动回收（doc.destroy + revokeObjectURL），首屏起播耗时仅 140 ms，翻页稳定 60 FPS。",
  ),
  note-tip: "按 L 键开启红色激光笔，在左侧数学公式或右侧表格的最后一行上移动鼠标，弹出投影窗会实时同步高亮红点！",
)[
  #grid(
    columns: (0.92fr, 1.08fr),
    column-gutter: 8pt,
    [
      #rect(
        width: 100%,
        fill: c-card,
        stroke: 0.6pt + c-border,
        radius: 6pt,
        inset: 8pt,
      )[
        #text(size: 8.5pt, weight: "bold", fill: c-navy)[1. 学术公式与矢量级 3× 超采样渲染]
        #v(2.5pt)
        #rect(
          width: 100%,
          fill: c-bg,
          stroke: 0.5pt + c-border,
          radius: 4pt,
          inset: (x: 4pt, y: 5pt),
        )[
          #align(center)[
            #text(size: 8.5pt)[
              $ J^*(pi) = min_(a_t) sum_(t=1)^T [ alpha L_"TTFT"(s_t, a_t) + beta frac(V_"KV"(t), B_"ISL"(t)) ] $
            ]
          ]
        ]
        #v(2.5pt)
        #text(size: 7.3pt, fill: c-muted)[
          其中 $V_"KV"(t)$ 为待迁移 KV Cache 体积，$B_"ISL"(t)$ 为星间激光链路动态带宽包络，$T_j (t)$ 为一阶热 RC 模型下的芯片结温演化方程：
        ]
        #v(2.5pt)
        #rect(
          width: 100%,
          fill: c-bg,
          stroke: 0.5pt + c-border,
          radius: 4pt,
          inset: (x: 4pt, y: 5pt),
        )[
          #align(center)[
            #text(size: 8.5pt)[
              $ C_"th" frac(d T_j (t), d t) = P_"dyn"(f_t, V_t) - frac(T_j (t) - T_"amb", R_"th") $
            ]
          ]
        ]
        #v(2.5pt)
        #text(size: 7.2pt, fill: c-teal, weight: "bold")[
          ✓ 216 DPI 高清位图 + 原生坐标映射，公式符号与正文均可精准划词
        ]
      ]
    ],
    [
      #rect(
        width: 100%,
        fill: c-card,
        stroke: 0.6pt + c-border,
        radius: 6pt,
        inset: 8pt,
      )[
        #text(size: 8.5pt, weight: "bold", fill: c-navy)[2. 跨平台演讲工具实测性能基准对比 (50 页 Deck)]
        #v(4pt)
        #table(
          columns: (1.05fr, 0.9fr, 0.9fr, 1.15fr),
          inset: (x: 4pt, y: 3.5pt),
          stroke: 0.5pt + c-border,
          fill: (x, y) => if y == 0 { c-navy } else if x == 3 { c-teal-bg } else { white },
          align: (left + horizon, center + horizon, center + horizon, center + horizon),
          text(size: 7pt, weight: "bold", fill: white)[评估维度],
          text(size: 7pt, weight: "bold", fill: white)[pdfpc (GTK3)],
          text(size: 7pt, weight: "bold", fill: white)[Pympress],
          text(size: 7pt, weight: "bold", fill: rgb("#2dd4bf"))[pdfpc-ts (Ours)],

          text(size: 7pt, weight: "bold")[免安装即用],
          text(size: 7pt)[❌ 需编译安装],
          text(size: 7pt)[❌ 需 Python],
          text(size: 7pt, weight: "bold", fill: c-teal)[✅ Pages 秒开],

          text(size: 7pt, weight: "bold")[首屏起播延迟],
          text(size: 7pt)[680 ms],
          text(size: 7pt)[520 ms],
          text(size: 7pt, weight: "bold", fill: c-teal)[140 ms (首屏优先)],

          text(size: 7pt, weight: "bold")[翻页过渡帧率],
          text(size: 7pt)[25~40 FPS],
          text(size: 7pt)[30~45 FPS],
          text(size: 7pt, weight: "bold", fill: c-teal)[60 FPS 满帧],

          text(size: 7pt, weight: "bold")[讲稿划词复制],
          text(size: 7pt)[❌ 仅纯位图],
          text(size: 7pt)[⚠️ 仅外部备注],
          text(size: 7pt, weight: "bold", fill: c-teal)[✅ 4 维复制+.md],

          text(size: 7pt, weight: "bold")[排练高清录像],
          text(size: 7pt)[❌ 无],
          text(size: 7pt)[❌ 无],
          text(size: 7pt, weight: "bold", fill: c-teal)[✅ 1080p + PiP],

          text(size: 7pt, weight: "bold")[Typst 热重载],
          text(size: 7pt)[❌ 需手动重开],
          text(size: 7pt)[⚠️ 易丢页码],
          text(size: 7pt, weight: "bold", fill: c-teal)[✅ SSE 保页码],
        )
      ]
    ],
  )
]

// =========================================================================
// SLIDE 5: Live Stage Control (Blackout, Laser Pointer, Pacing Timer, Overview)
// =========================================================================
#render-slide(
  idx: 5,
  section: "05 · STAGE CONTROL & PACING",
  title: "现场演讲控场利器：激光笔、黑屏、倒计时与网格概览",
  pacing: "01:45",
  note-title: "现场答辩与授课时的四大控场技巧",
  note-lines: (
    "第一，双屏同步激光笔（快捷键 L）：在主控台画面上移动鼠标，观众投影窗口会实时渲染带发光光晕的红色激光点，即使通过腾讯会议或 Zoom 共享投影窗口，观众也能清晰看到你指的位置。",
    "第二，一键黑屏（快捷键 B 或句号 .）：在板书推导或穿插口头提问时，按 B 键将观众屏切为纯黑，主控台仍保留半透明画面提示。",
    "第三，智能倒计时告警（快捷键 G）：支持设定目标演讲时长（如 15 分钟），剩余不足 2 分钟时自动变黄预警，超时后变红闪烁。",
    "第四，概览网格快速跳页（快捷键 Tab）：答辩提问环节（Q&A）按 Tab 键切出全量缩略图网格，点击任意页秒跳，且观众屏不会看到网格切换过程！",
  ),
  note-tip: "现在按一下 Tab 键试试看！你会发现主控台切到了缩略图网格，而如果开启了观众投影窗，观众看到的画面完全不受打扰。",
)[
  #grid(
    columns: (1fr, 1fr),
    column-gutter: 9pt,
    row-gutter: 7pt,
    rect(
      width: 100%,
      fill: c-card,
      stroke: 0.6pt + c-border,
      radius: 6pt,
      inset: 8pt,
    )[
      #grid(
        columns: (auto, 1fr),
        column-gutter: 7pt,
        rect(fill: rgb("#fee2e2"), radius: 5pt, inset: 5.5pt)[
          #text(size: 10.5pt, weight: "bold", fill: rgb("#dc2626"))[L]
        ],
        [
          #text(size: 8.6pt, weight: "bold", fill: c-navy)[双屏同步红色激光笔 (Laser Pointer)]
          #v(2pt)
          #text(size: 7.5pt, fill: c-muted)[
            开启后鼠标变为十字准星，在演讲者主控台移动鼠标，观众投影窗通过百分比相对坐标 $(x\%, y\%)$ 实时同步绘制高亮激光点。
          ]
        ],
      )
    ],
    rect(
      width: 100%,
      fill: c-card,
      stroke: 0.6pt + c-border,
      radius: 6pt,
      inset: 8pt,
    )[
      #grid(
        columns: (auto, 1fr),
        column-gutter: 7pt,
        rect(fill: rgb("#1e293b"), radius: 5pt, inset: 5.5pt)[
          #text(size: 10.5pt, weight: "bold", fill: white)[B]
        ],
        [
          #text(size: 8.6pt, weight: "bold", fill: c-navy)[观众投影黑屏控场 (Blackout Mode)]
          #v(2pt)
          #text(size: 7.5pt, fill: c-muted)[
            按 `B` 或 `.` 键立即将观众屏置黑，引导听众注意力回到讲者本身；主控台仅叠加半透明横幅，方便讲者随时确认当前所在页。
          ]
        ],
      )
    ],
    rect(
      width: 100%,
      fill: c-card,
      stroke: 0.6pt + c-border,
      radius: 6pt,
      inset: 8pt,
    )[
      #grid(
        columns: (auto, 1fr),
        column-gutter: 7pt,
        rect(fill: c-amber-bg, radius: 5pt, inset: 5.5pt)[
          #text(size: 10.5pt, weight: "bold", fill: c-amber)[G]
        ],
        [
          #text(size: 8.6pt, weight: "bold", fill: c-navy)[快速页码跳转 & 演讲倒计时预警]
          #v(2pt)
          #text(size: 7.5pt, fill: c-muted)[
            按 `G` 键或点击右上角页码，可直接输入页码跳转并设置目标分钟数（支持 URL 参数 `?duration=15` 预设），配合 `P` 暂停、`R` 重置。
          ]
        ],
      )
    ],
    rect(
      width: 100%,
      fill: c-card,
      stroke: 0.6pt + c-border,
      radius: 6pt,
      inset: 8pt,
    )[
      #grid(
        columns: (auto, 1fr),
        column-gutter: 7pt,
        rect(fill: c-teal-light, radius: 5pt, inset: 5.5pt)[
          #text(size: 9.5pt, weight: "bold", fill: c-teal)[Tab]
        ],
        [
          #text(size: 8.6pt, weight: "bold", fill: c-navy)[Q&A 无干扰概览网格 (Overview Grid)]
          #v(2pt)
          #text(size: 7.5pt, fill: c-muted)[
            答辩问答时按 `Tab` 在主控台展开全量幻灯片网格（观众屏保持原画面不变），选中目标页点击后借助 View Transition 丝滑切入。
          ]
        ],
      )
    ],
  )
]

// =========================================================================
// SLIDE 6: Built-in HD Rehearsal Recorder & Playback Review
// =========================================================================
#render-slide(
  idx: 6,
  section: "06 · REHEARSAL RECORDER STUDIO",
  title: "内置高清排练录制与复盘：无需 OBS 的自检闭环",
  pacing: "02:00",
  note-title: "如何用内置录制功能在正式演讲前快速打磨节奏与表达？",
  note-lines: (
    "很多同学在重要学术会议（如 SIGCOMM / ICNP / OSDI）报告前排练时，配置 OBS 捕获窗口非常繁琐，还经常不小心把备注或桌面弹窗录进去。",
    "pdfpc-ts 左下角内置了一键排练录制器（Recorder），提供『纯净幻灯片画布模式』与『屏幕捕获模式』。",
    "在纯净幻灯片模式下，系统使用离屏 Canvas 直接绘制高清左半屏正稿（支持 1080p 2.2Mbps 或 720p 1.2Mbps），可选在右下角叠加圆角摄像头人像画中画（PiP）以及 48kHz 单声道降噪麦克风音频。",
    "点击停止录制后，立即弹出复盘回放窗口，统计本次演练总时长与覆盖页码，支持 0.75x ~ 2.0x 倍速回看并一键保存为 WebM/MP4 视频文件。",
  ),
  note-tip: "点击左下角控制栏的『齿轮图标』可以配置 1080p/720p 与摄像头画中画开关，点击『红点图标』即可直接开始排练录制！",
)[
  #grid(
    columns: (1.1fr, 0.9fr),
    column-gutter: 9pt,
    [
      #rect(
        width: 100%,
        fill: c-card,
        stroke: 0.6pt + c-border,
        radius: 6pt,
        inset: 8pt,
      )[
        #text(size: 8.8pt, weight: "bold", fill: c-navy)[事件驱动离屏缓存录制管线 (Low-CPU Overhead)]
        #v(4pt)
        #stack(
          dir: ttb,
          spacing: 4.5pt,
          rect(width: 100%, fill: c-teal-bg, stroke: 0.6pt + c-teal, radius: 4pt, inset: 5.5pt)[
            #text(size: 7.6pt, weight: "bold", fill: c-teal)[Step 1 · 离屏正稿光栅缓存 (Offscreen Slide Canvas)]
            #linebreak()
            #text(size: 7pt, fill: c-muted)[仅在翻页事件触发时将当前正稿渲染至 `offscreenCanvas`，避免每秒 60 次重复缩放高分位图。]
          ],
          rect(width: 100%, fill: c-blue-bg, stroke: 0.6pt + c-blue, radius: 4pt, inset: 5.5pt)[
            #text(size: 7.6pt, weight: "bold", fill: c-blue)[Step 2 · 摄像头 PiP 合成与低开销心跳 (Adaptive Loop)]
            #linebreak()
            #text(size: 7pt, fill: c-muted)[开启摄像头时以 30 FPS 合成右下角圆角画中画；纯幻灯片下自动降为 2 FPS 低功耗心跳。]
          ],
          rect(width: 100%, fill: c-purple-bg, stroke: 0.6pt + c-purple, radius: 4pt, inset: 5.5pt)[
            #text(size: 7.6pt, weight: "bold", fill: c-purple)[Step 3 · 48kHz 语音降噪与即时复盘播放器 (Review Modal)]
            #linebreak()
            #text(size: 7pt, fill: c-muted)[开启 `echoCancellation` + `noiseSuppression` 单声道录音，停止后立刻弹出倍速复盘弹窗。]
          ],
        )
      ]
    ],
    [
      #rect(
        width: 100%,
        fill: rgb("#0f172a"),
        stroke: 1pt + rgb("#334155"),
        radius: 6pt,
        inset: 8.5pt,
      )[
        #text(size: 8.2pt, weight: "bold", fill: rgb("#2dd4bf"))[🎬 纯净录制画面合成示意 (1920 × 1080)]
        #v(5pt)
        #rect(
          width: 100%,
          height: 3.3cm,
          fill: rgb("#1e293b"),
          stroke: 0.8pt + rgb("#475569"),
          radius: 5pt,
          inset: 7pt,
        )[
          #text(size: 7.6pt, weight: "bold", fill: white)[16:9 幻灯片正稿画面 (无浏览器边框/备注干扰)]
          #v(3pt)
          #text(size: 6.8pt, fill: rgb("#94a3b8"))[
            • 自动裁切 32:9 左半屏正稿\
            • 码率受控：1080p (2.2 Mbps) / 720p (1.2 Mbps)
          ]
          #place(bottom + right)[
            #rect(
              width: 2.1cm,
              height: 1.2cm,
              fill: rgb("#0f766e"),
              stroke: 1pt + white,
              radius: 4pt,
              inset: 3pt,
            )[
              #align(center + horizon)[
                #text(size: 6.8pt, weight: "bold", fill: white)[📷 讲者 PiP]
              ]
            ]
          ]
        ]
        #v(5pt)
        #text(size: 7pt, fill: rgb("#cbd5e1"))[
          复盘统计：自动记录*总时长*与*已演练页码序列*，支持一键下载 `.webm` / `.mp4`。
        ]
      ]
    ],
  )
]

// =========================================================================
// SLIDE 7: Bun CLI, --watch Live Reload & Next Terminal Remote Ops
// =========================================================================
#render-slide(
  idx: 7,
  section: "07 · CLI & NEXT TERMINAL REMOTE DEV",
  title: "Bun CLI 启动器、Typst 热重载与 Next Terminal 远程协同",
  pacing: "02:00",
  note-title: "本地命令行秒开与 Next Terminal / Tailscale 远程服务器工作流",
  note-lines: (
    "除了部署在 GitHub Pages 上供所有人在线使用外，pdfpc-ts 还提供了跨平台 Bun CLI 启动器（cli.ts），可编译为单文件二进制 bin/pdfpc。",
    "在本地电脑写 Typst 幻灯片时，运行 pdfpc --watch deck.pdf，CLI 会通过 fs.watch 监听 PDF 原子写入，并通过 Server-Sent Events (`/__pdfpc_events`) 通知浏览器无感重绘。",
    "在 Next Terminal 纳管的远程无头 Linux 节点（如 qzlab 100.99.0.3）上开发时，加上 --tailscale 参数即可自动绑定 0.0.0.0 并输出 Tailscale 直连 URL。",
    "远程服务器改完代码或重编译 Typst 后，你本地 Mac/Windows 浏览器打开的 Tailscale 链接会自动同步更新，实现完美的云端编写+本地放映闭环。",
  ),
  note-tip: "在底部提词栏或画面中可以直接复制下方的常用 CLI 启动命令，到 Next Terminal 的 qzlab 节点 ~/src/pdfpc-ts-acam 下实操验证。",
)[
  #grid(
    columns: (1fr, 1fr),
    column-gutter: 9pt,
    [
      #rect(
        width: 100%,
        fill: rgb("#0f172a"),
        radius: 6pt,
        inset: 9pt,
      )[
        #text(size: 8.4pt, weight: "bold", fill: rgb("#2dd4bf"))[💻 本地与远程 CLI 常用命令速查]
        #v(2.5pt)
        #text(size: 7.2pt, font: "Noto Sans Mono CJK SC", fill: rgb("#e2e8f0"))[
          #text(fill: rgb("#94a3b8"))[\# 1. 本地秒开独立 Chrome App 演讲窗]\
          #text(fill: rgb("#4ade80"))[pdfpc --watch --duration 15 talk.pdf]\
          \
          #text(fill: rgb("#94a3b8"))[\# 2. Next Terminal (qzlab) Tailscale 远程热重载]\
          #text(fill: rgb("#38bdf8"))[pdfpc --tailscale --watch --port 8765 talk.pdf]\
          \
          #text(fill: rgb("#94a3b8"))[\# 3. 一键构建前端 dist/ 与独立可执行二进制]\
          #text(fill: rgb("#f472b6"))[pnpm run build:all]
        ]
      ]
    ],
    [
      #rect(
        width: 100%,
        fill: c-card,
        stroke: 0.6pt + c-border,
        radius: 6pt,
        inset: 9pt,
      )[
        #text(size: 8.6pt, weight: "bold", fill: c-navy)[Next Terminal (`qzlab`) 远程协同闭环]
        #v(2.5pt)
        #table(
          columns: (auto, 1fr),
          inset: (x: 5pt, y: 4pt),
          stroke: 0.5pt + c-border,
          fill: (x, y) => if x == 0 { c-bg } else { white },
          text(size: 7.2pt, weight: "bold")[开发节点],
          text(size: 7.2pt, font: "Noto Sans Mono CJK SC")[qzlab (100.99.0.3) · user: ccds],
          text(size: 7.2pt, weight: "bold")[工作目录],
          text(size: 7.2pt, font: "Noto Sans Mono CJK SC")[/home/ccds/src/pdfpc-ts-acam],
          text(size: 7.2pt, weight: "bold")[组织仓库],
          text(size: 7.2pt, font: "Noto Sans Mono CJK SC")[github.com/acam-infra/pdfpc-ts],
          text(size: 7.2pt, weight: "bold")[在线 Pages],
          text(size: 7.2pt, font: "Noto Sans Mono CJK SC")[acam-infra.github.io/pdfpc-ts/],
          text(size: 7.2pt, weight: "bold")[热重载协议],
          text(size: 7.2pt, font: "Noto Sans Mono CJK SC")[SSE `/__pdfpc_events` (180ms 防抖)],
        )
      ]
    ],
  )
]

// =========================================================================
// SLIDE 8: Summary Cheat Sheet & Quick Links
// =========================================================================
#render-slide(
  idx: 8,
  section: "08 · CHEAT SHEET & SUMMARY",
  title: "全功能快捷键速查表与演练验收清单",
  pacing: "01:15",
  note-title: "结语：开始上传你自己的 PDF 演示文稿吧！",
  note-lines: (
    "以上就是 pdfpc-ts 互动示例的全部 8 页内容。你可以随时点击左上角的『文件名 / 换文件』按钮返回工作台首页。",
    "在首页，你既可以拖入自己的 16:9 标准 PDF 或 32:9 Touying 双屏备注 PDF，也可以在顶部一键切换体验 16:9 标准单屏示例（example-16x9.pdf）。",
    "如果觉得这个工具对你的组会汇报、学术会议报告或课程讲授有帮助，欢迎把 GitHub Pages 链接直接分享给实验室同门！",
  ),
  note-tip: "按 M 键即可将这 8 页示例的所有中英文讲稿导出为一份排版整洁的 Markdown 笔记（example-notes.md）！",
)[
  #grid(
    columns: (1.15fr, 0.85fr),
    column-gutter: 9pt,
    [
      #rect(
        width: 100%,
        fill: c-card,
        stroke: 0.6pt + c-border,
        radius: 6pt,
        inset: 8pt,
      )[
        #text(size: 8.6pt, weight: "bold", fill: c-navy)[⌨️ 演讲者核心快捷键速查表 (按 ? 随时呼出)]
        #v(2.5pt)
        #table(
          columns: (0.78fr, 1.22fr, 0.78fr, 1.22fr),
          inset: (x: 4.5pt, y: 3.5pt),
          stroke: 0.5pt + c-border,
          fill: (x, y) => if calc.even(x) { c-teal-bg } else { white },
          text(size: 7pt, font: "Noto Sans Mono CJK SC", weight: "bold", fill: c-teal)[→ / Space / J],
          text(size: 7pt)[下一页 (自动启计时)],
          text(size: 7pt, font: "Noto Sans Mono CJK SC", weight: "bold", fill: c-teal)[← / PageUp / K],
          text(size: 7pt)[上一页],

          text(size: 7pt, font: "Noto Sans Mono CJK SC", weight: "bold", fill: c-teal)[Tab],
          text(size: 7pt)[概览网格 / 演讲视图],
          text(size: 7pt, font: "Noto Sans Mono CJK SC", weight: "bold", fill: c-teal)[N],
          text(size: 7pt)[切 16:9 / 32:9 备注],

          text(size: 7pt, font: "Noto Sans Mono CJK SC", weight: "bold", fill: c-teal)[T],
          text(size: 7pt)[展开/收起底部提词栏],
          text(size: 7pt, font: "Noto Sans Mono CJK SC", weight: "bold", fill: c-teal)[C / Ctrl+C],
          text(size: 7pt)[复制选中或本页讲稿],

          text(size: 7pt, font: "Noto Sans Mono CJK SC", weight: "bold", fill: c-teal)[M],
          text(size: 7pt)[导出全篇讲稿 .md],
          text(size: 7pt, font: "Noto Sans Mono CJK SC", weight: "bold", fill: c-teal)[G],
          text(size: 7pt)[跳页 & 设演讲倒计时],

          text(size: 7pt, font: "Noto Sans Mono CJK SC", weight: "bold", fill: c-teal)[L],
          text(size: 7pt)[双屏同步红色激光笔],
          text(size: 7pt, font: "Noto Sans Mono CJK SC", weight: "bold", fill: c-teal)[B / .],
          text(size: 7pt)[观众投影窗口黑屏],

          text(size: 7pt, font: "Noto Sans Mono CJK SC", weight: "bold", fill: c-teal)[P / R],
          text(size: 7pt)[暂停 / 重置计时器],
          text(size: 7pt, font: "Noto Sans Mono CJK SC", weight: "bold", fill: c-teal)[F / ?],
          text(size: 7pt)[全屏切换 / 帮助弹窗],
        )
      ]
    ],
    [
      #rect(
        width: 100%,
        fill: gradient.linear(rgb("#0f172a"), rgb("#134e4a"), angle: 25deg),
        radius: 6pt,
        inset: 9pt,
      )[
        #pill("READY TO PRESENT", bg: rgb("#0d9488"), fg: white)
        #v(4pt)
        #text(size: 11.5pt, weight: "bold", fill: white)[
          Thank You & Happy Presenting!
        ]
        #v(4pt)
        #text(size: 7.3pt, fill: rgb("#ccfbf1"))[
          • *在线工作台*：\
            `acam-infra.github.io/pdfpc-ts/`\
          • *GitHub 仓库*：\
            `github.com/acam-infra/pdfpc-ts`\
          • *示例源码*：\
            `public/example.typ`
        ]
        #v(2.5pt)
        #rect(
          width: 100%,
          fill: rgb("#1e293b"),
          stroke: 0.6pt + rgb("#2dd4bf"),
          radius: 4pt,
          inset: 5.5pt,
        )[
          #text(size: 7pt, fill: white)[
            👉 点击左上角文件名按钮即可返回首页，上传你自己的 PDF 或切换体验 *16:9 标准单屏示例*！
          ]
        ]
      ]
    ],
  )
]
