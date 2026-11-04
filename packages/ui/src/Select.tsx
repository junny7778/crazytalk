import React, {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, Search } from "lucide-react";

type Option = {
  value: string;
  label: string;
  disabled: boolean;
  index: number;
};
export type SelectProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "value" | "onChange" | "children"
> & {
  value: string | number;
  onValueChange: (value: string) => void;
  children: ReactNode;
  placeholder?: string;
  size?: "compact" | "form";
  searchable?: boolean;
  name?: string;
};
function text(nodes: ReactNode): string {
  return React.Children.toArray(nodes)
    .map((node) =>
      typeof node === "string" || typeof node === "number"
        ? String(node)
        : React.isValidElement<{ children?: ReactNode }>(node)
          ? text(node.props.children)
          : "",
    )
    .join("");
}
function optionsFrom(nodes: ReactNode): Option[] {
  const options: Option[] = [];
  function walk(children: ReactNode) {
    React.Children.forEach(children, (node) => {
      if (
        !React.isValidElement<{
          value?: string | number;
          label?: string;
          disabled?: boolean;
          children?: ReactNode;
        }>(node)
      )
        return;
      if (node.type === "option") {
        const label = node.props.label ?? text(node.props.children);
        options.push({
          value: String(node.props.value ?? label),
          label,
          disabled: !!node.props.disabled,
          index: options.length,
        });
      } else if (node.type === React.Fragment) walk(node.props.children);
    });
  }
  walk(nodes);
  return options;
}
export function Select({
  value,
  onValueChange,
  children,
  placeholder = "请选择",
  size = "compact",
  searchable: searchOverride,
  className = "",
  disabled,
  name,
  onKeyDown,
  ...props
}: SelectProps) {
  const options = useMemo(() => optionsFrom(children), [children]);
  const selected = options.find((o) => o.value === String(value));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeValue, setActive] = useState<string | undefined>();
  const [english, setEnglish] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const typed = useRef({ value: "", time: 0 });
  const tabDirection = useRef<1 | -1 | null>(null);
  const listId = useId();
  const searchId = useId();
  const searchable = searchOverride ?? options.length > 8;
  const filtered = options.filter((o) =>
    o.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const enabled = filtered.filter((o) => !o.disabled);
  const active = enabled.find((o) => o.value === activeValue) || enabled[0];
  const activeId = active ? `${listId}-${active.index}` : undefined;
  useEffect(() => {
    if (open && activeId) {
      const item = document.getElementById(activeId);
      item?.scrollIntoView?.({ block: "nearest" });
    }
  }, [open, activeId]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  function changeOpen(next: boolean) {
    setOpen(next);
    setQuery("");
    if (next) {
      setEnglish(
        (
          trigger.current?.closest("[lang]")?.getAttribute("lang") || "zh"
        ).startsWith("en"),
      );
      setActive(
        selected && !selected.disabled
          ? selected.value
          : options.find((o) => !o.disabled)?.value,
      );
    }
  }
  function choose(option: Option) {
    if (option.disabled) return;
    onValueChange(option.value);
    setOpen(false);
    setQuery("");
  }
  function keys(event: React.KeyboardEvent) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Tab") {
      event.preventDefault();
      tabDirection.current = event.shiftKey ? -1 : 1;
      setOpen(false);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const index = enabled.findIndex((o) => o.value === active?.value);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? enabled.length - 1
            : event.key === "ArrowDown"
              ? (index + 1) % enabled.length
              : (index - 1 + enabled.length) % enabled.length;
      setActive(enabled[next]?.value);
    } else if (event.key === "Enter" || (event.key === " " && !searchable)) {
      event.preventDefault();
      if (active) choose(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (
      !searchable &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      const now = Date.now();
      typed.current = {
        value:
          (now - typed.current.time < 700 ? typed.current.value : "") +
          event.key.toLocaleLowerCase(),
        time: now,
      };
      const found = enabled.find((o) =>
        o.label.toLocaleLowerCase().startsWith(typed.current.value),
      );
      if (found) setActive(found.value);
    }
  }
  return (
    <Popover.Root open={open} onOpenChange={changeOpen}>
      <Popover.Trigger asChild>
        <button
          {...props}
          ref={trigger}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          disabled={disabled}
          className={`ct-select-trigger ct-select-${size} ${className}`}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (
              !event.defaultPrevented &&
              ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)
            ) {
              event.preventDefault();
              changeOpen(true);
            }
          }}
        >
          <span
            className={`ct-select-value ${selected ? "" : "ct-select-placeholder"}`}
          >
            {selected?.label || placeholder}
          </span>
          <ChevronDown
            size={16}
            className="ct-select-chevron"
            aria-hidden="true"
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="ct-select-content"
          role="presentation"
          lang={english ? "en" : "zh"}
          sideOffset={8}
          collisionPadding={16}
          align="start"
          onCloseAutoFocus={(event) => {
            const direction = tabDirection.current;
            tabDirection.current = null;
            if (!direction || !trigger.current) return;
            event.preventDefault();
            const root = trigger.current.closest('[role="dialog"]') || document;
            const controls = Array.from(
              root.querySelectorAll<HTMLElement>(
                'button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),[tabindex]',
              ),
            ).filter(
              (element) =>
                element.tabIndex >= 0 &&
                !element.closest(
                  '.ct-select-content,[hidden],[aria-hidden="true"]',
                ) &&
                getComputedStyle(element).display !== "none" &&
                getComputedStyle(element).visibility !== "hidden",
            );
            const index = controls.indexOf(trigger.current);
            controls[
              (index + direction + controls.length) % controls.length
            ]?.focus();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (searchable) search.current?.focus();
            else list.current?.focus();
          }}
        >
          {searchable && (
            <div className="ct-select-search">
              <Search size={16} aria-hidden="true" />
              <input
                ref={search}
                id={searchId}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(undefined);
                }}
                onKeyDown={keys}
                aria-label={english ? "Search options" : "搜索选项"}
                placeholder={english ? "Search options" : "搜索选项"}
                aria-controls={listId}
                aria-activedescendant={activeId}
                autoComplete="off"
              />
            </div>
          )}
          <div
            className="ct-select-options"
            id={listId}
            ref={list}
            role="listbox"
            aria-label={props["aria-label"] || selected?.label || placeholder}
            tabIndex={searchable ? -1 : 0}
            aria-activedescendant={!searchable ? activeId : undefined}
            onKeyDown={keys}
          >
            {filtered.map((option) => (
              <button
                type="button"
                tabIndex={-1}
                key={`${option.index}-${option.value}`}
                id={`${listId}-${option.index}`}
                role="option"
                aria-selected={String(value) === option.value}
                aria-disabled={option.disabled || undefined}
                disabled={option.disabled}
                data-active={active?.value === option.value || undefined}
                className="ct-select-option"
                onPointerMove={() => {
                  if (!option.disabled) setActive(option.value);
                }}
                onClick={() => choose(option)}
              >
                <span>{option.label}</span>
                {String(value) === option.value && (
                  <Check size={16} aria-hidden="true" />
                )}
              </button>
            ))}
            {!filtered.length && (
              <p className="ct-select-empty" role="status">
                {english ? "No matching options" : "没有匹配选项"}
              </p>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
      {name && (
        <input type="hidden" name={name} value={value} disabled={disabled} />
      )}
    </Popover.Root>
  );
}
