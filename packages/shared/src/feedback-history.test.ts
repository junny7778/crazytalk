import { describe, expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { stateSchema } from "./model";
describe("反馈历史生成", () => {
  it("客服未修改和重复保存不追加历史或事件，变更只保存实际字段及操作人", () => {
    const data = createSeed(),
      record = data.feedback[0];
    const command = {
      type: "feedback.customer" as const,
      id: record.id,
      progress: record.customerProgress,
      result: record.customerResult,
      note: record.processNote,
      operator: "验收教务",
    };
    const before = record.followUps.length;
    const unchanged = transition(data, command).data;
    expect(unchanged.feedback[0].followUps).toEqual(record.followUps);
    expect(unchanged.events).toEqual(data.events);
    const changed = transition(data, { ...command, note: "新的沟通结果" }).data;
    expect(changed.feedback[0].followUps).toHaveLength(before + 1);
    expect(changed.feedback[0].followUps.at(-1)).toMatchObject({
      operator: "验收教务",
      changes: [
        {
          field: "客服备注",
          before: record.processNote,
          after: "新的沟通结果",
        },
      ],
    });
    const repeated = transition(changed, {
      ...command,
      note: "新的沟通结果",
    }).data;
    expect(repeated.feedback[0].followUps).toEqual(
      changed.feedback[0].followUps,
    );
    expect(repeated.events).toEqual(changed.events);
    expect(
      stateSchema.parse(JSON.parse(JSON.stringify(changed))).feedback[0]
        .followUps,
    ).toEqual(changed.feedback[0].followUps);
  });
  it("TM同样跳过无变化保存，追加跟进不改变原文或覆盖旧记录", () => {
    const data = createSeed(),
      record = data.feedback[0];
    const command = {
      type: "feedback.tm" as const,
      id: record.id,
      jointVerdict: record.jointVerdict,
      result: record.tmResult,
      date: record.tmDate,
      note: record.tmNote,
      operator: "验收TM",
    };
    expect(transition(data, command).data.feedback[0].followUps).toEqual(
      record.followUps,
    );
    const changed = transition(data, {
      ...command,
      note: "已核实老师说明",
    }).data;
    const appended = transition(changed, {
      type: "feedback.followUp",
      id: record.id,
      section: "TM跟进",
      content: "补充：家长认可处理。",
      operator: "另一位TM",
    }).data;
    expect(appended.feedback[0].followUps.slice(0, -1)).toEqual(
      changed.feedback[0].followUps,
    );
    expect(appended.feedback[0].followUps.at(-1)).toMatchObject({
      content: "补充：家长认可处理。",
      operator: "另一位TM",
    });
  });
});
