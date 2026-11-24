import { act as testAct } from "@testing-library/react";
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as sharedReact from "@crazytalk/shared/react";
import * as teacherActions from "../pages/operations/common";
import { DemoProvider } from "@crazytalk/shared/react";
import { defaultAvatarSource, ToastProvider } from "@crazytalk/ui";
import { bindSchedulingStaff } from "../../../../tests/fixtures/scheduling";
import { demoRepository } from "../../../../packages/shared/src/repository";
import {
  stateSchema,
  teacherSchema,
} from "../../../../packages/shared/src/model";
import { DEMO_TODAY, type Command } from "@crazytalk/shared";
import Teachers from "../pages/operations/Teachers";
import { Availability } from "../../../teacher/src/screens";
import en from "../../../teacher/src/locales/en";

function mount(path: string) {
  const result = render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DemoProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/teachers" element={<Teachers />} />
              <Route path="/teachers/:id" element={<Teachers />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
  const dayMode=screen.queryByRole("button",{name:"按星期填写"});
  if(dayMode) fireEvent.click(dayMode);
  return result;
}
beforeEach(() => {
  localStorage.clear();
  demoRepository.reset();
  demoRepository.read().classInAccounts = demoRepository.read().students.map((student,index)=>({id:`verified-${student.id}`,phone:"",uid:String(123456+index),studentIds:[student.id]}));
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

describe("老师课表视图", () => {
  it("默认完整列表，周日历限定当前老师并支持跨周导航", async () => {
    const data = demoRepository.read();
    const sample = data.lessons[0];
    data.lessons = [
      {
        ...sample,
        id: "calendar-future",
        teacherId: "t1",
        date: DEMO_TODAY,
        time: "10:00",
        status: "未开始",
        material: "待上教材",
      },
      {
        ...sample,
        id: "calendar-done",
        teacherId: "t1",
        date: DEMO_TODAY,
        time: "11:00",
        status: "已完成",
        material: "完成教材",
      },
      {
        ...sample,
        id: "calendar-cancel",
        teacherId: "t1",
        date: DEMO_TODAY,
        time: "12:00",
        status: "已取消",
        material: "取消教材",
      },
      {
        ...sample,
        id: "calendar-other",
        teacherId: "t2",
        date: DEMO_TODAY,
        status: "已完成",
        material: "其他老师教材",
      },
    ];
    mount("/teachers/t1?tab=schedule");
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("完成教材")).toBeTruthy();
    expect(screen.getByText("取消教材")).toBeTruthy();
    expect(screen.queryByText("其他老师教材")).toBeNull();
    const student = data.students.find((item) => item.id === sample.studentId)!;
    const row = screen.getByText("待上教材").closest("tr")!;
    expect(within(row).getByRole("link", { name: student.name }).getAttribute("href")).toBe(`/students/${student.id}`);
    fireEvent.click(within(row).getByRole("button", { name: "查看详情" }));
    const detail = screen.getByRole("dialog", { name: "课程详情" });
    expect(detail.querySelector("dt")?.textContent).toBe("学员");
    expect(detail.querySelector("dd")?.textContent).toBe(student.name);
    expect(within(detail).queryByText(`${student.name} · ${DEMO_TODAY} 10:00`)).toBeNull();
    fireEvent.click(within(detail).getAllByRole("button", { name: "关闭" })[0]);
    fireEvent.click(screen.getByText("日历"));
    expect(screen.getByRole("region", {name:"课程周历"})).toBeTruthy();
    expect(screen.getAllByRole("button",{name:/查看课程/})).toHaveLength(3);
    fireEvent.click(screen.getByRole("button",{name:"下一周"}));
    expect(screen.queryAllByRole("button",{name:/查看课程/})).toHaveLength(0);
    fireEvent.click(screen.getByRole("button",{name:"回到本周"}));
    expect(screen.getAllByRole("button",{name:/查看课程/})).toHaveLength(3);

  });
});

describe("老师列表显示列", () => {
  it("老师名下学员的教材与学习进度分列，旧进度按统一格式展示", () => {
    const student = demoRepository
      .read()
      .students.find((item) => item.teacherId === "t1");
    if (!student) throw new Error("缺少学员");
    student.material = "Power Up 3";
    student.unit = "Unit 1 · p.4";
    mount("/teachers/t1?tab=students");
    const row = screen.getByRole("link", {name: student.name}).closest("tr")!;
    expect(within(row).getByRole("cell", {name: "Power Up 3"})).toBeTruthy();
    expect(within(row).getByRole("cell", {name: "Unit 1 / P4"})).toBeTruthy();
  });
  it("独立展示等级，可切换列并恢复默认，筛选后保留列选择", async () => {
    mount("/teachers");
    expect(screen.getByRole("columnheader", { name: "口音等级" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "导师等级" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "培训状态" })).toBeTruthy();
    expect(
      screen.queryByRole("columnheader", { name: "口音 / 等级" }),
    ).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "老师标签" })).toBeNull();
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "显示列" })); });
    await testAct(async () => { fireEvent.click(screen.getByRole("checkbox", { name: "口音等级" })); });
    await testAct(async () => { fireEvent.click(screen.getByRole("checkbox", { name: "老师标签" })); });
    expect(screen.queryByRole("columnheader", { name: "口音等级" })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "导师等级" })).toBeTruthy();
    await testAct(async () => { fireEvent.change(screen.getByPlaceholderText("搜索老师姓名或编号"), {
      target: { value: "Carol" },
    }); });
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getAllByRole("cell")).toHaveLength(
      within(rows[0]).getAllByRole("columnheader").length,
    );
    expect(within(rows[1]).getByText("温柔有耐心")).toBeTruthy();
    expect(within(rows[1]).getByText("口音好")).toBeTruthy();
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "恢复默认" })); });
    expect(screen.getByRole("columnheader", { name: "口音等级" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "老师标签" })).toBeNull();
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "显示列" })); });
    expect(screen.queryByRole("checkbox", { name: "导师等级" })).toBeNull();
  });
});

