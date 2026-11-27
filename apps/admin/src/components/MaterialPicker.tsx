import { useState } from "react";
import type { DemoState } from "@crazytalk/shared";

export default function MaterialPicker({
  catalog,
  value,
  onChange,
  label,
  multiple = true,
}: {
  catalog: DemoState["catalog"];
  value: string[];
  onChange: (ids: string[]) => void;
  label: string;
  multiple?: boolean;
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
      <div className="material-picker-options">
        {materials
          .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
          .map((c) => {
            const checked = value.includes(c.id);
            const disabled = !c.enabled && !checked;
            return (
              <label
                className={`material-picker-option${checked ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`}
                key={c.id}
              >
                <input
                  type={multiple ? "checkbox" : "radio"}
                  name={multiple ? undefined : `material-picker-${label}`}
                  checked={checked}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange(
                      multiple
                        ? e.target.checked
                          ? [...value, c.id]
                          : value.filter((id) => id !== c.id)
                        : e.target.checked
                          ? [c.id]
                          : [],
                    )
                  }
                />
                {c.name}
                {!c.enabled && "（已停用）"}
              </label>
            );
          })}
      </div>
      {!multiple && value.length > 0 && (
        <div>
          <button type="button" className="text-link" onClick={() => onChange([])}>
            清除已选教材
          </button>
        </div>
      )}
      {!materials.length && (
        <small className="muted">请先在设置中维护教材目录。</small>
      )}
    </div>
  );
}
