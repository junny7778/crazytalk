// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { businessRequest, useDemo } from "@crazytalk/shared/react";
import { createSeed } from "../../../../packages/shared/src/seed";
import ClassInBookingPreview from "./scheduling/ClassInBookingPreview";
import StudentClasses from "./StudentClasses";
import ClassInSyncManagement from "./ClassInSyncManagement";
import {MemoryRouter} from "react-router-dom";
vi.mock("@crazytalk/shared/react", () => ({
  businessMode: () => true,
  businessRequest: vi.fn(),
  useDemo: vi.fn(),
}));
const state = createSeed();
const student = state.students[0];
const owner = state.accounts.find((a) => a.id === student.ownerAccountId)!;
owner.classInUid = "900";
state.classInAccounts = [
  { id: "verified", uid: "300", phone: "", studentIds: [student.id] },
];
state.teachers[0].classInUid = "400";
const group = {
  courseId: "11",
  studentId: student.id,
  teacherId: state.teachers[0].id,
  name: "已建学习群",
  isLegacy: false,
  owner: owner.name,
  mainTeacherUid: "900",
  ownerMode: "headteacher",
  studentUid: "300",
  teacherUids: ["400"],
  lessonCount: 1,
  lessons: [
    {
      id: "lesson",
      date: "2099-01-01",
      time: "18:00",
      status: "未开始",
      classId: "22",
      activityId: "33",
    },
  ],
  jobs: [],
};
function mount(element: React.ReactElement) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {element}
    </QueryClientProvider>,
  );
}
const view = { data: state, can: (_permission: string) => true };
beforeEach(() => {
  vi.mocked(useDemo, { partial: true }).mockReturnValue(view);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("AC-17/44 排课预览不把历史班级当成可复用的新组合班", async () => {
  vi.mocked(businessRequest).mockResolvedValue({
    classes: [{ ...group, isLegacy: true }],
  });
  mount(
    <ClassInBookingPreview
      studentId={student.id}
      teacherIds={[group.teacherId]}
    />,
  );
  expect(
    await screen.findByText(new RegExp(`新建：${student.chineseName}`)),
  ).toBeTruthy();
  expect(screen.queryByText(/复用：/)).toBeNull();
});
it("AC-08/23/43 班级显示原编号，只读账号没有添加成员操作", async () => {
  vi.mocked(useDemo, { partial: true }).mockReturnValue({
    ...view,
    can: (p: string) => p === "lesson.view",
  });
  vi.mocked(businessRequest).mockResolvedValue({
    candidates: [],
    classes: [group],
  });
  mount(<StudentClasses studentId={student.id} />);
  expect(await screen.findByText(/已建学习群/)).toBeTruthy();
  expect(screen.getByText(/课堂 22 \/ 活动 33/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "加入班级" })).toBeNull();
});
it("同步管理只展示日志，无匹配通知只记录，不生成核实或重试操作", async () => {
  vi.mocked(businessRequest).mockResolvedValue({jobs:[{id:"job",lessonId:"lesson",studentId:student.id,createdAt:"2026-11-20T10:00:00Z",operation:"create",status:"completed",error:"",step:"lesson.create",courseId:"11",attempts:1}],notices:[{id:"notice",command:"eeoClassInfoChange",error:"未找到对应课程",receivedAt:"2026-11-20T11:00:00Z",courseId:"",classId:""}]});
  mount(<MemoryRouter><ClassInSyncManagement connected/></MemoryRouter>);
  expect(await screen.findByText("未找到对应课程")).toBeTruthy();
  expect(screen.getByText("成功")).toBeTruthy();
  expect(screen.getByText(/eeoClassInfoChange/).closest("details")).toBeNull();
  expect(screen.getByText(/任务 job/).closest("details")).toBeNull();
  expect(screen.queryByText("查看详情")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("heading",{name:"待核实的外部结果"})).toBeNull();
  expect(screen.queryByRole("heading",{name:"班级同步事项"})).toBeNull();
  expect(screen.queryByRole("button",{name:/重试|核实/})).toBeNull();
});
it("添加成员在外部完成前保持 loading，确认后才显示成功",async()=>{
  let complete=false;
  vi.mocked(businessRequest).mockImplementation(async(_path,method)=>{
    if(method==="POST")return {jobId:"member-job"};
    return {candidates:[{key:"teacher:new",name:"New",uid:"500"}],classes:[{...group,jobs:vi.mocked(businessRequest).mock.calls.some(c=>c[1]==="POST")?[{id:"member-job",operation:"course.member",status:complete?"completed":"pending",error:"",memberUid:"500"}]:[]}]};
  });
  mount(<StudentClasses studentId={student.id}/>);
  fireEvent.click(await screen.findByLabelText(`为 ${group.name} 添加成员`));
  fireEvent.click(await screen.findByRole("option",{name:"New · UID 500"}));
  fireEvent.click(screen.getByRole("button",{name:"加入班级"}));
  const loading=await screen.findByRole("button",{name:"正在添加成员"});
  expect(loading.hasAttribute("disabled")).toBe(true);
  expect(loading.querySelector(".spin")).toBeTruthy();
  expect(screen.queryByText("成员已加入班级")).toBeNull();
  fireEvent.click(loading);
  expect(vi.mocked(businessRequest).mock.calls.filter(c=>c[1]==="POST")).toHaveLength(1);
  complete=true;
  expect(await screen.findByText("成员已加入班级",{}, {timeout:2500})).toBeTruthy();
});
