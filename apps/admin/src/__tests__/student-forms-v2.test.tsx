import { act as testAct } from "@testing-library/react";
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
import {
  demoRepository,
  DEMO_STORAGE_KEY,
} from "../../../../packages/shared/src/repository";
import StudentClassIn from "../components/StudentClassIn";
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
  await testAct(async () => {
    fireEvent.change(screen.getByLabelText(label, { exact: true }), {
      target: { value },
    });
  });
}
async function choose(label: string, value: string) {
  const trigger = screen.getByRole("combobox", { name: label });
  await testAct(async () => {
    trigger.focus();
    fireEvent.click(trigger);
  });
  const option = await screen.findByRole("option", { name: value });
  await testAct(async () => {
    fireEvent.click(option);
  });
  await waitFor(() => expect(document.activeElement).toBe(trigger));
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
      学生中文名: "表单数字化验收",
      年龄: "/",
      喜欢的老师类型: "耐心",
      教材: "Power Up 1",
    };
    for (const [label, value] of Object.entries(fields))
      await change(label, value);
    expect(screen.queryByLabelText("关联老师")).toBeNull();
    const teachers = demoRepository.read().teachers;
    const active = teachers.find((teacher) => teacher.status === "在职");
    if (!active) throw new Error("缺少在职老师");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("combobox", { name: "上课老师" }));
    });
    for (const teacher of teachers.filter((item) => item.status !== "在职")) {
      expect(
        screen.queryByRole("option", {
          name: `${teacher.name} · ${teacher.so}`,
        }),
      ).toBeNull();
    }
    await testAct(async () => {
      fireEvent.click(
        screen.getByRole("option", { name: `${active.name} · ${active.so}` }),
      );
    });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("combobox", { name: "上课老师" }),
      ),
    );
    await choose("性别", "女");
    await choose("外教上课经验", "有");
    await choose("小孩性格", "内向型（慢热 一开始比较害羞，需要老师耐心引导）");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存学员资料" }));
    });
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
    for (const [label, value] of Object.entries(history))
      await change(label, value);
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "添加月份" }));
    });
    await change("第1条月份", "7月（原表，年份未注明）");
    await change("第1条实际上课", "0");
    await change("补录／更正原因", "核对原表补录");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存历史资料" }));
    });
    const saved = demoRepository
      .read()
      .students.find((item) => item.name === "表单数字化验收");
    expect(saved).toMatchObject({
      groupName: "",
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
    await change("学生中文名", "无编号充值路径");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存并加课时" }));
    });
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
  it("续费记录业务日期并累加到原套餐余额", async () => {
    const before = structuredClone(demoRepository.read().students[0]);
    mount(<Action action="credit" />);
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "续费" }));
    });
    await choose("购买课时", "144 课时");
    await change("业务日期", "2026-10-20");
    expect(screen.queryByLabelText("充值金额")).toBeNull();
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "确认加 144 课时" }));
    });
    await waitFor(() =>
      expect(
        demoRepository
          .read()
          .orders?.find((order) => order.studentIds.includes(before.id))
          ?.balance,
      ).toBe(before.balance + 144),
    );
    expect(demoRepository.read().credits[0]).toMatchObject({
      type: "续费",
      units: 144,
      date: "2026-10-20",
    });
    expect(demoRepository.read().students[0]).toMatchObject({
      balance: before.balance + 144,
      renewalStatus: before.renewalStatus,
    });
  });
  it("登记介绍人和被介绍人关系，不擅自赠课", async () => {
    const data = demoRepository.read();
    data.students[1].name = "独立介绍人";
    data.students[1].chineseName = "独立介绍人";
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
    demoRepository.refresh();
    const students = demoRepository.read().students;
    const before = students[0].balance;
    mount(<Action action="referral" />);
    await choose(
      "介绍人",
      `${students[1].name}${students[1].groupName ? ` · ${students[1].groupName}` : ""}`,
    );
    await change("业务日期", "2026-10-20");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "确认保存" }));
    });
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
    await change("备注 / 原因", "家长已确认停止服务");
    await testAct(async () => {
      fireEvent.click(
        screen.getByRole("checkbox", { name: "我已与家长和老师确认本次变更" }),
      );
    });
    await testAct(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "确认停用服务" }),
      );
    });
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
    await change("课时数", "2");
    await change("备注 / 原因", "投诉处理补偿两课时");
    await choose("关联反馈", `${feedback?.date} · ${feedback?.content}`);
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "确认加 2 课时" }));
    });
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
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "前往核实余额" }));
    });
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
    mount(<Action action="compensate" />);
    expect(screen.queryByLabelText("关联转介绍")).toBeNull();
    expect(screen.queryByLabelText("充值金额")).toBeNull();
    await change("课时数", "2");
    await change("备注 / 原因", "课中故障补偿");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "确认加 2 课时" }));
    });
    await waitFor(() =>
      expect(demoRepository.read().credits[0]).toMatchObject({
        type: "补偿",
        units: 2,
      }),
    );
    expect(demoRepository.read().credits[0].referralId).toBeUndefined();
    expect(demoRepository.read().referrals).toHaveLength(1);
  });
  it("按客户课时口径登记1.5课时，总课时允许原表小数", async () => {
    const before = demoRepository.read().students[0].balance;
    const creditView = mount(<Action action="compensate" />);
    await change("备注 / 原因", "核实补偿");
    expect(screen.getByLabelText("课时数").getAttribute("step")).toBe("any");
    await change("课时数", "1.5");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "确认加 1.5 课时" }));
    });
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
    await change("历史总课时", "1.5");
    await change("补录／更正原因", "核对原表小数课时");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存历史资料" }));
    });
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
    await change("学生中文名", "仅修改群名");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存学员资料" }));
    });
    await waitFor(() =>
      expect(
        demoRepository.read().students.find((item) => item.id === linked.id)
          ?.chineseName,
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
    await change("学生中文名", "历史资料不变");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存学员资料" }));
    });
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
    await change("课时数", "1.5");
    await change("备注 / 原因", "补记历史投诉补偿");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "确认加 1.5 课时" }));
    });
    await waitFor(() =>
      expect(demoRepository.read().credits[0].type).toBe("补偿"),
    );
    expect(
      demoRepository.read().students.find((item) => item.id === student.id),
    ).toMatchObject({ status: "结课", orderStatus: "结课" });
  });
});

