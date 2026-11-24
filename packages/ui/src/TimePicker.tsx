import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Clock } from "lucide-react";
import "./time-picker.css";

const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const allMinutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const halfHourMinutes = ["00", "30"];

export function TimePicker({
  value,
  onChange,
  label,
  disabled = false,
  english = false,
  halfHourOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  english?: boolean;
  halfHourOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hour = "", minute = ""] = value.split(":");
  const minutes = halfHourOnly ? halfHourMinutes : allMinutes;
  return (
    <Popover.Root open={open && !disabled} onOpenChange={setOpen}>
      <div className="ct-time-picker">
        <input
          type="text"
          inputMode="numeric"
          placeholder="HH:mm"
          maxLength={5}
          aria-label={label}
          value={value}
          disabled={disabled}
          readOnly={halfHourOnly}
          tabIndex={halfHourOnly ? -1 : undefined}
          onClick={halfHourOnly ? () => setOpen(true) : undefined}
          onChange={halfHourOnly ? undefined : (event) => onChange(event.target.value)}
        />
        <Popover.Trigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={`${label} ${english ? "choose time" : "选择时间"}`}
          >
            <Clock size={16} />
          </button>
        </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Content
          className="ct-time-popup"
          sideOffset={6}
          align="start"
          collisionPadding={12}
          aria-label={label}
        >
          <div className="ct-time-popup-heading">
            {english ? "Choose time" : "选择时间"}
            <strong>{value || "--:--"}</strong>
          </div>
          <div className="ct-time-columns">
            {(["hour", "minute"] as const).map((part) => (
              <section key={part}>
                <strong>
                  {part === "hour"
                    ? english
                      ? "Hour"
                      : "小时"
                    : english
                      ? "Minute"
                      : "分钟"}
                </strong>
                <div className="ct-time-options">
                  {(part === "hour" ? hours : minutes).map((option) => (
                    <button
                      type="button"
                      key={option}
                      aria-label={`${option} ${part === "hour" ? (english ? "hour" : "时") : english ? "minute" : "分"}`}
                      aria-pressed={
                        (part === "hour" ? hour : minute) === option
                      }
                      ref={(node) => {
                        if (
                          node &&
                          (part === "hour" ? hour : minute) === option
                        )
                          node.scrollIntoView?.({ block: "nearest" });
                      }}
                      onClick={() => {
                        onChange(
                          part === "hour"
                            ? `${option}:${minutes.includes(minute) ? minute : "00"}`
                            : `${/^\d{2}$/.test(hour) && Number(hour) < 24 ? hour : "00"}:${option}`,
                        );
                        if (part === "minute") setOpen(false);
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
