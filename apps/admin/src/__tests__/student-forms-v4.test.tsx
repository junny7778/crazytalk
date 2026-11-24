import { act as testAct } from "@testing-library/react";
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider, useDemo } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { emptyStudentProfile, matchingSurveyAnswers, matchingSurveyOptions } from "@crazytalk/shared";
import { demoRepository } from "../../../../packages/shared/src/repository";
import StudentProfileEditor from "../components/StudentProfileEditor";
import StudentHistoryEditor from "../components/StudentHistoryEditor";
import {
  StudentActionModal,
  type StudentAction,
} from "../components/StudentActions";
function Location() {
  return (
    <div data-testid="location">
      {useLocation().pathname}
      {useLocation().search}
    </div>
  );
}
function Action({
  action,
  studentId,
}: {
  action: StudentAction;
  studentId?: string;
}) {
  const { data } = useDemo();
  return (
    <StudentActionModal
      student={
        data.students.find((item) => item.id === studentId) ?? data.students[0]
      }
      action={action}
      onClose={() => {}}
    />
  );
}
function mount(child: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DemoProvider>
        <ToastProvider>
          <MemoryRouter>
            {child}
            <Location />
          </MemoryRouter>
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
}
async function change(label: string, value: string) {
  await testAct(async () => { fireEvent.change(screen.getByLabelText(label, { exact: true }), {
    target: { value },
  }); });
}
async function choose(label: string, value: string) {
  await testAct(async () => { fireEvent.click(screen.getByRole("combobox", { name: label })); });
  await testAct(async () => { fireEvent.click(screen.getByRole("option", { name: value })); });
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("combobox", { name: label })));
}
beforeEach(() => {
  localStorage.clear();
  demoRepository.reset();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("学员资料与历史分离 V4", () => {
  it("选择负责教务后直接保存归属", async () => {
    const data = demoRepository.read();
    const student = data.students[0];
    const owner = data.accounts.find(a => a.roleId === "ops" && a.enabled && a.id !== student.ownerAccountId)!;
    mount(<StudentProfileEditor student={student} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("combobox", { name: "负责教务" }));
    fireEvent.click(screen.getByRole("option", { name: new RegExp(owner.name + " ·") }));
    const team = screen.getByRole<HTMLInputElement>("textbox", { name: "所属队伍" });
    const group = screen.getByRole<HTMLInputElement>("textbox", { name: "所属组别" });
    expect([team.value, group.value]).toEqual([owner.team, owner.group]);
    expect(team.disabled && group.disabled).toBe(true);
    expect(screen.queryByText(/接手教务加入相关班级/)).toBeNull();
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "保存学员资料" })); });
    expect(demoRepository.read().students.find(s => s.id === student.id)?.ownerAccountId).toBe(owner.id);
  });
  it("普通新建只需姓名，历史统计和业务结果不再手填，正常0余额建档", async () => {
    mount(<StudentProfileEditor onClose={() => {}} />);
    for (const label of [
      "序号",
      "订单状态",
      "总课时",
      "买单日期",
      "上课时间",
      "周上课频次",
      "第一节课",
      "投诉记录（次数）",
      "原老师",
    ])
      expect(screen.queryByLabelText(label, { exact: true })).toBeNull();
    expect(screen.queryByRole("button", { name: "添加月份" })).toBeNull();
    await change("学生中文名", "新资料建档");
    await choose(
      "上课老师",
      `${demoRepository.read().teachers.find((item) => item.status === "在职")?.name} · ${demoRepository.read().teachers.find((item) => item.status === "在职")?.so}`,
    );
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "保存学员资料" })); });
    await waitFor(() =>
      expect(
        demoRepository
          .read()
          .students.find((item) => item.name === "新资料建档"),
      ).toMatchObject({ balance: 0, balanceKnown: true, orderStatus: "正常" }),
    );
  });
  it("只保存变动资料，不用打开时的旧进度覆盖后续业务更新", async () => {
    const student = structuredClone(demoRepository.read().students[0]);
    mount(<StudentProfileEditor student={student} onClose={() => {}} />);
    await change("学生中文名", "仅编辑群名");
    demoRepository.execute({
      type: "student.edit",
      id: student.id,
      patch: { material: "最新教材", unit: "p.99" },
    });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "保存学员资料" })); });
    await waitFor(() =>
      expect(
        demoRepository.read().students.find((item) => item.id === student.id),
      ).toMatchObject({
        chineseName: "仅编辑群名",
        material: "最新教材",
        unit: "p.99",
      }),
    );
  });
  it("已有课后进度时，普通资料编辑不再提供教材和页码输入", () => {
    const data = demoRepository.read();
    const lesson = data.lessons.find((item) => item.status === "已完成");
    if (!lesson) throw new Error("缺少已结束课程");
    demoRepository.execute({
      type: "report.save",
      report: {
        lessonId: lesson.id,
        studentId: lesson.studentId,
        teacherId: lesson.teacherId,
        date: lesson.date,
        material: "最新教材",
        from: "1",
        to: "8",
        rating: 0,
        comment: "",
        suggestedLevel: "",
      },
    });
    const student = demoRepository
      .read()
      .students.find((item) => item.id === lesson.studentId);
    if (!student) throw new Error("缺少学员");
    mount(<StudentProfileEditor student={student} onClose={() => {}} />);
    expect(screen.queryByRole("textbox", { name: "教材" })).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: "起始单元／页码" }),
    ).toBeNull();
    expect(screen.getByText(/教材进度已由课后记录维护/)).toBeTruthy();
  });
  it("问卷原答预填旧档字段，教务可修改选项并保存，原答和精确年龄保留", async () => {
    const student = demoRepository.read().students[0];
    student.age = 8;
    student.gender = "";
    student.level = "待评估";
    student.interests = "唱歌、画画";
    const original = matchingSurveyAnswers.parse({
      chineseName: student.chineseName, gender: "女", ageGroup: "少儿(6-9岁)",
      level: matchingSurveyOptions.level[0], personality: matchingSurveyOptions.personality[0],
      membership: "1-2个月", listening: "200小时内", times: "晚上（18:00-21:00）", needs: "家长原答",
    });
    student.surveyOriginal = original;
    student.surveySubmittedAt = "2026-11-16T02:10:00.000Z";
    const close = vi.fn();
    mount(<StudentProfileEditor student={student} onClose={close} />);
    const interests = screen.getByRole("combobox", { name: "兴趣爱好" });
    expect(interests.textContent).toContain("唱歌、画画");
    expect(screen.getByRole("combobox", { name: "加入体系时长" }).textContent).toContain("1-2个月");
    expect(screen.getByRole("textbox", { name: "其他备注" })).toHaveProperty("value", "家长原答");
    await testAct(async () => { fireEvent.click(interests); });
    const list = screen.getByRole("listbox", { name: "兴趣爱好" });
    expect(list.getAttribute("aria-multiselectable")).toBe("true");
    expect(within(list).getByRole("option", { name: "唱歌" }).getAttribute("aria-selected")).toBe("true");
    await testAct(async () => { fireEvent.click(within(list).getByRole("option", { name: "跳舞" })); });
    expect(within(list).getByRole("option", { name: "昆虫" })).toHaveProperty("disabled", true);
    await testAct(async () => { fireEvent.keyDown(screen.getByRole("textbox", { name: "搜索选项" }), { key: "Escape" }); });
    await waitFor(() => expect(document.activeElement).toBe(interests));
    await choose("加入体系时长", "6个月以上");
    await choose("听力输入总时长", "500小时以上");
    await choose("预选上课时段", "未填写");
    await change("其他备注", "教务补充");
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "保存学员资料" })); });
    expect(close).toHaveBeenCalledOnce();
    expect(demoRepository.read().students.find((item) => item.id === student.id)).toMatchObject({
      age: 8, gender: "", level: "待评估", membershipDuration: "6个月以上",
      listeningHours: "500小时以上", preferredLessonTime: "", learningNotes: "教务补充",
      interests: "唱歌、画画、跳舞", surveyOriginal: original, surveySubmittedAt: student.surveySubmittedAt,
    });
  });
  it("相同资料被其他操作更改时，保存提示冲突并保留新值", async () => {
    const student = structuredClone(demoRepository.read().students[0]);
    mount(<StudentProfileEditor student={student} onClose={() => {}} />);
    await change("学生中文名", "我的编辑");
    demoRepository.execute({
      type: "student.details.update",
      id: student.id,
      patch: { chineseName: "他人已修改" },
      expected: { chineseName: student.chineseName },
    });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "保存学员资料" })); });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      demoRepository.read().students.find((item) => item.id === student.id)
        ?.chineseName,
    ).toBe("他人已修改");
  });
  it("历史更正须说明原因，原月度/历史原文保留，未填写日期不假设统计起点", async () => {
    const student = structuredClone(demoRepository.read().students[0]);
    mount(<StudentHistoryEditor student={student} onClose={() => {}} />);
    await change("投诉记录（次数）", "2");
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "保存历史资料" })); });
    expect(await screen.findByText("请填写本次补录或更正原因")).toBeTruthy();
    await change("补录／更正原因", "核对旧表");
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "保存历史资料" })); });
    await waitFor(() =>
      expect(
        demoRepository.read().students.find((item) => item.id === student.id),
      ).toMatchObject({
        legacyComplaints: "2",
        monthlyRecords: student.monthlyRecords,
      }),
    );
    expect(
      demoRepository
        .read()
        .events.some(
          (event) =>
            event.studentId === student.id &&
            event.content.includes("核对旧表"),
        ),
    ).toBe(true);
  });
  it("历史填写后关闭可继续保留内容", async () => {
    const close = vi.fn();
    mount(
      <StudentHistoryEditor
        student={demoRepository.read().students[0]}
        onClose={close}
      />,
    );
    await change("投诉记录（次数）", "4");
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "取消" })); });
    expect(
      screen.getByRole("dialog", { name: "放弃未保存的内容？" }),
    ).toBeTruthy();
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "继续填写" })); });
    expect(
      (screen.getByLabelText("投诉记录（次数）") as HTMLInputElement).value,
    ).toBe("4");
    expect(close).not.toHaveBeenCalled();
  });
});

