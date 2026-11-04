import { describe, expect, it } from "vitest";
import {
  formatMaterialProgress,
  formatStudentProgress,
} from "./studentProgress";

describe("教材进度显示格式", () => {
  it("统一旧分隔符和页码写法，兼容已有存储数据", () => {
    expect(formatMaterialProgress("Power Up 3", "Unit 1 · p.4")).toBe(
      "Power Up 3 / Unit 1 / P4",
    );
    expect(formatMaterialProgress("Think 1", "Unit 8 / P46")).toBe(
      "Think 1 / Unit 8 / P46",
    );
    expect(formatStudentProgress("Unit 2•p. 12–14")).toBe("Unit 2 / P12–14");
  });
  it("缺少层级时不虚构单元或页码，保留自由文本", () => {
    expect(formatMaterialProgress("Think 1", "p.4")).toBe("Think 1 / P4");
    expect(formatMaterialProgress("Think 1", "")).toBe("Think 1");
    expect(formatStudentProgress("复习第一单元")).toBe("复习第一单元");
    expect(formatStudentProgress(undefined)).toBe("");
  });
});