describe("老师详情资料与培训", () => {
  it("办理离职期间显示loading并防止重复提交", async () => {
    const original = teacherActions.useBusinessAction;
    let finish: () => void = () => {};
    const pending = new Promise<void>(resolve => { finish = resolve; });
    let calls = 0;
    vi.spyOn(teacherActions,"useBusinessAction").mockImplementation(() => {
      const run = original();
      return async (...args) => { calls++; await pending; return run(...args); };
    });
    mount("/teachers/t1");
    fireEvent.click(screen.getByRole("button",{name:"离职"}));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByRole("textbox", { name: /离职原因/ }),{target:{value:"离职"}});
    fireEvent.click(dialog.getByRole("button",{name:"确认离职"}));
    const busy = dialog.getByRole("button",{name:"正在办理离职"});
    expect(busy.hasAttribute("disabled")).toBe(true);
    fireEvent.click(busy);
    expect(calls).toBe(1);
    await testAct(async () => { finish(); await pending; });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each(["无学员", "仅绑定", "有课程"])("离职弹窗按影响范围展示提示：%s", async scenario => {
    const data = demoRepository.read();
    data.students.forEach(s => { s.teacherId = ""; });
    const sample = data.lessons[0];
    data.lessons = [];
    data.slotLocks = [];
    if (scenario !== "无学员") { data.students[0].teacherId = "t1"; data.students[0].status = "在读"; }
    if (scenario === "有课程") data.lessons = [1,2].map(i => ({...sample,id:`offboard-${i}`,studentId:data.students[0].id,teacherId:"t1",status:"未开始",date:"2099-01-02"}));
    mount("/teachers/t1");
    await testAct(async () => { fireEvent.click(screen.getByRole("button", {name:"离职"})); });
    const dialog=within(screen.getByRole("dialog"));
    const notice=dialog.getByText(scenario === "无学员" ? /目前该老师没有需要继续上课/ : scenario === "仅绑定" ? /1 位学员需要继续上课，目前暂无待上课程/ : /1 位学员，合计 2 节待上课程/).closest(".notice");
    expect(notice?.classList.contains("notice-danger")).toBe(scenario !== "无学员");
  });

  it("老师离职仅填写原因即可确认，无需输入姓名", async () => {
    mount("/teachers/t1");
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "离职" })); });
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.queryByText(/输入老师姓名/)).toBeNull();
    expect((dialog.getByLabelText("计薪结束时间") as HTMLInputElement).value).toBe(DEMO_TODAY);
    const confirm = dialog.getByRole("button", { name: "确认离职" });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    await testAct(async () => { fireEvent.change(dialog.getByRole("textbox", { name: /离职原因/ }), { target: { value: "个人原因" } }); });
    expect(confirm.hasAttribute("disabled")).toBe(false);
    await testAct(async () => { fireEvent.click(confirm); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(demoRepository.read().teachers.find(item => item.id === "t1")).toMatchObject({ status: "已离职", payrollEndDate: DEMO_TODAY });
  });
  it.each([undefined, "/avatars/avatar-3.webp", "https://example.com/teacher.webp"])(
    "修改姓名保留当前头像并保存：%s",
    async (photo) => {
      const teacher = demoRepository.read().teachers[0];
      teacher.photo = photo;
      const originalPhoto = photo || defaultAvatarSource(teacher.name);
      mount(`/teachers/${teacher.id}`);
      await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "编辑资料" })); });
      const dialog = within(screen.getByRole("dialog"));
      for (const name of ["M", "Mi", "Miya"]) {
        await testAct(async () => { fireEvent.change(dialog.getByPlaceholderText("输入老师姓名"), { target: { value: name } }); });
        expect(dialog.getByAltText(`${name}的头像`).getAttribute("src")).toBe(originalPhoto);
        if (originalPhoto.startsWith("/avatars/")) {
          const selected = dialog.getAllByRole("button", { name: /^默认头像 / }).filter(button => button.getAttribute("aria-pressed") === "true");
          expect(selected).toHaveLength(1);
          expect(selected[0].querySelector("img")?.getAttribute("src")).toBe(originalPhoto);
        }
      }
      await testAct(async () => { fireEvent.click(dialog.getByRole("button", { name: "保存老师" })); });
      expect(demoRepository.read().teachers.find(item => item.id === teacher.id)?.photo).toBe(originalPhoto);
      expect(screen.getByAltText("Miya的头像").getAttribute("src")).toBe(originalPhoto);
    },
  );
  it("新建预选默认头像，保存后可编辑更换并同步详情", async () => {
    mount("/teachers");
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: /新建老师/ })); });
    expect(
      screen
        .getByRole("button", { name: "默认头像 1" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(screen.getByRole("group", { name: "默认头像" })).getAllByRole(
        "button",
      ),
    ).toHaveLength(4);
    await testAct(async () => { fireEvent.change(screen.getByPlaceholderText("输入老师姓名"), {
      target: { value: "Avatar Test" },
    }); });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "保存老师" })); });
    const saved = demoRepository
      .read()
      .teachers.find((item) => item.name === "Avatar Test");
    expect(saved?.photo).toBe("/avatars/avatar-1.webp");
    cleanup();
    mount(`/teachers/${saved?.id}`);
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "编辑资料" })); });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "默认头像 4" })); });
    expect(
      screen
        .getByRole("button", { name: "默认头像 1" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "保存老师" })); });
    expect(screen.getByAltText("Avatar Test的头像").getAttribute("src")).toBe(
      "/avatars/avatar-4.webp",
    );
    expect(
      demoRepository.read().teachers.find((item) => item.id === saved?.id)
        ?.photo,
    ).toBe("/avatars/avatar-4.webp");
  });
  it("旧老师资料无需补填新字段即可读取，quiz 拒绝超范围成绩", () => {
    const legacy = demoRepository.read().teachers[0];
    expect(teacherSchema.parse(legacy).trained).toBe(true);
    expect(teacherSchema.parse(legacy).quizScore).toBeUndefined();
    expect(teacherSchema.safeParse({ ...legacy, quizScore: -1 }).success).toBe(
      false,
    );
    expect(teacherSchema.safeParse({ ...legacy, quizScore: 101 }).success).toBe(
      false,
    );
  });
  it("保存头像、独立开课日期、证书、标签与备注并展示", async () => {
    mount("/teachers/t1");
    expect(
      within(screen.getByLabelText("基本信息")).queryByText("英文名"),
    ).toBeNull();
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "编辑资料" })); });
    const dialog = within(screen.getByRole("dialog", { name: "编辑老师" }));
    if(dialog.queryByRole("button",{name:"按星期填写"})) fireEvent.click(dialog.getByRole("button",{name:"按星期填写"}));
    await testAct(async () => { fireEvent.click(dialog.getByRole("checkbox", { name: "TEFL" })); });
    await testAct(async () => { fireEvent.click(dialog.getByRole("checkbox", { name: "TESOL" })); });
    await testAct(async () => { fireEvent.click(dialog.getByRole("button", {name:"移除标签 口音好"})); });
    await testAct(async () => { fireEvent.click(dialog.getByRole("checkbox", {name:/会唱歌/})); });
    expect(dialog.queryByLabelText("老师介绍")).toBeNull();
    expect(dialog.getAllByRole("heading", {level:3}).map(el=>el.textContent)).toEqual(["基本信息","教学信息","对外介绍","排课信息","培训与内部记录"]);
    await testAct(async () => {
      fireEvent.change(dialog.getByLabelText("教育背景"), {target:{value:"化学工程学士 Bachelor of Science"}});
      fireEvent.change(dialog.getByLabelText("教学经验"), {target:{value:"五年教学经验"}});
      fireEvent.change(dialog.getByLabelText("教师寄语与教学特色"), {target:{value:"用游戏陪伴孩子学习"}});
    });
    await testAct(async () => { fireEvent.change(dialog.getByLabelText("内部备注"), {
      target: { value: "优先安排晚间课程" },
    }); });
    await testAct(async () => { fireEvent.change(dialog.getByLabelText("开课日期"), {
      target: { value: "2026-11-10" },
    }); });
    await testAct(async () => { fireEvent.change(dialog.getByLabelText("上传老师头像"), {
      target: {
        files: [new File(["photo"], "teacher.png", { type: "image/png" })],
      },
    }); });
    await waitFor(() =>
      expect(dialog.getByRole("button", { name: "更换头像" })).toBeTruthy(),
    );
    expect(dialog.queryByRole("button", { name: "使用默认头像" })).toBeNull();
    await testAct(async () => { fireEvent.click(dialog.getByRole("button", { name: "保存老师" })); });
    const saved = demoRepository.read().teachers[0];
    expect(saved).toMatchObject({
      certificates: "TEFL、TESOL",
      tags: ["tt-34", "tt-48"],
      notes: "优先安排晚间课程",
      educationBackground: "化学工程学士 Bachelor of Science",
      teachingExperience: "五年教学经验",
      teachingPhilosophy: "用游戏陪伴孩子学习",
      startDate: "2026-11-10",
      availabilityFrom: "",
    });
    const persisted = stateSchema.parse(
      JSON.parse(localStorage.getItem("crazytalk-demo-v1") || "null"),
    );
    expect(persisted.teachers[0]).toMatchObject({
      photo: saved.photo,
      certificates: "TEFL、TESOL",
      notes: "优先安排晚间课程",
      educationBackground: "化学工程学士 Bachelor of Science",
      teachingExperience: "五年教学经验",
      teachingPhilosophy: "用游戏陪伴孩子学习",
      startDate: "2026-11-10",
    });
    expect(saved.photo).toMatch(/^data:image\/png;base64,/);
    expect(screen.getByText("TEFL、TESOL")).toBeTruthy();
    expect(screen.getByText("优先安排晚间课程")).toBeTruthy();
    expect(screen.getByText("五年教学经验")).toBeTruthy();
    expect(screen.getByText("用游戏陪伴孩子学习")).toBeTruthy();
    expect(screen.getAllByAltText("T. Carol的头像")).toHaveLength(1);
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "编辑资料" })); });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "默认头像 3" })); });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "保存老师" })); });
    expect(demoRepository.read().teachers[0].photo).toBe(
      "/avatars/avatar-3.webp",
    );
    expect(screen.getByAltText("T. Carol的头像").getAttribute("src")).toBe(
      "/avatars/avatar-3.webp",
    );
  }, 15000);

  it("培训项目独立登记，零分可保存，取消视频培训不修改在职状态", async () => {
    mount("/teachers/t1?tab=training");
    expect(screen.queryByText(/92 分/)).toBeNull();
    expect(screen.getAllByText("未登记").length).toBeGreaterThan(0);
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "编辑培训记录" })); });
    expect(screen.getByRole("dialog", { name: "编辑培训记录" }).classList.contains("modal")).toBe(true);
    const dialog = within(screen.getByRole("dialog", { name: "编辑培训记录" }));
    if(dialog.queryByRole("button",{name:"按星期填写"})) fireEvent.click(dialog.getByRole("button",{name:"按星期填写"}));
    expect(dialog.queryByLabelText("内部备注")).toBeNull();
    expect(dialog.queryByText("每周常规可用时间")).toBeNull();
    await testAct(async () => { fireEvent.change(dialog.getByLabelText("quiz 成绩"), {
      target: { value: "101" },
    }); });
    expect(
      dialog.getByRole("button", { name: "保存培训记录" }).hasAttribute("disabled"),
    ).toBe(true);
    await testAct(async () => { fireEvent.change(dialog.getByLabelText("quiz 成绩"), {
      target: { value: "0" },
    }); });
    await testAct(async () => { fireEvent.click(dialog.getByLabelText("视频培训已完成")); });
    await testAct(async () => { fireEvent.click(dialog.getByLabelText("RC")); });
    await testAct(async () => { fireEvent.click(screen.getByRole("option", { name: "已完成" })); });
    await testAct(async () => { fireEvent.change(dialog.getByLabelText("老师培训"), {
      target: { value: "已参加课堂互动培训" },
    }); });
    await testAct(async () => { fireEvent.click(dialog.getByRole("button", { name: "保存培训记录" })); });
    expect(demoRepository.read().teachers[0]).toMatchObject({
      quizScore: 0,
      rcTraining: "已完成",
      trained: false,
      status: "在职",
      teacherTraining: "已参加课堂互动培训",
    });
    expect(demoRepository.read().teachers[0].titTraining).toBeUndefined();
    expect(screen.getByText("0 分")).toBeTruthy();
    expect(screen.getByText("已参加课堂互动培训")).toBeTruthy();
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "编辑培训记录" })); });
    await testAct(async () => { fireEvent.change(screen.getByLabelText("quiz 成绩"), {
      target: { value: "" },
    }); });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "保存培训记录" })); });
    expect(demoRepository.read().teachers[0].quizScore).toBeNull();
  });
});

