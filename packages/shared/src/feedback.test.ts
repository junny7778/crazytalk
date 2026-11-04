import { describe, expect, it, vi } from "vitest";
import { createSeed } from "./seed";
import { demoRepository, DEMO_STORAGE_KEY } from "./repository";
import { transition } from "./domain";
import {
  stateSchema,
  type DemoState,
  type FeedbackDetailsInput,
  type Command,
} from "./model";
import { assertFeedbackCommandAccess } from "./react";

const image = {
  id: "shot-1",
  name: "课堂截图.png",
  dataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPp8AAAAASUVORK5CYII=",
};
function draft(): FeedbackDetailsInput {
  return {
    studentId: "s1",
    teacherId: "t1",
    lessonId: "",
    date: "2026-10-12",
    owner: "Roma",
    source: "K12",
    teacherName: "T. Carol",
    so: "BigBrains",
    stage: "≤3节课",
    grade: "二星",
    categories: [
      "老师相关 / 教学问题 / 缺乏互动",
      "设备相关 / 设备网络问题 / 音频问题＞3分钟",
    ],
    rating: "差评",
    content: "",
    screenshots: [image],
  };
}
function newest(data: DemoState) {
  const record = data.feedback[0];
  if (!record) throw new Error("反馈未保存");
  return record;
}

