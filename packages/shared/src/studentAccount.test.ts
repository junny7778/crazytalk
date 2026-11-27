import { finishStudentAccountChange } from "./classInChanges";
import { it, expect } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { emptyStudentProfile } from "./model";

it("两个孩子绑定同一登录账号，冲突 UID 不会覆盖原账号", () => {
  let data = createSeed();
  const [a, b] = data.students;
  const bind = (id: string, uid: string) =>
    transition(data, {
      type: "student.bindClassIn",
      id,
      phone: "13900001234",
      uid,
    }).data;
  expect(() => bind(a.id, "")).toThrow("请填写有效");
  data = bind(a.id, "101");
  data = bind(b.id, "101");
  data = bind(a.id, "101");
  expect(data.classInAccounts).toHaveLength(1);
  expect(data.classInAccounts![0].studentIds.sort()).toEqual(
    [a.id, b.id].sort(),
  );
  expect(() => bind(a.id, "102")).toThrow("不一致");
});
it("同手机号新增两个独立学员，重放批次不再发号", () => {
  const row = {
    ...emptyStudentProfile(),
    importStudentId: "",
    openingBalance:0, orderStatus:"正常", name: "甲",
    phone: "13900001234",
  };
  const command = {
    type: "student.import" as const,
    mode: "skip" as const,
    students: [row, { ...row, name: "乙" }],
    batchId: "test",
  };
  const seed = createSeed(),
    data = transition(seed, command).data;
  expect(data.students.length).toBe(seed.students.length + 2);
  expect(new Set(data.students.map((s) => s.id)).size).toBe(
    data.students.length,
  );
  expect(transition(data, command).data.students).toEqual(data.students);
});

it("绑定同账号自动合并余额，重复绑定不增加余额，共享成员换号不带走原余额", () => {
  let data = createSeed();
  const [a,b] = data.students;
  const before = a.balance + b.balance;
  for (const id of [a.id,b.id,a.id]) data = transition(data,{type:"student.bindClassIn",id,phone:"13900001234",uid:"101"}).data;
  const pool = data.orders!.filter(order => order.studentIds.includes(a.id));
  expect(pool).toHaveLength(1);
  expect(pool[0].studentIds).toContain(b.id);
  expect(pool[0].balance).toBe(before);
  data = transition(data,{type:"credit.add",studentId:b.id,units:5,kind:"赠送",note:"奖励"}).data;
  expect(data.students.find(s=>s.id===a.id)!.balance).toBe(before+5);
  data = transition(data,{type:"credit.deduct",studentId:a.id,units:1,reason:"核实扣课"}).data;
  expect(data.students.find(s=>s.id===b.id)!.balance).toBe(before+4);
  data=transition(data,{type:"student.bindClassIn",id:b.id,phone:"13900000002",uid:"102"}).data;
  expect(data.classInAccounts![0].studentIds).toContain(b.id);
  finishStudentAccountChange(data,b.id);
  expect(data.students.find(s=>s.id===a.id)!.balance).toBe(before+4);
  expect(data.students.find(s=>s.id===b.id)!.balance).toBe(0);
});

it("邮箱账号必须取得 UID 后才能关联", () => {
  let data = createSeed();
  const id = data.students[0].id;
  expect(() =>
    transition(data, {
      type: "student.bindClassIn",
      id,
      phone: "student@example.com",
      uid: "",
    }),
  ).toThrow("请填写有效");
  data = transition(data, {
    type: "student.bindClassIn",
    id,
    phone: "student@example.com",
    uid: "123",
  }).data;
  expect(
    data.classInAccounts?.find((a) => a.studentIds.includes(id))?.uid,
  ).toBe("123");
});

it("UID直接关联无需手机号，复用相同UID并支持后续补充注册账号",()=>{
 let data=createSeed();const [a,b]=data.students;
 data=transition(data,{type:"student.bindClassIn",id:a.id,phone:"",uid:"12345"}).data;
 data=transition(data,{type:"student.bindClassIn",id:b.id,phone:"",uid:"12345"}).data;
 expect(data.classInAccounts).toHaveLength(1);
 data=transition(data,{type:"student.bindClassIn",id:a.id,phone:"001-8005551234",uid:"12345"}).data;
 expect(data.classInAccounts![0].phone).toBe("001-8005551234");
 expect(data.students.find(s=>s.id===a.id)!.phone).toBe(a.phone);
});

it("历史导入余额存在重复风险时拒绝合并且不改变绑定", () => {
  const data = createSeed();
  const [a,b] = data.students;
  a.roster = {key:"history-a",row:1,fields:{}};
  b.roster = {key:"history-b",row:2,fields:{}};
  const bound = transition(data,{type:"student.bindClassIn",id:a.id,phone:"",uid:"555"}).data;
  const snapshot = JSON.stringify(bound);
  expect(()=>transition(bound,{type:"student.bindClassIn",id:b.id,phone:"",uid:"555"})).toThrow("历史导入");
  expect(JSON.stringify(bound)).toBe(snapshot);
});

it("空账号首次赠课建立共享余额，成员一致且重绑不会重复赠课", () => {
  let data = createSeed();
  const ids:string[]=[];
  for (const chineseName of ["新甲","新乙"]) {
    data=transition(data,{type:"student.create",student:{...emptyStudentProfile(),chineseName}}).data;
    ids.push(data.students[0].id);
  }
  for (const id of ids) data=transition(data,{type:"student.bindClassIn",id,phone:"",uid:"777"}).data;
  data=transition(data,{type:"credit.add",studentId:ids[0],units:3,kind:"赠送",note:"活动"}).data;
  expect(data.students.filter(student=>ids.includes(student.id)).map(student=>student.balance)).toEqual([3,3]);
  expect(data.orders!.filter(order=>order.studentIds.includes(ids[0]))).toHaveLength(1);
});

it("旧同账号独立余额在重新关联前不能继续分别扣课", () => {
  const data = createSeed();
  const [a,b] = data.students;
  data.classInAccounts=[{id:"legacy",phone:"",uid:"888",studentIds:[a.id,b.id]}];
  expect(()=>transition(data,{type:"credit.deduct",studentId:a.id,units:1,reason:"扣课"})).toThrow("历史余额成员未统一");
  const fixed=transition(data,{type:"student.bindClassIn",id:a.id,phone:"",uid:"888"}).data;
  expect(fixed.orders!.filter(order=>order.studentIds.includes(a.id))).toHaveLength(1);
  expect(fixed.students.find(student=>student.id===b.id)!.balance).toBe(a.balance+b.balance);
});
