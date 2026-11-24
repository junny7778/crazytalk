import { matchingSurveyAnswers, studentSurveyPrefill } from "./studentSurvey";
import { studentSchema } from "./model";
import { recommendedTags } from "./teacherMatch";

import { expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
it("固定令牌回填本人，不可重复生成或直接覆盖提交", () => {
  let d = createSeed();
  const [a, b] = d.students;
  d = transition(d, { type: "survey.issue", id: a.id }).data;
  expect(() => transition(d, { type: "survey.issue", id: a.id })).toThrow("固定问卷链接");
  const cmd = {
    type: "survey.submit" as const,
    token: d.students[0].surveyToken!,
    answers: {
      age: 8,
      level: "L1" as const,
      personality: "内向或慢热",
      interests: "汽车",
      experience: "无",
      material: "",
      times: "周四",
      needs: "",
    },
  };
  expect(() => transition(d, { ...cmd, token: "unknown-token" })).toThrow("失效");
  d = transition(d, cmd).data;
  expect(d.students[0].interests).toBe("汽车");
  expect(d.students[1]).toEqual(b);
  expect(() => transition(d, cmd)).toThrow("已提交");
});

const matching = {
  chineseName: "学员甲", gender: "女", level: "L2(基础)能日常简单交流",
  personality: "内向型（慢热 一开始比较害羞，需要老师耐心引导）",
  membership: "2-4个月", listening: "300小时内",
};

it("校验六项必填、合法选项和兴趣上限", () => {
  expect(matchingSurveyAnswers.safeParse(matching).success).toBe(true);
  for (const key of Object.keys(matching))
    expect(matchingSurveyAnswers.safeParse({...matching, [key]: ""}).success).toBe(false);
  for (const patch of [
    {chineseName: "   "}, {ageGroup: "7"}, {times: ["上午", "晚上"]}, {experience: "未知"},
    {interests: ["唱歌", "唱歌"]}, {interests: ["听歌"]}, {interests: ["唱歌", "画画", "跳舞", "昆虫"]},
  ]) expect(matchingSurveyAnswers.safeParse({...matching, ...patch}).success).toBe(false);
});

it("按专属链接保存十一项原答并同步画像，年龄区间可用于匹配老师", () => {
  const initial = createSeed(), student = initial.students[0];
  student.age = null;
  const issued = transition(initial, {type: "survey.issue", id: student.id}).data;
  const answers = matchingSurveyAnswers.parse({
    ...matching, ageGroup: "少儿(6-9岁)", interests: ["唱歌", "画画", "昆虫"], experience: "没有",
    times: "下午（14:00-18:00）", needs: "请放慢语速",
  });
  const stored = transition(issued, {type: "survey.submit", token: issued.students[0].surveyToken!, answers}).data;
  const updated = studentSchema.parse(stored.students[0]);
  expect(updated).toMatchObject({id: student.id, name: "学员甲", chineseName: "学员甲", englishName: student.englishName, gender: "女",
    surveyOriginal: answers, age: null, ageText: answers.ageGroup, level: "L2", material: student.material,
    interests: "唱歌、画画、昆虫", foreignTeacherExperience: "无", preferences: student.preferences,
    ageGroup: answers.ageGroup, membershipDuration: answers.membership, listeningHours: answers.listening,
    preferredLessonTime: answers.times, learningNotes: answers.needs,
  });
  expect(recommendedTags(updated)).toEqual(expect.arrayContaining(["擅长少儿 (6-9岁)", "温柔有耐心", "会唱歌"]));
  expect(stored.students[1]).toEqual(initial.students[1]);
});

it("清空问卷选填项，保留精确年龄、教材和老师偏好", () => {
  const initial = createSeed(), s = initial.students[0];
  s.interests = "卡通动漫类（奥特曼、蜘蛛侠、漫威等）、唱歌";
  const issued = transition(initial, {type:"survey.issue", id:s.id}).data.students[0];
  const updated = transition({...initial, students:[issued]}, {
    type: "survey.submit", token: issued.surveyToken!, answers: matchingSurveyAnswers.parse(matching),
  }).data.students[0];
  expect(updated).toMatchObject({age: s.age, material: s.material, preferences: s.preferences, foreignTeacherExperience: "", interests: ""});
  expect(updated.surveyOriginal).toMatchObject({ageGroup:"", interests:[], times:"", needs:""});
});

it("未修改姓名时保留后台更名，授权修改沿用原链接回填", () => {
  let data = createSeed();
  const student = data.students[0];
  student.chineseName = student.name = "后台已更正";
  const issue = () => {
    data = transition(data, { type: "survey.issue", id: student.id }).data;
  };
  const answers = matchingSurveyAnswers.parse(matching);
  const submittedAt = "2026-11-16T02:10:00.000Z";
  issue();
  data = transition(data, { type: "survey.submit", token: data.students[0].surveyToken!,
    answers, submittedAt, nameEdited: false }).data;
  expect(data.students[0]).toMatchObject({ chineseName: "后台已更正", name: "后台已更正", surveyOriginal: answers, surveySubmittedAt: submittedAt });
  const token = data.students[0].surveyToken!;
  expect(() => transition(data, { type: "survey.issue", id: student.id })).toThrow("固定问卷链接");
  expect(() => transition(data, { type: "survey.submit", token, answers, submittedAt, revision: true })).toThrow("已提交");
  data = transition(data, {
    type: "survey.submit", token, answers, nameEdited: true, revision: true,
    submittedAt: "2026-11-23T02:10:00.000Z",
  }).data;
  expect(data.students[0]).toMatchObject({
    surveyToken: token, chineseName: matching.chineseName, surveySubmittedAt: "2026-11-23T02:10:00.000Z",
  });
});


it("旧档的问卷字段可读，教务保存后问卷读取最新值并保留上次提交快照", () => {
  const data = createSeed(), student = data.students[0];
  const optionWithSeparators = "卡通动漫类（奥特曼、蜘蛛侠、漫威等）";
  const original = matchingSurveyAnswers.parse({
    ...matching, ageGroup: "少儿(6-9岁)", interests: [optionWithSeparators],
    times: "晚上（18:00-21:00）", needs: "家长原答",
  });
  Object.assign(student, {
    surveyOriginal: original, interests: optionWithSeparators,
    surveySubmittedAt: "2026-11-16T02:10:00.000Z",
  });
  const before = studentSchema.parse(student);
  expect(studentSurveyPrefill(before)).toMatchObject({
    membership: matching.membership, listening: matching.listening, ageGroup: original.ageGroup,
    interests: [optionWithSeparators], times: original.times, needs: original.needs,
  });
  const patch = {
    interests: `${optionWithSeparators}、唱歌`, membershipDuration: "6个月以上" as const,
    preferredLessonTime: "" as const, learningNotes: "教务补充",
  };
  const updated = transition(data, {
    type: "student.details.update", id: student.id, patch, expected: { interests: optionWithSeparators },
  }).data.students[0];
  expect(studentSurveyPrefill(updated)).toMatchObject({
    interests: [optionWithSeparators, "唱歌"], membership: patch.membershipDuration,
    times: "", needs: patch.learningNotes,
  });
  expect(updated.surveyOriginal).toEqual(original);
  expect(updated.surveySubmittedAt).toBe(student.surveySubmittedAt);
});
