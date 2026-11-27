import * as Popover from "@radix-ui/react-popover";
import { TimePicker } from "./TimePicker";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  studentIntent = false,
}: {
  value: AvailabilityValue;
  onChange: (value: AvailabilityValue) => void;
  disabled?: boolean;
  language?: "zh" | "en";
  legacy?: boolean;
  heading?: string;
  studentIntent?: boolean;
}) {
  const remembered = useRef<Record<number, AvailabilityValue["availability"]>>(
    {},
  );
  const [mode, setMode] = useState<"day" | "grid">("grid");
  const [editing, setEditing] = useState<{ day: number; row: number; indices: number[] } | null>(null);
  const [copyDay, setCopyDay] = useState<number | null>(null);
  const [targets, setTargets] = useState<number[]>([]);
  const week = [1, 2, 3, 4, 5, 6, 0];
  const english = language === "en";
  const days = english
    ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    : ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const gridRange = (range: AvailabilityValue["availability"][number]) =>
    range.start < range.end &&
    /^(?:[01]\d|2[0-3]):(?:00|30)$/.test(range.start) && (/^(?:[01]\d|2[0-3]):(?:00|30)$/.test(range.end) || range.end === "23:59");
  const copyHasExactTime = value.availability.some(range =>
    range.day === copyDay && [range.start, range.end].some(time => !/:(00|30)$/.test(time))
  );
  const exactRanges = value.availability.filter(range => !gridRange(range));
  const grid = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const body = grid.current;
    if (!body) return;
    const first = body.querySelector('tbody button[aria-pressed="true"]')?.closest("tr");
    const defaultRow = body.querySelectorAll("tbody tr")[14];
    const header = body.querySelector("thead");
    const row = first || defaultRow;
    if (header && row) {
      body.scrollTop += row.getBoundingClientRect().top -
        body.getBoundingClientRect().top - header.getBoundingClientRect().height;
    }
  }, [mode]);
  const drag = useRef<{day:number;row:number;select:boolean;base:AvailabilityValue} | null>(null);
  useEffect(() => {
    const stop = () => { drag.current = null; };
    window.addEventListener("mouseup", stop);
    window.addEventListener("blur", stop);
    return () => { window.removeEventListener("mouseup", stop); window.removeEventListener("blur", stop); };
  }, []);
  const clock = (row:number) => row === 48 ? "23:59" : String(Math.floor(row / 2)).padStart(2,"0") + (row % 2 ? ":30" : ":00");
  function paint(day:number,row:number) {
    const selection=drag.current;
    if(!selection) return;
    const base=selection.base;
    const exact=base.availability.filter(range=>!gridRange(range));
    const next:AvailabilityValue["availability"]=[...exact];
    for(const d of week) {
      for(let r=0;r<48;r++) {
        const start=clock(r),end=clock(r+1);
        if(exact.some(range=>range.day===d && range.start<end && range.end>start)) continue;
        let selected=base.availability.some(range=>gridRange(range) && range.day===d && range.start<=start && range.end>=end);
        if(week.indexOf(d)>=Math.min(week.indexOf(day),week.indexOf(selection.day)) && week.indexOf(d)<=Math.max(week.indexOf(day),week.indexOf(selection.day)) && r>=Math.min(row,selection.row) && r<=Math.max(row,selection.row)) selected=selection.select;
        if(selected) {
          const previous=next[next.length-1];
          if(previous && gridRange(previous) && previous.day===d && previous.end===start) previous.end=end;
          else next.push({day:d,start,end});
        }
      }
    }
    onChange({...base,availability:next.sort((a,b)=>a.day-b.day || a.start.localeCompare(b.start))});
  }
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
      {heading && <h2 className="weekly-availability-heading">{heading}</h2>}
      <div className="weekly-availability-modes" role="group" aria-label={english ? "Availability entry mode" : "时间填写方式"}>
        <button type="button" aria-pressed={mode === "grid"} onClick={() => {setMode("grid");setCopyDay(null);}}>{english ? "Weekly grid" : "周历勾选"}</button>
        <button type="button" aria-pressed={mode === "day"} onClick={() => { setEditing(null); setMode("day"); }}>{english ? "By day" : "按星期填写"}</button>
      </div>
      <p className="weekly-availability-hint">{mode === "day"
        ? english ? "Choose start and end times on the hour or half hour." : "开始和结束时间可选整点或半点，每天可添加多段。"
        : english ? "Click or drag to toggle 30-minute slots. Click a labeled range to edit its exact times." : "点击或拖动勾选、取消半小时时段。点击带起止时间的格子可精确编辑。"}</p>
      {mode === "grid" ? <section className="weekly-calendar-picker" aria-label={english ? "Weekly availability grid" : "每周可用时间周历"}>
        <div className="weekly-slot-grid" ref={grid}><table><thead><tr><th>{english ? "Time" : "时间"}</th>{week.map(day=><th key={day}>{days[day]}</th>)}</tr></thead>
          <tbody>{Array.from({length:48},(_,i)=>{
            const start=clock(i),end=clock(i+1);
            return <tr key={start}><th>{start}</th>{week.map(day=>{
              const ranges=value.availability.filter(range=>gridRange(range) && range.day===day && range.start<end && range.end>start);
              const precise = exactRanges.filter(range => range.day === day && range.start < end && range.end > start);
              const editingHere = editing?.day === day && editing.row === i;
              if (precise.length || editingHere) return <td key={day}>
                <Popover.Root open={editingHere} onOpenChange={open =>
                  setEditing(open ? { day, row: i, indices: precise.map(range => value.availability.indexOf(range)) } : null)
                }>
                  <Popover.Trigger asChild>
                    <button type="button" className="weekly-slot-cell weekly-slot-exact" aria-label={days[day]+" "+start} aria-pressed={precise.length > 0} disabled={disabled}>
                      {precise.map(range => <span key={range.start}>{range.start}–{range.end}</span>)}
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content className="ct-time-popup weekly-exact-editor" sideOffset={6} aria-label={days[day]}>
                      <strong>{days[day]}</strong>
                      {editingHere && editing.indices.map(index => {
                        const range = value.availability[index];
                        return <div className="weekly-availability-range" key={index}>
                          <TimePicker label={english ? "Start time" : "开始时间"} value={range.start} onChange={start => updateRange(index, { start })} english={english} />
                          <TimePicker label={english ? "End time" : "结束时间"} value={range.end} onChange={end => updateRange(index, { end })} english={english} />
                          <button type="button" className="weekly-availability-remove" aria-label={english ? "Remove range" : "移除时段"}
                            onClick={() => { setEditing(null); onChange({...value, availability: value.availability.filter((_, i) => i !== index)}); }}><X size={16} /></button>
                        </div>;
                      })}
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              </td>;
              const covered=ranges.some(range=>range.start<=start && range.end>=end);
              return <td key={day}><button type="button" className="weekly-slot-cell" aria-label={days[day]+" "+start} aria-pressed={covered} disabled={disabled}
                title={ranges.map(range => `${range.start}–${range.end}`).join("、") || undefined}
                onMouseDown={event=>{if(event.button!==0)return;event.preventDefault();drag.current={day,row:i,select:!covered,base:value};paint(day,i);}}
                onMouseEnter={()=>{if(drag.current)paint(day,i);}}
                onClick={event=>{if(event.detail===0){drag.current={day,row:i,select:!covered,base:value};paint(day,i);drag.current=null;}}}
              >{covered ? "✓" : ""}</button></td>;

            })}</tr>;
          })}</tbody>
        </table></div>
      </section> : <>
      <div
        className="weekly-availability-weekdays"
        role="group"
        aria-label={studentIntent ? "每周上课日" : english ? "Teaching days" : "每周授课日"}
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
                          : [{ day, start: "17:00", end: "22:00" }]),
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
              : studentIntent ? "将覆盖所选日期的已有时段，生成排课方案后保存。" : "将覆盖所选日期的已有时段，保存可用时间后生效。"}
          </small>
          {copyHasExactTime && <p role="alert">{english ? "Choose whole or half hours for this day before copying." : "请先将当天的起止时间调整为整点或半点，再复制。"}</p>}
          <div className="row">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={
                copyHasExactTime ||
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
          {studentIntent ? "请先选择学员的意向上课日。" : english
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
                        halfHourOnly
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
                        halfHourOnly
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
                        last && last.end <= "23:00"
                          ? clock(Number(last.end.slice(0, 2)) * 2 + Math.ceil(Number(last.end.slice(3)) / 30))
                          : "17:00";
                      onChange({
                        ...value,
                        availability: [
                          ...value.availability,
                          {
                            day,
                            start,
                            end: start < "22:00" ? "22:00" : "23:30",
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
      </>}
      {!studentIntent && <div className="weekly-availability-meta">
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
      </div>}
    </div>
  );
}