describe("学生反馈原表数据数字化", () => {
  it("完整保存反馈资料、客服和 TM 字段，并通过持久化解析原样读回", () => {
    let data = transition(createSeed(), {
      type: "feedback.create",
      feedback: draft(),
    }).data;
    const record = newest(data);
    expect(record).toMatchObject({
      ...draft(),
      category: draft().categories[0],
    });
    data = transition(data, {
      type: "feedback.customer",
      id: record.id,
      progress: "已处理",
      result: "处理成功",
      note: "已联系家长，等待培训完成",
    }).data;
    data = transition(data, {
      type: "feedback.tm",
      id: record.id,
      jointVerdict: "三星",
      result: "处理失败",
      date: "2026-10-14",
      note: "重复投诉，已关联已有处理，不再重复扣款",
    }).data;
    const restored = stateSchema.parse(JSON.parse(JSON.stringify(data)));
    expect(newest(restored)).toMatchObject({
      ...draft(),
      processNote: "已联系家长，等待培训完成",
      customerProgress: "已处理",
      customerResult: "处理成功",
      jointVerdict: "三星",
      tmResult: "处理失败",
      tmDate: "2026-10-14",
      tmNote: "重复投诉，已关联已有处理，不再重复扣款",
      status: "处理中",
      verdict: "",
    });
    expect(newest(restored).followUps.map((entry) => entry.section)).toEqual([
      "反馈资料",
      "客服处理",
      "TM跟进",
    ]);
    expect(newest(restored).followUps[1].content).toContain("未填写 →");
  });

  it("旧浏览器数据缺少新字段时可读取且不丢失原反馈记录", () => {
    const seed = createSeed();
    const old = {
      ...seed,
      feedback: seed.feedback.map((record) => ({
        id: record.id,
        studentId: record.studentId,
        teacherId: record.teacherId,
        lessonId: record.lessonId,
        date: record.date,
        rating: record.rating,
        category: record.category,
        content: record.content,
        status: record.status,
        owner: record.owner,
        processNote: record.processNote,
        verdict: record.verdict,
        measures: record.measures,
        repeat: record.repeat,
      })),
    };
    const restored = stateSchema.parse(JSON.parse(JSON.stringify(old)));
    expect(restored.feedback).toHaveLength(4);
    expect(restored.feedback[0]).toMatchObject(old.feedback[0]);
    expect(restored.feedback[0]).toMatchObject({
      categories: [],
      source: "",
      tmResult: "",
      screenshots: [],
      followUps: [],
    });
  });

  it("旧 JSON 快照只补缺失字段并持久化，明确空值不补，之后资料变动不会漂移", () => {
    const seed = createSeed();
    const legacyFeedback = seed.feedback.map((record, index) => {
      if (index !== 0) return record;
      const {
        source: _source,
        teacherName: _teacherName,
        so: _so,
        stage: _stage,
        grade: _grade,
        customerProgress: _customerProgress,
        ...legacy
      } = record;
      return legacy;
    });
    const payload = new Map([
      [DEMO_STORAGE_KEY, JSON.stringify({ ...seed, feedback: legacyFeedback })],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => payload.get(key) ?? null,
      setItem: (key: string, value: string) => payload.set(key, value),
      removeItem: (key: string) => payload.delete(key),
    });
    try {
      const data = demoRepository.refresh();
      const first = data.feedback[0];
      const learner = data.students.find(
        (entry) => entry.id === first.studentId,
      );
      const tutor = data.teachers.find((entry) => entry.id === first.teacherId);
      if (!learner || !tutor) throw new Error("缺少关联学员或老师");
      const expected = {
        source: learner.project,
        teacherName: tutor.name,
        so: tutor.so,
      };
      expect(first).toMatchObject(expected);
      expect(first).toMatchObject({
        stage: "",
        grade: "",
        customerProgress: "",
      });
      const saved = stateSchema.parse(
        JSON.parse(payload.get(DEMO_STORAGE_KEY) || "{}"),
      );
      expect(saved.feedback[0]).toMatchObject(expected);
      saved.students.find((entry) => entry.id === first.studentId)!.project =
        "变更后的项目";
      saved.teachers.find((entry) => entry.id === first.teacherId)!.name =
        "变更后的老师名";
      saved.teachers.find((entry) => entry.id === first.teacherId)!.so =
        "变更后的SO";
      saved.feedback[1].source = "";
      saved.feedback[1].teacherName = "";
      saved.feedback[1].so = "";
      payload.set(DEMO_STORAGE_KEY, JSON.stringify(saved));
      const reread = demoRepository.refresh();
      expect(reread.feedback[0]).toMatchObject(expected);
      expect(reread.feedback[1]).toMatchObject({
        source: "",
        teacherName: "",
        so: "",
      });
    } finally {
      vi.unstubAllGlobals();
      demoRepository.refresh();
    }
  });

  it("核实成功或失败都不会自动改变处理进度，显式完成后仍可追加跟进", () => {
    let data = transition(createSeed(), {
      type: "feedback.create",
      feedback: draft(),
    }).data;
    const record = newest(data);
    for (const result of ["处理成功", "处理失败"]) {
      data = transition(data, {
        type: "feedback.tm",
        id: record.id,
        jointVerdict: "二星",
        result,
        date: "2026-10-14",
        note: "核实记录",
      }).data;
      expect(newest(data).status).toBe("待处理");
    }
    data = transition(data, {
      type: "feedback.customer",
      id: record.id,
      progress: "已完成",
      result: "处理失败",
      note: "已告知家长核实结果",
    }).data;
    data = transition(data, {
      type: "feedback.followUp",
      id: record.id,
      section: "客服处理",
      content: "家长确认已收到说明",
    }).data;
    expect(newest(data).status).toBe("已完成");
    expect(newest(data).customerResult).toBe("处理失败");
    expect(newest(data).followUps.at(-1)?.content).toBe("家长确认已收到说明");
  });

  it("好评完成后仍能追加 TM 跟进和鼓励措施，不必重新打开责任判定", () => {
    let data = createSeed();
    const record = data.feedback.find((entry) => entry.rating === "好评");
    if (!record) throw new Error("缺少好评演示记录");
    data = transition(data, {
      type: "feedback.tm",
      id: record.id,
      jointVerdict: "五星",
      result: "处理成功",
      date: "2026-10-31",
      note: "邀请老师参与专题培训共创",
    }).data;
    data = transition(data, {
      type: "feedback.measures",
      id: record.id,
      measures: ["鼓励", "培训"],
      amount: 0,
      deductionConfirmed: false,
      separateDeduction: false,
      note: "表扬老师并邀请培训分享",
    }).data;
    const saved = data.feedback.find((entry) => entry.id === record.id);
    expect(saved?.status).toBe("已完成");
    expect(saved?.tmNote).toBe("邀请老师参与专题培训共创");
    expect(saved?.measures).toEqual(expect.arrayContaining(["鼓励", "培训"]));
    expect(
      data.actions
        .filter((action) => action.feedbackId === record.id)
        .map((action) => action.status),
    ).toEqual(["已确认", "已确认"]);
  });

  it("新建编号不因删除已有记录而复用，资料编辑保留客服、TM 和跟进信息", () => {
    let data = transition(createSeed(), {
      type: "feedback.create",
      feedback: draft(),
    }).data;
    const firstId = newest(data).id;
    data.feedback.shift();
    data = transition(data, {
      type: "feedback.create",
      feedback: draft(),
    }).data;
    expect(newest(data).id).not.toBe(firstId);
    const id = newest(data).id;
    data = transition(data, {
      type: "feedback.customer",
      id,
      progress: "待回访",
      result: "处理成功",
      note: "三天后回访",
    }).data;
    data = transition(data, {
      type: "feedback.edit",
      id,
      feedback: { ...draft(), grade: "三星", content: "补充家长原话" },
    }).data;
    expect(newest(data)).toMatchObject({
      grade: "三星",
      processNote: "三天后回访",
      status: "处理中",
    });
    expect(newest(data).followUps.at(-1)?.content).toContain("反馈等级");
  });

  it("反馈历史归属不会随学员项目或老师 SO 变化而改变", () => {
    const data = transition(createSeed(), {
      type: "feedback.create",
      feedback: draft(),
    }).data;
    data.students[0].project = "新项目";
    data.teachers[0].so = "新SO";
    const restored = stateSchema.parse(JSON.parse(JSON.stringify(data)));
    expect(newest(restored)).toMatchObject({
      source: "K12",
      teacherName: "T. Carol",
      so: "BigBrains",
    });
  });

  it("拒绝无效日期、截图类型、超额截图和错关联的课程", () => {
    const data = createSeed();
    expect(() =>
      transition(data, {
        type: "feedback.create",
        feedback: { ...draft(), date: "2026-02-30" },
      }),
    ).toThrow("日期");
    expect(() =>
      transition(data, {
        type: "feedback.create",
        feedback: {
          ...draft(),
          screenshots: [
            { ...image, dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" },
          ],
        },
      }),
    ).toThrow();
    expect(() =>
      transition(data, {
        type: "feedback.create",
        feedback: { ...draft(), screenshots: [image, image, image, image] },
      }),
    ).toThrow("3 张");
    expect(() =>
      transition(data, {
        type: "feedback.create",
        feedback: {
          ...draft(),
          screenshots: [
            {
              ...image,
              dataUrl: `data:image/png;base64,${"A".repeat(1_400_000)}`,
            },
          ],
        },
      }),
    ).toThrow("1 MB");
    const unrelated = data.lessons.find((lesson) => lesson.studentId !== "s1");
    if (!unrelated) throw new Error("缺少无关课程");
    expect(() =>
      transition(data, {
        type: "feedback.create",
        feedback: { ...draft(), lessonId: unrelated.id },
      }),
    ).toThrow("不一致");
  });

  it("按客服和 TM 区块检查操作权限，直接扣款不能绕过权限", () => {
    const can = (permission: string) =>
      ["feedback.create", "feedback.process"].includes(permission);
    const customer: Command = {
      type: "feedback.customer",
      id: "x",
      progress: "处理中",
      result: "",
      note: "",
    };
    const tm: Command = {
      type: "feedback.tm",
      id: "x",
      result: "处理成功",
      jointVerdict: "三星",
      date: "",
      note: "",
    };
    expect(() => assertFeedbackCommandAccess(customer, can)).not.toThrow();
    expect(() => assertFeedbackCommandAccess(tm, can)).toThrow("权限");
    expect(() =>
      assertFeedbackCommandAccess(
        {
          type: "feedback.followUp",
          id: "x",
          section: "TM跟进",
          content: "说明",
        },
        can,
      ),
    ).toThrow("权限");
    expect(() =>
      assertFeedbackCommandAccess(
        {
          type: "feedback.measures",
          id: "x",
          measures: ["扣款"],
          amount: 50,
          deductionConfirmed: true,
          separateDeduction: false,
          note: "",
        },
        (permission) => permission === "feedback.verdict",
      ),
    ).toThrow("直接扣款");
  });
});
