import type { CatalogEntry, DemoState } from "./model";

export const standardTeacherTags: CatalogEntry[] = [
  {
    "id": "tt-17",
    "type": "老师标签",
    "name": "口音夯",
    "detail": "",
    "enabled": true,
    "tagCategory": "口音",
    "tagColor": "green",
    "tagMeaning": "对应A+，纯正地道，极具感染力",
    "tagExample": "发音纯正，语音语调自然，能瞬间抓住学员听觉",
    "tagAdvice": "优先匹配对发音要求极高的学员"
  },
  {
    "id": "tt-18",
    "type": "老师标签",
    "name": "口音好",
    "detail": "",
    "enabled": true,
    "tagCategory": "口音",
    "tagColor": "green",
    "tagMeaning": "B+～A发音清晰标准，无明显口音",
    "tagExample": "发音准确，适合对口音有高要求的家长",
    "tagAdvice": "优先匹配对口音有要求的学员"
  },
  {
    "id": "tt-19",
    "type": "老师标签",
    "name": "口音可以",
    "detail": "",
    "enabled": true,
    "tagCategory": "口音",
    "tagColor": "green",
    "tagMeaning": "B～B+发音清楚，有轻微口音但不影响理解",
    "tagExample": "可匹配大部分学员，无明显沟通障碍",
    "tagAdvice": "对口音无特殊要求即可"
  },
  {
    "id": "tt-20",
    "type": "老师标签",
    "name": "口音一般",
    "detail": "",
    "enabled": true,
    "tagCategory": "口音",
    "tagColor": "green",
    "tagMeaning": "个别词汇发音有偏差，不影响整体",
    "tagExample": "存在发音偏差，但不影响整体理解",
    "tagAdvice": "不匹配对口音敏感的学员"
  },
  {
    "id": "tt-21",
    "type": "老师标签",
    "name": "稳定夯",
    "detail": "",
    "enabled": true,
    "tagCategory": "教学风格",
    "tagColor": "green",
    "tagMeaning": "出勤极其稳定，从不随意请假取消",
    "tagExample": "课表固定，能长期陪伴学员，家长最放心",
    "tagAdvice": "优先匹配长期固定学员、高要求家长"
  },
  {
    "id": "tt-22",
    "type": "老师标签",
    "name": "经验丰富",
    "detail": "",
    "enabled": true,
    "tagCategory": "教学风格",
    "tagColor": "green",
    "tagMeaning": "3年以上教龄，课堂掌控力强",
    "tagExample": "从容应对突发情况，掌控节奏",
    "tagAdvice": "适合高要求学员或更换过多次的学员"
  },
  {
    "id": "tt-23",
    "type": "老师标签",
    "name": "有经验",
    "detail": "",
    "enabled": true,
    "tagCategory": "教学风格",
    "tagColor": "green",
    "tagMeaning": "半年及以上教学经验",
    "tagExample": "半年及以上教学经验",
    "tagAdvice": "有点基础，非第一次线上上课学员"
  },
  {
    "id": "tt-24",
    "type": "老师标签",
    "name": "非常负责",
    "detail": "",
    "enabled": true,
    "tagCategory": "教学风格",
    "tagColor": "green",
    "tagMeaning": "认真对待课堂，课后反馈详细",
    "tagExample": "准时提交反馈，主动跟进学员进度",
    "tagAdvice": "适合需严格跟进的学员"
  },
  {
    "id": "tt-25",
    "type": "老师标签",
    "name": "教学能力强",
    "detail": "",
    "enabled": true,
    "tagCategory": "教学风格",
    "tagColor": "green",
    "tagMeaning": "灵活度高，会引导，会拓展",
    "tagExample": "课堂应变强，能承接二次更换学员",
    "tagAdvice": "高要求家长、二次更换学员首选"
  },
  {
    "id": "tt-26",
    "type": "老师标签",
    "name": "综合能力强",
    "detail": "",
    "enabled": true,
    "tagCategory": "教学风格",
    "tagColor": "green",
    "tagMeaning": "教学、互动、设备，控场均衡",
    "tagExample": "无短板，课堂问题解决快，发挥稳定",
    "tagAdvice": "适用性广，大部分学员"
  },
  {
    "id": "tt-27",
    "type": "老师标签",
    "name": "会引导",
    "detail": "",
    "enabled": true,
    "tagCategory": "教学风格",
    "tagColor": "green",
    "tagMeaning": "启发式提问，引导开口",
    "tagExample": "用问题引导输出，不直接给答案",
    "tagAdvice": "适合内向、不敢开口的学员"
  },
  {
    "id": "tt-28",
    "type": "老师标签",
    "name": "会拓展",
    "detail": "",
    "enabled": true,
    "tagCategory": "教学风格",
    "tagColor": "green",
    "tagMeaning": "善于延伸知识点，举一反三",
    "tagExample": "不局限教材，结合生活实际",
    "tagAdvice": "适合有一定基础、需挑战的学员"
  },
  {
    "id": "tt-29",
    "type": "老师标签",
    "name": "擅长鼓励",
    "detail": "",
    "enabled": true,
    "tagCategory": "教学风格",
    "tagColor": "green",
    "tagMeaning": "善于高频正向反馈，建立自信",
    "tagExample": "多使用Reward，夸奖具体，孩子答错也不打击",
    "tagAdvice": "匹配零基础、敏感、内向学员"
  },
  {
    "id": "tt-30",
    "type": "老师标签",
    "name": "情绪价值高",
    "detail": "",
    "enabled": true,
    "tagCategory": "教学风格",
    "tagColor": "green",
    "tagMeaning": "能敏锐察觉并接住孩子情绪，课堂温暖",
    "tagExample": "孩子不开心能哄好，课堂充满欢声笑语，家长极度放心",
    "tagAdvice": "优先匹配容易挫败、需要陪伴的学员"
  },
  {
    "id": "tt-31",
    "type": "老师标签",
    "name": "肢体语言丰富(TPR)",
    "detail": "",
    "enabled": true,
    "tagCategory": "教学风格",
    "tagColor": "green",
    "tagMeaning": "善用动作、表情辅助教学",
    "tagExample": "动作夸张生动，极具感染力",
    "tagAdvice": "适合零基础、低龄、听力弱的学员"
  },
  {
    "id": "tt-32",
    "type": "老师标签",
    "name": "社牛类型(活泼热情)",
    "detail": "",
    "enabled": true,
    "tagCategory": "教学风格",
    "tagColor": "green",
    "tagMeaning": "极度外向，天生社牛型",
    "tagExample": "能量爆棚，迅速和学生打成一片",
    "tagAdvice": "适合内向、慢热、需带动气氛的学员"
  },
  {
    "id": "tt-34",
    "type": "老师标签",
    "name": "温柔有耐心",
    "detail": "",
    "enabled": true,
    "tagCategory": "教学风格",
    "tagColor": "green",
    "tagMeaning": "态度温和，情绪稳定",
    "tagExample": "对零基础、内向学员特别包容",
    "tagAdvice": "适合零基础、敏感型、内向型学员"
  },
  {
    "id": "tt-35",
    "type": "老师标签",
    "name": "有亲和力",
    "detail": "",
    "enabled": true,
    "tagCategory": "教学风格",
    "tagColor": "green",
    "tagMeaning": "容易建立信任，孩子愿意互动",
    "tagExample": "表情自然，语气亲切",
    "tagAdvice": "适合低龄、性格敏感、慢热的学员"
  },
  {
    "id": "tt-36",
    "type": "老师标签",
    "name": "沉稳成熟",
    "detail": "",
    "enabled": true,
    "tagCategory": "教学风格",
    "tagColor": "green",
    "tagMeaning": "教学风格稳重，节奏平缓",
    "tagExample": "适合偏好稳重风格的学员",
    "tagAdvice": "匹配前确认家长偏好（如大童/青少年）"
  },
  {
    "id": "tt-37",
    "type": "老师标签",
    "name": "颜值高",
    "detail": "",
    "enabled": true,
    "tagCategory": "教学风格",
    "tagColor": "green",
    "tagMeaning": "形象好，上镜效果好",
    "tagExample": "画面养眼，提升第一印象",
    "tagAdvice": "适合注重老师形象的家长"
  },
  {
    "id": "tt-38",
    "type": "老师标签",
    "name": "擅长低龄 (3-5岁)",
    "detail": "",
    "enabled": true,
    "tagCategory": "年龄与基础",
    "tagColor": "green",
    "tagMeaning": "懂幼儿心理，极具耐心",
    "tagExample": "能用夸张的动作、儿歌、游戏吸引幼儿",
    "tagAdvice": "优先匹配幼儿段学员"
  },
  {
    "id": "tt-39",
    "type": "老师标签",
    "name": "擅长少儿 (6-9岁)",
    "detail": "",
    "enabled": true,
    "tagCategory": "年龄与基础",
    "tagColor": "green",
    "tagMeaning": "互动好，能带动小学生注意力",
    "tagExample": "善于用游戏、奖励机制引导开口",
    "tagAdvice": "优先匹配小学段学员"
  },
  {
    "id": "tt-40",
    "type": "老师标签",
    "name": "擅长大童 (10-12岁+)",
    "detail": "",
    "enabled": true,
    "tagCategory": "年龄与基础",
    "tagColor": "green",
    "tagMeaning": "能聊有深度的话题",
    "tagExample": "像朋友一样交流，能探讨爱好与观点",
    "tagAdvice": "优先匹配高年级/青少年学员"
  },
  {
    "id": "tt-41",
    "type": "老师标签",
    "name": "擅长0基础",
    "detail": "",
    "enabled": true,
    "tagCategory": "年龄与基础",
    "tagColor": "green",
    "tagMeaning": "善于教学零基础学员",
    "tagExample": "有教具、肢体动作丰富、爱笑、语速慢",
    "tagAdvice": "优先匹配零基础学员"
  },
  {
    "id": "tt-42",
    "type": "老师标签",
    "name": "不适合教0基础",
    "detail": "",
    "enabled": true,
    "tagCategory": "年龄与基础",
    "tagColor": "green",
    "tagMeaning": "教学方式不适合零基础",
    "tagExample": "语速快或缺乏耐心",
    "tagAdvice": "绝对不匹配零基础学员"
  },
  {
    "id": "tt-43",
    "type": "老师标签",
    "name": "懂卡通IP (男孩向)",
    "detail": "",
    "enabled": true,
    "tagCategory": "特色兴趣",
    "tagColor": "purple",
    "tagMeaning": "了解奥特曼、漫威、恐龙等",
    "tagExample": "能聊相关话题，用IP人物举例",
    "tagAdvice": "优先匹配喜欢英雄、恐龙的小男孩"
  },
  {
    "id": "tt-44",
    "type": "老师标签",
    "name": "懂卡通IP (女孩向)",
    "detail": "",
    "enabled": true,
    "tagCategory": "特色兴趣",
    "tagColor": "purple",
    "tagMeaning": "了解迪士尼、公主、芭比等",
    "tagExample": "能聊公主故事，配合道具教学",
    "tagAdvice": "优先匹配喜欢公主、动画的小女孩"
  },
  {
    "id": "tt-45",
    "type": "老师标签",
    "name": "会画画",
    "detail": "",
    "enabled": true,
    "tagCategory": "特色兴趣",
    "tagColor": "purple",
    "tagMeaning": "能快速画出简单图案",
    "tagExample": "边画边教，吸引低龄注意力",
    "tagAdvice": "优先匹配低龄、注意力不集中的学员"
  },
  {
    "id": "tt-46",
    "type": "老师标签",
    "name": "擅长表演 (戏精)",
    "detail": "",
    "enabled": true,
    "tagCategory": "特色兴趣",
    "tagColor": "purple",
    "tagMeaning": "表现力极强，扮演各种角色",
    "tagExample": "配合夸张动作和声音演绎绘本",
    "tagAdvice": "优先匹配内向慢热、需带动气氛的学员"
  },
  {
    "id": "tt-47",
    "type": "老师标签",
    "name": "喜欢萌宠/有道具",
    "detail": "",
    "enabled": true,
    "tagCategory": "特色兴趣",
    "tagColor": "purple",
    "tagMeaning": "养宠物或上课使用毛绒公仔",
    "tagExample": "用玩偶打招呼，增加亲和力",
    "tagAdvice": "优先匹配低龄学员、敏感型学员"
  },
  {
    "id": "tt-48",
    "type": "老师标签",
    "name": "会唱歌",
    "detail": "",
    "enabled": true,
    "tagCategory": "特色兴趣",
    "tagColor": "purple",
    "tagMeaning": "善用歌曲教学",
    "tagExample": "增加低龄课堂趣味性",
    "tagAdvice": "优先匹配低龄学员"
  },
  {
    "id": "tt-49",
    "type": "老师标签",
    "name": "玩游戏",
    "detail": "",
    "enabled": true,
    "tagCategory": "特色兴趣",
    "tagColor": "purple",
    "tagMeaning": "善用游戏互动教学",
    "tagExample": "课堂游戏设计好",
    "tagAdvice": "优先匹配低龄、注意力不集中的学员"
  },
  {
    "id": "tt-50",
    "type": "老师标签",
    "name": "擅长乐器",
    "detail": "",
    "enabled": true,
    "tagCategory": "特色兴趣",
    "tagColor": "purple",
    "tagMeaning": "会弹奏乐器辅助教学",
    "tagExample": "才艺加分",
    "tagAdvice": "优先匹配低龄学员"
  },
  {
    "id": "tt-51",
    "type": "老师标签",
    "name": "喜欢户外运动",
    "detail": "",
    "enabled": true,
    "tagCategory": "特色兴趣",
    "tagColor": "purple",
    "tagMeaning": "热爱篮球、足球等",
    "tagExample": "能和大童聊体育话题",
    "tagAdvice": "优先匹配大童/青少年、活泼好动的学员"
  },
  {
    "id": "tt-52",
    "type": "老师标签",
    "name": "了解中国文化",
    "detail": "",
    "enabled": true,
    "tagCategory": "特色兴趣",
    "tagColor": "purple",
    "tagMeaning": "懂中国美食、历史、城市等",
    "tagExample": "能用英语聊中国本土文化",
    "tagAdvice": "优先匹配有一定基础、喜欢分享的学员"
  },
  {
    "id": "tt-53",
    "type": "老师标签",
    "name": "男老师",
    "detail": "",
    "enabled": true,
    "tagCategory": "需关注项",
    "tagColor": "yellow",
    "tagMeaning": "性别为男",
    "tagExample": "无性别要求的学员优先安排",
    "tagAdvice": "匹配前确认家长无性别偏好"
  },
  {
    "id": "tt-54",
    "type": "老师标签",
    "name": "大叔型",
    "detail": "",
    "enabled": true,
    "tagCategory": "需关注项",
    "tagColor": "yellow",
    "tagMeaning": "中年男性，沉稳成熟",
    "tagExample": "偏好经验丰富老师的家长",
    "tagAdvice": "匹配前确认家长偏好"
  },
  {
    "id": "tt-55",
    "type": "老师标签",
    "name": "年龄稍大",
    "detail": "",
    "enabled": true,
    "tagCategory": "需关注项",
    "tagColor": "yellow",
    "tagMeaning": "老师年龄偏大",
    "tagExample": "经验丰富，但部分家长介意",
    "tagAdvice": "匹配前确认家长偏好"
  },
  {
    "id": "tt-57",
    "type": "老师标签",
    "name": "语速快",
    "detail": "",
    "enabled": true,
    "tagCategory": "需关注项",
    "tagColor": "yellow",
    "tagMeaning": "老师语速偏快",
    "tagExample": "节奏紧凑",
    "tagAdvice": "匹配高阶段、听力好的学员"
  },
  {
    "id": "tt-58",
    "type": "老师标签",
    "name": "语速慢",
    "detail": "",
    "enabled": true,
    "tagCategory": "需关注项",
    "tagColor": "yellow",
    "tagMeaning": "老师语速偏慢，吐字清晰",
    "tagExample": "适合低龄、零基础",
    "tagAdvice": "匹配零基础、低龄学员"
  },
  {
    "id": "tt-59",
    "type": "老师标签",
    "name": "不安排要求多学员",
    "detail": "",
    "enabled": true,
    "tagCategory": "需关注项",
    "tagColor": "yellow",
    "tagMeaning": "老师不接受过度挑剔的家长",
    "tagExample": "家长要求多不要派",
    "tagAdvice": "不匹配要求过多的学员"
  },
  {
    "id": "tt-60",
    "type": "老师标签",
    "name": "爱迟到",
    "detail": "",
    "enabled": true,
    "tagCategory": "风险项",
    "tagColor": "red",
    "tagMeaning": "上课迟到",
    "tagExample": "影响课堂稳定性",
    "tagAdvice": "重点关注，限制排课"
  },
  {
    "id": "tt-61",
    "type": "老师标签",
    "name": "爱缺席",
    "detail": "",
    "enabled": true,
    "tagCategory": "风险项",
    "tagColor": "red",
    "tagMeaning": "无故缺课",
    "tagExample": "严重影响学员体验",
    "tagAdvice": "暂停排课"
  },
  {
    "id": "tt-62",
    "type": "老师标签",
    "name": "待离职",
    "detail": "",
    "enabled": true,
    "tagCategory": "风险项",
    "tagColor": "red",
    "tagMeaning": "即将离职",
    "tagExample": "无法长期稳定授课",
    "tagAdvice": "尽快更换，不匹配新学员"
  },
  {
    "id": "tt-63",
    "type": "老师标签",
    "name": "暂停接新",
    "detail": "",
    "enabled": true,
    "tagCategory": "风险项",
    "tagColor": "red",
    "tagMeaning": "暂时不接新学员",
    "tagExample": "自身要求或者考虑优化",
    "tagAdvice": "暂时不安排新学员"
  },
  {
    "id": "tt-64",
    "type": "老师标签",
    "name": "暂停排课",
    "detail": "",
    "enabled": true,
    "tagCategory": "风险项",
    "tagColor": "red",
    "tagMeaning": "暂停排课状态",
    "tagExample": "生病或者其他原因无法上课",
    "tagAdvice": "暂停课程"
  },
  {
    "id": "tt-65",
    "type": "老师标签",
    "name": "网络问题",
    "detail": "",
    "enabled": true,
    "tagCategory": "风险项",
    "tagColor": "red",
    "tagMeaning": "网络不稳定，上课卡顿",
    "tagExample": "影响课堂流畅度",
    "tagAdvice": "需解决后恢复"
  },
  {
    "id": "tt-66",
    "type": "老师标签",
    "name": "设备问题",
    "detail": "",
    "enabled": true,
    "tagCategory": "风险项",
    "tagColor": "red",
    "tagMeaning": "设备故障影响上课",
    "tagExample": "视频/音频质量差",
    "tagAdvice": "需解决后恢复"
  },
  {
    "id": "tt-67",
    "type": "老师标签",
    "name": "背景不清晰",
    "detail": "",
    "enabled": true,
    "tagCategory": "风险项",
    "tagColor": "red",
    "tagMeaning": "上课背景杂乱/虚拟背景",
    "tagExample": "视觉效果差",
    "tagAdvice": "需提醒改善"
  },
  {
    "id": "tt-l2",
    "type": "老师标签",
    "name": "擅长L2（基础）",
    "detail": "",
    "enabled": true,
    "tagCategory": "年龄与基础",
    "tagColor": "green",
    "tagMeaning": "按4.0匹配表的基础等级适配",
    "tagExample": "",
    "tagAdvice": "对应学员L2"
  },
  {
    "id": "tt-l3",
    "type": "老师标签",
    "name": "擅长L3（中级）",
    "detail": "",
    "enabled": true,
    "tagCategory": "年龄与基础",
    "tagColor": "green",
    "tagMeaning": "按4.0匹配表的基础等级适配",
    "tagExample": "",
    "tagAdvice": "对应学员L3"
  }
];

