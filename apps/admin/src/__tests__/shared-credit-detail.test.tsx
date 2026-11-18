// @vitest-environment jsdom
import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { demoRepository } from "../../../../packages/shared/src/repository";
import StudentRecordDrawer from "../components/StudentRecordDrawer";

it("共享成员可以查看另一位成员的套餐流水，但不能查看无关流水", () => {
  demoRepository.reset();
  const [a, b, c] = demoRepository.read().students;
  for (const id of [a.id,b.id]) demoRepository.execute({type:"student.bindClassIn",id,phone:"13900001234",uid:"101"});
  demoRepository.execute({
    type: "order.buy",
    id: "family",
    studentId: a.id,
    studentIds: [a.id, b.id],
    units: 72,
    kind: "新购",
    date: "2026-10-30",
    note: "家庭购课凭据",
  });
  const id = demoRepository
    .read()
    .credits.find((entry) => entry.orderId === "family")!.id;
  const client = new QueryClient();
  const props = {
    target: { kind: "credit" as const, id },
    onClose: () => {},
    onOpenFeedback: () => {},
    onOpenLesson: () => {},
    onOpen: () => {},
  };
  const drawer = (student: typeof a) => (
    <QueryClientProvider client={client}>
      <DemoProvider>
        <StudentRecordDrawer student={student} {...props} />
      </DemoProvider>
    </QueryClientProvider>
  );
  const view = render(drawer(b));
  expect(screen.getByText("家庭购课凭据")).toBeTruthy();
  view.rerender(drawer(c));
  expect(screen.getByText("没有找到这条记录")).toBeTruthy();
  view.unmount();
});
