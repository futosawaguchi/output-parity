"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./check.module.css";
import { loadPdfjs } from "./pdfjs-client";

type Props = { src: string; label: string };

/** Draws every page of one PDF into canvases sized to the column. */
export function PdfView(props: Props) {
  // A new document gets a fresh view, so a failure shown for one PDF never sticks to the next.
  return <PdfCanvas key={props.src} {...props} />;
}

function PdfCanvas({ src, label }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
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
        canvas.className = styles.pdfPage;
        el.appendChild(canvas);
        await page.render({ canvas, viewport }).promise;
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
  }, [src]);

  return (
    <figure className={styles.pdf}>
      <figcaption className={styles.pdfLabel}>{label}</figcaption>
      {failed ? <p className={styles.muted}>PDF を表示できませんでした</p> : <div ref={holder} className={styles.pdfFrame} aria-label={`${label}の PDF`} />}
    </figure>
  );
}
