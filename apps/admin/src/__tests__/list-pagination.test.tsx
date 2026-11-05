// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ListPagination, { useListPage } from "../components/ListPagination";
afterEach(cleanup);
function List({ count }: { count: number }) {
  const page = useListPage(Array.from({ length: count }, (_, i) => i));
  return (
    <>
      <ul>
        {page.rows.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <ListPagination total={count} page={page.page} onChange={page.setPage} />
    </>
  );
}
it("每页25条，页码跳转、末页和筛选后重置", () => {
  const view = render(<List count={51} />);
  expect(screen.getAllByRole("listitem")).toHaveLength(25);
  fireEvent.click(screen.getByRole("button", { name: "第 3 页" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(
    screen.getByRole("button", { name: "下一页" }).hasAttribute("disabled"),
  ).toBe(true);
  view.rerender(<List count={2} />);
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(
    screen
      .getByRole("button", { name: "第 1 页" })
      .getAttribute("aria-current"),
  ).toBe("page");
});
it("空结果保留统一分页且不能翻页", () => {
  render(<List count={0} />);
  expect(screen.getByText("共 0 条 · 每页 25 条")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "下一页" }).hasAttribute("disabled"),
  ).toBe(true);
});
