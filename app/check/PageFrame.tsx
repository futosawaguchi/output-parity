"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./check.module.css";

/** Old business pages are laid out for a desktop screen; drawn at this width, then scaled to fit. */
const PAGE_WIDTH = 920;
const FRAME_HEIGHT = 420;

/**
 * An HTML output drawn as its page, shrunk to the column like a thumbnail of the real screen. The
 * frame is sandboxed with nothing allowed; the route serves the page with the same policy.
 */
export function PageFrame({ src, title }: { src: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(1, entry.contentRect.width / PAGE_WIDTH)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={box} className={styles.pageFrame} style={{ height: FRAME_HEIGHT }}>
      <iframe
        src={src}
        sandbox=""
        referrerPolicy="no-referrer"
        title={title}
        style={{ width: PAGE_WIDTH, height: FRAME_HEIGHT / scale, transform: `scale(${scale})`, transformOrigin: "0 0", border: 0 }}
      />
    </div>
  );
}