async function chooseTime(label: string, time: string) {
  const english = label.startsWith("Mon ");
  const [hour, minute] = time.split(":");
  const trigger = screen.getByLabelText(label + (english ? " choose time" : " 选择时间"));
  fireEvent.click(trigger);
  const picker = within(screen.getByRole("dialog", { name: label }));
  fireEvent.click(picker.getByLabelText(hour + (english ? " hour" : " 时")));
  fireEvent.click(picker.getByLabelText(minute + (english ? " minute" : " 分")));
  await waitFor(() => expect(document.activeElement).toBe(trigger));
}

describe("教师常规可用时间表单", () => {
  it("自定义时间浮层选择小时和分钟后更新字段并关闭", async () => {
    mount("/teachers/t1?tab=availability");
    await testAct(async () => { fireEvent.click(
      screen.getByRole("button", { name: "周一 开始时间 1 选择时间" }),
    ); });
    expect(screen.getAllByRole("button", { name: /^\d{2} 分$/ }).map(button => button.textContent)).toEqual(["00", "30"]);
    expect(screen.getByRole("textbox", { name: "周一 开始时间 1" }).hasAttribute("readonly")).toBe(true);
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "09 时" })); });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "30 分" })); });
    expect(screen.getByLabelText("周一 开始时间 1").getAttribute("value")).toBe(
      "09:30",
    );
    expect(screen.queryByRole("button", { name: "30 分" })).toBeNull();
  });
  it("取消授课日后重新选中，恢复当天全部不连续时段", async () => {
    mount("/teachers/t1?tab=availability");
    await chooseTime("周一 开始时间 1", "10:00");
    await chooseTime("周一 结束时间 1", "12:00");
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "周一 添加时段" })); });
    await chooseTime("周一 开始时间 2", "19:00");
    await chooseTime("周一 结束时间 2", "21:00");
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "周一" })); });
    expect(screen.queryByLabelText("周一 开始时间 1")).toBeNull();
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "周一" })); });
    expect(screen.getByLabelText("周一 开始时间 1").getAttribute("value")).toBe(
      "10:00",
    );
    expect(screen.getByLabelText("周一 结束时间 1").getAttribute("value")).toBe(
      "12:00",
    );
    expect(screen.getByLabelText("周一 开始时间 2").getAttribute("value")).toBe(
      "19:00",
    );
    expect(screen.getByLabelText("周一 结束时间 2").getAttribute("value")).toBe(
      "21:00",
    );
  });
  it("一键把周一多段时间应用到工作日，替换原时段并保留周末", async () => {
    mount("/teachers");
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: /新建老师/ })); });
    const dialog = within(screen.getByRole("dialog", { name: "新建老师" }));
    if(dialog.queryByRole("button",{name:"按星期填写"})) fireEvent.click(dialog.getByRole("button",{name:"按星期填写"}));
    await testAct(async () => { fireEvent.change(dialog.getByLabelText("英文名"), {
      target: { value: "T. Weekdays" },
    }); });
    await testAct(async () => { fireEvent.click(
      dialog.queryByRole("button", { name: "周一 添加时段" }) ||
        dialog.getByRole("button", { name: "周一" }),
    ); });
    await chooseTime("周一 结束时间 1", "18:00");
    await testAct(async () => { fireEvent.click(
      dialog.queryByRole("button", { name: "周一 添加时段" }) ||
        dialog.getByRole("button", { name: "周一" }),
    ); });
    await chooseTime("周一 开始时间 2", "19:30");
    await testAct(async () => { fireEvent.click(
      dialog.queryByRole("button", { name: "周二 添加时段" }) ||
        dialog.getByRole("button", { name: "周二" }),
    ); });
    await chooseTime("周二 开始时间 1", "20:00");
    await testAct(async () => { fireEvent.click(
      dialog.queryByRole("button", { name: "周六 添加时段" }) ||
        dialog.getByRole("button", { name: "周六" }),
    ); });
    await chooseTime("周六 开始时间 1", "12:30");
    await chooseTime("周六 结束时间 1", "14:30");
    await testAct(async () => { fireEvent.click(dialog.getByRole("button", { name: "周一 复制时段" })); });
    for (const day of ["周二", "周三", "周四", "周五"])
      await testAct(async () => { fireEvent.click(dialog.getByRole("checkbox", { name: day })); });
    await testAct(async () => { fireEvent.click(dialog.getByRole("button", { name: "确认复制" })); });
    expect(dialog.getByLabelText("周二 开始时间 1").getAttribute("value")).toBe(
      "17:00",
    );
    expect(dialog.getByLabelText("周五 开始时间 2").getAttribute("value")).toBe(
      "19:30",
    );
    expect(dialog.getByLabelText("周六 结束时间 1").getAttribute("value")).toBe(
      "14:30",
    );
    await testAct(async () => { fireEvent.click(dialog.getByRole("button", { name: "保存老师" })); });
    const saved = demoRepository
      .read()
      .teachers.find((teacher) => teacher.name === "T. Weekdays");
    expect(saved?.availability).toHaveLength(11);
    for (const day of [1, 2, 3, 4, 5])
      expect(saved?.availability.filter((range) => range.day === day)).toEqual([
        { day, start: "17:00", end: "18:00" },
        { day, start: "19:30", end: "22:00" },
      ]);
    expect(saved?.availability.filter((range) => range.day === 6)).toEqual([
      { day: 6, start: "12:30", end: "14:30" },
    ]);
    expect(saved?.availability.some((range) => range.day === 0)).toBe(false);
  }, 15000);

  it("建档时不默认开放，按星期填写多段并保存半小时时段和说明", async () => {
    mount("/teachers");
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: /新建老师/ })); });
    const dialog = within(screen.getByRole("dialog", { name: "新建老师" }));
    if(dialog.queryByRole("button",{name:"按星期填写"})) fireEvent.click(dialog.getByRole("button",{name:"按星期填写"}));
    expect(dialog.getByText(/尚未填写常规可用时间/)).toBeTruthy();
    await testAct(async () => { fireEvent.change(dialog.getByLabelText("英文名"), {
      target: { value: "T. Time Test" },
    }); });
    await testAct(async () => { fireEvent.click(
      dialog.queryByRole("button", { name: "周一 添加时段" }) ||
        dialog.getByRole("button", { name: "周一" }),
    ); });
    await chooseTime("周一 结束时间 1", "18:00");
    await testAct(async () => { fireEvent.click(
      dialog.queryByRole("button", { name: "周一 添加时段" }) ||
        dialog.getByRole("button", { name: "周一" }),
    ); });
    await chooseTime("周一 开始时间 2", "19:30");
    await chooseTime("周一 结束时间 2", "22:00");
    expect(dialog.queryByLabelText("开始使用日期（选填）")).toBeNull();
    await testAct(async () => { fireEvent.change(dialog.getByLabelText("时间说明（选填）"), {
      target: { value: "周五休息，临时安排先联系" },
    }); });
    await testAct(async () => { fireEvent.click(dialog.getByRole("button", { name: "保存老师" })); });
    expect(
      demoRepository
        .read()
        .teachers.find((teacher) => teacher.name === "T. Time Test"),
    ).toMatchObject({
      availability: [
        { day: 1, start: "17:00", end: "18:00" },
        { day: 1, start: "19:30", end: "22:00" },
      ],
      availabilityFrom: "",
      availabilityNote: "周五休息，临时安排先联系",
      availabilitySource: "entered",
    });
  });

  it("同一天重叠时给出可理解的提示并阻止保存", async () => {
    mount("/teachers");
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: /新建老师/ })); });
    const dialog = within(screen.getByRole("dialog", { name: "新建老师" }));
    if(dialog.queryByRole("button",{name:"按星期填写"})) fireEvent.click(dialog.getByRole("button",{name:"按星期填写"}));
    await testAct(async () => { fireEvent.change(dialog.getByLabelText("英文名"), {
      target: { value: "T. Overlap" },
    }); });
    await testAct(async () => { fireEvent.click(
      dialog.queryByRole("button", { name: "周一 添加时段" }) ||
        dialog.getByRole("button", { name: "周一" }),
    ); });
    await testAct(async () => { fireEvent.click(
      dialog.queryByRole("button", { name: "周一 添加时段" }) ||
        dialog.getByRole("button", { name: "周一" }),
    ); });
    await chooseTime("周一 开始时间 2", "19:00");
    expect(dialog.getByRole("alert").textContent).toMatch(/不能重叠/);
    expect(
      dialog.getByRole("button", { name: "保存老师" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      demoRepository
        .read()
        .teachers.some((teacher) => teacher.name === "T. Overlap"),
    ).toBe(false);
  });

  it("修改时间先列出受影响课程，确认保存后保留课程", async () => {
    bindSchedulingStaff(demoRepository.read());
    demoRepository.execute({
      type: "lesson.schedule",
      studentId: "s4",
      teacherId: "t1",
      slots: [{ date: "2026-11-20", time: "10:30" }],
      duration: 25,
      kind: "固定课",
      material: "Think 1",
    });
    const scheduled = demoRepository
      .read()
      .lessons.find(
        (lesson) =>
          lesson.date === "2026-11-20" &&
          lesson.time === "10:30" &&
          lesson.teacherId === "t1",
      );
    if (!scheduled) throw new Error("Missing scheduled lesson");
    mount("/teachers/t1?tab=availability");
    await chooseTime("周五 结束时间 1", "10:30");
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "保存可用时间" })); });
    const dialog = within(
      screen.getByRole("dialog", { name: "确认调整可上课时间" }),
    );
    expect(dialog.getByText("2026-11-20 10:30")).toBeTruthy();
    expect(
      demoRepository
        .read()
        .teachers[0].availability.find((range) => range.day === 5)?.end,
    ).toBe("18:00");
    await testAct(async () => { fireEvent.click(
      dialog.getByRole("button", { name: "确认保存，保留现有课程" }),
    ); });
    expect(
      demoRepository
        .read()
        .teachers[0].availability.find((range) => range.day === 5)?.end,
    ).toBe("10:30");
    expect(
      demoRepository
        .read()
        .lessons.find((lesson) => lesson.id === scheduled.id),
    ).toMatchObject({
      date: scheduled.date,
      time: scheduled.time,
      status: "未开始",
    });
  });

  it("教师端用英文维护同一份半小时可用时间，不发起虚假的请假申请", async () => {
    const data = demoRepository.read();
    const run = vi.fn((command: Command) => {
      demoRepository.execute(command);
      return true;
    });
    render(
      <Availability
        teacher={data.teachers[0]}
        lessons={data.lessons.filter((lesson) => lesson.teacherId === "t1")}
        leaves={[]}
        t={(key) => en[key]}
        language="en"
        run={run}
      />,
    );
    fireEvent.click(screen.getByRole("button",{name:"By day"}));
    await chooseTime("Mon end 1", "17:30");
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "Save availability" })); });
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0][0].type).toBe("teacher.save");
    expect(
      demoRepository
        .read()
        .teachers[0].availability.find((range) => range.day === 1)?.end,
    ).toBe("17:30");
    expect(demoRepository.read().leaves).toHaveLength(data.leaves.length);
  });
});

