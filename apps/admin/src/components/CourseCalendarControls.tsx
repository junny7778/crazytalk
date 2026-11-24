import { CalendarDays, ChevronLeft, ChevronRight, List } from "lucide-react";
import { Button } from "@crazytalk/ui";
import { addDays, DEMO_TODAY } from "@crazytalk/shared";
import "./student-courses.css";
export function CourseViewSwitch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: "list" | "calendar") => void;
}) {
  return (
    <div className="sc-view-switch" aria-label="课程显示方式">
      {(["list", "calendar"] as const).map((view) => (
        <Button
          key={view}
          size="sm"
          aria-pressed={value === view}
          variant={value === view ? "primary" : "ghost"}
          onClick={() => onChange(view)}
        >
          {view === "list" ? <List size={14} /> : <CalendarDays size={14} />}
          {view === "list" ? "列表" : "日历"}
        </Button>
      ))}
    </div>
  );
}
export function CourseWeekNavigation({
  week,
  onChange,
}: {
  week: string;
  onChange: (week: string) => void;
}) {
  return (
    <div className="sc-week-toolbar">
      <div className="row">
        <Button
          size="sm"
          variant="ghost"
          aria-label="上一周"
          onClick={() => onChange(addDays(week, -7))}
        >
          <ChevronLeft size={15} />
        </Button>
        <strong>
          {week} — {addDays(week, 6)}
        </strong>
        <Button
          size="sm"
          variant="ghost"
          aria-label="下一周"
          onClick={() => onChange(addDays(week, 7))}
        >
          <ChevronRight size={15} />
        </Button>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          onChange(
            addDays(
              DEMO_TODAY,
              -((new Date(`${DEMO_TODAY}T12:00:00Z`).getUTCDay() + 6) % 7),
            ),
          )
        }
      >
        回到本周
      </Button>
    </div>
  );
}