it("同一购课入口累计余额，B 的余额合并后归零再购买仍共用", async () => {
  const enroll = (name: string) => {
    demoRepository.execute({
      type: "student.create",
      student: { ...emptyStudentProfile(), chineseName: name },
    });
    return demoRepository.read().students[0];
  };
  const a = enroll("安安"),
    b = enroll("蓓蓓");
  demoRepository.execute({
    type: "student.bindClassIn",
    id: a.id,
    phone: "13900001234",
    uid: "101",
  });
  const buy = async (studentId: string, kind: "新购" | "续费") => {
    const page = mount(<Action action="credit" studentId={studentId} />);
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: kind }));
    });
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "确认加 72 课时" }));
    });
    page.unmount();
  };
  await buy(a.id, "续费");
  demoRepository.execute({
    type: "credit.deduct",
    studentId: a.id,
    units: 2,
    reason: "更正",
  });
  await buy(a.id, "新购");
  expect(
    demoRepository
      .read()
      .credits.filter((row) => row.studentId === a.id && row.purchaseId)
      .map((row) => row.type),
  ).toEqual(["新购", "续费"]);
  demoRepository.execute({
    type: "credit.add",
    studentId: b.id,
    units: 10,
    kind: "赠送",
    note: "赠课",
  });
  const page = mount(<Action action="credit" studentId={b.id} />);
  expect(screen.queryByRole("button", {name:"共享已有课时"})).toBeNull();
  page.unmount();
  demoRepository.execute({type:"student.bindClassIn",id:b.id,phone:"13900001234",uid:"101"});
  demoRepository.execute({
    type: "credit.deduct",
    studentId: b.id,
    units: 152,
    reason: "历史核对",
  });
  await buy(a.id, "续费");
  const balances = demoRepository
    .read()
    .orders!.filter((order) => order.studentIds.includes(b.id));
  expect(balances).toHaveLength(1);
  expect(balances[0]).toMatchObject({ studentIds: [a.id, b.id], balance: 72 });
});

it("绑定前提示现有使用者，共用的 72 课时只展示一次", async () => {
  const lookup = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue({
      ok: true,
      json: async () => ({ uid: "101", addedToInstitution: false }),
    } as Response);
  const enroll = (name: string) => {
    demoRepository.execute({
      type: "student.create",
      student: { ...emptyStudentProfile(), chineseName: name },
    });
    return demoRepository.read().students[0];
  };
  const a = enroll("小安"),
    b = enroll("小北"),
    c = enroll("小初");
  for (const id of [a.id, b.id])
    demoRepository.execute({
      type: "student.bindClassIn",
      id,
      phone: "13900001234",
      uid: "101",
    });
  demoRepository.execute({
    type: "order.buy",
    id: "siblings",
    studentId: a.id,
    studentIds: [a.id, b.id],
    units: 72,
    date: "2026-10-31",
    kind: "新购",
    note: "",
  });
  mount(<StudentClassIn student={c} />);
  await testAct(async () => {
    fireEvent.click(screen.getByRole("button", { name: "关联账号" }));
  });
  await testAct(async () => {
    fireEvent.change(screen.getByRole("textbox", { name: "ClassIn 账号" }), {
      target: { value: "13900001234" },
    });
  });
  expect(screen.getByText(/使用学员：/).textContent).toContain(a.name);
  expect(
    screen.getAllByText(/关联后共享余额：72 课时/),
  ).toHaveLength(1);
  await testAct(async () => {
    fireEvent.click(screen.getByRole("button", { name: "核实账号" }));
  });
  await testAct(async () => {
    fireEvent.click(screen.getByRole("button", { name: "确认关联并共享课时" }));
  });
  lookup.mockRestore();
  expect(
    demoRepository.read().orders!.find((pack) => pack.id === "siblings")!
      .studentIds,
  ).toEqual([a.id, b.id, c.id]);
});