describe("老师中心普通筛选", () => {
  it("默认全部老师，不展示快捷视图", () => {
    mount("/teachers");
    expect(
      screen.getByText(`共 ${demoRepository.read().teachers.length} 位老师`),
    ).toBeTruthy();
    expect(
      screen.queryByRole("tab", { name: /可排课|在职|本周被投诉/ }),
    ).toBeNull();
  });
  it("任职和培训条件组合筛选，清除后恢复全部", async () => {
    const data = demoRepository.read();
    mount("/teachers?status=在职&training=completed");
    expect(
      screen.getByText(
        `共 ${data.teachers.filter((t) => t.status === "在职" && t.trained).length} 位老师`,
      ),
    ).toBeTruthy();
    await testAct(async () => { fireEvent.click(screen.getByRole("combobox", { name: "培训状态" })); });
    await testAct(async () => { fireEvent.click(screen.getByRole("option", { name: "未完成培训" })); });
    expect(
      screen.getByText(
        `共 ${data.teachers.filter((t) => t.status === "在职" && !t.trained).length} 位老师`,
      ),
    ).toBeTruthy();
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "清除全部筛选" })); });
    expect(screen.getByText(`共 ${data.teachers.length} 位老师`)).toBeTruthy();
  });
  it("搜索与SO筛选可一并清除", async () => {
    const data = demoRepository.read();
    mount("/teachers");
    await testAct(async () => { fireEvent.click(screen.getByRole("combobox", { name: "筛选 SO" })); });
    await testAct(async () => { fireEvent.click(screen.getByRole("option", { name: data.teachers[0].so })); });
    await testAct(async () => { fireEvent.change(screen.getByPlaceholderText("搜索老师姓名或编号"), {
      target: { value: "不存在的老师" },
    }); });
    expect(screen.getByText("没有符合条件的老师")).toBeTruthy();
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "清除全部筛选" })); });
    expect(screen.getByText(`共 ${data.teachers.length} 位老师`)).toBeTruthy();
  });
  it("旧排课链接转为可见普通条件，清除恢复全部", async () => {
    const data = demoRepository.read();
    mount("/teachers?view=可排课");
    expect(
      screen.getByRole("combobox", { name: "任职状态" }).textContent,
    ).toContain("在职");
    expect(
      screen.getByText(
        `共 ${data.teachers.filter((t) => t.status === "在职" && (!data.rules.trainingRequired || t.trained)).length} 位老师`,
      ),
    ).toBeTruthy();
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "清除全部筛选" })); });
    expect(screen.getByText(`共 ${data.teachers.length} 位老师`)).toBeTruthy();
  });
});

