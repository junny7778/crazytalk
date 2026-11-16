import { useEffect, useId, useState, type FocusEvent } from "react";
import { createPortal } from "react-dom";

export default function FeedbackContentPreview({ content }: { content: string }) {
  const id = useId();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  function show(element: HTMLElement) {
    if (element.scrollHeight > element.clientHeight) setAnchor(element.getBoundingClientRect());
  }
  function blur(event: FocusEvent) {
    if (!event.currentTarget.contains(event.relatedTarget)) setAnchor(null);
  }
  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const scroll = (event: Event) => {
      if (!(event.target instanceof Element && event.target.closest(".feedback-content-tooltip"))) close();
    };
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", escape);
    };
  }, [anchor]);
  const above = anchor && anchor.top > window.innerHeight - anchor.bottom;
  const width = Math.min(420, window.innerWidth - 16);
  return <span onMouseLeave={() => setAnchor(null)} onBlur={blur}>
    <span className="feedback-content-preview" tabIndex={0} aria-describedby={anchor ? id : undefined}
      onMouseEnter={event => show(event.currentTarget)} onFocus={event => show(event.currentTarget)}>
      {content || "—"}
    </span>
    {anchor && createPortal(<span id={id} role="tooltip" className="feedback-content-tooltip"
      onClick={event => event.stopPropagation()}
      style={{
        width, left: Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8)),
        ...(above ? { bottom: window.innerHeight - anchor.top } : { top: anchor.bottom }),
        maxHeight: (above ? anchor.top : window.innerHeight - anchor.bottom) - 8,
      }}>{content}</span>, document.body)}
  </span>;
}
