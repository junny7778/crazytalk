import { useState } from "react";
import type { DemoState } from "@crazytalk/shared";

export default function MaterialPicker({
  catalog,
  value,
  onChange,
  label,
}: {
  catalog: DemoState["catalog"];
  value: string[];
  onChange: (ids: string[]) => void;
  label: string;
}) {
  const [query, setQuery] = useState("");
  const materials = catalog.filter(
    (c) => c.type === "教材" && (c.enabled || value.includes(c.id)),
  );
  return (
    <div className="stack material-picker" role="group" aria-label={label}>
      <input
        aria-label={`搜索${label}`}
        placeholder="搜索教材或册级"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="row wrap">
        {materials
          .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
          .map((c) => (
            <label className="row" key={c.id}>
              <input
                type="checkbox"
                checked={value.includes(c.id)}
                disabled={!c.enabled && !value.includes(c.id)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...value, c.id]
                      : value.filter((id) => id !== c.id),
                  )
                }
              />
              {c.name}
              {!c.enabled && "（已停用）"}
            </label>
          ))}
      </div>
      {!materials.length && (
        <small className="muted">请先在设置中维护教材目录。</small>
      )}
    </div>
  );
}
