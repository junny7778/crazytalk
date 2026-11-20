import { readFileSync, writeFileSync } from "node:fs";
import type { DemoState } from "../packages/shared/src/model";
import { accountBalanceReviewIssue } from "../packages/shared/src/packageBalances";

// Read-only audit of an exported state. Never infer whether two opening balances are duplicates.
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("用法：tsx scripts/audit-account-balances.ts 导出状态.json 核对清单.json");
const data = JSON.parse(readFileSync(input, "utf8")) as DemoState;
const accounts = (data.classInAccounts ?? []).map(account => {
  const sources = (data.orders ?? []).filter(order => order.studentIds.some(id => account.studentIds.includes(id)));
  const aligned = sources.length <= 1 && sources.every(order => order.studentIds.length === account.studentIds.length && order.studentIds.every(id => account.studentIds.includes(id)));
  return {
    uid: account.uid, members: account.studentIds,
    sources: sources.map(order => ({ id: order.id, members: order.studentIds, balance: order.balance, kind: order.kind })),
    issue: accountBalanceReviewIssue(data, account.studentIds) || (aligned ? "" : "账号与余额成员未统一，请核对后重新关联账号"),
  };
});
writeFileSync(output, JSON.stringify({accounts, unbound: data.students.filter(student => !data.classInAccounts?.some(account => account.studentIds.includes(student.id))).map(student => ({id: student.id, balance: student.balance, balanceKnown: student.balanceKnown}))}, null, 2));
console.log(`已生成核对清单：${accounts.filter(account => account.issue).length} 个账号需要处理；未修改原始数据。`);
