// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Avatar } from "./index";

afterEach(cleanup);

it("同一用户在后台、老师端及重新渲染后保持同一头像", () => {
  const { container, rerender } = render(<Avatar name="T. Carol" />);
  const source = container.querySelector("img")?.getAttribute("src");
  expect(source).toMatch(/^\/avatars\/avatar-[1-4]\.webp$/);
  rerender(<Avatar name="Carol" size={64} />);
  expect(container.querySelector("img")?.getAttribute("src")).toBe(source);
  expect(container.querySelector("img")?.getAttribute("width")).toBe("64");
  expect(container.textContent).toBe("");
});