it("证书多选回显旧证书，允许增选 CELTA 及取消其他", async () => {
  demoRepository.read().teachers[0].certificates = "TEFL、旧资格证";
  mount("/teachers/t1");
  await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "编辑资料" })); });
  const dialog = within(screen.getByRole("dialog", { name: "编辑老师" }));
    if(dialog.queryByRole("button",{name:"按星期填写"})) fireEvent.click(dialog.getByRole("button",{name:"按星期填写"}));
  expect((dialog.getByRole("checkbox", { name: "TEFL" }) as HTMLInputElement).checked).toBe(true);
  expect((dialog.getByRole("checkbox", { name: "其他" }) as HTMLInputElement).checked).toBe(true);
  expect(dialog.getByText("其他证书：旧资格证")).toBeTruthy();
  await testAct(async () => { fireEvent.click(dialog.getByRole("checkbox", { name: "CELTA" })); });
  await testAct(async () => { fireEvent.click(dialog.getByRole("button", { name: "保存老师" })); });
  expect(demoRepository.read().teachers[0].certificates).toBe("TEFL、旧资格证、CELTA");
  await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "编辑资料" })); });
  const reopened = within(screen.getByRole("dialog", { name: "编辑老师" }));
  await testAct(async () => { fireEvent.click(reopened.getByRole("checkbox", { name: "其他" })); });
  await testAct(async () => { fireEvent.click(reopened.getByRole("checkbox", { name: "TEFL" })); });
  await testAct(async () => { fireEvent.click(reopened.getByRole("checkbox", { name: "CELTA" })); });
  await testAct(async () => { fireEvent.click(reopened.getByRole("button", { name: "保存老师" })); });
  expect(demoRepository.read().teachers[0].certificates).toBe("");
});

