import { Select } from "@crazytalk/ui";
import { studentOrganization, type DemoState } from "@crazytalk/shared";
import { useSearchParams } from "react-router-dom";

export function OrganizationFilters({data}: {data: DemoState}) {
  const [params, setParams] = useSearchParams();
  const team = params.get("team") || "";
  const memberships = data.students.map(s => studentOrganization(data.accounts,s.owner,s.roster));
  const teams = [...new Set(["A队","B队",...memberships.map(m => m.team)])].sort();
  const groups = [...new Set([...data.accounts.filter(a=>a.team===team && a.group).map(a=>a.group!),...memberships.filter(m => m.team === team).map(m => m.group)])].sort();
  function update(key:"team"|"group", value:string) {
    const next = new URLSearchParams(params);
    if(value) next.set(key,value); else next.delete(key);
    if(key==="team") next.delete("group");
    next.delete("page"); setParams(next);
  }
  return <>
    <Select aria-label="队伍筛选" value={team} onValueChange={v=>update("team",v)}>
      <option value="">全部队伍</option>{teams.map(t=><option key={t}>{t}</option>)}
    </Select>
    <Select aria-label="组别筛选" disabled={!team} value={params.get("group")||""} onValueChange={v=>update("group",v)}>
      <option value="">全部组别</option>{groups.map(g=><option key={g}>{g}</option>)}
    </Select>
  </>;
}
