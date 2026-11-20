import { expect,it } from "vitest";
import {teacherSchema} from "./model";
import {createSeed} from "./seed";
import {teacherProfileCard,studentProfileCard} from "./profileCards";
it("public teacher card excludes private details and uses selected public labels",()=>{
 const teacher={...createSeed().teachers[0],certificates:"TEFL、TESOL",phone:"private-phone",notes:"private-note",tags:["暂停排课"],educationBackground:"化学工程学士",teachingExperience:"3年",teachingPhilosophy:"鼓励表达"};
 const card=teacherProfileCard(teacher,["温柔有耐心"]);
 expect(card.teacher?.certificates).toBe("TEFL、TESOL");
 expect(card.text.indexOf("资质认证：TEFL、TESOL")).toBeGreaterThan(card.text.indexOf("教学专长："));
 expect(card.text.indexOf("资质认证：TEFL、TESOL")).toBeLessThan(card.text.indexOf("教育背景："));
 expect(card.text).toContain("教学经验：3年");expect(card.text).toContain("教师寄语与教学特色：鼓励表达");expect(card.text).not.toContain("教学理念：");expect(card.text).not.toContain("温柔有耐心");expect(card.teacher?.education).toBe("化学工程学士");
 for(const secret of ["private-phone","private-note","暂停排课"]) expect(card.text).not.toContain(secret);
});
it("student card uses earliest noncancelled lesson and L1 guidance without inventing date",()=>{
 const data=createSeed(), student={...data.students[0],level:"L1",firstLessonDate:"",interests:"唱歌",personality:"内向"};
 const empty=studentProfileCard(student,[]);
 expect(empty.text).toContain("Not scheduled");expect(empty.text).toContain("Slow to warm up");expect(empty.text).toContain("Singing");
 const lesson={...data.lessons[0],studentId:student.id,date:"2026-12-02",time:"18:00"};
 expect(studentProfileCard(student,[lesson]).text).toContain("2026-12-02 18:00");
 expect(empty.text).toContain("full sentence");
});

it("风险和负向标签即使颜色改为绿色也不进入公开老师简介", async () => {
  const {publicTeacherTags}=await import("./teacherTags");
  const data=createSeed();
  const risk=data.catalog.find(c=>c.id==="tt-64")!;
  risk.tagColor="green";
  expect(publicTeacherTags(data.catalog,["tt-34","tt-64","tt-42"])).toEqual(["温柔有耐心"]);
});

it("迁移旧老师介绍并且再次读取不会重复追加",()=>{
 const teacher=createSeed().teachers[0];
 const migrated=teacherSchema.parse({...teacher,bio:"原介绍",teachingPhilosophy:"教师寄语"});
 expect(migrated.teachingPhilosophy).toBe("教师寄语\n\n原介绍");
 expect(migrated).not.toHaveProperty("bio");
 expect(teacherSchema.parse(migrated)).toEqual(migrated);
 expect(teacherSchema.parse({...teacher,bio:"原介绍",teachingPhilosophy:""}).teachingPhilosophy).toBe("原介绍");
 expect(teacherSchema.parse({...teacher,bio:"相同内容",teachingPhilosophy:"相同内容"}).teachingPhilosophy).toBe("相同内容");
 expect(teacherProfileCard(migrated,[]).text).not.toContain("老师介绍：");
 expect(teacherSchema.parse({...migrated,teachingPhilosophy:""}).teachingPhilosophy).toBe("");
});


it("老师简介只取头像，不把相册照片当作头像",()=>{
 const teacher={...createSeed().teachers[0],photo:"/avatars/avatar-3.webp",photos:["/uploads/album.webp"]};
 expect(teacherProfileCard(teacher,[]).photo).toBe(teacher.photo);
 expect(teacherProfileCard({...teacher,photo:"/uploads/avatar.webp"},[]).photo).toBe("/uploads/avatar.webp");
 expect(teacherProfileCard({...teacher,photo:undefined},[]).photo).toBeUndefined();
});
