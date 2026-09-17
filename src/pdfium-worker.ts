import type { PDFiumDocument, PDFiumPageRenderOptions } from "@hyzyla/pdfium";
import { PDFiumLibrary } from "@hyzyla/pdfium";
import module from "@hyzyla/pdfium/pdfium.wasm?url";
import { expose } from "comlink";
import type { Setter } from "solid-js";

import init, { bitmap_to_png } from "../pkg/bitmap_to_png.js";
import type { setDocImagesWrapper, PageTextRect } from "./App.tsx";

const [pdfium, _] = await Promise.all([
  PDFiumLibrary.init({
    wasmUrl: module,
  }),
  init(),
]);

postMessage({
  type: "worker-ready",
});

async function renderFunction(
  options: PDFiumPageRenderOptions,
): Promise<Uint8Array> {
  const { data, height, width } = options;

  const png = bitmap_to_png(data, width, height);
  return png;
}

let doc: PDFiumDocument | undefined = undefined;

export class obj {
  static ready = (setIsReady: Setter<boolean>) => {
    setIsReady(true);
  };
  static loadPDF = async (file: Uint8Array) => {
    doc = await pdfium.loadDocument(file);
    console.log("Loaded PDF document in worker:", doc);
  };
  static pageCount = (): number => {
    if (!doc) {
      throw new Error("Document not loaded");
    }
    return doc.getPageCount();
  };
  static renderPDF = async function (
    pageIndex: number,
    callback: typeof setDocImagesWrapper,
  ) {
    if (!doc) {
      throw new Error("Document not loaded");
    }
    const page = doc.getPage(pageIndex);
    console.log(`${page.number} - rendering...`);

    // 1. Extract text and rects BEFORE page.render closes the page!
    let pageText = "";
    const rects: PageTextRect[] = [];
    try {
      pageText = page.getText() || "";
      const pageSize = page.getOriginalSize();
      const pdfModule = (page as any).module;
      const pIdx = (page as any).pageIdx;

      if (pdfModule && pIdx !== undefined) {
        const textPage = pdfModule._FPDFText_LoadPage(pIdx);
        if (textPage) {
          const count = pdfModule._FPDFText_CountRects(textPage, 0, -1);
          if (count > 0) {
            const rectBuffer = pdfModule.wasmExports.malloc(32);
            const textBufSize = 1024;
            const textBuffer = pdfModule.wasmExports.malloc(textBufSize);

            for (let i = 0; i < count; i++) {
              pdfModule._FPDFText_GetRect(
                textPage,
                i,
                rectBuffer,
                rectBuffer + 8,
                rectBuffer + 16,
                rectBuffer + 24,
              );
              const coords = new Float64Array(pdfModule.HEAPU8.buffer, rectBuffer, 4);
              const [left, top, right, bottom] = [coords[0], coords[1], coords[2], coords[3]];

              const len = pdfModule._FPDFText_GetBoundedText(
                textPage,
                left,
                top,
                right,
                bottom,
                textBuffer,
                textBufSize / 2,
              );
              let str = "";
              if (len > 0) {
                str = new TextDecoder("utf-16le").decode(
                  new Uint8Array(pdfModule.HEAPU8.buffer, textBuffer, (len - 1) * 2),
                );
              }

              if (str.trim().length > 0 && pageSize.originalWidth > 0 && pageSize.originalHeight > 0) {
                rects.push({
                  text: str,
                  left: Math.max(0, (left / pageSize.originalWidth) * 100),
                  top: Math.max(0, ((pageSize.originalHeight - top) / pageSize.originalHeight) * 100),
                  width: Math.min(100, ((right - left) / pageSize.originalWidth) * 100),
                  height: Math.min(100, ((top - bottom) / pageSize.originalHeight) * 100),
                });
              }
            }

            pdfModule.wasmExports.free(rectBuffer);
            pdfModule.wasmExports.free(textBuffer);
          }
          pdfModule._FPDFText_ClosePage(textPage);
        }
      }
    } catch (extractErr) {
      console.warn("Text extraction failed for page", pageIndex, extractErr);
    }

    // 2. Render PDF page to PNG image (this closes the page handle)
    const image = await page.render({
      scale: 3, // 3x scale (72 DPI is the default)
      render: renderFunction,
    });

    const blob = new Blob([image.data], { type: "image/png" });
    const imgUrl = URL.createObjectURL(blob);

    await callback(page.number, imgUrl, pageText, rects);
  };
}

expose(obj);
