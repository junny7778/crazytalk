// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider, useDemo } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { emptyStudentProfile } from "@crazytalk/shared";
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
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), {
    target: { value },
  });
}
function choose(label: string, value: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  fireEvent.click(screen.getByRole("option", { name: value }));
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
describe("学生原表表单与客户操作", () => {
  it("无编号建档后独立补录历史资料，保留原表零值并按内部id进入详情", async () => {
    mount(<StudentProfileEditor onClose={() => {}} />);
    for (const label of [
      "学员编号",
      "中文名",
      "CEFR 等级",
      "学习目标",
      "学员状态",
      "课包有效期",
    ])
      expect(screen.queryByLabelText(label, { exact: true })).toBeNull();
    expect(screen.getByLabelText("项目")).toBeTruthy();
    const fields = {
      学生名字: "表单数字化验收",
      学生群名: "家长学习服务群",
      年龄: "/",
      小孩性格: "慢热",
      喜欢的老师类型: "耐心",
      教材: "Power Up 1",
    };
    Object.entries(fields).forEach(([label, value]) => change(label, value));
    expect(screen.queryByLabelText("关联老师")).toBeNull();
    const teachers = demoRepository.read().teachers;
    const active = teachers.find((teacher) => teacher.status === "在职");
    if (!active) throw new Error("缺少在职老师");
    fireEvent.click(screen.getByRole("combobox", { name: "上课老师" }));
    for (const teacher of teachers.filter((item) => item.status !== "在职")) {
      expect(
        screen.queryByRole("option", {
          name: `${teacher.name} · ${teacher.so}`,
        }),
      ).toBeNull();
    }
    fireEvent.click(
      screen.getByRole("option", { name: `${active.name} · ${active.so}` }),
    );
    choose("性别", "女");
    choose("外教上课经验", "有");
    fireEvent.click(screen.getByRole("button", { name: "保存学员资料" }));
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toMatch(
        /^\/students\//,
      ),
    );
    const fresh = demoRepository
      .read()
      .students.find((item) => item.name === "表单数字化验收");
    if (!fresh) throw new Error("新建失败");
    expect(fresh.balanceKnown).toBe(true);
    cleanup();
    mount(<StudentHistoryEditor student={fresh} onClose={() => {}} />);
    const history = {
      序号: "0",
      买单日期: "2026-10-01",
      历史总课时: "0",
      历史上课时间: "周一20:00",
      历史周上课频次: "2*55mins",
      历史第一节课: "2026-10-02",
      "投诉记录（次数）": "0",
      "赠课记录（补偿次数）": "2",
      "被缺席记录（次数）": "/",
      原老师: "A",
      首次换老师: "B",
      二次换老师: "C",
      是否续课: "是",
    };
    Object.entries(history).forEach(([label, value]) => change(label, value));
    fireEvent.click(screen.getByRole("button", { name: "添加月份" }));
    change("第1条月份", "7月（原表，年份未注明）");
    change("第1条实际上课", "0");
    change("补录／更正原因", "核对原表补录");
    fireEvent.click(screen.getByRole("button", { name: "保存历史资料" }));
    const saved = demoRepository
      .read()
      .students.find((item) => item.name === "表单数字化验收");
    expect(saved).toMatchObject({
      groupName: "家长学习服务群",
      totalUnits: 0,
      phone: "",
      age: null,
      ageText: "/",
      orderStatus: "正常",
      teacherId: active.id,
      teacherName: active.name,
      material: "Power Up 1",
      frequencyText: "2*55mins",
      legacyComplaints: "0",
      originalTeacher: "A",
      firstChangedTeacher: "B",
      secondChangedTeacher: "C",
    });
    expect(saved?.monthlyRecords[0]).toMatchObject({
      planned: null,
      actual: 0,
    });
  });
  it("保存并加课时按id导航，无需用户补充编号", async () => {
    mount(<StudentProfileEditor onClose={() => {}} />);
    change("学生名字", "无编号充值路径");
    fireEvent.click(screen.getByRole("button", { name: "保存并加课时" }));
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toContain(
        "tab=credits&action=credit",
      ),
    );
    const saved = demoRepository
      .read()
      .students.find((item) => item.name === "无编号充值路径");
    expect(screen.getByTestId("location").textContent).toBe(
      `/students/${saved?.id}?tab=credits&action=credit`,
    );
  });
  it("续费套餐登记订单日期和共享余额，保留原有个人余额", async()=>{
    const before=structuredClone(demoRepository.read().students[0]);
    mount(<Action action="credit"/>);choose("课时套餐","144 课时");change("业务日期","2026-10-20");
    expect(screen.queryByLabelText("充值金额")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"确认加 144 课时"}));
    await waitFor(()=>expect(demoRepository.read().orders?.[0]).toMatchObject({units:144,balance:144,date:"2026-10-20",studentIds:[before.id]}));
    expect(demoRepository.read().students[0]).toMatchObject({balance:before.balance,totalUnits:before.totalUnits,renewalStatus:"是"});
  });
  it("登记介绍人和被介绍人关系，不擅自赠课", async () => {
    const students = demoRepository.read().students;
    const before = students[0].balance;
    mount(<Action action="referral" />);
    choose(
      "介绍人",
      `${students[1].name}${students[1].groupName ? ` · ${students[1].groupName}` : ""}`,
    );
    change("业务日期", "2026-10-20");
    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));
    await waitFor(() =>
      expect(demoRepository.read().referrals).toHaveLength(1),
    );
    expect(demoRepository.read().referrals[0]).toMatchObject({
      studentId: students[0].id,
      referrerStudentId: students[1].id,
      date: "2026-10-20",
    });
    expect(demoRepository.read().students[0].balance).toBe(before);
  });
  it("退款停用明确模拟，确认后保留余额并记录各项停用结果", async () => {
    const before = structuredClone(demoRepository.read().students[0]);
    mount(<Action action="退费" />);
    expect(screen.getByText(/不执行资金退款/)).toBeTruthy();
    change("备注 / 原因", "家长已确认停止服务");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "我已与家长和老师确认本次变更" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "确认停用服务（模拟）" }),
    );
    await waitFor(() =>
      expect(demoRepository.read().students[0].orderStatus).toBe("退款"),
    );
    expect(demoRepository.read().students[0].balance).toBe(before.balance);
    expect(demoRepository.read().students[0].serviceStopResults).toHaveLength(
      4,
    );
  });
  it("服务补偿入口默认登记补偿而非续费，关联反馈并保留原续费字段", async () => {
    const student = structuredClone(demoRepository.read().students[0]);
    const feedback = demoRepository
      .read()
      .feedback.find((item) => item.studentId === student.id);
    expect(feedback).toBeDefined();
    mount(<Action action="compensate" />);
    expect(screen.getByRole("dialog", { name: "登记补偿课时" })).toBeTruthy();
    change("课时数", "2");
    change("备注 / 原因", "投诉处理补偿两课时");
    choose("关联反馈", `${feedback?.date} · ${feedback?.content}`);
    fireEvent.click(screen.getByRole("button", { name: "确认加 2 课时" }));
    await waitFor(() =>
      expect(demoRepository.read().credits[0].type).toBe("补偿"),
    );
    expect(demoRepository.read().credits[0]).toMatchObject({
      units: 2,
      feedbackId: feedback?.id,
    });
    expect(demoRepository.read().students[0].renewalStatus).toBe(
      student.renewalStatus,
    );
  });
  it("未知余额的补偿入口提供核实路径，不让用户停在不可提交的表单", async () => {
    demoRepository.execute({
      type: "student.import",
      students: [{ ...emptyStudentProfile(), name: "待核实学员" }],
      mode: "skip",
    });
    const student = demoRepository
      .read()
      .students.find((item) => item.name === "待核实学员");
    mount(<Action action="compensate" studentId={student?.id} />);
    expect(screen.getByRole("dialog", { name: "先核实剩余课时" })).toBeTruthy();
    expect(screen.queryByLabelText("课时数")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "前往核实余额" }));
    expect(screen.getByTestId("location").textContent).toBe(
      `/students/${student?.id}?tab=credits`,
    );
  });
  it("补偿去除金额和转介绍，历史关系仍保留", async () => {
    const students = demoRepository.read().students;
    demoRepository.execute({
      type: "referral.add",
      studentId: students[0].id,
      referrerStudentId: students[1].id,
      date: "2026-10-20",
      note: "原始介绍",
    });
    mount(<Action action="compensate"/>);
    expect(screen.queryByLabelText("关联转介绍")).toBeNull();
    expect(screen.queryByLabelText("充值金额")).toBeNull();
    change("课时数","2");change("备注 / 原因","课中故障补偿");
    fireEvent.click(screen.getByRole("button",{name:"确认加 2 课时"}));
    await waitFor(()=>expect(demoRepository.read().credits[0]).toMatchObject({type:"补偿",units:2}));
    expect(demoRepository.read().credits[0].referralId).toBeUndefined();
    expect(demoRepository.read().referrals).toHaveLength(1);
  });
  it("按客户课时口径登记1.5课时，总课时允许原表小数", async () => {
    const before = demoRepository.read().students[0].balance;
    const creditView = mount(<Action action="compensate" />);
    change("备注 / 原因","核实补偿");
    expect(screen.getByLabelText("课时数").getAttribute("step")).toBe("any");
    change("课时数", "1.5");
    fireEvent.click(screen.getByRole("button", { name: "确认加 1.5 课时" }));
    await waitFor(() =>
      expect(demoRepository.read().students[0].balance).toBe(before + 1.5),
    );
    expect(demoRepository.read().credits[0].units).toBe(1.5);
    creditView.unmount();
    const old = demoRepository.read().students[0];
    mount(<StudentHistoryEditor student={old} onClose={() => {}} />);
    expect(screen.getByLabelText("历史总课时").getAttribute("step")).toBe(
      "any",
    );
    change("历史总课时", "1.5");
    change("补录／更正原因", "核对原表小数课时");
    fireEvent.click(screen.getByRole("button", { name: "保存历史资料" }));
    await waitFor(() =>
      expect(
        demoRepository.read().students.find((item) => item.id === old.id)
          ?.totalUnits,
      ).toBe(1.5),
    );
  });
  it("普通资料编辑不提供老师修改入口，关联及历史老师原名均保留", async () => {
    const linked = structuredClone(demoRepository.read().students[0]);
    const linkedView = mount(
      <StudentProfileEditor student={linked} onClose={() => {}} />,
    );
    expect(screen.queryByLabelText("上课老师")).toBeNull();
    change("学生群名", "仅修改群名");
    fireEvent.click(screen.getByRole("button", { name: "保存学员资料" }));
    await waitFor(() =>
      expect(
        demoRepository.read().students.find((item) => item.id === linked.id)
          ?.groupName,
      ).toBe("仅修改群名"),
    );
    expect(
      demoRepository.read().students.find((item) => item.id === linked.id),
    ).toMatchObject({
      teacherId: linked.teacherId,
      teacherName: linked.teacherName,
    });
    linkedView.unmount();
    demoRepository.execute({
      type: "student.import",
      students: [
        {
          ...emptyStudentProfile(),
          name: "未关联老师学生",
          teacherName: "原表老师A",
        },
      ],
      mode: "skip",
    });
    const unlinked = demoRepository
      .read()
      .students.find((item) => item.name === "未关联老师学生");
    expect(unlinked).toBeDefined();
    mount(<StudentProfileEditor student={unlinked} onClose={() => {}} />);
    expect(screen.queryByLabelText("上课老师")).toBeNull();
    change("学生群名", "历史资料不变");
    fireEvent.click(screen.getByRole("button", { name: "保存学员资料" }));
    await waitFor(() =>
      expect(
        demoRepository.read().students.find((item) => item.id === unlinked?.id)
          ?.teacherName,
      ).toBe("原表老师A"),
    );
  });
  it("结课学生补记补偿明确保持服务状态，不隐式复课", async () => {
    const student = demoRepository.read().students[0];
    demoRepository.execute({
      type: "student.lifecycle",
      studentId: student.id,
      status: "结课",
      reason: "已完成原服务",
    });
    mount(<Action action="compensate" studentId={student.id} />);
    expect(
      screen.getByText(
        "本次仅登记课时，服务状态保持不变；重新上课请办理复课。",
      ),
    ).toBeTruthy();
    change("课时数", "1.5");
    change("备注 / 原因", "补记历史投诉补偿");
    fireEvent.click(screen.getByRole("button", { name: "确认加 1.5 课时" }));
    await waitFor(() =>
      expect(demoRepository.read().credits[0].type).toBe("补偿"),
    );
    expect(
      demoRepository.read().students.find((item) => item.id === student.id),
    ).toMatchObject({ status: "结课", orderStatus: "结课" });
  });
});
