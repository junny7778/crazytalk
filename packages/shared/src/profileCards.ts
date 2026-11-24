import type { DemoState, Student, Teacher } from "./model";

export type TeacherCardFields = { name:string; specialties:string; certificates:string; education:string; experience:string; message:string };
export type ProfileCardContent = { title: string; text: string; photo?: string; teacher?:TeacherCardFields };
export function teacherProfileCard(teacher: Teacher, _publicTags: string[]): ProfileCardContent {
  const fields={name:teacher.name,specialties:teacher.categories.join(" / "),certificates:teacher.certificates || "",education:teacher.educationBackground || "",experience:teacher.teachingExperience || "",message:teacher.teachingPhilosophy || ""};
  return {title:`${teacher.name} · 老师简介`,photo:teacher.photo,teacher:fields,text:[`姓名：${fields.name}`,`教学专长：${fields.specialties}`,`资质认证：${fields.certificates}`,`教育背景：${fields.education}`,`教学经验：${fields.experience}`,`教师寄语与教学特色：${fields.message}`].join("\n\n")};
}
const levelNotes: Record<string, string> = {
  L1: "How to talk: short sentences, lots of repetition, slower pace. Lead with yes/no and choice questions.\nFocus: self-introduction and everyday sentence frames. Encourage full-sentence answers.\nDon't: ask open why/how questions before the student is ready.\nProgress: the student answers in a full sentence, not one word.",
  L2: "How to talk: normal but slightly slower pace. Teach 'Sorry, can you repeat that?'\nFocus: role-play familiar situations and communication.\nDon't: interrupt to correct pronunciation mid-sentence.\nProgress: the student completes a role-play without switching to Chinese.",
  L3: "How to talk: normal pace with follow-up questions.\nFocus: opinions with reasons and longer turns.\nDon't: rely on mechanical questions and answers.\nProgress: the student speaks for 1–2 minutes with reasons.",
};
const interestNotes: [RegExp, string][] = [
  [/唱歌/, "Singing: use songs to introduce the lesson."], [/画画|简笔画|手工|黏土|拼贴/, "Drawing and crafts: use simple pictures to prompt speaking."],
  [/汽车|飞机/, "Toy cars or planes: use a short pretend journey and encourage spoken responses."],
  [/运动|足球|篮球|游泳|乒乓球/, "Sports: ask about favorite sports and games."],
  [/卡通|奥特曼|漫威|公主|迪士尼|芭比/, "Cartoons: ask about favorite characters to build rapport."],
  [/毛绒|公仔/, "Soft toys: use a toy to greet the student."],
  [/跳舞|角色扮演|积木|乐高/, "Acting and building: use a simple role-play to encourage participation."],
  [/桌游|拼图|下棋|大富翁/, "Games and puzzles: use a short interactive game as an icebreaker."],
];
export function studentProfileCard(student: Student, lessons: DemoState["lessons"]): ProfileCardContent {
  const first = lessons.filter(l => l.studentId === student.id && l.status !== "已取消").sort((a,b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
  const age = student.age != null ? `${student.age} years old` : (student.ageGroup ?? student.ageText).replace(/幼儿/g,"Young child").replace(/少儿/g,"Child").replace(/大童/g,"Older child").replace(/岁/g," years");
  const personality = /内向|慢热/.test(student.personality) ? "Slow to warm up. Use a gentle voice, be patient and build rapport first." : /活泼|外向|自来熟/.test(student.personality) ? "Outgoing. Encourage expression and keep activities focused." : "To be completed by the coordinator.";
  const interests = interestNotes.filter(([pattern]) => pattern.test(student.interests || "")).map(([,note])=>note);
  return {title: "Student profile", text: [
    `Name: ${student.chineseName || student.name}${student.englishName ? ` (${student.englishName})` : ""}\nID: ${student.id}`,
    `Gender: ${{男:"Boy",女:"Girl"}[student.gender] || "Not provided"}\nAge: ${age || "Not provided"}`,
    `Textbook: ${student.material || "To be confirmed"}\nFirst class: ${first ? `${first.date} ${first.time}` : student.firstLessonDate || "Not scheduled"}`,
    `Oral level: ${student.level || "Not provided"}\n${levelNotes[student.level] || "Teaching guidance: to be completed by the coordinator."}`,
    `Previous experience with foreign teachers: ${{有:"Yes",无:"None",没有:"None"}[student.foreignTeacherExperience] || "Not provided"}`,
    `Teaching notes: ${personality}`, `Interests and icebreakers:\n${interests.join("\n") || "To be completed by the coordinator."}`,
    ...(student.interests ? [`Original interests (coordinator review): ${student.interests}`] : []),
  ].join("\n\n")};
}
