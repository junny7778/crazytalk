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
    const owner = studentOrganization(data.accounts,student.owner,student.roster);
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

export function assignSampleTeams(data: DemoState) {
  const batch = "sample-teams-v1";
  if (data.importedBatches?.includes(batch)) return false;
  for (const [id, name, team, group] of [
    ["u2", "Rita", "A队", "二组"],
    ["u3", "Roma", "B队", "一组"],
  ]) {
    const account = data.accounts.find(a => a.id === id && a.name === name && a.roleId === "ops");
    if (!account || (account.team && account.team !== team)) continue;
    account.team ||= team;
    account.group ||= group;
  }
  (data.importedBatches ??= []).push(batch);
  return true;
}

export function studentOrganization(accounts: Account[], owner: string, roster?:Student["roster"]) {
  if(roster && (roster.fields["教务"] || "")===owner)return {team:roster.fields["队别"]||"待分配",group:roster.fields["组别"]||"待分配"};
  const account = accounts.find(a => a.name === owner);
  return { team: account?.team || "待分配", group: account?.group || "待分配" };
}

export function organizationView(data: DemoState, params: URLSearchParams) {
  const team = params.get("team"), group = params.get("group");
  if (!team && !group) return data;
  const students = data.students.filter(s => {
    const org = studentOrganization(data.accounts, s.owner, s.roster);
    return (!team || org.team === team) && (!group || org.group === group);
  });
  const ids = new Set(students.map(s => s.id));
  const lessons = data.lessons.filter(l => ids.has(l.studentId));
  const teacherIds = new Set([...students, ...lessons].map(item => item.teacherId));
  return {...data, students, lessons, feedback: data.feedback.filter(f => ids.has(f.studentId)),
    teachers: data.teachers.filter(t => teacherIds.has(t.id))};
}
