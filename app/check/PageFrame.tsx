"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./check.module.css";

/** Old business pages are laid out for a desktop screen; drawn at this width, then scaled to fit. */
const PAGE_WIDTH = 920;

/**
 * An HTML output drawn as its page, shrunk to the column like a thumbnail of the real screen. The
 * frame is sandboxed with nothing allowed; the route serves the page with the same policy.
 */
export function PageFrame({ src, title }: { src: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ scale: 0.6, height: 600 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // The frame's height comes from the stylesheet (as tall as a PDF's); the page is scaled to its width.
    const observer = new ResizeObserver(([entry]) => setSize({ scale: Math.min(1, entry.contentRect.width / PAGE_WIDTH), height: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={box} className={styles.pageFrame}>
      <iframe
        src={src}
        sandbox=""
        referrerPolicy="no-referrer"
        title={title}
        style={{ width: PAGE_WIDTH, height: size.height / size.scale, transform: `scale(${size.scale})`, transformOrigin: "0 0", border: 0 }}
      />
    </div>
  );
}
