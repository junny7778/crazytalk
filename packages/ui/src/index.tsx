import { Select } from "./Select";
import { DatePicker } from "./DatePicker";
export { DatePicker } from "./DatePicker";
export type { DatePickerProps } from "./DatePicker";
export { Select } from "./Select";
export {
  WeeklyAvailabilityEditor,
  availabilityInputError,
} from "./WeeklyAvailabilityEditor";
export type { AvailabilityValue } from "./WeeklyAvailabilityEditor";
import React, {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  Search,
  Check,
  AlertCircle,
  ArrowUpRight,
  Inbox,
  Loader2,
} from "lucide-react";
export { tokens } from "./tokens";
export function Button({
  variant = "secondary",
  size,
  loading,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "danger-solid";
  size?: "sm" | "xs";
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${size ? `btn-${size}` : ""} ${className}`}
      {...props}
      disabled={props.disabled || loading}
    >
      {loading && <Loader2 size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function Panel({
  children,
  className = "",
  title,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="row gap-12">{action}</div>
    </div>
  );
}
export function defaultAvatarSource(name: string) {
  const identity = name
    .trim()
    .replace(/^T\.\s*/, "")
    .toLowerCase();
  const hash = Array.from(identity).reduce(
    (value, character) => Math.imul(value ^ character.charCodeAt(0), 16777619),
    2166136261,
  );
  return `/avatars/avatar-${((hash >>> 0) % 4) + 1}.webp`;
}
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const source = defaultAvatarSource(name);
  return (
    <span
      className="avatar"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <img
        src={source}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = "搜索",
  label,
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <label className="search-input">
      <Search size={16} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label || placeholder}
      />
      {value && (
        <button aria-label="清除搜索" onClick={() => onChange("")}>
          <X size={14} />
        </button>
      )}
    </label>
  );
}
export function Tabs({
  items,
  value,
  onChange,
  variant = "segment",
}: {
  items: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (v: string) => void;
  variant?: "segment" | "underline" | "chips";
}) {
  return (
    <div className={`tabs tabs-${variant}`} role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={value === item.value}
          className={value === item.value ? "active" : ""}
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {item.count !== undefined && (
            <span className="tab-count">{item.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
export function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  const fieldId = React.useId();
  function annotate(nodes: ReactNode): ReactNode {
    return React.Children.map(nodes, (node) => {
      if (!React.isValidElement<Record<string, unknown>>(node)) return node;
      if (
        node.type === "input" &&
        ["checkbox", "radio"].includes(String(node.props.type))
      )
        return node;
      if (
        node.type === Select ||
        node.type === DatePicker ||
        (typeof node.type === "string" &&
          ["input", "textarea"].includes(node.type))
      )
        return React.cloneElement(node, {
          "aria-label": node.props["aria-label"] || label,
          id: node.props.id || fieldId,
          "aria-invalid": !!error,
        });
      if (typeof node.type === "string" && node.props.children)
        return React.cloneElement(node, {
          children: annotate(node.props.children as ReactNode),
        });
      return node;
    });
  }
  return (
    <div className={`field ${error ? "field-error" : ""}`}>
      <label htmlFor={fieldId}>
        {label}
        {required && <b className="danger"> *</b>}
      </label>
      {annotate(children)}
      {error ? (
        <small className="danger" role="alert">
          {error}
        </small>
      ) : (
        hint && <small>{hint}</small>
      )}
    </div>
  );
}
export function EmptyState({
  title = "暂时没有内容",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Inbox size={32} />
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function StatCard({
  title,
  label,
  value,
  note,
  trend,
  onClick,
  children,
  variant = "standard",
}: {
  title?: string;
  variant?: "standard" | "dashboard" | "dashboard-featured";
  label: string;
  value: ReactNode;
  note?: ReactNode;
  trend?: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      className={`stat-card ${variant !== "standard" ? "dashboard-stat" : ""} ${variant === "dashboard-featured" ? "dashboard-stat-featured" : ""}`}
      onClick={onClick}
      disabled={!onClick}
    >
      <div className="row between">
        <span>{label}</span>
        {onClick && (
          <span className="stat-arrow">
            <ArrowUpRight size={variant === "standard" ? 15 : 19} />
          </span>
        )}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">
        {trend && <span className="success">{trend} </span>}
        {note}
      </div>
      {children}
    </button>
  );
}
function Overlay({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 560,
  drawer = false,
  closeLabel = "关闭",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  drawer?: boolean;
  closeLabel?: string;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className={`overlay ${drawer ? "drawer-overlay" : ""}`}
        />
        <Dialog.Content
          className={drawer ? "drawer" : "modal"}
          style={{ "--overlay-width": `${width}px` } as React.CSSProperties}
          aria-describedby={description ? "overlay-description" : undefined}
        >
          <header className="overlay-header">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              {description && (
                <Dialog.Description id="overlay-description">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" aria-label={closeLabel}>
                <X size={20} />
              </button>
            </Dialog.Close>
          </header>
          <div className="overlay-body">{children}</div>
          {footer && <footer className="overlay-footer">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Modal(props: React.ComponentProps<typeof Overlay>) {
  return <Overlay {...props} />;
}
export function Drawer(props: React.ComponentProps<typeof Overlay>) {
  return <Overlay {...props} drawer />;
}
type Toast = {
  id: number;
  message: string;
  tone: "success" | "error" | "info";
  undo?: () => void;
};
const ToastContext = createContext<
  (
    message: string,
    options?: { tone?: Toast["tone"]; undo?: () => void },
  ) => void
>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  function show(
    message: string,
    options?: { tone?: Toast["tone"]; undo?: () => void },
  ) {
    const id = Date.now() + Math.random();
    setItems((s) => [
      ...s,
      { id, message, tone: options?.tone || "success", undo: options?.undo },
    ]);
    setTimeout(
      () => setItems((s) => s.filter((t) => t.id !== id)),
      options?.undo ? 10000 : 4200,
    );
  }
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((item) => (
          <div className={`toast toast-${item.tone}`} key={item.id}>
            {item.tone === "error" ? (
              <AlertCircle size={22} />
            ) : (
              <Check size={22} />
            )}
            <span>{item.message}</span>
            {item.undo && (
              <button
                onClick={() => {
                  item.undo?.();
                  setItems((s) => s.filter((t) => t.id !== item.id));
                }}
              >
                撤销
              </button>
            )}
            <button
              aria-label="关闭提示"
              onClick={() => setItems((s) => s.filter((t) => t.id !== item.id))}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

export { DataExplanation } from "./DataExplanation";
