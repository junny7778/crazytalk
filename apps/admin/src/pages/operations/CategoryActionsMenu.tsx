import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { Button } from "@crazytalk/ui";

export default function CategoryActionsMenu({
  name,
  enabled,
  onMove,
  onToggle,
  onDelete,
}: {
  name: string;
  enabled: boolean;
  onMove: () => void;
  onToggle: () => void;
  onDelete?: () => void;
}) {
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = () => {
    setPosition(null);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector("button")?.focus();
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menu.current?.contains(event.target) &&
        !trigger.current?.contains(event.target)
      )
        setPosition(null);
    };
    const hide = () => setPosition(null);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [position]);
  return (
    <>
      <Button
        size="xs"
        aria-haspopup="menu"
        aria-expanded={!!position}
        onClick={(event) => {
          trigger.current = event.currentTarget;
          const rect = trigger.current?.getBoundingClientRect();
          if (rect)
            setPosition(
              position
                ? null
                : {
                    top:
                      rect.bottom + 144 > window.innerHeight
                        ? Math.max(8, rect.top - 144)
                        : rect.bottom + 4,
                    left: Math.max(
                      8,
                      Math.min(rect.right - 140, window.innerWidth - 148),
                    ),
                  },
            );
        }}
      >
        更多
        <ChevronDown size={12} />
      </Button>
      {position &&
        createPortal(
          <div
            ref={menu}
            className="dropdown settings-category-popup"
            role="menu"
            aria-label={`${name}操作`}
            style={position}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                close();
              }
              if (event.key === "Tab") setPosition(null);
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                const items = Array.from(
                  menu.current?.querySelectorAll("button") || [],
                );
                const index = items.findIndex(
                  (item) => item === document.activeElement,
                );
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? items.length - 1
                      : (index +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          items.length) %
                        items.length;
                items[next]?.focus();
              }
            }}
          >
            <button
              role="menuitem"
              onClick={() => {
                setPosition(null);
                onMove();
              }}
            >
              调整归属
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setPosition(null);
                onToggle();
              }}
            >
              {enabled ? "停用分类" : "启用分类"}
            </button>
            {onDelete && (
              <button
                role="menuitem"
                className="settings-category-delete"
                onClick={() => {
                  setPosition(null);
                  onDelete();
                }}
              >
                删除分类
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
