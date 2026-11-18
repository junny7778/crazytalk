import "dotenv/config";
import { database, readState, writeState, lockBusiness } from "./store";
import { passwordHash } from "./auth";
import { superAdminRole } from "../../../packages/shared/src/model";
async function main() {
  const login = process.env.BOOTSTRAP_LOGIN,
    password = process.env.BOOTSTRAP_PASSWORD;
  if (!login || !password || password.length < 8)
    throw new Error(
      "Set BOOTSTRAP_LOGIN and BOOTSTRAP_PASSWORD (at least 8 characters)",
    );
  await database.$transaction(async (tx) => {
    await lockBusiness(tx);
    if (await tx.account.count())
      throw new Error("Initial account already exists");
    const account = await tx.account.create({
      data: {
        login,
        name: process.env.BOOTSTRAP_NAME || "管理员",
        passwordHash: passwordHash(password),
        roleId: "admin",
      },
    });
    const state = await readState(tx);
    state.roles.push(superAdminRole());
    state.accounts.push({
      id: account.id,
      name: account.name,
      phone: login,
      roleId: "admin",
      scope: "全部",
      enabled: true,
    });
    await writeState(tx, state);
  });
}
main().finally(() => database.$disconnect());
