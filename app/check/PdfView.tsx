"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./check.module.css";

/** Draws every page of one PDF into canvases sized to the column. */
export function PdfView({ src, label }: { src: string; label: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => Promise<void>) | null = null;
    const el = holder.current;
    if (!el) return;

    (async () => {
      // This entry point also starts pdfjs's worker from the package itself.
      const pdfjs = await import("pdfjs-dist/webpack.mjs");
      const task = pdfjs.getDocument({ url: src, cMapUrl: "/api/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/api/pdfjs/standard_fonts/" });
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
        canvas.className = styles.pdfPage;
        el.appendChild(canvas);
        await page.render({ canvas, viewport }).promise;
      }
    })().catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [src]);

  return (
    <figure className={styles.pdf}>
      <figcaption className={styles.pdfLabel}>{label}</figcaption>
      {failed ? <p className={styles.muted}>PDF を表示できませんでした</p> : <div ref={holder} className={styles.pdfFrame} aria-label={`${label}の PDF`} />}
    </figure>
  );
}
