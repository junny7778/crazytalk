import {
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import "./date-picker.css";

type Mode = "date" | "month" | "datetime-local";
export type DatePickerProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "onChange" | "min" | "max" | "size"
> & {
  mode?: Mode;
  value: string;
  onValueChange: (value: string) => void;
  min?: string;
  max?: string;
  language?: "zh" | "en";
};
const pad = (n: number) => String(n).padStart(2, "0");
const dayValue = (date: Date) =>
  `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
function valid(value: string, mode: Mode) {
  const pattern =
    mode === "month"
      ? /^\d{4}-\d{2}$/
      : mode === "date"
        ? /^\d{4}-\d{2}-\d{2}$/
        : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  if (!pattern.test(value)) return false;
  const date = new Date(`${value.slice(0, 7)}-01T12:00:00`);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() < 1 ||
    date.getMonth() + 1 !== Number(value.slice(5, 7))
  )
    return false;
  if (mode !== "month") {
    date.setDate(Number(value.slice(8, 10)));
    if (dayValue(date) !== value.slice(0, 10)) return false;
  }
  return (
    mode !== "datetime-local" ||
    (Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60)
  );
}
export function DatePicker({
  mode = "date",
  value,
  onValueChange,
  min,
  max,
  language,
  className = "",
  disabled,
  readOnly,
  onKeyDown,
  onBlur,
  ...props
}: DatePickerProps) {
  const generatedId = useId();
  const inputId = props.id || generatedId;
  const panelId = useId();
  const input = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [english, setEnglish] = useState(language === "en");
  const [cursor, setCursor] = useState(new Date());
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const [pending, setPending] = useState("");
  const [focusGrid, setFocusGrid] = useState(false);
  useEffect(() => {
    setText(value);
  }, [value]);
  useEffect(() => {
    if (open && focusGrid && grid.current) {
      (
        grid.current?.querySelector<HTMLButtonElement>(
          'button[aria-pressed="true"]:not(:disabled)',
        ) ||
        grid.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      )?.focus();
      setFocusGrid(false);
    }
  }, [open, cursor, view, focusGrid]);
  const today = dayValue(new Date());
  const current =
    mode === "month"
      ? today.slice(0, 7)
      : mode === "date"
        ? today
        : `${today}T${pad(new Date().getHours())}:${pad(Math.floor(new Date().getMinutes() / 30) * 30)}`;
  const allowed = (next: string) =>
    valid(next, mode) && (!min || next >= min) && (!max || next <= max);
  function changeOpen(next: boolean) {
    if (next && (disabled || readOnly)) return;
    if (next) {
      setEnglish(
        language ? language === "en" : !!input.current?.closest('[lang="en"]'),
      );
      const initial = valid(value, mode)
        ? value
        : min && current < min
          ? min
          : max && current > max
            ? max
            : current;
      setCursor(new Date(`${initial.slice(0, 7)}-01T12:00:00`));
      setPending(mode === "datetime-local" ? initial : "");
      setView(mode === "month" ? "months" : "days");
    }
    setOpen(next);
  }
  function commit(next: string) {
    if ((next === "" && !props.required) || allowed(next)) {
      onValueChange(next);
      setText(next);
      setOpen(false);
    }
  }
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  function navigate(direction: number) {
    const next = new Date(cursor);
    if (view === "days") next.setMonth(month + direction);
    else next.setFullYear(year + direction * (view === "years" ? 12 : 1));
    if (next.getFullYear() >= 1 && next.getFullYear() <= 9999) setCursor(next);
  }
  function intersects(start: string, end: string) {
    const length = mode === "month" ? 7 : 10;
    return (
      (!min || end >= min.slice(0, length)) &&
      (!max || start <= max.slice(0, length))
    );
  }
  const first = new Date(year, month, 1, 12);
  first.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(first);
    date.setDate(first.getDate() + i);
    return date;
  });
  const yearStart = Math.max(1, Math.floor((year - 1) / 12) * 12 + 1);
  const locale = english ? "en" : "zh-CN";
  const label =
    mode === "month"
      ? english
        ? "Choose month"
        : "选择月份"
      : mode === "datetime-local"
        ? english
          ? "Choose date and time"
          : "选择日期时间"
        : english
          ? "Choose date"
          : "选择日期";
  function chooseDay(next: string) {
    if (mode === "datetime-local") {
      let candidate = `${next}T${pending.slice(11) || "09:00"}`;
      if (min && candidate < min && next === min.slice(0, 10)) candidate = min;
      if (max && candidate > max && next === max.slice(0, 10)) candidate = max;
      setPending(candidate);
      setCursor(new Date(`${next.slice(0, 7)}-01T12:00:00`));
    } else commit(next);
  }
  return (
    <Popover.Root open={open} onOpenChange={changeOpen}>
      <Popover.Anchor asChild>
        <div
          className={`ct-date-picker ${className}`}
          data-disabled={disabled || readOnly || undefined}
        >
          <input
            {...props}
            ref={input}
            id={inputId}
            type="text"
            value={text}
            disabled={disabled}
            readOnly={readOnly}
            placeholder={
              props.placeholder ||
              (mode === "month"
                ? "YYYY-MM"
                : mode === "date"
                  ? "YYYY-MM-DD"
                  : "YYYY-MM-DDTHH:mm")
            }
            autoComplete="off"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            onClick={() => changeOpen(true)}
            onChange={(event) => {
              const next = event.target.value;
              setText(next);
              if ((next === "" && !props.required) || allowed(next)) {
                onValueChange(next);
                input.current?.setCustomValidity("");
              }
            }}
            onBlur={(event) => {
              if (text && !allowed(text)) {
                setText(value);
                input.current?.setCustomValidity("");
              }
              onBlur?.(event);
            }}
            onKeyDown={(event) => {
              onKeyDown?.(event);
              if (event.defaultPrevented) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                changeOpen(true);
                setFocusGrid(true);
              }
              if (event.key === "Escape") {
                setOpen(false);
                setText(value);
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (allowed(text)) commit(text);
                else {
                  changeOpen(true);
                  setFocusGrid(true);
                }
              }
            }}
          />
          <button
            type="button"
            className="ct-date-trigger"
            disabled={disabled || readOnly}
            aria-label={english ? "Open calendar" : "打开日期选择器"}
            aria-expanded={open}
            onClick={() => {
              changeOpen(!open);
              setFocusGrid(true);
            }}
          >
            <CalendarDays size={16} aria-hidden="true" />
          </button>
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          id={panelId}
          className="ct-date-content"
          aria-label={label}
          lang={locale}
          align="start"
          sideOffset={8}
          collisionPadding={12}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (focusGrid) {
              (
                grid.current?.querySelector<HTMLButtonElement>(
                  'button[aria-pressed="true"]:not(:disabled)',
                ) ||
                grid.current?.querySelector<HTMLButtonElement>(
                  "button:not(:disabled)",
                )
              )?.focus();
              setFocusGrid(false);
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            input.current?.focus();
          }}
        >
          <header className="ct-date-heading">
            <button
              type="button"
              aria-label={english ? "Previous" : "上一页"}
              onClick={() => navigate(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="ct-date-period"
              onClick={() => {
                setView(
                  view === "days"
                    ? "months"
                    : view === "months"
                      ? "years"
                      : mode === "month"
                        ? "months"
                        : "days",
                );
                setFocusGrid(true);
              }}
            >
              {view === "years"
                ? `${yearStart}–${Math.min(yearStart + 11, 9999)}`
                : view === "months"
                  ? `${year}${english ? "" : "年"}`
                  : cursor.toLocaleDateString(locale, {
                      year: "numeric",
                      month: "long",
                    })}
            </button>
            <button
              type="button"
              aria-label={english ? "Next" : "下一页"}
              onClick={() => navigate(1)}
            >
              <ChevronRight size={16} />
            </button>
          </header>
          {view === "days" && (
            <div className="ct-date-weekdays" aria-hidden="true">
              {(english
                ? ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
                : ["一", "二", "三", "四", "五", "六", "日"]
              ).map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
          )}
          <div
            ref={grid}
            className={`ct-date-grid ct-date-grid-${view}`}
            onKeyDown={(event) => {
              if (!(event.target instanceof HTMLButtonElement)) return;
              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button",
                ),
              );
              const at = buttons.indexOf(event.target),
                columns = view === "days" ? 7 : 3;
              let next = at;
              if (event.key === "ArrowRight") next++;
              else if (event.key === "ArrowLeft") next--;
              else if (event.key === "ArrowDown") next += columns;
              else if (event.key === "ArrowUp") next -= columns;
              else if (event.key === "Home") next -= at % columns;
              else if (event.key === "End")
                next += columns - 1 - (at % columns);
              else if (event.key === "PageUp" || event.key === "PageDown") {
                event.preventDefault();
                navigate(event.key === "PageUp" ? -1 : 1);
                setFocusGrid(true);
                return;
              } else return;
              event.preventDefault();
              if (buttons[next] && !buttons[next].disabled)
                buttons[next].focus();
            }}
          >
            {view === "days" &&
              days.map((date) => {
                const key = dayValue(date),
                  selected =
                    (mode === "datetime-local" ? pending : value).slice(
                      0,
                      10,
                    ) === key;
                return (
                  <button
                    type="button"
                    key={key}
                    aria-label={key}
                    aria-pressed={selected}
                    aria-current={key === today ? "date" : undefined}
                    data-outside={date.getMonth() !== month || undefined}
                    disabled={!intersects(key, key)}
                    onClick={() => chooseDay(key)}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            {view === "months" &&
              Array.from({ length: 12 }, (_, i) => {
                const key = `${String(year).padStart(4, "0")}-${pad(i + 1)}`;
                const end = dayValue(new Date(year, i + 1, 0, 12));
                return (
                  <button
                    type="button"
                    key={key}
                    aria-label={key}
                    aria-pressed={value.slice(0, 7) === key}
                    data-today={today.slice(0, 7) === key || undefined}
                    disabled={
                      !intersects(
                        mode === "month" ? key : `${key}-01`,
                        mode === "month" ? key : end,
                      )
                    }
                    onClick={() => {
                      if (mode === "month") commit(key);
                      else {
                        setCursor(new Date(year, i, 1, 12));
                        setView("days");
                        setFocusGrid(true);
                      }
                    }}
                  >
                    {new Date(year, i, 1).toLocaleDateString(locale, {
                      month: "short",
                    })}
                  </button>
                );
              })}
            {view === "years" &&
              Array.from({ length: 12 }, (_, i) => yearStart + i)
                .filter((y) => y <= 9999)
                .map((y) => (
                  <button
                    type="button"
                    key={y}
                    aria-pressed={y === year}
                    disabled={
                      !intersects(
                        `${y}-01${mode === "month" ? "" : "-01"}`,
                        `${y}-12${mode === "month" ? "" : "-31"}`,
                      )
                    }
                    onClick={() => {
                      const next = new Date(cursor);
                      next.setFullYear(y);
                      setCursor(next);
                      setView("months");
                      setFocusGrid(true);
                    }}
                  >
                    {y}
                  </button>
                ))}
          </div>
          {mode === "datetime-local" && (
            <section
              className="ct-date-time"
              aria-label={english ? "Time" : "选择时间"}
            >
              <p>{pending.replace("T", " ")}</p>
              <div>
                {Array.from(
                  { length: 48 },
                  (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 ? "30" : "00"}`,
                ).map((time) => (
                  <button
                    type="button"
                    key={time}
                    aria-pressed={pending.slice(11) === time}
                    disabled={!allowed(`${pending.slice(0, 10)}T${time}`)}
                    onClick={() =>
                      setPending(`${pending.slice(0, 10)}T${time}`)
                    }
                  >
                    {time}
                  </button>
                ))}
              </div>
            </section>
          )}
          <footer className="ct-date-footer">
            {!props.required && (
              <button type="button" onClick={() => commit("")}>
                {english ? "Clear" : "清除"}
              </button>
            )}
            <button
              type="button"
              disabled={!allowed(current)}
              onClick={() => {
                if (mode === "datetime-local") {
                  setPending(current);
                  setCursor(new Date(`${today.slice(0, 7)}-01T12:00:00`));
                } else commit(current);
              }}
            >
              {english
                ? mode === "month"
                  ? "This month"
                  : "Today"
                : mode === "month"
                  ? "本月"
                  : "今天"}
            </button>
            {mode === "datetime-local" && (
              <button
                type="button"
                disabled={!allowed(pending)}
                onClick={() => commit(pending)}
              >
                {english ? "Confirm" : "确定"}
              </button>
            )}
          </footer>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
