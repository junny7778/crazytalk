import type { Student, Teacher } from "./model";

const interestLabels: [RegExp, string[]][] = [
  [/奥特曼|蜘蛛侠|漫威/, ["懂卡通IP(男孩向)"]],
  [/迪士尼|公主|艾莎|芭比/, ["懂卡通IP(女孩向)"]],
  [/唱歌/, ["会唱歌"]],
  [/画画/, ["会画画"]],
  [/跳舞|积木|乐高|角色扮演/, ["擅长表演(戏精)"]],
  [/毛绒|公仔/, ["喜欢萌宠", "有道具"]],
  [/汽车|飞机/, ["会简笔画", "擅长表演(戏精)"]],
  [/手工|黏土|拼贴/, ["会简笔画"]],
  [/桌游|拼图|下棋|大富翁/, ["玩游戏"]],
  [/运动|足球|篮球|乒乓球|游泳/, ["爱运动"]],
];
export function recommendedTags(s: Student) {
  const tags = new Set<string>(),
    age = s.age;
  const level = s.level.match(/^L([123])(?:$|\b)/)?.[1];
  if (age != null && age >= 3 && level) {
    const tier = age <= 5 ? "幼儿" : age <= 9 ? "少儿" : "大童";
    tags.add(
      tier === "幼儿"
        ? "擅长低龄(3-5岁)"
        : tier === "少儿"
          ? "擅长少儿(6-9岁)"
          : "大童(10-12岁+)",
    );
    tags.add(
      "擅长L" +
        level +
        "(" +
        { "1": "零基础", "2": "基础", "3": "中级" }[level] +
        ")",
    );
    const extra =
      tier === "幼儿"
        ? ["肢体语言丰富(TPR)", "有道具"]
        : tier === "少儿"
          ? level === "1"
            ? ["会引导", "会拓展"]
            : level === "2"
              ? ["会拓展"]
              : ["教学能力强"]
          : level === "1"
            ? ["沉稳成熟", "会引导"]
            : level === "2"
              ? ["教学能力强"]
              : ["教学能力强", "综合能力强"];
    extra.forEach((t) => tags.add(t));
  }
  if (/内向|慢热/.test(s.personality))
    ["温柔有耐心", "亲和力强", "擅长鼓励"].forEach((t) => tags.add(t));
  if (/活泼|外向|自来熟/.test(s.personality))
    ["热情活动(社牛)", "擅长表演(戏精)"].forEach((t) => tags.add(t));
  for (const [pattern, labels] of interestLabels)
    if (pattern.test(s.interests || "")) labels.forEach((t) => tags.add(t));
  return [...tags];
}
export function matchedTags(s: Student, t: Teacher) {
  const normalize = (v: string) =>
    v.replace(/（/g, "(").replace(/）/g, ")").replace(/\s/g, "");
  const tags = t.tags.map(normalize);
  return recommendedTags(s).filter((label) =>
    tags.some((t) => t.includes(normalize(label))),
  );
}
