import { describe, expect, it } from "vitest";
import { createSeed } from "./seed";
import { assertCommandAccess, scopeState } from "./access";
import { parseCommand } from "./commandSchema";
import { permissionGroups, stateSchema } from "./model";

describe("业务接口权限边界", () => {
  it("业务角色表缺少超级管理员或仍使用旧定义时，管理员可查看完整系统角色", () => {
    const state = createSeed();
    const account = state.accounts.find((item) => item.roleId === "admin")!;
    const identity = {
      accountId: account.id,
      roleId: account.roleId,
      name: account.name,
    };
    const teacherRole = {
      id: "teacher",
      name: "老师",
      description: "本人教学业务",
      permissions: [],
      scope: "本人",
    };
    const expected = {
      id: "admin",
      name: "超级管理员",
      permissions: permissionGroups.flatMap((group) => group.keys),
      scope: "全部",
    };

    state.roles = [teacherRole];
    expect(scopeState(state, identity).roles).toMatchObject([
      expected,
      teacherRole,
    ]);

    state.roles.push({
      id: "admin",
      name: "管理员",
      description: "系统管理员",
      permissions: [],
      scope: "全部",
    });
    expect(scopeState(state, identity).roles).toMatchObject([
      expected,
      teacherRole,
    ]);
  });

  it("按账号队组拒绝越权操作及重新归属", () => {
    const state = createSeed();
    const account = state.accounts.find((item) => item.id === "u2")!;
    const identity = {
      accountId: account.id,
      roleId: account.roleId,
      name: account.name,
    };
    const student = state.students.find(
      (item) => item.owner === account.name,
    )!;
    const other = state.students.find(
      (item) => item.owner !== account.name,
    )!;
    expect(() =>
      assertCommandAccess(state, identity, {
        type: "credit.add",
        studentId: student.id,
        units: 1,
        kind: "补偿",
        note: "核实补偿",
      }),
    ).not.toThrow();
    expect(() =>
      assertCommandAccess(state, identity, {
        type: "credit.add",
        studentId: other.id,
        units: 1,
        kind: "补偿",
        note: "核实补偿",
      }),
    ).toThrow("数据范围");
    expect(() =>
      assertCommandAccess(state, identity, {
        type: "student.details.update",
        id: student.id,
        patch: { owner: other.owner },
        expected: { owner: student.owner },
      }),
    ).toThrow("数据范围");
    expect(
      scopeState(state, identity).students.every(
        (item) => item.owner === account.name,
      ),
    ).toBe(true);
    expect(() => assertCommandAccess(state, identity, {
      type: "student.details.update", id: student.id,
      patch: {project: "乐说"}, expected: {project: student.project},
    })).not.toThrow();
    student.email = "student@example.com";
    const role = state.roles.find((item) => item.id === identity.roleId)!;
    role.permissions = role.permissions.filter(
      (key) => key !== "field.student_phone",
    );
    expect(
      scopeState(state, identity).students.find((item) => item.id === student.id)
        ?.email,
    ).toBe("");
    expect(() =>
      assertCommandAccess(state, identity, {
        type: "student.details.update",
        id: student.id,
        patch: { email: "updated@example.com" },
        expected: { email: student.email },
      }),
    ).toThrow("你没有修改学员邮箱的权限");
  });

  it("范围内学员不能借用范围外课程或课时账户", () => {
    const state = createSeed();
    const account = state.accounts.find((item) => item.id === "u2")!;
    const identity = {
      accountId: account.id,
      roleId: account.roleId,
      name: account.name,
    };
    const student = state.students.find(
      (item) => item.owner === account.name,
    )!;
    const other = state.students.find(
      (item) => item.owner !== account.name,
    )!;
    state.orders = [
      {
        id: "foreign",
        studentIds: [other.id],
        units: 72,
        balance: 72,
        date: "2026-11-18",
        kind: "新购",
        channel: other.channel,
        project: other.project,
      },
    ];
    expect(() =>
      assertCommandAccess(state, identity, {
        type: "credit.deduct",
        studentId: student.id,
        orderId: "foreign",
        units: 1,
        reason: "测试",
      }),
    ).toThrow("课时账户");
    expect(() =>
      assertCommandAccess(state, identity, {
        type: "student.courseReminder.preview",
        studentId: student.id,
        lessonId: "unknown",
        kind: "before",
      }),
    ).toThrow("课程与学员");
  });

  it("老师只能提交本人课节且不能修改本人薪资资料", () => {
    const state = createSeed();
    const teacher = state.teachers[0];
    state.accounts.push({
      id: "teacher-account",
      name: teacher.name,
      phone: teacher.phone,
      roleId: "teacher",
      scope: "本人负责",
      enabled: true,
    });
    const identity = {
      accountId: "teacher-account",
      name: teacher.name,
      roleId: "teacher",
      teacherId: teacher.id,
    };
    expect(() =>
      assertCommandAccess(state, identity, {
        type: "teacher.save",
        teacher: { ...teacher, so: "other" },
      }),
    ).toThrow("仅可编辑");
    expect(() =>
      assertCommandAccess(state, identity, {
        type: "teacher.save",
        teacher: { ...teacher, availability: [] },
      }),
    ).not.toThrow();
    const lesson = state.lessons.find((item) => item.teacherId === teacher.id)!;
    const student = state.students.find((item) => item.id === lesson.studentId)!;
    student.email = "student@example.com";
    expect(() =>
      assertCommandAccess(state, identity, {
        type: "report.save",
        report: {
          lessonId: lesson.id,
          studentId: "forged",
          teacherId: teacher.id,
          date: lesson.date,
          material: "Book",
          from: "",
          to: "P1",
          rating: 0,
          comment: "",
          suggestedLevel: "",
        },
      }),
    ).toThrow("本人课程");
    expect(() =>
      scopeState(state, { ...identity, teacherId: undefined }),
    ).toThrow("关联档案");
    const visible = scopeState(state, identity);
    expect(visible.teachers.map((item) => item.id)).toEqual([teacher.id]);
    expect(visible.lessons.every((item) => item.teacherId === teacher.id)).toBe(
      true,
    );
    expect(
      visible.students.every((item) => !item.surveySecret && !item.surveyToken),
    ).toBe(true);
    expect(visible.credits).toEqual([]);
    expect(
      visible.students.every(
        (item) =>
          item.phone === "" &&
          item.email === "" &&
          item.roster === undefined &&
          item.balance === 0 &&
          item.monthlyRecords.length === 0,
      ),
    ).toBe(true);
    expect(
      visible.feedback.every(
        (item) =>
          item.status === "已完成" &&
          item.processNote === "" &&
          item.tmNote === "" &&
          item.followUps.length === 0,
      ),
    ).toBe(true);
    const originalFeedback = state.feedback.find((item) =>
      visible.feedback.some((row) => row.id === item.id),
    );
    if (originalFeedback)
      expect(
        visible.feedback.find((item) => item.id === originalFeedback.id),
      ).toMatchObject({
        content: originalFeedback.content,
        verdict: originalFeedback.verdict,
        measures: originalFeedback.measures,
      });
  });

  it("字段与模块权限在服务端投影生效，且不污染业务原始数据", () => {
    const state = createSeed();
    const account = state.accounts[0];
    account.roleId = "limited";
    Object.assign(account, {scope:"本组", team:"A队", group:"二组"});
    state.students[0].owner = "Rita";
    state.students[0].ownerAccountId = "u2";
    state.roles.push({
      id: "limited",
      name: "资料编辑",
      description: "",
      scope: "全部",
      permissions: [
        "student.view",
        "student.edit",
        "teacher.view",
        "teacher.edit",
        "availability.edit",
        "payroll.view",
      ],
    });
    const identity = {
      accountId: account.id,
      roleId: account.roleId,
      name: account.name,
    };
    const student = state.students[0];
    student.phone = "13812345678";
    student.roster = {
      key: "fixture",
      row: 1,
      fields: {
        手机号码: student.phone,
        投诉记录: "内部投诉",
        学生中文名: student.chineseName,
      },
    };
    const visible = scopeState(state, identity);
    expect(stateSchema.safeParse(visible).success).toBe(true);
    expect(visible.students[0].phone).toBe("****5678");
    expect(visible.students[0].roster?.fields["手机号码"]).toBe("****5678");
    expect(visible.students[0].roster?.fields).not.toHaveProperty("投诉记录");
    expect(visible.feedback).toEqual([]);
    expect(visible.teachers.every((teacher) => teacher.rate === 0)).toBe(true);
    expect(visible.actions.every((action) => action.amount === 0)).toBe(true);
    expect(visible.payTerms).toEqual([]);
    expect(student.phone).toBe("13812345678");
    expect(state.teachers[0].rate).toBeGreaterThan(0);
    expect(() =>
      assertCommandAccess(state, identity, {
        type: "student.details.update",
        id: student.id,
        patch: { phone: "13912345678" },
        expected: { phone: student.phone },
      }),
    ).toThrow("手机号");
    expect(() =>
      assertCommandAccess(state, identity, {
        type: "teacher.save",
        teacher: { ...visible.teachers[0], rate: 999 },
      }),
    ).toThrow("单价");
    expect(() =>
      assertCommandAccess(state, identity, {
        type: "teacher.save",
        teacher: visible.teachers[0],
      }),
    ).not.toThrow();
  });

  it("无档案查看权限仅返回关联资料，不返回画像和服务记录", () => {
    const state = createSeed(),
      account = state.accounts[0];
    account.roleId = "dictionary";
    Object.assign(account, {scope:"本组", team:"A队", group:"二组"});
    state.students[0].owner = "Rita";
    state.students[0].ownerAccountId = "u2";
    state.roles.push({
      id: "dictionary",
      name: "关联名称",
      description: "",
      scope: "全部",
      permissions: [],
    });
    state.students[0].preferences = "私密偏好";
    state.teachers[0].notes = "内部老师备注";
    state.teachers[0].introVideo = "/api/files/private";
    const visible = scopeState(state, {
      accountId: account.id,
      roleId: account.roleId,
      name: account.name,
    });
    expect(stateSchema.safeParse(visible).success).toBe(true);
    expect(visible.students[0]).toMatchObject({
      id: state.students[0].id,
      preferences: "",
      phone: "",
    });
    expect(visible.students[0].surveyOriginal).toBeUndefined();
    expect(visible.teachers[0]).toMatchObject({
      id: state.teachers[0].id,
      phone: "",
      notes: "",
      introVideo: "",
      certificates: "",
    });
    expect([
      ...visible.tasks,
      ...visible.referrals,
      ...visible.reports,
      ...visible.events,
    ]).toEqual([]);
    expect(state.teachers[0].notes).toBe("内部老师备注");
  });

  it("请求边界剥离伪造操作者及模拟失败参数", () => {
    const command = parseCommand({
      type: "student.lifecycle",
      studentId: "student",
      status: "停课",
      reason: "家长确认",
      operator: "管理员",
      simulateFailure: true,
    });
    expect(command).not.toHaveProperty("operator");
    expect(command).not.toHaveProperty("simulateFailure");
    expect(() =>
      parseCommand({
        type: "credit.deduct",
        studentId: "s",
        units: -1,
        reason: "x",
      }),
    ).toThrow();
    expect(() => parseCommand({ type: "unknown" })).toThrow();
  });
});

it("普通账号授权全部后可跨队读取和操作，角色操作权限仍保留", () => {
 const state=createSeed(), account=state.accounts.find(a=>a.id==="u2")!;
 account.scope="全部";
 const identity={accountId:account.id,roleId:account.roleId,name:account.name};
 expect(scopeState(state,identity).students.map(s=>s.id)).toEqual(state.students.map(s=>s.id));
 const other=state.students.find(s=>s.owner==="Roma")!;
 expect(()=>assertCommandAccess(state,identity,{type:"credit.add",studentId:other.id,units:1,kind:"补偿",note:"跨队授权"})).not.toThrow();
 expect(()=>assertCommandAccess(state,identity,{type:"account.save",account})).toThrow("权限");
});
