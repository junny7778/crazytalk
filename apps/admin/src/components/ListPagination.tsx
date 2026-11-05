import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
export const LIST_PAGE_SIZE = 25;
export function useListPage<T>(rows: T[]) {
  const [requested, setPage] = useState(1);
  const key = JSON.stringify(rows);
  const [previous, setPrevious] = useState(key);
  if (previous !== key) {
    setPrevious(key);
    setPage(1);
  }
  const page = Math.min(
    requested,
    Math.max(1, Math.ceil(rows.length / LIST_PAGE_SIZE)),
  );
  return {
    page,
    setPage,
    rows: rows.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE),
  };
}
export default function ListPagination({
  total,
  page,
  onChange,
}: {
  total: number;
  page: number;
  onChange: (page: number) => void;
}) {
  const count = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));
  return (
    <nav className="pagination" aria-label="列表分页">
      <span>
        共 {total} 条 · 每页 {LIST_PAGE_SIZE} 条
      </span>
      <button
        aria-label="上一页"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={14} />
      </button>
      {Array.from({ length: count }, (_, i) => i + 1)
        .filter((n) => n === 1 || n === count || Math.abs(n - page) <= 2)
        .map((n, i, pages) => (
          <span key={n}>
            {i > 0 && n - pages[i - 1] > 1 && <span>…</span>}
            <button
              aria-label={`第 ${n} 页`}
              aria-current={n === page ? "page" : undefined}
              className={n === page ? "active" : ""}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          </span>
        ))}
      <button
        aria-label="下一页"
        disabled={page >= count}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight size={14} />
      </button>
    </nav>
  );
}