it("两人未绑号可直接共享，首次绑号列出成员并一次保存全组", async () => {
  const lookup = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue({
      ok: true,
      json: async () => ({ uid: "101", addedToInstitution: false }),
    } as Response);
  const enroll = (name: string) => {
    demoRepository.execute({
      type: "student.create",
      student: { ...emptyStudentProfile(), chineseName: name },
    });
    return demoRepository.read().students[0];
  };
  const a = enroll("未绑甲"),
    b = enroll("未绑乙");
  demoRepository.execute({
    type: "credit.add",
    studentId: a.id,
    kind: "赠送",
    units: 17,
    note: "赠课",
  });
  demoRepository.execute({
    type: "credit.add",
    studentId: b.id,
    kind: "赠送",
    units: 2,
    note: "赠课",
  });
  demoRepository.execute({type:"student.bindClassIn",id:a.id,phone:"13900001234",uid:"101"});
  mount(<StudentClassIn student={b} />);
  await testAct(async () => {
    fireEvent.click(screen.getByRole("button", { name: "关联账号" }));
  });
  await testAct(async () => {
    fireEvent.change(screen.getByRole("textbox", { name: "ClassIn 账号" }), {
      target: { value: "13900001234" },
    });
  });
  await testAct(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "核实账号" }),
    );
  });
  await testAct(async()=>{fireEvent.click(screen.getByRole("button",{name:"确认关联并共享课时"}));});
  lookup.mockRestore();
  const result = demoRepository.read();
  expect(
    result
      .classInAccounts!.find((account) => account.uid === "101")!
      .studentIds.sort(),
  ).toEqual([a.id, b.id].sort());
  expect(
    result.orders!.find((pack) => pack.studentIds.includes(b.id))!.balance,
  ).toBe(19);
});

it("关联失败不保存关联，成功后保存UID", async()=>{
 const student=demoRepository.read().students[0];
 const fetchMock=vi.spyOn(globalThis,"fetch").mockResolvedValueOnce({ok:false,json:async()=>({error:"请求结果未确认，请核实账号状态"})} as Response);
 mount(<StudentClassIn student={student}/>);
 fireEvent.click(screen.getByRole("button",{name:"关联账号"}));
 fireEvent.change(screen.getByLabelText("ClassIn 账号"),{target:{value:"student@example.com"}});
 fireEvent.click(screen.getByRole("button",{name:"核实账号"}));
 await screen.findByRole("alert");
 expect(demoRepository.read().classInAccounts?.some(a=>a.studentIds.includes(student.id))).not.toBe(true);
 fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({uid:"123",addedToInstitution:false})} as Response);
 fireEvent.click(screen.getByRole("button",{name:"核实账号"}));
 await screen.findByText("已取得 UID：123");
 fireEvent.click(screen.getByRole("button",{name:"确认关联"}));
 await screen.findByText("已关联");
 expect(demoRepository.read().classInAccounts?.find(a=>a.uid==="123")?.phone).toBe("student@example.com");
 fetchMock.mockRestore();
});

it("加课时仅展示其他共享学员，单人账号隐藏提示", () => {
  const [a,b] = demoRepository.read().students;
  demoRepository.execute({type:"student.bindClassIn",id:a.id,phone:"",uid:"7654321"});
  const first = mount(<Action action="credit" studentId={a.id}/>);
  expect(screen.queryByText(/本次课时将由/)).toBeNull();
  first.unmount();
  demoRepository.execute({type:"student.bindClassIn",id:b.id,phone:"",uid:"7654321"});
  mount(<Action action="credit" studentId={a.id}/>);
  const note = screen.getByText(/本次课时将由/);
  expect(note.textContent).toContain(b.name);
  expect(note.textContent).not.toContain(a.name);
  expect(note.textContent).toMatch(/共同使用。$/);
});
