// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Select, Field, Modal, Button } from "./index";
afterEach(cleanup);
function Example({
  long = false,
  disabled = false,
}: {
  long?: boolean;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("本周");
  return (
    <Field label="时间范围">
      <Select value={value} onValueChange={setValue} disabled={disabled}>
        {(long
          ? [
              "今天",
              "本周",
              "本月",
              ...Array.from({ length: 10 }, (_, i) => `周期 ${i + 1}`),
            ]
          : ["今天", "本周", "本月"]
        ).map((v) => (
          <option key={v}>{v}</option>
        ))}
      </Select>
    </Field>
  );
}
describe("统一选择框", () => {
  it("显示当前值，选择后更新并关闭，焦点回到触发器", async () => {
    render(<Example />);
    const trigger = screen.getByRole("combobox", { name: "时间范围" });
    expect(trigger.textContent).toContain("本周");
    fireEvent.click(trigger);
    expect(
      screen
        .getByRole("option", { name: "本周" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("option", { name: "本月" }));
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(trigger.textContent).toContain("本月");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
  it("支持方向键选择、Enter确认和Esc关闭", async () => {
    render(<Example />);
    const trigger = screen.getByRole("combobox");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const list = screen.getByRole("listbox");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "Enter" });
    await waitFor(() => expect(trigger.textContent).toContain("本月"));
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });
  it("超过8项出现搜索，支持无结果及清空，重新打开重置搜索", async () => {
    render(<Example long />);
    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);
    const search = screen.getByRole("textbox", { name: "搜索选项" });
    fireEvent.change(search, { target: { value: "周期 10" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.change(search, { target: { value: "不存在" } });
    expect(screen.getByRole("status").textContent).toBe("没有匹配选项");
    fireEvent.change(search, { target: { value: "" } });
    expect(screen.getAllByRole("option")).toHaveLength(13);
    fireEvent.keyDown(search, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    fireEvent.click(trigger);
    expect(
      screen.getByRole("textbox", { name: "搜索选项" }).getAttribute("value"),
    ).toBe("");
  });
  it("禁用时不可展开", () => {
    render(<Example disabled />);
    const trigger = screen.getByRole("combobox");
    expect(trigger.hasAttribute("disabled")).toBe(true);
    fireEvent.click(trigger);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("支持空字符串选项并跳过禁用项", () => {
    function All() {
      const [v, set] = useState("a");
      return (
        <Select aria-label="项目" value={v} onValueChange={set}>
          <option value="">全部项目</option>
          <option value="a">K12</option>
          <option disabled value="b">
            已停用项目
          </option>
        </Select>
      );
    }
    render(<All />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(
      screen
        .getByRole("option", { name: "已停用项目" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("option", { name: "全部项目" }));
    expect(screen.getByRole("combobox").textContent).toBe("全部项目");
  });
  it("弹窗内可以搜索选择，Esc只关闭下拉，不关闭表单", async () => {
    function DialogExample() {
      const [open, set] = useState(true);
      return (
        <Modal
          open={open}
          onClose={() => set(false)}
          title="编辑学员"
          footer={<Button onClick={() => set(false)}>取消</Button>}
        >
          <Example long />
        </Modal>
      );
    }
    render(<DialogExample />);
    fireEvent.click(screen.getByRole("combobox", { name: "时间范围" }));
    const search = screen.getByRole("textbox", { name: "搜索选项" });
    fireEvent.change(search, { target: { value: "本月" } });
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(screen.getByRole("dialog", { name: "编辑学员" })).toBeTruthy();
    expect(screen.getByRole("combobox").textContent).toContain("本月");
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "搜索选项" }), {
      key: "Escape",
    });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(screen.getByRole("dialog", { name: "编辑学员" })).toBeTruthy();
  });
  it("老师英文界面的搜索与空态使用英文", () => {
    render(
      <div lang="en">
        <Example long />
      </div>,
    );
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("textbox", { name: "Search options" }), {
      target: { value: "missing" },
    });
    expect(screen.getByRole("status").textContent).toBe("No matching options");
  });

  it("Tab关闭列表并移到下一个控件，Shift Tab返回上一个控件", async () => {
    render(
      <>
        <Button>上一个</Button>
        <Example long />
        <Button>下一个</Button>
      </>,
    );
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "搜索选项" }), {
      key: "Tab",
    });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "下一个" }),
      ),
    );
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "搜索选项" }), {
      key: "Tab",
      shiftKey: true,
    });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "上一个" }),
      ),
    );
  });
});