it("业务版新建老师不显示ClassIn绑定，详情页独立入口绑定", async () => {
  vi.spyOn(sharedReact, "businessMode").mockReturnValue(true);
  const view = mount("/teachers");
  fireEvent.click(await screen.findByRole("button", {name:/新建老师/}));
  const create = within(screen.getByRole("dialog", {name:"新建老师"}));
  expect(create.queryByLabelText("ClassIn 新账号初始密码")).toBeNull();
  expect(create.queryByRole("button", {name:"注册/获取老师 UID"})).toBeNull();
  view.unmount();
  mount("/teachers/" + demoRepository.read().teachers[0].id);
  fireEvent.click(await screen.findByRole("button", {name:"编辑资料"}));
  const edit = within(screen.getByRole("dialog", {name:"编辑老师"}));
  expect(edit.queryByLabelText("ClassIn 新账号初始密码")).toBeNull();
  fireEvent.click(edit.getByRole("button",{name:"取消"}));
  fireEvent.click(screen.getByRole("button",{name:"关联账号"}));
  const binding=within(screen.getByRole("dialog",{name:"关联 ClassIn 账号"}));
  expect(binding.queryByLabelText("ClassIn UID")).toBeNull();
  expect(binding.getByLabelText("ClassIn 账号")).toBeTruthy();
  expect(binding.queryByLabelText("新账号初始密码")).toBeNull();
  expect(binding.queryByLabelText("新账号初始密码")).toBeNull();
  expect(binding.getByText(/请填写已注册的 ClassIn 手机号或邮箱/)).toBeTruthy();
});

