import { TimePicker } from "./TimePicker";
import { useRef, useState } from "react";
import { DatePicker } from "./DatePicker";
import { Copy, Plus, X } from "lucide-react";
import "./weekly-availability.css";

export type AvailabilityValue = {
  availability: { day: number; start: string; end: string }[];
  availabilityFrom: string;
  availabilityNote: string;
};

export function availabilityInputError(
  value: AvailabilityValue,
  language: "zh" | "en" = "zh",
) {
  for (const day of [1, 2, 3, 4, 5, 6, 0]) {
    const ranges = value.availability
      .filter((range) => range.day === day)
      .sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i];
      if (
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(range.start) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(range.end) ||
        range.start >= range.end
      )
        return language === "en"
          ? "Please choose an end time after the start time."
          : "请填写完整时间，结束时间需晚于开始时间。";
      if (i && ranges[i - 1].end > range.start)
        return language === "en"
          ? "Time ranges on the same day cannot overlap."
          : "同一天的时间段不能重叠，请调整后保存。";
    }
  }
  return "";
}

export function WeeklyAvailabilityEditor({
  value,
  onChange,
  disabled = false,
  language = "zh",
  heading,
}: {
  value: AvailabilityValue;
  onChange: (value: AvailabilityValue) => void;
  disabled?: boolean;
  language?: "zh" | "en";
  legacy?: boolean;
  heading?: string;
}) {
  const remembered = useRef<Record<number, AvailabilityValue["availability"]>>(
    {},
  );
  const [copyDay, setCopyDay] = useState<number | null>(null);
  const [targets, setTargets] = useState<number[]>([]);
  const week = [1, 2, 3, 4, 5, 6, 0];
  const english = language === "en";
  const days = english
    ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    : ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const updateRange = (
    index: number,
    change: { start?: string; end?: string },
  ) =>
    onChange({
      ...value,
      availability: value.availability.map((range, i) =>
        i === index ? { ...range, ...change } : range,
      ),
    });
  return (
    <div className="weekly-availability">
      <div className="weekly-availability-meta">
        <label>
          {english ? "Effective from (optional)" : "开始使用日期（选填）"}
          <DatePicker
            placeholder={
              english ? "Effective from (optional)" : "开始使用日期（选填）"
            }
            mode="date"
            language={language}
            value={value.availabilityFrom}
            disabled={disabled}
            onValueChange={(nextValue) =>
              onChange({ ...value, availabilityFrom: nextValue })
            }
          />
        </label>
      </div>
      {heading && <h2 className="weekly-availability-heading">{heading}</h2>}
      <p className="weekly-availability-hint">
        {english
          ? "Set your usual teaching hours for each day."
          : "按星期填写常规授课时间，每天可添加多段。"}
      </p>
      <details><summary>{english?"Weekly time grid":"按周历勾选时段"}</summary><div className="weekly-slot-grid"><table><thead><tr><th>{english?"Time":"时间"}</th>{week.map(d=><th key={d}>{days[d]}</th>)}</tr></thead>
      <tbody>{Array.from({length:30},(_,i)=>{
        const clock=(n:number)=>String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");
        const start=clock(7*60+i*30),end=clock(7*60+(i+1)*30);
        return <tr key={start}><th>{start}</th>{week.map(day=>{
          const ranges=value.availability.filter(r=>r.day===day && r.start<end && r.end>start);
          const covered=ranges.some(r=>r.start<=start && r.end>=end);
          return <td key={day}><label><input type="checkbox" aria-label={days[day]+" "+start} checked={covered} disabled={disabled} onChange={()=>{
            const next=value.availability.filter(r=>!ranges.includes(r));
            for(const r of ranges){if(r.start<start)next.push({...r,end:start});if(r.end>end)next.push({...r,start:end});}
            if(!covered)next.push({day,start,end});
            const merged:AvailabilityValue["availability"]=[];
            for(const r of next.sort((a,b)=>a.day-b.day || a.start.localeCompare(b.start))){
              const prev=merged[merged.length-1];if(prev?.day===r.day && prev.end===r.start)prev.end=r.end;else merged.push({...r});
            }
            onChange({...value,availability:merged});
          }}/></label></td>})}</tr>
      })}</tbody></table></div></details>
      <div
        className="weekly-availability-weekdays"
        role="group"
        aria-label={english ? "Teaching days" : "每周授课日"}
      >
        {week.map((day) => {
          const ranges = value.availability.filter(
            (range) => range.day === day,
          );
          return (
            <button
              type="button"
              key={day}
              disabled={disabled}
              aria-pressed={ranges.length > 0}
              onClick={() => {
                if (ranges.length) remembered.current[day] = ranges;
                onChange({
                  ...value,
                  availability: ranges.length
                    ? value.availability.filter((range) => range.day !== day)
                    : [
                        ...value.availability,
                        ...(remembered.current[day]?.length
                          ? remembered.current[day]
                          : [{ day, start: "17:00", end: "21:55" }]),
                      ],
                });
              }}
            >
              {days[day]}
            </button>
          );
        })}
      </div>
      {copyDay !== null && !disabled && (
        <div className="weekly-availability-copy">
          <strong>
            {english
              ? `Copy all ${days[copyDay]} ranges to`
              : `将${days[copyDay]}的全部时段复制到`}
          </strong>
          <div className="row wrap">
            {week
              .filter((day) => day !== copyDay)
              .map((day) => (
                <label key={day} className="select-row">
                  <input
                    type="checkbox"
                    checked={targets.includes(day)}
                    onChange={(e) =>
                      setTargets(
                        e.target.checked
                          ? [...targets, day]
                          : targets.filter((target) => target !== day),
                      )
                    }
                  />
                  {days[day]}
                </label>
              ))}
          </div>
          <small>
            {english
              ? "Replaces existing ranges on selected days. Changes take effect after saving."
              : "将覆盖所选日期的已有时段，保存可用时间后生效。"}
          </small>
          <div className="row">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={
                !targets.length ||
                !value.availability.some((range) => range.day === copyDay) ||
                Boolean(
                  availabilityInputError(
                    {
                      ...value,
                      availability: value.availability.filter(
                        (range) => range.day === copyDay,
                      ),
                    },
                    language,
                  ),
                )
              }
              onClick={() => {
                onChange({
                  ...value,
                  availability: [
                    ...value.availability.filter(
                      (range) => !targets.includes(range.day),
                    ),
                    ...targets.flatMap((day) =>
                      value.availability
                        .filter((range) => range.day === copyDay)
                        .map((range) => ({ ...range, day })),
                    ),
                  ],
                });
                setCopyDay(null);
                setTargets([]);
              }}
            >
              {english ? "Confirm copy" : "确认复制"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setCopyDay(null)}
            >
              {english ? "Cancel" : "取消"}
            </button>
          </div>
        </div>
      )}
      {!value.availability.length && (
        <p className="weekly-availability-empty">
          {english
            ? disabled
              ? "Usual teaching hours have not been set. Please contact your coordinator."
              : "Usual teaching hours have not been set. Select teaching days to get started."
            : disabled
              ? "尚未填写常规可用时间，请联系老师管理补充。"
              : "尚未填写常规可用时间，请先选择授课日。"}
        </p>
      )}
      <div className="weekly-availability-days">
        {week
          .filter((day) =>
            value.availability.some((range) => range.day === day),
          )
          .map((day) => {
            const ranges = value.availability
              .map((range, index) => ({ ...range, index }))
              .filter((range) => range.day === day);
            return (
              <div className="weekly-availability-day" key={day}>
                <div className="weekly-availability-card-heading">
                  <strong>{days[day]}</strong>
                  {!disabled && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      aria-label={`${days[day]} ${english ? "copy ranges" : "复制时段"}`}
                      onClick={() => {
                        setCopyDay(day);
                        setTargets([]);
                      }}
                    >
                      <Copy size={14} />
                      {english ? "Copy" : "复制到…"}
                    </button>
                  )}
                </div>
                <div className="weekly-availability-ranges">
                  {!ranges.length && (
                    <span className="weekly-availability-off">
                      {english
                        ? value.availability.length
                          ? "Off"
                          : "Not set"
                        : value.availability.length
                          ? "休息"
                          : "未填写"}
                    </span>
                  )}
                  {ranges.map((range, order) => (
                    <div
                      className="weekly-availability-range"
                      key={range.index}
                    >
                      <TimePicker
                        label={`${days[day]} ${english ? "start" : "开始时间"} ${order + 1}`}
                        value={range.start}
                        disabled={disabled}
                        english={english}
                        onChange={(time) =>
                          updateRange(range.index, { start: time })
                        }
                      />
                      <span aria-hidden="true">–</span>
                      <TimePicker
                        label={`${days[day]} ${english ? "end" : "结束时间"} ${order + 1}`}
                        value={range.end}
                        disabled={disabled}
                        english={english}
                        onChange={(time) =>
                          updateRange(range.index, { end: time })
                        }
                      />
                      {!disabled && (
                        <button
                          type="button"
                          className="weekly-availability-remove"
                          aria-label={`${english ? "Remove" : "删除"} ${days[day]} ${english ? "time range" : "时段"} ${order + 1}`}
                          onClick={() =>
                            onChange({
                              ...value,
                              availability: value.availability.filter(
                                (_, i) => i !== range.index,
                              ),
                            })
                          }
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {availabilityInputError(
                  { ...value, availability: ranges },
                  language,
                ) && (
                  <p className="danger" role="alert">
                    {availabilityInputError(
                      { ...value, availability: ranges },
                      language,
                    )}
                  </p>
                )}
                {!disabled && (
                  <button
                    type="button"
                    className="weekly-availability-add"
                    aria-label={`${days[day]} ${english ? "add time range" : "添加时段"}`}
                    onClick={() => {
                      const last = ranges.at(-1);
                      const start =
                        last && last.end < "23:00" ? last.end : "17:00";
                      onChange({
                        ...value,
                        availability: [
                          ...value.availability,
                          {
                            day,
                            start,
                            end: start < "21:55" ? "21:55" : "23:55",
                          },
                        ],
                      });
                    }}
                  >
                    <Plus size={14} />
                    <span>{english ? "Add" : "添加时段"}</span>
                  </button>
                )}
              </div>
            );
          })}
      </div>
      <div className="weekly-availability-meta">
        <label>
          {english ? "Notes (optional)" : "时间说明（选填）"}
          <textarea
            value={value.availabilityNote}
            disabled={disabled}
            rows={2}
            placeholder={
              english
                ? "Keep any original notes or special arrangements here."
                : "可保留原表说明，或补充特殊时间安排"
            }
            onChange={(event) =>
              onChange({ ...value, availabilityNote: event.target.value })
            }
          />
        </label>
      </div>
    </div>
  );
}
