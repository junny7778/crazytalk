import type { CatalogEntry } from "./model";

export function feedbackCategoryPath(
  catalog: CatalogEntry[],
  category: CatalogEntry,
): CatalogEntry[] {
  const path: CatalogEntry[] = [];
  const seen = new Set<string>();
  let current: CatalogEntry | undefined = category;
  while (current) {
    if (seen.has(current.id))
      throw new Error("分类不能选择自身或下级分类作为上级");
    seen.add(current.id);
    path.unshift(current);
    if (!current.parentId) break;
    const parent = catalog.find(
      (item) => item.id === current?.parentId && item.type === "反馈分类",
    );
    if (!parent) throw new Error("上级分类不存在");
    current = parent;
  }
  return path;
}

export function feedbackCategoryOptions(catalog: CatalogEntry[]) {
  return catalog
    .filter((item) => item.type === "反馈分类")
    .map((item) => feedbackCategoryPath(catalog, item))
    .filter((path) => path.every((item) => item.enabled))
    .map((path) => path.map((item) => item.name));
}

export function migrateFeedbackCatalog(
  catalog: CatalogEntry[],
): CatalogEntry[] {
  if (
    !catalog.some(
      (item) => item.type === "反馈分类" && item.parentId === undefined,
    )
  )
    return catalog;
  const result = catalog
    .filter((item) => item.type !== "反馈分类" || item.parentId !== undefined)
    .map((item) => ({ ...item }));
  for (const entry of catalog.filter(
    (item) => item.type === "反馈分类" && item.parentId === undefined,
  )) {
    let parentId = "";
    const parts = entry.name
      .split(/\s*\/\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
    for (const [index, name] of parts.entries()) {
      const leaf = index === parts.length - 1;
      let node = result.find(
        (item) =>
          item.type === "反馈分类" &&
          item.parentId === parentId &&
          item.name === name,
      );
      if (!node) {
        node = {
          ...entry,
          id: leaf
            ? entry.id
            : `feedback-category:${encodeURIComponent(parts.slice(0, index + 1).join("/"))}`,
          name,
          parentId,
          detail: leaf ? entry.detail : "",
        };
        result.push(node);
      } else if (entry.enabled) node.enabled = true;
      parentId = node.id;
    }
  }
  return result;
}

export function saveFeedbackCategory(
  catalog: CatalogEntry[],
  entry: CatalogEntry,
): CatalogEntry[] {
  const name = entry.name.trim();
  if (!name || name.includes("/"))
    throw new Error("请填写当前级别的分类名称，名称不能包含 / ");
  const parentId = entry.parentId || "";
  if (
    catalog.some(
      (item) =>
        item.type === "反馈分类" &&
        item.id !== entry.id &&
        (item.parentId || "") === parentId &&
        item.name === name,
    )
  )
    throw new Error("同一上级下已存在同名分类");
  const usedInFeedback =
    catalog.find((item) => item.id === entry.id)?.usedInFeedback ||
    entry.usedInFeedback;
  const updated = {
    ...entry,
    name,
    parentId,
    ...(usedInFeedback ? { usedInFeedback: true } : {}),
  };
  const next = catalog.map((item) =>
    item.id === entry.id ? updated : { ...item },
  );
  if (!catalog.some((item) => item.id === entry.id)) next.push(updated);
  const categories = next.filter((item) => item.type === "反馈分类");
  for (const category of categories) {
    const path = feedbackCategoryPath(next, category);
    if (path.length > 3)
      throw new Error("反馈分类最多支持三级，请调整上级分类");
    if (!entry.enabled && path.some((item) => item.id === entry.id))
      category.enabled = false;
  }
  if (
    entry.enabled &&
    feedbackCategoryPath(next, entry).some((item) => !item.enabled)
  )
    throw new Error("请先启用上级分类");
  return next;
}

export function trackFeedbackCategoryUsage(
  data: Pick<import("./model").DemoState, "catalog" | "feedback">,
): CatalogEntry[] {
  const normalize = (value: string) =>
    value
      .split(/\s*\/\s*/)
      .map((part) => part.trim())
      .join("/");
  const paths = data.feedback
    .flatMap((record) => [record.category, ...record.categories])
    .filter(Boolean)
    .map(normalize);
  const historicalChanges = data.feedback
    .flatMap((record) =>
      record.followUps.flatMap((followUp) =>
        (followUp.changes || [])
          .filter((change) => /分类|categor/i.test(change.field))
          .flatMap((change) => [change.before, change.after]),
      ),
    )
    .map(normalize);
  return data.catalog.map((item) => {
    if (item.type !== "反馈分类" || item.usedInFeedback) return item;
    const path = feedbackCategoryPath(data.catalog, item)
      .map((node) => node.name.trim())
      .join("/");
    const used =
      paths.some((value) => value === path || value.startsWith(path + "/")) ||
      historicalChanges.some((value) => value.includes(path));
    return used ? { ...item, usedInFeedback: true } : item;
  });
}

export function feedbackCategoryDeletionError(
  data: Pick<import("./model").DemoState, "catalog" | "feedback">,
  id: string,
): string | null {
  const entry = trackFeedbackCategoryUsage(data).find(
    (item) => item.id === id && item.type === "反馈分类",
  );
  if (!entry) return "分类不存在或已删除";
  if (
    data.catalog.some(
      (item) => item.type === "反馈分类" && item.parentId === id,
    )
  )
    return "该分类仍有下级分类，请先调整或删除下级分类。";
  if (entry.usedInFeedback)
    return "该分类已被反馈使用，不能删除，请使用停用功能保留历史记录。";
  return null;
}
