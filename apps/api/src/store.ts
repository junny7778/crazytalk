import { initializeTeacherNumbers } from "../../../packages/shared/src/teacherNumbers";
import { initializeTeacherTags } from "../../../packages/shared/src/teacherTags";
import { migrateStudentOwners, migrateTeamCatalog, migrateProjectChannels } from "../../../packages/shared/src/organization";
import { isDeepStrictEqual } from "node:util";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  stateSchema,
  staffRoles,
  type DemoState,
} from "../../../packages/shared/src/model";
export const database = new PrismaClient();
export type Transaction = Prisma.TransactionClient;
const collections = {
  students: "Student",
  teachers: "Teacher",
  orders: "Order",
  lessons: "Lesson",
  credits: "Credit",
  reports: "Report",
  feedback: "Feedback",
  events: "Event",
  actions: "TeacherAction",
  payroll: "Payroll",
  roles: "Role",
  accounts: "TeamAccount",
  catalog: "Catalog",
  leaves: "Leave",
  referrals: "Referral",
  tasks: "Task",
  classInAccounts: "ClassInAccount",
  slotLocks: "SlotLock",
  payTerms: "PayTerms",
  settlements: "Settlement",
} as const;
const columns: Record<string, string[]> = {
  students: ["owner", "project", "channel"],
  lessons: ["studentId", "teacherId", "orderId", "date", "time", "status"],
  credits: ["studentId", "orderId", "lessonId"],
  reports: ["lessonId"],
};
function rowId(key: string, value: unknown) {
  const row = value as Record<string, unknown>;
  if (typeof row.id === "string") return row.id;
  return key === "slotLocks"
    ? [row.studentId, row.teacherId, row.date, row.time].join("|")
    : [row.teacherId, row.month].join("|");
}
export async function readState(
  tx: Transaction = database,
): Promise<DemoState> {
  if (tx === database) return database.$transaction(transaction => readState(transaction));
  await lockBusiness(tx);
  const settings = await tx.businessSettings.findUnique({ where: { id: 1 } });
  const result: Record<string, unknown> = {
    version: 1,
    revision: 0,
    packageBalanceVersion: 2,
    importedBatches: [],
    rules: { lowBalance: 8, trainingRequired: false },
    connection: "未连接",
    language: "zh",
    ...(settings?.data as Record<string, unknown>),
  };
  for (const [key, table] of Object.entries(collections)) {
    const rows = await tx.$queryRawUnsafe<{ data: unknown }[]>(
      'SELECT data FROM "' + table + '" ORDER BY position',
    );
    result[key] = rows.map((row) => row.data);
  }
  const state = stateSchema.parse(result);
  const before = structuredClone(state);
  const numbersChanged = initializeTeacherNumbers(state);
  const tagsChanged = initializeTeacherTags(state);
  const teamsChanged = migrateTeamCatalog(state);
  const projectsChanged = migrateProjectChannels(state);
  const ownersChanged = migrateStudentOwners(state);
  if (numbersChanged || teamsChanged || projectsChanged || tagsChanged || ownersChanged) await writeState(tx, state, before);
  return state;
}
export async function writeState(
  tx: Transaction,
  state: DemoState,
  before?: DemoState,
) {
  const previous = before || (await readState(tx));
  const settings: Record<string, unknown> = {};
  const previousSettings: Record<string, unknown> = {};
  for (const key of Object.keys(state) as (keyof DemoState)[]) {
    if (!(key in collections)) {
      settings[key] = state[key];
      previousSettings[key] = previous[key];
    }
  }
  if (!isDeepStrictEqual(settings, previousSettings)) {
    await tx.businessSettings.upsert({
      where: { id: 1 },
      create: { id: 1, data: JSON.parse(JSON.stringify(settings)) },
      update: { data: JSON.parse(JSON.stringify(settings)) },
    });
  }
  for (const [key, table] of Object.entries(collections)) {
    const rows = state[key as keyof typeof collections] || [];
    const oldRows = previous[key as keyof typeof collections] || [];
    const oldById = new Map(
      oldRows.map((row, index) => [rowId(key, row), { row, index }]),
    );
    for (const [position, value] of rows.entries()) {
      const row = value as Record<string, unknown>;
      const id = rowId(key, row);
      const old = oldById.get(id);
      if (old && old.index === position && isDeepStrictEqual(old.row, row))
        continue;
      const names = ["id", "position", "data", ...(columns[key] || [])];
      const values = [
        id,
        position,
        JSON.stringify(value),
        ...(columns[key] || []).map((name) =>
          ["orderId", "lessonId"].includes(name) && !row[name]
            ? null
            : row[name],
        ),
      ];
      const placeholders = names.map(
        (name, i) => "$" + (i + 1) + (name === "data" ? "::jsonb" : ""),
      );
      const updates = names
        .slice(1)
        .map((name) => '"' + name + '" = EXCLUDED."' + name + '"');
      await tx.$executeRawUnsafe(
        'INSERT INTO "' +
          table +
          '" (' +
          names.map((name) => '"' + name + '"').join(",") +
          ") VALUES (" +
          placeholders.join(",") +
          ") ON CONFLICT (id) DO UPDATE SET " +
          updates.join(","),
        ...values,
      );
      if (key === "orders") {
        await tx.orderMember.deleteMany({ where: { orderId: id } });
        await tx.orderMember.createMany({
          data: (row.studentIds as string[]).map((studentId) => ({
            orderId: id,
            studentId,
          })),
        });
      }
    }
  }
  for (const [key, table] of Object.entries(collections).reverse()) {
    const nextIds = new Set(
      (state[key as keyof typeof collections] || []).map((row) =>
        rowId(key, row),
      ),
    );
    const removed = (previous[key as keyof typeof collections] || [])
      .map((row) => rowId(key, row))
      .filter((id) => !nextIds.has(id));
    if (removed.length)
      await tx.$executeRawUnsafe(
        'DELETE FROM "' + table + '" WHERE id = ANY($1::text[])',
        removed,
      );
  }
}
export async function lockBusiness(tx: Transaction) {
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(183018)");
}

export async function ensureStaffRoles() {
  return database.$transaction(async (tx) => {
    await lockBusiness(tx);
    const defaults = staffRoles();
    const existing = await tx.role.findMany({
      where: { id: { in: defaults.map((role) => role.id) } },
      select: { id: true },
    });
    const missing = defaults.filter(
      (role) => !existing.some((item) => item.id === role.id),
    );
    if (!missing.length) return;
    const { _max } = await tx.role.aggregate({ _max: { position: true } });
    await tx.role.createMany({
      data: missing.map((role, index) => ({
        id: role.id,
        position: (_max.position ?? -1) + index + 1,
        data: role,
      })),
    });
  });
}