it("新建老师默认在职，任职状态仅含在职和已离职", async () => {
  mount("/teachers");
  fireEvent.click(await screen.findByRole("button", {name:/新建老师/}));
  const form=within(screen.getByRole("dialog", {name:"新建老师"}));
  const status=form.getByRole("combobox", {name:"在职状态"});
  expect(status.textContent).toBe("在职");
  fireEvent.click(status);
  expect((await screen.findAllByRole("option")).map(option=>option.textContent)).toEqual(["在职", "已离职"]);
});

it("可上课时间中的排课信息复用资料抽屉，取消不保存、保存回显且保留其他资料", async()=>{
  const scroll = vi.fn();
  const previousScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
  Object.defineProperty(HTMLElement.prototype,"scrollIntoView",{configurable:true,value:scroll});
  try {
    const before = structuredClone(demoRepository.read().teachers[0]);
    mount("/teachers/t1");
    await testAct(async()=>{fireEvent.click(screen.getByRole("button",{name:"编辑排课信息"}));});
    let dialog=within(screen.getByRole("dialog",{name:"编辑老师"}));
    expect(scroll).toHaveBeenCalledWith({block:"start"});
    fireEvent.change(dialog.getByLabelText("开课日期"),{target:{value:"2026-12-01"}});
    await testAct(async()=>{fireEvent.click(dialog.getByRole("button",{name:"取消"}));});
    expect(demoRepository.read().teachers[0]).toEqual(before);
    await testAct(async()=>{fireEvent.click(screen.getByRole("button",{name:"编辑排课信息"}));});
    dialog=within(screen.getByRole("dialog",{name:"编辑老师"}));
    fireEvent.change(dialog.getByLabelText("开课日期"),{target:{value:"2026-12-01"}});
    fireEvent.click(dialog.getByRole("checkbox",{name:"排课前需要先和老师确认"}));
    await testAct(async()=>{fireEvent.click(dialog.getByRole("button",{name:"保存老师"}));});
    await waitFor(()=>expect(screen.queryByRole("dialog",{name:"编辑老师"})).toBeNull());
    expect(demoRepository.read().teachers[0]).toMatchObject({...before,startDate:"2026-12-01",needConfirm:!before.needConfirm,availabilitySource:"entered"});
    expect(within(screen.getByLabelText("排课信息")).getByText("2026-12-01")).toBeTruthy();
  } finally {
    if(previousScroll)Object.defineProperty(HTMLElement.prototype,"scrollIntoView",previousScroll);
    else Reflect.deleteProperty(HTMLElement.prototype,"scrollIntoView");
  }
});
