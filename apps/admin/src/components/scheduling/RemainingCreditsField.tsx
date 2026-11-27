import { getScheduleCredits } from "@crazytalk/shared";
import { useDemo } from "@crazytalk/shared/react";
import { Field } from "@crazytalk/ui";

export function RemainingCreditsField({ studentId }: { studentId: string }) {
  const { data } = useDemo();
  const credits = getScheduleCredits(data, studentId, 0, 1);
  return (
    <Field label="剩余待排课时">
      <input className="remaining-credits" disabled value={credits.unknownCount ? "待核实" : `${credits.available} 课时`} />
    </Field>

  );
}