const normalize = (value: string) => value.replace(/[（]/g, "(").replace(/[）]/g, ")").replace(/\s/g, "");
const aliases: Record<string, string> = {
  "亲和力强":"tt-35", "爱运动":"tt-51", "大童(10-12岁+)":"tt-40",
  "热情活动(社牛)":"tt-32", "活泼热情":"tt-32", "会简笔画":"tt-45",
  "有道具":"tt-47", "喜欢萌宠":"tt-47", "擅长L1(零基础)":"tt-41", "擅长擅长L1(零基础)":"tt-41",
  "耐心":"tt-34", "活泼":"tt-32",
};
export function teacherTagEntries(catalog: CatalogEntry[]) { return catalog.filter(c => c.type === "老师标签"); }
export function teacherTagDefinition(id: string) { return standardTeacherTags.find(t => t.id === id); }
export function teacherTagName(catalog: CatalogEntry[], id: string) { return catalog.find(t => t.type === "老师标签" && t.id === id)?.name || id; }
export function teacherTagId(value: string) {
  return standardTeacherTags.find(t => t.id === value || normalize(t.name) === normalize(value))?.id || aliases[normalize(value)] || value;
}
export function initializeTeacherTags(data: DemoState) {
  const batch="teacher-tags-v4";
  if(data.importedBatches?.includes(batch)) return false;
  for(const tag of standardTeacherTags) if(!data.catalog.some(c=>c.id===tag.id)) data.catalog.push({...tag});
  for(const teacher of data.teachers) teacher.tags=[...new Set(teacher.tags.map(teacherTagId))];
  (data.importedBatches??=[]).push(batch);
  return true;
}

export function publicTeacherTags(catalog:CatalogEntry[], ids:string[]) {
  return catalog.filter(c=>c.type==="老师标签" && ids.includes(c.id) && ["green","purple"].includes(c.tagColor || "") && !["tt-19","tt-20","tt-42","tt-53","tt-54","tt-55","tt-57","tt-58","tt-59","tt-60","tt-61","tt-62","tt-63","tt-64","tt-65","tt-66","tt-67"].includes(c.id)).map(c=>c.name);
}
