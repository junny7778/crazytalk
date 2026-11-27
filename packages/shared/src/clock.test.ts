import { expect, it, vi } from "vitest";
import { configureDemoClock, operationsNow } from "./clock";
import { payrollReadiness } from "./halfMonthPayroll";
import { schedulingNow } from "./model";

it("uses the system clock until the Demo enables its fixed reference time", () => {
  const systemTime = Date.parse("2026-12-01T09:00:00+08:00");
  const dateNow = vi.spyOn(Date, "now").mockReturnValue(systemTime);
  try {
    expect(operationsNow()).toBe(systemTime);
    expect(payrollReadiness([], "2026-11-2").canConfirm).toBe(true);

    configureDemoClock();

    const demoTime = Date.parse("2026-10-31T18:00:00+08:00");
    expect(operationsNow()).toBe(demoTime);
    expect(schedulingNow()).toBe(demoTime);
    expect(payrollReadiness([], "2026-10-2").canConfirm).toBe(true);
    expect(payrollReadiness([], "2026-11-2").canConfirm).toBe(false);
  } finally {
    dateNow.mockRestore();
  }
});