it("受限编辑读取脱敏手机号，修改姓名不覆盖真实手机号", async () => {
  const original = structuredClone(demoRepository.read().students[0]);
  demoRepository.read().accounts.push({id:"masked-editor-account",name:"脱敏编辑",phone:"",roleId:"masked-editor",enabled:true,scope:"全部"});
  demoRepository.read().roles.push({ id: "masked-editor", name: "脱敏编辑", description: "专项验证", permissions: ["student.view", "student.edit"], scope: "全部" });
  function RestrictedEditor() {
    const { roleId, setRole } = useDemo();
    return roleId === "masked-editor"
      ? <StudentProfileEditor student={{ ...original, phone: original.phone ? `****${original.phone.slice(-4)}` : "" }} onClose={() => {}} />
      : <button onClick={() => setRole("masked-editor",false,"masked-editor-account")}>切换受限身份</button>;
  }
  mount(<RestrictedEditor />);
  await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "切换受限身份" })); });
  const phone = screen.getByLabelText("手机号码") as HTMLInputElement;
  expect(phone.disabled).toBe(true);
  expect(phone.value).toBe(original.phone ? `****${original.phone.slice(-4)}` : "");
  await testAct(async () => { fireEvent.change(screen.getByLabelText("学生中文名"), { target: { value: "脱敏资料编辑验证" } }); });
  await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "保存学员资料" })); });
  expect(demoRepository.read().students.find(student => student.id === original.id)).toMatchObject({ chineseName: "脱敏资料编辑验证", phone: original.phone });
});
