import { useMemo, useState } from "react";
import { addDays, DEMO_TODAY, isAvailable, type DemoState } from "@crazytalk/shared";
import { Avatar, Badge, Button, useToast } from "@crazytalk/ui";
import { ChevronLeft, ChevronRight, Copy } from "lucide-react";

const weekDayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

function mondayOf(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

export default function TeacherFixedFreeView({
  data,
  teacherId,
}: {
  data: DemoState;
  teacherId: string;
}) {
  const toast = useToast();
  const [week, setWeek] = useState(() => mondayOf(DEMO_TODAY));
  const teacher = data.teachers.find((t) => t.id === teacherId);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(week, i)),
    [week],
  );

  const { startHour, endHour, slotsByDay, summaryLines } = useMemo(() => {
    if (!teacher) {
      return { startHour: 9, endHour: 22, slotsByDay: new Map<string, Set<string>>(), summaryLines: [] as string[] };
    }
    const openStarts = teacher.availability.map((a) => toMinutes(a.start));
    const openEnds = teacher.availability.map((a) => toMinutes(a.end));
    const minH = openStarts.length
      ? Math.max(6, Math.min(9, Math.floor(Math.min(...openStarts) / 60)))
      : 9;
    const maxH = openEnds.length
      ? Math.min(24, Math.max(21, Math.ceil(Math.max(...openEnds) / 60)))
      : 22;

    const map = new Map<string, Set<string>>();
    const lines: string[] = [];

    days.forEach((date, dayIndex) => {
      const openSet = new Set<string>();
      const contiguous: [number, number][] = [];
      for (let m = minH * 60; m < maxH * 60; m += 30) {
        const time = clock(m);
        const fixedFree = [0, 1, 2, 3].every(
          (w) =>
            isAvailable(
              data,
              teacherId,
              addDays(date, w * 7),
              time,
              25,
              undefined,
              undefined,
              false,
              true,
            ).length === 0,
        );
        if (fixedFree) {
          openSet.add(time);
          const last = contiguous.at(-1);
          if (last && last[1] === m) last[1] = m + 30;
          else contiguous.push([m, m + 30]);
        }
      }
      map.set(date, openSet);
      if (contiguous.length) {
        lines.push(
          `${weekDayLabels[dayIndex]}：${contiguous
            .map(([s, e]) => `${clock(s)}–${clock(e)}`)
            .join("、")}`,
        );
      }
    });

    return { startHour: minH, endHour: maxH, slotsByDay: map, summaryLines: lines };
  }, [data, teacher, teacherId, days]);

  if (!teacher) return null;
  const totalSlots = [...slotsByDay.values()].reduce((sum, set) => sum + set.size, 0);

  async function copySummary() {
    const header = `${teacher?.name} 可固定排课时间（${week} 起连续 4 周有效）：`;
    const body = summaryLines.length ? summaryLines.join("\n") : "暂无连续 4 周可固定空闲时段";
    try {
      await navigator.clipboard.writeText(`${header}\n${body}`);
      toast("已复制可固定空闲时间");
    } catch {
      toast("复制未成功，请手动选中复制");
    }
  }

  return (
    <section className="teacher-free-screenshot stack" aria-label="可固定空闲时间截图视图">
      <div className="teacher-free-banner">
        <div className="row gap-12">
          <Avatar name={teacher.name} size={44} />
          <div>
            <div className="row wrap">
              <strong>{teacher.name} · 可固定上课时间</strong>
              <Badge tone="success">剩余 {totalSlots} 个 30 分钟可固定时段</Badge>
            </div>
            <small className="muted">
              起始周 {week}（已校验连续 4 周均空闲，隐藏已约学员信息，可直接截图发给家长/学员；50 分钟课程需选连续两格）
            </small>
          </div>
        </div>
        <div className="row wrap">
          <Button
            size="sm"
            variant="ghost"
            aria-label="上一周"
            onClick={() => setWeek(addDays(week, -7))}
          >
            <ChevronLeft size={16} />
          </Button>
          <span className="muted">
            {week} – {days[6]}
          </span>
          <Button
            size="sm"
            variant="ghost"
            aria-label="下一周"
            onClick={() => setWeek(addDays(week, 7))}
          >
            <ChevronRight size={16} />
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void copySummary()}>
            <Copy size={14} />
            复制文字时段
          </Button>
        </div>
      </div>

      <div className="teacher-free-grid-wrap">
        <div
          className="teacher-free-grid"
          style={{
            gridTemplateColumns: `68px repeat(7, minmax(96px, 1fr))`,
          }}
        >
          <div className="teacher-free-head">时段</div>
          {days.map((day, idx) => (
            <div className="teacher-free-head" key={day}>
              <strong>{weekDayLabels[idx]}</strong>
              <small>{day.slice(5)}</small>
            </div>
          ))}
          {Array.from({ length: (endHour - startHour) * 2 }, (_, rowIdx) => {
            const m = startHour * 60 + rowIdx * 30;
            const time = clock(m);
            return (
              <div className="teacher-free-row" key={time} style={{ display: "contents" }}>
                <div className="teacher-free-time">{time}</div>
                {days.map((day) => {
                  const open = slotsByDay.get(day)?.has(time) ?? false;
                  return (
                    <div
                      key={`${day}-${time}`}
                      className={`teacher-free-cell ${open ? "is-open" : "is-closed"}`}
                      aria-label={`${day} ${time} ${open ? "可固定预约" : "不可固定"}`}
                    >
                      {open ? time : ""}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="teacher-free-summary inset">
        <strong>可固定时段文字汇总：</strong>
        {summaryLines.length ? (
          <p>{summaryLines.join("；")}</p>
        ) : (
          <p className="muted">当前周期内暂无连续 4 周均可固定的空闲时段。</p>
        )}
      </div>
    </section>
  );
}
