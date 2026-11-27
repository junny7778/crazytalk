import { useState } from "react";
import type { CatalogEntry } from "@crazytalk/shared";
import { Badge, Button, EmptyState, SearchInput, Select } from "@crazytalk/ui";
import "../../components/teacher-tags.css";

export default function TeacherTagTable({
  catalog,
  query,
  onQueryChange,
  onToggle,
}: {
  catalog: CatalogEntry[];
  query: string;
  onQueryChange: (value: string) => void;
  onToggle: (tag: CatalogEntry) => void;
}) {
  const [category, setCategory] = useState("");
  const tags = catalog.filter((tag) => tag.type === "老师标签");
  const categories = [...new Set(tags.map((tag) => tag.tagCategory || "其他"))];
  const search = query.trim().toLowerCase();
  const groups = categories
    .filter((name) => !category || name === category)
    .map((name) => ({
      name,
      tags: tags.filter((tag) =>
        (tag.tagCategory || "其他") === name && tag.name.toLowerCase().includes(search),
      ),
    }))
    .filter((group) => group.tags.length > 0);

  return (
    <>
      <div className="toolbar teacher-tag-library-toolbar">
        <SearchInput value={query} onChange={onQueryChange} placeholder="搜索标签名称" />
        <Select aria-label="标签分类" value={category} onValueChange={setCategory}>
          <option value="">全部分类</option>
          {categories.map((name) => <option key={name}>{name}</option>)}
        </Select>
      </div>
      {groups.length ? (
        <div className="table-wrap">
          <table className="teacher-tag-table" aria-label="老师标签库">
            <thead>
              <tr>
                {["标签类型", "标签", "含义", "具体表现", "匹配建议", "状态", "操作"].map((label) => (
                  <th key={label} scope="col">{label}</th>
                ))}
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.name}>
                {group.tags.map((tag, index) => {
                  const color = tag.tagColor || "green";
                  return (
                    <tr key={tag.id}>
                      {index === 0 && (
                        <th className="teacher-tag-category" scope="rowgroup" rowSpan={group.tags.length}>
                          {group.name}
                        </th>
                      )}
                      <td>
                        <span className={`teacher-tag teacher-tag-${color}`}>{tag.name}</span>
                      </td>
                      <td>{tag.tagMeaning || "—"}</td>
                      <td>{tag.tagExample || "—"}</td>
                      <td>{tag.tagAdvice || "—"}</td>
                      <td>
                        <Badge tone={tag.enabled ? "success" : "neutral"}>
                          {tag.enabled ? "启用" : "已停用"}
                        </Badge>
                      </td>
                      <td>
                        <Button size="xs" onClick={() => onToggle(tag)}>
                          {tag.enabled ? "停用" : "启用"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      ) : (
        <EmptyState title="没有匹配的老师标签" />
      )}
    </>
  );
}
