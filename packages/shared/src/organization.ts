import type { Account, CatalogEntry, DemoState, Student } from "./model";

export function projectLabel(catalog: CatalogEntry[], project: CatalogEntry) {
  const channel = catalog.find(
    (item) => item.id === project.parentId && item.type === "渠道",
  );
  return [channel?.name || "渠道待补录", project.name].join(" / ");
}

export function scopeLabel(catalog: CatalogEntry[], scope: string) {
  const project = catalog.find(
    (p) => p.type === "项目" && scope === "project:" + p.id,
  );
  return project ? projectLabel(catalog, project) : scope;
}

export function studentInScope(
  data: DemoState,
  student: Student,
  scope: string,
  account?: Account,
) {
  if (scope === "全部") return true;
  if (scope === "本人负责") return student.owner === (account?.name || "Rita");
  if (scope === "本组" || scope === "本队") {
    const owner = data.accounts.find((item) => item.name === student.owner);
    if (!owner || !account) return false;
    return scope === "本组"
      ? !!account.team &&
          owner.team === account.team &&
          !!account.group &&
          owner.group === account.group
      : !!account.team && owner.team === account.team;
  }
  if (scope.startsWith("project:")) {
    const project = data.catalog.find(
      (item) => item.type === "项目" && "project:" + item.id === scope,
    );
    const channel = data.catalog.find(
      (item) => item.type === "渠道" && item.id === project?.parentId,
    );
    return (
      !!channel &&
      project?.name === student.project &&
      channel.name === student.channel
    );
  }
  return student.project === scope || student.channel === scope;
}
