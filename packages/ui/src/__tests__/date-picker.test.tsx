// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { DatePicker } from "../DatePicker";
import { Field, Modal } from "../index";
function Harness({
  mode = "date",
  initial = "2026-10-15",
  min,
  max,
  required = false,
}: {
  mode?: "date" | "month" | "datetime-local";
  initial?: string;
  min?: string;
  max?: string;
  required?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Field label="测试日期">
        <DatePicker
          mode={mode}
          value={value}
          min={min}
          max={max}
          required={required}
          onValueChange={setValue}
        />
      </Field>
      <output data-testid="value">{value}</output>
    </>
  );
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function open() {
  fireEvent.click(screen.getByRole("button", { name: "打开日期选择器" }));
}
it("selects a day from the shared panel, preserves ISO value, and closes", () => {
  render(<Harness />);
  open();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "2026-10-15" }),
  );
  expect(
    screen
      .getByRole("button", { name: "2026-10-15" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "2026-10-20" }));
  expect(screen.getByTestId("value").textContent).toBe("2026-10-20");
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("month selection supports year navigation and clear without browser controls", () => {
  render(<Harness mode="month" initial="2026-10" />);
  open();
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  fireEvent.click(screen.getByRole("button", { name: "2027-02" }));
  expect(screen.getByTestId("value").textContent).toBe("2027-02");
  open();
  fireEvent.click(screen.getByRole("button", { name: "清除" }));
  expect(screen.getByTestId("value").textContent).toBe("");
});
it("date and month bounds disable choices outside the existing range", () => {
  render(<Harness min="2026-10-10" max="2026-10-20" />);
  open();
  expect(
    screen.getByRole("button", { name: "2026-10-09" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: "2026-10-21" }).hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "2026-10-20" }));
  expect(screen.getByTestId("value").textContent).toBe("2026-10-20");
  cleanup();
  render(
    <Harness mode="month" initial="2026-10" min="2026-09" max="2026-11" />,
  );
  open();
  expect(
    screen.getByRole("button", { name: "2026-08" }).hasAttribute("disabled"),
  ).toBe(true);
});
it("datetime uses half-hour options and commits only after confirmation", () => {
  render(
    <Harness
      mode="datetime-local"
      initial="2026-10-15T09:00"
      min="2026-10-15T10:30"
    />,
  );
  open();
  const times = screen.getByRole("region", { name: "选择时间" });
  expect(
    within(times)
      .getByRole("button", { name: "10:00" })
      .hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "2026-10-16" }));
  fireEvent.click(within(times).getByRole("button", { name: "14:30" }));
  expect(screen.getByTestId("value").textContent).toBe("2026-10-15T09:00");
  fireEvent.click(screen.getByRole("button", { name: "确定" }));
  expect(screen.getByTestId("value").textContent).toBe("2026-10-16T14:30");
});
it("manual input rejects impossible days and out-of-range dates", () => {
  render(<Harness min="2026-01-01" max="2026-12-31" />);
  const input = screen.getByLabelText("测试日期");
  fireEvent.change(input, { target: { value: "2026-02-30" } });
  fireEvent.blur(input);
  expect(screen.getByTestId("value").textContent).toBe("2026-10-15");
  fireEvent.change(input, { target: { value: "2027-01-01" } });
  fireEvent.blur(input);
  expect(screen.getByTestId("value").textContent).toBe("2026-10-15");
  fireEvent.change(input, { target: { value: "2026-02-28" } });
  expect(screen.getByTestId("value").textContent).toBe("2026-02-28");
});
it("keyboard navigation moves calendar focus and selects with a click", () => {
  render(<Harness />);
  open();
  const day = screen.getByRole("button", { name: "2026-10-15" });
  day.focus();
  fireEvent.keyDown(day, { key: "ArrowRight" });
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "2026-10-16" }),
  );
  fireEvent.keyDown(document.activeElement || day, { key: "PageDown" });
  expect(screen.getByRole("button", { name: "2026-11-15" })).toBeTruthy();
});
it("required, disabled, and English controls retain their semantics", () => {
  render(<Harness required />);
  open();
  expect(screen.queryByRole("button", { name: "清除" })).toBeNull();
  cleanup();
  render(
    <DatePicker
      aria-label="Date"
      value=""
      onValueChange={() => {}}
      disabled
      language="en"
    />,
  );
  expect(screen.getByLabelText("Date").hasAttribute("disabled")).toBe(true);
  expect(
    screen
      .getByRole("button", { name: "Open calendar" })
      .hasAttribute("disabled"),
  ).toBe(true);
});
it("today shortcut respects bounds and leap days are available", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2028-02-15T12:00:00"));
  render(<Harness initial="2028-02-01" max="2028-02-10" />);
  open();
  expect(
    screen.getByRole("button", { name: "今天" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(screen.getByRole("button", { name: "2028-02-29" })).toBeTruthy();
});
it("calendar works inside a modal without closing the parent", async () => {
  render(
    <Modal open title="编辑日期" onClose={() => {}}>
      <Harness />
    </Modal>,
  );
  open();
  fireEvent.click(screen.getByRole("button", { name: "2026-10-18" }));
  expect(screen.getByRole("dialog", { name: "编辑日期" })).toBeTruthy();
  expect(screen.getByTestId("value").textContent).toBe("2026-10-18");
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByLabelText("测试日期")),
  );
});
