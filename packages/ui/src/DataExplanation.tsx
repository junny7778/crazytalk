import type { ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { X } from "lucide-react";

export function DataExplanation({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="data-explanation-trigger"
          aria-label={`${title}：数据说明`}
        >
          数据说明
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="data-explanation-popover"
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          aria-label={`${title}数据说明`}
        >
          <div className="data-explanation-heading">
            <strong>{title} · 数据说明</strong>
            <Popover.Close
              className="data-explanation-close"
              aria-label="关闭数据说明"
            >
              <X size={14} />
            </Popover.Close>
          </div>
          <div className="data-explanation-body">{children}</div>
          <Popover.Arrow
            className="data-explanation-arrow"
            width={12}
            height={6}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
