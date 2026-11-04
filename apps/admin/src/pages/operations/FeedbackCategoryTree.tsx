import { useState } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Tag,
  Pencil,
  Plus,
} from "lucide-react";
import { Badge, Button } from "@crazytalk/ui";
import { feedbackCategoryPath, type CatalogEntry } from "@crazytalk/shared";
import CategoryActionsMenu from "./CategoryActionsMenu";

export default function FeedbackCategoryTree({
  catalog,
  query,
  onEdit,
  onAdd,
  onMove,
  onToggle,
  onDelete,
}: {
  catalog: CatalogEntry[];
  query: string;
  onEdit: (entry: CatalogEntry) => void;
  onAdd: (entry: CatalogEntry) => void;
  onMove: (entry: CatalogEntry) => void;
  onToggle: (entry: CatalogEntry) => void;
  onDelete: (entry: CatalogEntry) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const categories = catalog.filter((item) => item.type === "反馈分类");
  const keyword = query.trim().toLowerCase();
  const visible = new Set<string>();
  for (const category of categories) {
    const path = feedbackCategoryPath(catalog, category);
    if (
      `${path.map((item) => item.name).join(" / ")} ${category.detail}`
        .toLowerCase()
        .includes(keyword)
    )
      path.forEach((item) => visible.add(item.id));
  }
  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  function renderNode(entry: CatalogEntry, depth: number) {
    const children = categories.filter(
      (item) => item.parentId === entry.id && visible.has(item.id),
    );
    const expanded = !!keyword || !collapsed.has(entry.id);
    const Icon = children.length ? (expanded ? FolderOpen : Folder) : Tag;
    return (
      <li
        role="treeitem"
        aria-label={entry.name}
        aria-level={depth}
        aria-expanded={children.length ? expanded : undefined}
        key={entry.id}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ArrowRight" && children.length && !expanded) {
            event.preventDefault();
            toggle(entry.id);
          } else if (
            event.key === "ArrowLeft" &&
            children.length &&
            expanded &&
            !keyword
          ) {
            event.preventDefault();
            toggle(entry.id);
          }
        }}
      >
        <div
          className="settings-category-tree-row"
          style={{ paddingLeft: 12 + (depth - 1) * 26 }}
        >
          {children.length ? (
            <button
              className="settings-category-tree-expander"
              aria-label={`${expanded ? "收起" : "展开"}${entry.name}`}
              disabled={!!keyword}
              onClick={() => toggle(entry.id)}
            >
              <ChevronRight
                size={16}
                style={{ transform: expanded ? "rotate(90deg)" : undefined }}
              />
            </button>
          ) : (
            <span className="settings-category-tree-spacer" />
          )}
          <Icon
            size={17}
            className="settings-category-tree-icon"
            aria-hidden="true"
          />
          <span className="settings-category-tree-title">{entry.name}</span>
          <small className="muted">{["一", "二", "三"][depth - 1]}级</small>
          <Badge tone={entry.enabled ? "success" : "neutral"}>
            {entry.enabled ? "启用" : "已停用"}
          </Badge>
          <span className="settings-category-tree-description">
            {entry.detail}
          </span>
          <div className="row settings-category-tree-actions">
            {depth < 3 && entry.enabled && (
              <Button
                size="xs"
                variant="ghost"
                aria-label={`添加${entry.name}的子分类`}
                onClick={() => {
                  setCollapsed((current) => {
                    const next = new Set(current);
                    next.delete(entry.id);
                    return next;
                  });
                  onAdd(entry);
                }}
              >
                <Plus size={14} />
                添加子分类
              </Button>
            )}
            <Button
              size="xs"
              variant="ghost"
              aria-label={`编辑${["一", "二", "三"][depth - 1]}级分类 ${entry.name}`}
              onClick={() => onEdit(entry)}
            >
              <Pencil size={14} />
              编辑
            </Button>
            <CategoryActionsMenu
              name={entry.name}
              enabled={entry.enabled}
              onMove={() => onMove(entry)}
              onToggle={() => onToggle(entry)}
              onDelete={() => onDelete(entry)}
            />
          </div>
        </div>
        {!!children.length && expanded && (
          <ul role="group">
            {children.map((child) => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  }
  return (
    <div className="settings-category-tree">
      <div className="row between settings-category-tree-toolbar">
        <small className="muted">
          共 {categories.length} 个分类
          {keyword ? " · 搜索已自动展开匹配路径" : ""}
        </small>
        <div className="row">
          <Button
            size="xs"
            variant="ghost"
            disabled={!!keyword}
            onClick={() => setCollapsed(new Set())}
          >
            全部展开
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={!!keyword}
            onClick={() =>
              setCollapsed(new Set(categories.map((item) => item.id)))
            }
          >
            全部收起
          </Button>
        </div>
      </div>
      <ul role="tree" aria-label="反馈分类树">
        {categories
          .filter((item) => !item.parentId && visible.has(item.id))
          .map((item) => renderNode(item, 1))}
      </ul>
      {!visible.size && (
        <p className="settings-category-tree-empty">
          {keyword
            ? "没有匹配的分类，请调整搜索条件。"
            : "暂无反馈分类，请新增一级分类。"}
        </p>
      )}
    </div>
  );
}
