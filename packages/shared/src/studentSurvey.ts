import { z } from "zod";
import type { Student } from "./model";

const gender = ["男", "女"] as const;
const ageGroup = ["幼儿 (3-5岁)", "少儿(6-9岁)", "大童 (10-12岁+)"] as const;
const level = ["L1(入门)能自我介绍能说简单句子", "L2(基础)能日常简单交流", "L3(中级)能表达观点"] as const;
const personality = ["活泼外向型（自来熟，不怯场，喜欢表达）", "内向型（慢热 一开始比较害羞，需要老师耐心引导）"] as const;
const interests = ["卡通动漫类（奥特曼、蜘蛛侠、漫威等）", "卡通动漫类（迪士尼/公主 艾莎 芭比等）", "唱歌", "画画", "跳舞", "毛绒玩具、ip公仔等", "汽车/飞机等玩具", "运动（足球、篮球、乒乓球、游泳等）", "昆虫", "益智桌游/拼图（大富翁、下棋等）", "角色扮演", "手工（做黏土、拼贴）", "积木/乐高"] as const;
const membership = ["1-2个月", "2-4个月", "3-6个月", "6个月以上"] as const;
const listening = ["200小时内", "300小时内", "400小时内", "500小时内", "500小时以上"] as const;
const experience = ["有", "没有"] as const;
const times = ["上午（9:00-12:00）", "下午（14:00-18:00）", "晚上（18:00-21:00）", "都可以，灵活安排"] as const;

export const matchingSurveyOptions = { gender, ageGroup, level, personality, interests, membership, listening, experience, times };
export const maxSurveyInterests = 3;

export const matchingSurveyAnswers = z.object({
  chineseName: z.string().trim().min(1, "请填写学员中文名"),
  gender: z.enum(gender),
  ageGroup: z.enum(ageGroup).or(z.literal("")).default(""),
  level: z.enum(level),
  personality: z.enum(personality),
  interests: z.array(z.enum(interests)).max(maxSurveyInterests).refine(items => new Set(items).size === items.length).default([]),
  membership: z.enum(membership),
  listening: z.enum(listening),
  experience: z.enum(experience).or(z.literal("")).default(""),
  times: z.enum(times).or(z.literal("")).default(""),
  needs: z.string().trim().default(""),
});

// The current profile can be incomplete. Only the public submission requires all six answers.
export const studentSurveyPrefillSchema = matchingSurveyAnswers.extend({
  chineseName: z.string().trim().default(""),
  gender: matchingSurveyAnswers.shape.gender.or(z.literal("")).default(""),
  level: matchingSurveyAnswers.shape.level.or(z.literal("")).default(""),
  personality: matchingSurveyAnswers.shape.personality.or(z.literal("")).default(""),
  membership: matchingSurveyAnswers.shape.membership.or(z.literal("")).default(""),
  listening: matchingSurveyAnswers.shape.listening.or(z.literal("")).default(""),
});
export type StudentSurveyPrefill = z.output<typeof studentSurveyPrefillSchema>;

export function studentSurveyInterests(value = "") {
  const text = `、${value.trim().replace(/\s*[，,；;、]\s*/g, "、")}、`;
  return interests
    .filter((option) => text.includes(`、${option}、`))
    .sort((left, right) => text.indexOf(`、${left}、`) - text.indexOf(`、${right}、`))
    .slice(0, maxSurveyInterests);
}

export function studentSurveyDetails(student: Student) {
  const original = student.surveyOriginal;
  const matching = original && "chineseName" in original ? original : undefined;
  return {
    ageGroup: student.ageGroup ?? ageGroup.find((option) => option === student.ageText) ?? matching?.ageGroup ?? "",
    membershipDuration: student.membershipDuration ?? matching?.membership ?? "",
    listeningHours: student.listeningHours ?? matching?.listening ?? "",
    preferredLessonTime: student.preferredLessonTime ?? times.find((option) => option === original?.times) ?? "",
    learningNotes: student.learningNotes ?? original?.needs ?? "",
  };
}

export function studentSurveyPrefill(student: Student): StudentSurveyPrefill {
  const details = studentSurveyDetails(student);
  return {
    chineseName: student.chineseName || student.name,
    gender: gender.find((option) => option === student.gender) ?? "",
    ageGroup: details.ageGroup,
    level: level.find((option) => option === student.level || option.slice(0, 2) === student.level) ?? "",
    personality: personality.find((option) => option === student.personality) ?? "",
    interests: studentSurveyInterests(student.interests),
    membership: details.membershipDuration,
    listening: details.listeningHours,
    experience: experience.find((option) => option === student.foreignTeacherExperience || (option === "没有" && student.foreignTeacherExperience === "无")) ?? "",
    times: details.preferredLessonTime,
    needs: details.learningNotes,
  };
}

type Question = {
  key: keyof z.infer<typeof matchingSurveyAnswers>;
  title: string;
  required?: boolean;
  options?: readonly string[];
  hint?: string;
};
export const matchingSurveyQuestions: readonly Question[] = [
  {key: "chineseName", title: "学员中文名", required: true},
  {key: "gender", title: "学员性别", options: gender, required: true},
  {key: "ageGroup", title: "学员年龄？", options: ageGroup},
  {key: "level", title: "学员目前的基础如何？", options: level, required: true},
  {key: "personality", title: "学员性格？", options: personality, required: true},
  {key: "interests", title: "学员兴趣爱好？", hint: "老师围绕孩子喜欢话题破冰", options: interests},
  {key: "membership", title: "学员加入体系多久了？", options: membership, required: true},
  {key: "listening", title: "学员坚持听力输入总时长", options: listening, required: true},
  {key: "experience", title: "是否有接触过外教？", options: experience},
  {key: "times", title: "预选上课时段", options: times},
  {key: "needs", title: "其他备注项", hint: "若有其他需要特别注意的点，上面没有询问到的，可以描述一下"},
];
