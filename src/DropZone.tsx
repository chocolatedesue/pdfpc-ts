import { cx } from "classix";
import { createSignal } from "solid-js";

type DropZoneProps = {
  type: "no-notes" | "notes-right";
  onFileSelect: (file: File) => void;
};

export function DropZone(props: DropZoneProps) {
  const [isDragging, setIsDragging] = createSignal(false);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        props.onFileSelect(file);
      } else {
        alert("请上传 PDF 格式的演示文稿文件 (.pdf)");
      }
    }
  };

  const handleClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        props.onFileSelect(file);
      }
    };
    input.click();
  };

  const isNotesRight = () => props.type === "notes-right";

  return (
    <div
      class={cx(
        "group relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-dashed p-6 transition-all duration-200 cursor-pointer select-none",
        isDragging()
          ? "border-cat-teal bg-cat-teal/15 scale-[1.01] shadow-xl"
          : "border-cat-surface2 bg-cat-mantle/70 hover:border-cat-teal/80 hover:bg-cat-surface0/50 hover:shadow-lg",
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      {/* Top badge & icon */}
      <div class="flex items-center justify-between">
        <span
          class={cx(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold tracking-wide",
            isNotesRight()
              ? "bg-cat-mauve/20 text-cat-mauve"
              : "bg-cat-teal/20 text-cat-teal",
          )}
        >
          <span>{isNotesRight() ? "32:9 双屏带讲稿" : "16:9 标准幻灯片"}</span>
        </span>
        <span class="rounded-xl bg-cat-surface0 p-2 text-cat-subtext0 group-hover:bg-cat-teal/20 group-hover:text-cat-teal transition-colors">
          <span class="icon-[fluent--document-pdf-24-regular] text-2xl block" />
        </span>
      </div>

      {/* Visual wireframe diagram */}
      <div class="my-6 flex items-center justify-center">
        {!isNotesRight() ? (
          <div class="flex aspect-video w-44 flex-col items-center justify-center rounded-lg border-2 border-cat-teal/60 bg-cat-base/80 p-3 shadow-inner group-hover:border-cat-teal transition-colors">
            <span class="text-xs font-mono font-bold text-cat-teal">16 : 9 SLIDE</span>
            <span class="mt-1 text-[10px] text-cat-subtext0">单屏正稿 · 自动提取全文</span>
          </div>
        ) : (
          <div class="grid aspect-[32/9] w-64 grid-cols-2 overflow-hidden rounded-lg border-2 border-cat-mauve/60 bg-cat-base/80 shadow-inner group-hover:border-cat-mauve transition-colors">
            <div class="flex flex-col items-center justify-center border-r border-dashed border-cat-surface2 p-2">
              <span class="text-[11px] font-mono font-bold text-cat-teal">LEFT · 正稿</span>
              <span class="text-[9px] text-cat-subtext0">观众投影画面</span>
            </div>
            <div class="flex flex-col items-center justify-center bg-cat-surface0/40 p-2">
              <span class="text-[11px] font-mono font-bold text-cat-mauve">RIGHT · 备注</span>
              <span class="text-[9px] text-cat-subtext0">演讲者提词与复制</span>
            </div>
          </div>
        )}
      </div>

      {/* Title & explanation */}
      <div>
        <h3 class="text-lg font-bold text-cat-text group-hover:text-cat-teal transition-colors">
          {isNotesRight()
            ? "右侧带演讲备注 (Touying / Pympress)"
            : "标准无备注幻灯片 (Beamer / PPT / Typst)"}
        </h3>
        <p class="mt-1 text-xs leading-relaxed text-cat-subtext0">
          {isNotesRight()
            ? "适用于 Typst Touying show-notes-on-second-screen: right，左半页投影给观众，右半页作为提词器并支持一键分离复制讲稿。"
            : "适用于常规 16:9 或 4:3 PDF 演示文稿，主屏展示当前页与文本划词层，副栏预览下一页并支持排练录像。"}
        </p>
        <div class="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-cat-teal">
          <span class="icon-[fluent--arrow-upload-16-filled]" />
          <span>点击选择或拖拽 PDF 到此处打开</span>
        </div>
      </div>
    </div>
  );
}
