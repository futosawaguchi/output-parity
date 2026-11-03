"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./check.module.css";
import { normalizeLine, type LineMark } from "@/lib/case-marks";
import { groupIntoRows, type TextItem } from "@/lib/compare/pdf-lines";
import { loadPdfjs } from "./pdfjs-client";

type Props = { src: string; label: string; marks?: LineMark[] };

/** Draws every page of one PDF into canvases sized to the column, with the changed lines framed. */
export function PdfView(props: Props) {
  // A new document gets a fresh view, so a failure shown for one PDF never sticks to the next.
  return <PdfCanvas key={props.src} {...props} />;
}

function PdfCanvas({ src, label, marks = [] }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  const key = JSON.stringify(marks);
  useEffect(() => {
    let cancelled = false;
    const wanted = JSON.parse(key) as LineMark[];
    let destroy: (() => Promise<void>) | null = null;
    const el = holder.current;
    if (!el) return;

    (async () => {
      const { pdfjs, worker } = await loadPdfjs();
      const task = pdfjs.getDocument({
        url: src,
        worker,
        cMapUrl: "/api/pdfjs/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/api/pdfjs/standard_fonts/",
      });
      destroy = () => task.destroy();
      const doc = await task.promise;
      el.replaceChildren();
      for (let n = 1; n <= doc.numPages && !cancelled; n++) {
        const page = await doc.getPage(n);
        const width = el.clientWidth;
        const viewport = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * window.devicePixelRatio });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = "100%";
        const box = document.createElement("div");
        box.className = styles.pdfPage;
        box.appendChild(canvas);
        el.appendChild(box);
        await page.render({ canvas, viewport }).promise;
        if (wanted.length > 0) markRows(box, page.getViewport({ scale: 1 }), await page.getTextContent(), wanted);
      }
    })().catch((e: unknown) => {
      if (cancelled) return;
      console.error(`PDF を表示できませんでした: ${src}`, e);
      setFailed(true);
    });

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [src, key]);

  return (
    <figure className={styles.pdf}>
      <figcaption className={styles.pdfLabel}>{label}</figcaption>
      {failed ? <p className={styles.muted}>PDF を表示できませんでした</p> : <div ref={holder} className={styles.pdfFrame} aria-label={`${label}の PDF`} />}
    </figure>
  );
}

/**
 * Frames, over the drawn page, each line whose text is one of the changed lines. The page's text
 * is grouped exactly as the comparison grouped it (lib/compare/pdf-lines), so the same text is the same line.
 */
function markRows(box: HTMLElement, page: { width: number; height: number }, content: { items: object[] }, wanted: LineMark[]) {
  const items = content.items.filter((i): i is TextItem => "str" in i && (i as TextItem).str.trim() !== "");
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;
  for (const row of groupIntoRows(items)) {
    const text = normalizeLine(row.text);
    const pad = row.size * 0.3;
    const left = pct(row.left - pad, page.width);
    const width = pct(row.right - row.left + pad * 2, page.width);
    for (const m of wanted.filter((w) => normalizeLine(w.text) === text)) {
      const mark = document.createElement("span");
      if (m.kind === "changed") {
        mark.className = styles.pdfMark;
        mark.style.top = pct(page.height - row.baseline - row.size - pad, page.height);
        mark.style.height = pct(row.size * 1.25 + pad * 2, page.height);
      } else {
        // The rule under the line before, and the count just right of it, clear of the lines that follow.
        mark.className = styles.pdfGone;
        mark.style.top = pct(page.height - row.baseline + row.size * 0.45, page.height);
        const note = document.createElement("span");
        note.className = styles.pdfGoneNote;
        note.style.top = mark.style.top;
        note.style.left = pct(row.right + pad * 2, page.width);
        // Short enough for the margin beside a table; the full sentence is its tooltip.
        note.textContent = `−${m.count} 行`;
        note.title = `ここにあった ${m.count} 行が消えています`;
        box.appendChild(note);
      }
      mark.style.left = left;
      mark.style.width = width;
      box.appendChild(mark);
    }
  }
}
