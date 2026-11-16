import { z } from "zod";

const gender = ["男", "女"] as const;
const ageGroup = ["幼儿 (3-5岁)", "少儿(6-9岁)", "大童 (10-12岁+)"] as const;
const level = ["L1(入门)能自我介绍能说简单句子", "L2(基础)能日常简单交流", "L3(中级)能表达观点"] as const;
const personality = ["活泼外向型（自来熟，不怯场，喜欢表达）", "内向型（慢热 一开始比较害羞，需要老师耐心引导）"] as const;
const interests = ["卡通动漫类（奥特曼、蜘蛛侠、漫威等）", "卡通动漫类（迪士尼/公主 艾莎 芭比等）", "唱歌", "画画", "跳舞", "毛绒玩具、ip公仔等", "汽车/飞机等玩具", "运动（足球、篮球、乒乓球、游泳等）", "昆虫", "益智桌游/拼图（大富翁、下棋等）", "角色扮演", "手工（做黏土、拼贴）", "积木/乐高"] as const;
const membership = ["1-2个月", "2-4个月", "3-6个月", "6个月以上"] as const;
const listening = ["200小时内", "300小时内", "400小时内", "500小时内", "500小时以上"] as const;
const experience = ["有", "没有"] as const;
const times = ["上午（9:00-12:00）", "下午（14:00-18:00）", "晚上（18:00-21:00）", "都可以，灵活安排"] as const;

export const matchingSurveyAnswers = z.object({
  chineseName: z.string().trim().min(1, "请填写学员中文名"),
  gender: z.enum(gender),
  ageGroup: z.enum(ageGroup).or(z.literal("")).default(""),
  level: z.enum(level),
  personality: z.enum(personality),
  interests: z.array(z.enum(interests)).max(3).refine(items => new Set(items).size === items.length).default([]),
  membership: z.enum(membership),
  listening: z.enum(listening),
  experience: z.enum(experience).or(z.literal("")).default(""),
  times: z.enum(times).or(z.literal("")).default(""),
  needs: z.string().trim().default(""),
});
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
  {key: "interests", title: "学员兴趣爱好？", hint: "老师围绕孩子喜欢话题破冰（最多选 3 个）", options: interests},
  {key: "membership", title: "学员加入体系多久了？", options: membership, required: true},
  {key: "listening", title: "学员坚持听力输入总时长", options: listening, required: true},
  {key: "experience", title: "是否有接触过外教？", options: experience},
  {key: "times", title: "预选上课时段", options: times},
  {key: "needs", title: "其他备注项", hint: "若有其他需要特别注意的点，上面没有询问到的，可以描述一下"},
];
