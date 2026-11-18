import { useState } from "react";
import { ChevronRight, Folder, FolderOpen, Tag, Pencil, Plus } from "lucide-react";
import { Badge, Button, EmptyState } from "@crazytalk/ui";
import type { CatalogEntry } from "@crazytalk/shared";

export default function TeamGroupTree({ catalog, query, onEdit, onAdd }: {
  catalog: CatalogEntry[];
  query: string;
  onEdit: (entry: CatalogEntry) => void;
  onAdd: (team: CatalogEntry) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const teams = catalog.filter(c => c.type === "队伍");
  const groups = catalog.filter(c => c.type === "组别");
  const keyword = query.trim().toLowerCase();
  const matches = (entry: CatalogEntry) => entry.name.toLowerCase().includes(keyword);
  const visibleTeams = teams.filter(team => matches(team) || groups.some(g => g.parentId === team.id && matches(g)));
  if (!visibleTeams.length) return <EmptyState title="没有符合条件的资料" />;
  const toggle = (id: string) => setCollapsed(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  function renderNode(entry: CatalogEntry, depth: number) {
    const children = depth === 1 ? groups.filter(g => g.parentId === entry.id && (matches(entry) || matches(g))) : [];
    const expanded = !!keyword || !collapsed.has(entry.id);
    const Icon = depth === 1 ? (expanded ? FolderOpen : Folder) : Tag;
    return <li key={entry.id} role="treeitem" aria-label={entry.name} aria-level={depth}
      aria-expanded={children.length ? expanded : undefined} tabIndex={0}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || !children.length || keyword) return;
        if ((event.key === "ArrowRight" && !expanded) || (event.key === "ArrowLeft" && expanded)) {
          event.preventDefault(); toggle(entry.id);
        }
      }}>
      <div className="settings-category-tree-row" style={{paddingLeft: 12 + (depth - 1) * 26}}>
        {children.length ? <button type="button" className="settings-category-tree-expander"
          aria-label={`${expanded ? "收起" : "展开"}${entry.name}`} disabled={!!keyword} onClick={() => toggle(entry.id)}>
          <ChevronRight size={16} style={{transform: expanded ? "rotate(90deg)" : undefined}}/>
        </button> : <span className="settings-category-tree-spacer"/>}
        <Icon size={17} className="settings-category-tree-icon" aria-hidden="true"/>
        <span className="settings-category-tree-title">{entry.name}</span>
        <small className="muted">{depth === 1 ? "队伍" : "组别"}</small>
        <Badge tone={entry.enabled ? "success" : "neutral"}>{entry.enabled ? "启用" : "已停用"}</Badge>
        <span className="settings-category-tree-description">{entry.detail}</span>
        <div className="row settings-category-tree-actions">
          {depth === 1 && entry.enabled && <Button size="xs" variant="ghost" aria-label={`添加${entry.name}的组别`} onClick={() => {
            setCollapsed(current => { const next = new Set(current); next.delete(entry.id); return next; });
            onAdd(entry);
          }}><Plus size={14}/>新增组别</Button>}
          <Button size="xs" variant="ghost" aria-label={`编辑${entry.type} ${entry.name}`} onClick={() => onEdit(entry)}>
            <Pencil size={14}/>编辑
          </Button>
        </div>
      </div>
      {!!children.length && expanded && <ul role="group">{children.map(child => renderNode(child, 2))}</ul>}
    </li>;
  }
  return <div className="settings-category-tree">
    <div className="row between settings-category-tree-toolbar">
      <small className="muted">共 {teams.length} 个队伍、{groups.length} 个组别{keyword ? " · 搜索已自动展开匹配路径" : ""}</small>
      <div className="row">
        <Button size="xs" variant="ghost" disabled={!!keyword} onClick={() => setCollapsed(new Set())}>全部展开</Button>
        <Button size="xs" variant="ghost" disabled={!!keyword} onClick={() => setCollapsed(new Set(teams.map(t => t.id)))}>全部收起</Button>
      </div>
    </div>
    <ul role="tree" aria-label="队伍与组别树">{visibleTeams.map(team => renderNode(team, 1))}</ul>
  </div>;
}
