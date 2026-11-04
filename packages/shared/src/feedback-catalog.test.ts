import { describe, expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import {
  feedbackCategoryOptions,
  feedbackCategoryPath,
  migrateFeedbackCatalog,
} from "./feedbackCatalog";
import type { CatalogEntry } from "./model";
const legacy = (id: string, name: string, enabled = true): CatalogEntry => ({
  id,
  type: "反馈分类",
  name,
  detail: "说明",
  enabled,
});

describe("反馈分类层级", () => {
  it("旧路径合并共同上级，保留叶子编号，重复转换无变化", () => {
    const original = [
      legacy("a", "老师相关 / 教学问题 / 缺乏互动"),
      legacy("b", "老师相关 / 教学问题 / 用错教材"),
      legacy("c", "教学表扬"),
    ];
    const migrated = migrateFeedbackCatalog(original);
    expect(migrated).toHaveLength(5);
    const leaf = migrated.find((item) => item.id === "a");
    if (!leaf) throw new Error("分类丢失");
    expect(
      feedbackCategoryPath(migrated, leaf).map((item) => item.name),
    ).toEqual(["老师相关", "教学问题", "缺乏互动"]);
    expect(migrateFeedbackCatalog(migrated)).toBe(migrated);
    expect(original[0].name).toContain(" / ");
  });
  it("重命名上级更新录入路径，历史反馈完全不变", () => {
    const seed = createSeed();
    const root = seed.catalog.find(
      (item) => item.type === "反馈分类" && item.name === "老师相关",
    );
    if (!root) throw new Error("缺少分类");
    const result = transition(seed, {
      type: "catalog.save",
      entry: { ...root, name: "课堂问题" },
    }).data;
    expect(feedbackCategoryOptions(result.catalog)).toContainEqual([
      "课堂问题",
      "设备网络",
      "音频问题超过 3 分钟",
    ]);
    expect(result.feedback).toEqual(seed.feedback);
    expect(seed.catalog.find((item) => item.id === root.id)?.name).toBe(
      "老师相关",
    );
  });
  it("停用上级连同下级停用，重新启用不自动恢复下级", () => {
    const seed = createSeed();
    const root = seed.catalog.find(
      (item) => item.type === "反馈分类" && !item.parentId,
    );
    if (!root) throw new Error("缺少分类");
    const disabled = transition(seed, {
      type: "catalog.save",
      entry: { ...root, enabled: false },
    }).data;
    expect(feedbackCategoryOptions(disabled.catalog)).toEqual([]);
    expect(disabled.feedback).toEqual(seed.feedback);
    const enabled = transition(disabled, {
      type: "catalog.save",
      entry: { ...root, enabled: true },
    }).data;
    expect(feedbackCategoryOptions(enabled.catalog)).toEqual([[root.name]]);
  });
  it("拒绝循环关系、第四级和同级重名", () => {
    const seed = createSeed();
    const root = seed.catalog.find(
      (item) => item.type === "反馈分类" && !item.parentId,
    );
    const leaf = seed.catalog.find(
      (item) => item.type === "反馈分类" && item.name === "缺乏互动",
    );
    if (!root || !leaf) throw new Error("缺少分类");
    expect(() =>
      transition(seed, {
        type: "catalog.save",
        entry: { ...root, parentId: leaf.id },
      }),
    ).toThrow("自身或下级");
    expect(() =>
      transition(seed, {
        type: "catalog.save",
        entry: { ...leaf, id: "fourth", parentId: leaf.id },
      }),
    ).toThrow("最多支持三级");
    expect(() =>
      transition(seed, {
        type: "catalog.save",
        entry: { ...leaf, id: "duplicate" },
      }),
    ).toThrow("同名分类");
  });
  it("拒绝不存在的上级和未启用的上级，允许不同上级下同名", () => {
    const seed = createSeed();
    const leaf = seed.catalog.find(
      (item) => item.type === "反馈分类" && item.name === "缺乏互动",
    );
    if (!leaf) throw new Error("缺少分类");
    expect(() =>
      transition(seed, {
        type: "catalog.save",
        entry: { ...leaf, parentId: "missing" },
      }),
    ).toThrow("上级分类不存在");
    const disabled = transition(seed, {
      type: "catalog.save",
      entry: { ...leaf, enabled: false },
    }).data;
    expect(() =>
      transition(disabled, {
        type: "catalog.save",
        entry: { ...leaf, id: "child", parentId: leaf.id },
      }),
    ).toThrow();
    const result = transition(seed, {
      type: "catalog.save",
      entry: { ...leaf, id: "root-copy", parentId: "" },
    }).data;
    expect(result.catalog.find((item) => item.id === "root-copy")?.name).toBe(
      "缺乏互动",
    );
  });
});

describe("反馈分类删除保护", () => {
  it("只允许删除未使用且没有下级的分类，并记录操作", () => {
    const seed = createSeed();
    const unused = {
      id: "unused",
      type: "反馈分类" as const,
      name: "未使用分类",
      detail: "",
      enabled: true,
      parentId: "",
    };
    const created = transition(seed, {
      type: "catalog.save",
      entry: unused,
    }).data;
    const deleted = transition(created, {
      type: "feedback-category.delete",
      id: unused.id,
    }).data;
    expect(deleted.catalog.some((item) => item.id === unused.id)).toBe(false);
    expect(deleted.feedback).toEqual(seed.feedback);
    expect(deleted.events.some((event) => event.type === "删除反馈分类")).toBe(
      true,
    );
  });
  it("有下级、当前被引用、分类已删除时拒绝删除", () => {
    const seed = createSeed();
    const root = seed.catalog.find((item) => item.name === "老师相关");
    const leaf = seed.catalog.find((item) => item.name === "缺乏互动");
    if (!root || !leaf) throw new Error("缺少分类");
    expect(() =>
      transition(seed, { type: "feedback-category.delete", id: root.id }),
    ).toThrow("仍有下级");
    expect(() =>
      transition(seed, { type: "feedback-category.delete", id: leaf.id }),
    ).toThrow("已被反馈使用");
    expect(() =>
      transition(seed, { type: "feedback-category.delete", id: "missing" }),
    ).toThrow("不存在");
  });
  it("分类改名和移动后仍记住历史引用，不能删除", () => {
    const seed = createSeed();
    const leaf = seed.catalog.find((item) => item.name === "缺乏互动");
    if (!leaf) throw new Error("缺少分类");
    const renamed = transition(seed, {
      type: "catalog.save",
      entry: { ...leaf, name: "互动不够", parentId: "" },
    }).data;
    expect(
      renamed.catalog.find((item) => item.id === leaf.id)?.usedInFeedback,
    ).toBe(true);
    expect(() =>
      transition(renamed, { type: "feedback-category.delete", id: leaf.id }),
    ).toThrow("已被反馈使用");
    expect(renamed.feedback).toEqual(seed.feedback);
  });
  it("跟进记录保存的旧分类也阻止删除", () => {
    const seed = createSeed();
    const leaf = seed.catalog.find((item) => item.name === "用错教材");
    if (!leaf) throw new Error("缺少分类");
    seed.feedback[0].followUps.push({
      id: "history-category",
      date: "2026-10-12",
      operator: "Rita",
      section: "反馈资料",
      content: "变更分类",
      changes: [
        {
          field: "问题分类",
          before: "老师相关 / 教学问题 / 用错教材",
          after: "",
        },
      ],
    });
    expect(() =>
      transition(seed, { type: "feedback-category.delete", id: leaf.id }),
    ).toThrow("已被反馈使用");
  });
});
