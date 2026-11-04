import { useDemo } from "@crazytalk/shared/react";
import { useToast } from "@crazytalk/ui";
import type { Command } from "@crazytalk/shared";
export function useBusinessAction() {
  const { act } = useDemo();
  const toast = useToast();
  return (command: Command, after?: () => void) => {
    try {
      const result = act(command);
      toast(result.message, { undo: result.undo });
      after?.();
      return true;
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "操作没有完成，请检查填写内容。",
        { tone: "error" },
      );
      return false;
    }
  };
}
export function exportCsv(name: string, rows: (string | number)[][]) {
  const csv =
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => '"' + String(value).replaceAll('"', '""') + '"')
          .join(","),
      )
      .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name + ".csv";
  link.click();
  URL.revokeObjectURL(url);
}
export const money = (value: number) =>
  "₱" +
  value.toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
export function tone(
  status: string,
): "success" | "warning" | "danger" | "info" | "neutral" {
  return ["已完成", "已确认", "已发放", "在职", "正常", "已通过"].includes(
    status,
  )
    ? "success"
    : ["待确认", "待处理", "等待判定", "培训中", "请假中", "待审批"].includes(
          status,
        )
      ? "warning"
      : ["缺席", "学员缺席", "老师缺席", "未同步", "已驳回"].includes(status)
        ? "danger"
        : status === "处理中"
          ? "info"
          : "neutral";
}
