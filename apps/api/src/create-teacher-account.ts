import "dotenv/config";
import { database, readState, writeState, lockBusiness } from "./store";
import { passwordHash } from "./auth";
async function main() {
  const teacherId = process.env.TEACHER_ID;
  const login = process.env.ACCOUNT_LOGIN;
  const password = process.env.ACCOUNT_PASSWORD;
  if (!teacherId || !login || !password || password.length < 8)
    throw new Error(
      "Set TEACHER_ID, ACCOUNT_LOGIN, ACCOUNT_PASSWORD (at least 8 characters)",
    );
  await database.$transaction(async (tx) => {
    await lockBusiness(tx);
    const state = await readState(tx);
    const teacher = state.teachers.find((item) => item.id === teacherId);
    if (!teacher) throw new Error("Teacher does not exist");
    if (await tx.account.findFirst({ where: { teacherId } }))
      throw new Error("Teacher already has a login account");
    const account = await tx.account.create({
      data: {
        login,
        name: teacher.name,
        teacherId,
        roleId: "teacher",
        passwordHash: passwordHash(password),
      },
    });
    state.accounts.push({
      id: account.id,
      name: account.name,
      phone: login,
      roleId: "teacher",
      scope: "本人",
      enabled: true,
    });
    if (!state.roles.some((role) => role.id === "teacher"))
      state.roles.push({
        id: "teacher",
        name: "老师",
        description: "本人教学业务",
        permissions: [],
        scope: "本人",
      });
    await writeState(tx, state);
  });
}
main().finally(() => database.$disconnect());
