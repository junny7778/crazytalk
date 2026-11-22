import {expect,it,vi} from "vitest";
import {createSeed} from "./seed";
import {initializeTeacherNumbers,newTeacherNumber} from "./teacherNumbers";
import {transition} from "./domain";
it("旧老师补号一次，关联键与所有历史课程保持不变",()=>{
 const data=createSeed();data.teachers.forEach(t=>delete t.teacherNumber);
 const before=structuredClone(data);expect(initializeTeacherNumbers(data)).toBe(true);
 expect(data.teachers.every(t=>/^[1-9]\d{7}$/.test(t.teacherNumber!))).toBe(true);
 expect(new Set(data.teachers.map(t=>t.teacherNumber)).size).toBe(data.teachers.length);
 const numbers=data.teachers.map(t=>t.teacherNumber);expect(initializeTeacherNumbers(data)).toBe(false);expect(data.teachers.map(t=>t.teacherNumber)).toEqual(numbers);
 expect(data.teachers.map(({teacherNumber,...t})=>t)).toEqual(before.teachers);expect(data.lessons).toEqual(before.lessons);
});
it("编辑不能改号，新建不接受客户端指定编号，离职号码仍被占用",()=>{
 const data=createSeed(),teacher=data.teachers[0];teacher.status="已离职";
 const values=[Number(teacher.teacherNumber)-10000000,8765432];
 const rng=vi.spyOn(crypto,"getRandomValues").mockImplementation((array:any)=>{array[0]=values.shift();return array;});
 expect(newTeacherNumber(data.teachers)).toBe("18765432");rng.mockRestore();
 const edited=transition(data,{type:"teacher.save",teacher:{...teacher,teacherNumber:"11111111",notes:"更新备注"}}).data;
 expect(edited.teachers[0].teacherNumber).toBe(teacher.teacherNumber);
 const made=transition(data,{type:"teacher.save",teacher:{...teacher,id:"new-teacher",teacherNumber:teacher.teacherNumber,status:"在职"}}).data.teachers.at(-1)!;
 expect(made.teacherNumber).toMatch(/^[1-9]\d{7}$/);expect(data.teachers.some(t=>t.teacherNumber===made.teacherNumber)).toBe(false);
});
