import type { Account, CatalogEntry, DemoState, Student } from "./model";

export function scopeLabel(_catalog: CatalogEntry[], scope: string) {
  return scope;
}

export function studentInScope(
  data: DemoState,
  student: Pick<Student, "owner" | "ownerAccountId" | "project" | "channel" | "roster">,
  scope: string,
  account?: Account,
) {
  if (account?.roleId === "admin" || scope === "全部") return true;
  if (scope === "本组" || scope === "本队") {
    const owner = studentOrganization(data.accounts,student.owner,student.roster,student.ownerAccountId);
    if (!owner || !account) return false;
    return scope === "本组"
      ? !!account.team &&
          owner.team === account.team &&
          !!account.group &&
          owner.group === account.group
      : !!account.team && owner.team === account.team;
  }
  return false;
}

export function assignSampleTeams(data: DemoState) {
  const batch = "sample-teams-v2";
  if (data.importedBatches?.includes(batch)) return false;
  for (const [id, name, team, group] of [
    ["u2", "Rita", "A队", "二组"],
    ["u3", "Roma", "B队", "一组"],
    ["u4", "Tina", "A队", "二组"],
  ]) {
    const account = data.accounts.find(a => a.id === id && a.name === name);
    if (!account || (account.team && account.team !== team)) continue;
    account.team ||= team;
    account.group ||= group;
  }
  for (const account of data.accounts) account.scope = account.roleId === "admin" || account.scope === "全部" ? "全部" : account.scope === "本队" ? "本队" : "本组";
  for (const role of data.roles) role.scope = role.id === "admin" ? "全部" : "本组";
  (data.importedBatches ??= []).push(batch);
  return true;
}

const defaultDemoTeacherTeams: Record<string, readonly [string, string]> = {
  t1: ["B队", "一组"],
  t2: ["A队", "二组"],
  t3: ["A队", "二组"],
  t4: ["B队", "一组"],
  t5: ["A队", "二组"],
  t6: ["A队", "二组"],
  t7: ["B队", "一组"],
  "demo-tutor-theo": ["A队", "二组"],
};

export function migrateTeacherTeams(data: DemoState) {
  const batch = "sample-teacher-teams-v1";
  if (data.importedBatches?.includes(batch)) return false;
  let changed = false;
  for (const teacher of data.teachers) {
    if (teacher.team || teacher.group) continue;
    const preset = defaultDemoTeacherTeams[teacher.id];
    if (preset) {
      [teacher.team, teacher.group] = preset;
      changed = true;
      continue;
    }
    if (teacher.tmAccountId) {
      const tm = data.accounts.find((a) => a.id === teacher.tmAccountId);
      if (tm?.team && tm?.group) {
        teacher.team = tm.team;
        teacher.group = tm.group;
        changed = true;
      }
    }
  }
  (data.importedBatches ??= []).push(batch);
  return changed || true;
}

export function studentOrganization(accounts: Account[], owner: string, roster?:Student["roster"], ownerAccountId?: string) {
  if (ownerAccountId) {
    const account = accounts.find(a => a.id === ownerAccountId);
    return { team: account?.team || "待分配", group: account?.group || "待分配" };
  }
  if(roster && (roster.fields["教务"] || "")===owner)return {team:roster.fields["队别"]||"待分配",group:roster.fields["组别"]||"待分配"};
  const matches = accounts.filter(a => a.name === owner);
  const account = matches.length === 1 ? matches[0] : undefined;
  return { team: account?.team || "待分配", group: account?.group || "待分配" };
}

export function organizationView(data: DemoState, params: URLSearchParams) {
  const team = params.get("team"), group = params.get("group");
  if (!team && !group) return data;
  const students = data.students.filter(s => {
    const org = studentOrganization(data.accounts, s.owner, s.roster, s.ownerAccountId);
    return (!team || org.team === team) && (!group || org.group === group);
  });
  const ids = new Set(students.map(s => s.id));
  const lessons = data.lessons.filter(l => ids.has(l.studentId));
  const teacherIds = new Set([...students, ...lessons].map(item => item.teacherId));
  return {...data, students, lessons, feedback: data.feedback.filter(f => ids.has(f.studentId)),
    teachers: data.teachers.filter(t => teacherIds.has(t.id))};
}

export function migrateStudentOwners(data: DemoState) {
  let changed = false;
  for (const student of data.students) {
    if (student.ownerAccountId || !student.owner) continue;
    const candidates = data.accounts.filter(a => a.roleId === "ops" && a.name === student.owner &&
      (!student.roster?.fields["队别"] || a.team === student.roster.fields["队别"]) &&
      (!student.roster?.fields["组别"] || a.group === student.roster.fields["组别"]));
    if (candidates.length !== 1) continue;
    student.ownerAccountId = candidates[0].id;
    changed = true;
  }
  return changed;
}

export function migrateTeamCatalog(data: DemoState) {
  const batch = "team-catalog-v1";
  if (data.importedBatches?.includes(batch)) return false;
  for (const account of data.accounts) {
    if (!account.team) continue;
    let team = data.catalog.find(c => c.type === "队伍" && c.name === account.team);
    if (!team) {
      team = { id: "team:" + account.team, type: "队伍", name: account.team, detail: "", enabled: true };
      data.catalog.push(team);
    }
    if (account.group && !data.catalog.some(c => c.type === "组别" && c.parentId === team.id && c.name === account.group))
      data.catalog.push({ id: "group:" + JSON.stringify([account.team, account.group]), type: "组别", parentId: team.id, name: account.group, detail: "", enabled: true });
  }
  (data.importedBatches ??= []).push(batch);
  return true;
}

export function migrateProjectChannels(data: DemoState) {
  let changed = false;
  for (const project of data.catalog.filter(c => c.type === "项目")) {
    if (!project.channelIds) {
      project.channelIds = project.parentId ? [project.parentId] : data.catalog
        .filter(c => c.type === "渠道" && data.students.some(s => s.project === project.name && s.channel === c.name)).map(c => c.id);
      project.scopeChannelId = project.parentId;
      changed = true;
    }
    if (!project.parentId && project.channelIds.length) {
      project.parentId = project.channelIds[0];
      changed = true;
    }
  }
  return changed;
}
