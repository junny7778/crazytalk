import { useToast } from "@crazytalk/ui";
import ClassInOperationFeedback from "../../components/ClassInOperationFeedback";
import ClassInHandoverPreview from "../../components/ClassInHandoverPreview";
import ClassInLinkForm from "../../components/ClassInLinkForm";
import TeamGroupTree from "./TeamGroupTree";
import { businessMode, businessRequest } from "@crazytalk/shared/react";
import AccountPasswordModal from "../../components/AccountPasswordModal";
import { passwordError, setDemoPassword } from "../../lib/demoPasswords";
import ClassInSyncManagement from "../../components/ClassInSyncManagement";
import FeedbackCategoryTree from "./FeedbackCategoryTree";
import DataTransferButton from "../../components/DataTransferButton";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useBlocker, useSearchParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  ChevronRight,
  Pencil,
  Plus,
  Copy,
  Save,
  ShieldCheck,
  AlertTriangle,
  Users,
  Network,
  BookOpen,
  SlidersHorizontal,
  Plug,
  ScrollText,
} from "lucide-react";
import { useDemo } from "@crazytalk/shared/react";
import {
  accountPasswordHint,
  feedbackCategoryPath,
  feedbackCategoryDeletionError,
  scopeLabel,
  isSystemRole,
  permissionGroups,
  permissionLabels,
  type Account,
  type CatalogEntry,
  type Role,
} from "@crazytalk/shared";
import {
  Select,
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  Panel,
  SearchInput,
  Tabs,
} from "@crazytalk/ui";
import { exportCsv, useBusinessAction } from "./common";
import "./operations.css";
const classInConnectionSchema = z.object({
  status: z.enum(["正常", "配置不可用", "验证失败"]),
  sid: z.string().nullable(),
  maskedSecret: z.string().nullable(),
});
const settingTabs = [
  {
    icon: Users,
    value: "accounts",
    label: "团队账号",
    permission: "account.manage",
  },
  {
    icon: ShieldCheck,
    value: "roles",
    label: "角色与权限",
    permission: "role.manage",
  },
  {
    icon: Network,
    value: "org",
    label: "项目与渠道",
    permission: "org.manage",
  },
  {
    icon: BookOpen,
    value: "basics",
    label: "基础资料",
    permission: "basics.manage",
  },
  {
    icon: SlidersHorizontal,
    value: "rules",
    label: "业务规则",
    permission: "rule.manage",
  },
  {
    icon: Plug,
    value: "classin",
    label: "ClassIn 同步管理",
    permission: "classin.view",
  },
  {
    icon: ScrollText,
    value: "audit",
    label: "操作日志",
    permission: "audit.view",
  },
];
const settingGroups = [
  { label: "团队与权限", tabs: ["accounts", "roles"] },
  { label: "业务资料", tabs: ["org", "basics", "rules"] },
  { label: "系统管理", tabs: ["classin", "audit"] },
];
export default function Settings() {
  const toast = useToast();
  const { data, can, accountId, act } = useDemo();
  const navigate = useNavigate();
  const run = useBusinessAction();
  const [params, setParams] = useSearchParams();
  const allowed = settingTabs.filter((t) => can(t.permission));
  const tab = params.get("tab") || allowed[0]?.value || "accounts";
  const isBusiness = businessMode();
  const classInConnection = useQuery({
    queryKey: ["classin-connection", accountId],
    queryFn: async ({ signal }) => classInConnectionSchema.parse(
      await businessRequest("/classin/connection", "GET", undefined, signal),
    ),
    enabled: isBusiness && tab === "classin" && can("classin.view"),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const connection = !isBusiness
    ? data.connection
    : classInConnection.isFetching
      ? "检查中"
      : classInConnection.isError
        ? "验证失败"
        : classInConnection.data?.status ?? "检查中";
  const connected = connection === "正常";
  const [query, setQuery] = useState("");
  const roleId = params.get("role") || "";
  const [draftRole, setDraftRole] = useState<Role | null>(null);
  const [roleConfirm, setRoleConfirm] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [classInTargetId, setClassInTargetId] = useState("");
  const classInTarget = data.accounts.find(a => a.id === classInTargetId);
  const [initialPassword, setInitialPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordTarget, setPasswordTarget] = useState<Account | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSaveError, setPasswordSaveError] = useState("");

  const [handover, setHandover] = useState("");
  const [organizationType, setOrganizationType] = useState<"渠道" | "项目">("渠道");
  const [catalogType, setCatalogType] = useState<CatalogEntry["type"]>("教材");
  const [entry, setEntry] = useState<CatalogEntry | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<CatalogEntry | null>(
    null,
  );
  const [categoryConfirm, setCategoryConfirm] = useState(false);
  const [movingCategory, setMovingCategory] = useState<CatalogEntry | null>(
    null,
  );
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  function openEntry(value: CatalogEntry) {
    setSelectedProjectIds(data.catalog.filter(p => p.type === "项目" && p.channelIds?.includes(value.id)).map(p => p.id));
    setEntry(value);
  }
  const [categoryToDisable, setCategoryToDisable] =
    useState<CatalogEntry | null>(null);
  const [rules, setRules] = useState({ ...data.rules });
  const [ruleConfirm, setRuleConfirm] = useState(false);
  const [logId, setLogId] = useState("");
  const [deleteRole, setDeleteRole] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const chosenRole = data.roles.find((r) => r.id === roleId);
  const role = draftRole?.id === roleId ? draftRole : chosenRole;
  useEffect(() => {
    setDraftRole((current) =>
      tab === "roles" && current?.id === roleId ? current : null,
    );
  }, [tab, roleId]);
  const log = data.events.find((e) => e.id === logId);
  const update = (value: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", value);
    next.delete("role");
    setParams(next);
    setQuery("");
  };
  useEffect(() => {
    setRules({ ...data.rules });
  }, [data.rules]);
  function openRole(id: string) {
    const next = new URLSearchParams(params);
    next.set("tab", "roles");
    if (id) next.set("role", id);
    else next.delete("role");
    setParams(next);
  }
  function createRole(source?: Role) {
    const copy: Role = source
      ? { ...source, id: `role${Date.now()}`, name: source.name + " 副本" }
      : {
          id: `role${Date.now()}`,
          name: "新角色",
          description: "",
          permissions: [],
          scope: "本组",
        };
    openRole(copy.id);
    setDraftRole(copy);
  }
  function togglePermission(key: string, checked: boolean) {
    if (!role) return;
    let keys = checked
      ? [...new Set([...role.permissions, key])]
      : role.permissions.filter((p) => p !== key);
    const module = key.split(".")[0];
    if (
      checked &&
      !key.endsWith(".view") &&
      permissionGroups.flatMap((g) => g.keys).includes(`${module}.view`)
    )
      keys = [...new Set([...keys, `${module}.view`])];
    if (!checked && key.endsWith(".view"))
      keys = keys.filter((p) => !p.startsWith(module + "."));
    setDraftRole({ ...role, permissions: keys });
  }
  const categoryDeleteError = categoryToDelete
    ? feedbackCategoryDeletionError(data, categoryToDelete.id)
    : null;
  const rulesDirty = JSON.stringify(rules) !== JSON.stringify(data.rules);
  const savedAccount = data.accounts.find((item) => item.id === account?.id);
  const hasAvailableTeams = data.catalog.some(c => c.type === "队伍" && c.enabled);
  const accountTeamId = data.catalog.find(c => c.type === "队伍" && c.name === account?.team)?.id;
  const hasAvailableGroups = data.catalog.some(c => c.type === "组别" && c.enabled && c.parentId === accountTeamId);

  const savedEntry = data.catalog.find((item) => item.id === entry?.id);
  const accountDirty =
    !!account &&
    (savedAccount
      ? JSON.stringify(account) !== JSON.stringify(savedAccount)
      : !!(account.name || account.phone || initialPassword || confirmPassword));
  const categoryPath =
    entry?.type === "反馈分类" ? feedbackCategoryPath(data.catalog, entry) : [];
  const categoryLevel = ["一", "二", "三"][categoryPath.length - 1] || "一";
  const categoryDescendants =
    entry?.type === "反馈分类"
      ? data.catalog.filter(
          (item) =>
            item.type === "反馈分类" &&
            item.id !== entry.id &&
            feedbackCategoryPath(data.catalog, item).some(
              (node) => node.id === entry.id,
            ),
        )
      : [];
  const renamedParent =
    !!savedEntry &&
    entry?.type === "反馈分类" &&
    entry.name.trim() !== savedEntry.name &&
    categoryDescendants.length > 0;
  const entryDirty =
    !!entry &&
    ((entry.type === "渠道" && JSON.stringify([...selectedProjectIds].sort()) !== JSON.stringify(data.catalog.filter(p => p.type === "项目" && p.channelIds?.includes(entry.id)).map(p => p.id).sort())) || (savedEntry
      ? JSON.stringify(entry) !== JSON.stringify(savedEntry)
      : !!(entry.name || entry.detail)));
  const originalMove = data.catalog.find(
    (item) => item.id === movingCategory?.id,
  );
  const moveDirty =
    !!movingCategory && movingCategory.parentId !== originalMove?.parentId;
  const moveDescendants = movingCategory
    ? data.catalog.filter(
        (item) =>
          item.type === "反馈分类" &&
          feedbackCategoryPath(data.catalog, item).some(
            (node) => node.id === movingCategory.id,
          ),
      )
    : [];
  const moveHeight = movingCategory
    ? Math.max(
        ...moveDescendants.map(
          (item) =>
            feedbackCategoryPath(data.catalog, item).length -
            feedbackCategoryPath(data.catalog, originalMove || movingCategory)
              .length +
            1,
        ),
      )
    : 1;
  const moveOptions = movingCategory
    ? data.catalog.filter(
        (item) =>
          item.type === "反馈分类" &&
          !moveDescendants.some((node) => node.id === item.id) &&
          feedbackCategoryPath(data.catalog, item).length + moveHeight <= 3 &&
          feedbackCategoryPath(data.catalog, item).every(
            (node) => node.enabled,
          ),
      )
    : [];
  const moveParent = data.catalog.find(
    (item) => item.id === movingCategory?.parentId,
  );
  const moveParentPath = moveParent
    ? feedbackCategoryPath(data.catalog, moveParent)
    : [];
  const roleDirty =
    !!draftRole && JSON.stringify(draftRole) !== JSON.stringify(chosenRole);
  const dirty =
    roleDirty ||
    rulesDirty ||
    accountDirty ||
    entryDirty ||
    moveDirty;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);
  function requestClose(action: () => void, changed: boolean) {
    if (changed) setDiscardAction(() => action);
    else action();
  }
  function discardDrafts() {
    setDraftRole(null);
    setRules({ ...data.rules });
    setAccount(null);
    setEntry(null);
    setCategoryToDisable(null);
    setCategoryConfirm(false);
    setCategoryToDelete(null);
    setMovingCategory(null);
    setRoleConfirm(false);
    setRuleConfirm(false);
  }
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function saveEntry() {
    if (!entry) return;
    await run({ type: "catalog.save", entry, ...(entry.type === "渠道" ? {projectIds: selectedProjectIds} : {}) }, () => {
      setEntry(null);
      setCategoryConfirm(false);
      setCategoryToDisable(null);
    });
  }
  const showCatalogType = tab !== "org" && catalogType !== "SO";
  const catalogRows = data.catalog.filter(
    (c) =>
      (tab === "org"
        ? c.type === organizationType
        : c.type === catalogType) &&
      `${
        c.type === "反馈分类"
          ? feedbackCategoryPath(data.catalog, c)
              .map((item) => item.name)
              .join(" / ")
          : c.name
      } ${c.detail}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="stack">
      <div className="ops-settings settings-workspace">
        <nav
          className="ops-side-tabs settings-navigation"
          aria-label="设置导航"
        >
          {settingGroups.map((group) => {
            const items = allowed.filter((item) =>
              group.tabs.includes(item.value),
            );
            return items.length ? (
              <section
                className="settings-nav-group"
                key={group.label}
                aria-label={group.label}
              >
                <h2>{group.label}</h2>
                {items.map((item) => (
                  <button
                    key={item.value}
                    aria-current={tab === item.value ? "page" : undefined}
                    className={tab === item.value ? "active" : ""}
                    onClick={() => update(item.value)}
                  >
                    <item.icon
                      size={17}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <span>{item.label}</span>
                  </button>
                ))}
              </section>
            ) : null;
          })}
        </nav>
        <div className="stack">
          {!allowed.some((t) => t.value === tab) ? (
            <Panel>
              <EmptyState
                title="你没有查看这项设置的权限"
                description="请联系管理员确认工作范围。"
              />
            </Panel>
          ) : tab === "accounts" ? (
            <Panel
              title="团队账号"
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setHandover("");
                    setInitialPassword(""); setConfirmPassword(""); setPasswordSaveError("");
                    setAccount({
                      id: `u${Date.now()}`,
                      name: "",
                      phone: "",
                      roleId: "ops",
                      scope: "本组",
                      enabled: true,
                    });
                  }}
                >
                  <Plus size={14} />
                  新建账号
                </Button>
              }
            >
              <ClassInOperationFeedback/>
              <div className="toolbar">
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="搜索姓名或登录账号"
                />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>姓名</th>
                      <th>登录账号</th>
                      <th>角色</th><th>数据范围</th><th>队伍</th><th>组别</th>
                      <th>ClassIn 账号</th>
                      <th>负责学员</th>
                      <th>状态</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.accounts
                      .filter((a) => `${a.name} ${a.phone}`.includes(query))
                      .map((a) => (
                        <tr key={a.id}>
                          <td>
                            <strong>{a.name}</strong>
                          </td>
                          <td>
                            {a.phone.slice(0, 3)}****{a.phone.slice(-4)}
                          </td>
                          <td>
                            {data.roles.find((r) => r.id === a.roleId)?.name}
                          </td><td>
                              {a.scope === "全部"
                                ? "全部数据"
                                : scopeLabel(data.catalog, a.scope)}
                          </td><td>{a.team || "—"}</td><td>{a.group || "—"}</td>
                          <td>
                            {["ops", "tm"].includes(a.roleId) ? a.classInUid ? (
                              a.classInAccount || a.classInUid
                            ) : (
                              <div className="row">
                                <span className="muted">未关联</span>
                                <Button size="xs" variant="ghost" disabled={!a.enabled} onClick={() => setClassInTargetId(a.id)}>关联</Button>
                              </div>
                            ) : "—"}
                          </td>
                          <td>
                            {
                              data.students.filter((s) => s.owner === a.name)
                                .length
                            }{" "}
                            位
                          </td>
                          <td>
                            <Badge tone={a.enabled ? "success" : "neutral"}>
                              {a.enabled ? "启用" : "已停用"}
                            </Badge>
                          </td>
                          <td>
                            <Button
                              size="xs"
                              variant="ghost"
                              disabled={businessMode() ? a.id === accountId : a.id === "u1"}
                              onClick={() => {
                                setAccount({ ...a });
                                setHandover("");
                              }}
                            >
                              编辑
                            </Button>
                            <Button size="xs" variant="ghost" onClick={() => setPasswordTarget(a)}>重置密码</Button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : tab === "roles" ? (
            !roleId ? (
              <Panel
                title="角色与权限"
                description="管理团队角色，进入角色详情查看或编辑权限。"
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    data-diagnostic-action="new-role"
                    onClick={() => createRole()}
                  >
                    <Plus size={14} />
                    新建角色
                  </Button>
                }
              >
                <div className="table-wrap">
                  <table className="settings-role-list">
                    <thead>
                      <tr>
                        <th>角色名称</th>
                        <th>说明</th>
                        <th>使用账号</th>
                        <th>操作权限</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.roles.map((item) => (
                        <tr key={item.id} onClick={() => openRole(item.id)}>
                          <td>
                            <button
                              className="settings-role-link"
                              onClick={(event) => {
                                event.stopPropagation();
                                openRole(item.id);
                              }}
                            >
                              <ShieldCheck size={18} />
                              <strong>{item.name}</strong>
                              {isSystemRole(item.id) && (
                                <Badge tone="neutral">系统角色</Badge>
                              )}
                            </button>
                          </td>
                          <td>{item.description || "—"}</td>
                          <td>
                            {
                              data.accounts.filter(
                                (account) => account.roleId === item.id,
                              ).length
                            }{" "}
                            个账号
                          </td>
                          <td>{item.permissions.length} 项</td>
                          <td>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                openRole(item.id);
                              }}
                            >
                              查看详情
                              <ChevronRight size={14} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            ) : role ? (
              <div className="stack settings-role-detail">
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openRole("")}
                  >
                    <ArrowLeft size={16} />
                    返回角色列表
                  </Button>
                </div>
                <Panel
                  title={role.name}
                  action={
                    <div className="row">
                      {!draftRole && (
                        <>
                          <Button variant="ghost" size="sm" data-diagnostic-action="copy-role" onClick={() => createRole(role)}>
                            <Copy size={14} />
                            复制角色
                          </Button>
                          {role.id !== "admin" && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() =>
                                setDraftRole({
                                  ...role,
                                  permissions: [...role.permissions],
                                })
                              }
                            >
                              <Pencil size={14} />
                              编辑权限
                            </Button>
                          )}
                        </>
                      )}
                      {draftRole && <Badge tone="neutral">编辑中</Badge>}
                    </div>
                  }
                >
                  <div className="stack">
                    <div className="settings-role-summary">
                      <span>
                        <Users size={16} />
                        {
                          data.accounts.filter(
                            (account) => account.roleId === role.id,
                          ).length
                        }{" "}
                        个账号使用
                      </span>
                      <span>
                        <ShieldCheck size={16} />
                        {role.permissions.length} 项操作权限
                      </span>
                    </div>
                    {role.id === "admin" ? (
                      <div className="notice notice-info">
                        <ShieldCheck size={18} />
                        超级管理员拥有全部权限，不能修改或删除。
                      </div>
                    ) : draftRole ? (
                      <div className="form-grid">
                        <Field label="角色名称" required>
                          <input
                            value={role.name}
                            onChange={(event) =>
                              setDraftRole({
                                ...role,
                                name: event.target.value,
                              })
                            }
                          />
                        </Field>
                        <Field label="说明">
                          <input
                            value={role.description}
                            onChange={(event) =>
                              setDraftRole({
                                ...role,
                                description: event.target.value,
                              })
                            }
                          />
                        </Field>
                      </div>
                    ) : null}
                    <div className="row between">
                      <h3>权限配置</h3>
                      {draftRole && (
                        <small className="muted">
                          修改权限后，保存时将展示变更影响。
                        </small>
                      )}
                    </div>
                    {permissionGroups.map((group) => {
                      const selectedCount = group.keys.filter((key) =>
                        role.permissions.includes(key),
                      ).length;
                      const allSelected = selectedCount === group.keys.length;
                      return (
                        <section
                          className="settings-permission-group"
                          key={group.name}
                        >
                          <h3 className="settings-permission-heading">
                            {group.name}{" "}
                            <small>
                              {selectedCount}/{group.keys.length}
                            </small>
                          </h3>
                          <div className="ops-permissions">
                            {draftRole && role.id !== "admin" && (
                              <label className="select-row">
                                <input
                                  type="checkbox"
                                  aria-label={`${group.name}全部权限`}
                                  checked={allSelected}
                                  ref={(input) => {
                                    if (input) {
                                      input.indeterminate =
                                        selectedCount > 0 && !allSelected;
                                    }
                                  }}
                                  onChange={(event) => {
                                    const permissions = event.target.checked
                                      ? [
                                          ...new Set([
                                            ...role.permissions,
                                            ...group.keys,
                                          ]),
                                        ]
                                      : role.permissions.filter(
                                          (key) => !group.keys.includes(key),
                                        );
                                    setDraftRole({ ...role, permissions });
                                  }}
                                />
                                全部
                              </label>
                            )}
                            {group.keys.map((key) => (
                              <label
                                key={key}
                                className="select-row"
                                title={key}
                              >
                                <input
                                  type="checkbox"
                                  disabled={!draftRole || role.id === "admin"}
                                  checked={role.permissions.includes(key)}
                                  onChange={(e) =>
                                    togglePermission(key, e.target.checked)
                                  }
                                />
                                {permissionLabels[key] || "其他业务操作"}
                                {[
                                  "student.refund",
                                  "payroll.confirm",
                                  "role.manage",
                                  "classin.manage",
                                  "field.pay_amount",
                                ].includes(key) && (
                                  <AlertTriangle size={12} className="warning" />
                                )}
                              </label>
                            ))}
                          </div>
                        </section>
                      );
                    })}

                    {(draftRole || !isSystemRole(role.id)) && (
                      <div className="row between settings-role-footer">
                        {!draftRole ? (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              setDeleteName("");
                              setDeleteRole(true);
                            }}
                          >
                            删除角色
                          </Button>
                        ) : (
                          <>
                            <span className="muted">
                              {roleDirty ? "有未保存的修改" : "尚未修改"}
                            </span>
                            <div className="row">
                              <Button
                                onClick={() =>
                                  chosenRole
                                    ? requestClose(
                                        () => setDraftRole(null),
                                        roleDirty,
                                      )
                                    : openRole("")
                                }
                              >
                                取消编辑
                              </Button>
                              <Button
                                variant="primary"
                                disabled={!roleDirty || !role.name.trim()}
                                data-diagnostic-action="save-role"
                                onClick={() => setRoleConfirm(true)}
                              >
                                <Save size={15} />
                                保存权限
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </Panel>
              </div>
            ) : (
              <Panel>
                <EmptyState
                  title="角色不存在或已删除"
                />
              </Panel>
            )
          ) : tab === "org" || tab === "basics" ? (
            <Panel
              title={tab === "org" ? "项目与渠道" : "基础资料"}
              description={
                tab === "org" || catalogType !== "反馈分类"
                  ? "已使用的资料保留历史记录，不直接删除。停用后不再提供给新业务选择。"
                  : undefined
              }
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    openEntry({
                      id: `c${Date.now()}`,
                      type: tab === "org" ? organizationType : catalogType,
                      ...(tab === "basics" && catalogType === "反馈分类"
                        ? { parentId: "" }
                        : {}),
                      name: "",
                      detail: "",
                      enabled: true,
                    })
                  }
                >
                  <Plus size={14} />
                  {tab === "org"
                    ? `新建${organizationType}`
                    : catalogType === "反馈分类"
                      ? "新增一级分类"
                      : "新增"}
                </Button>
              }
            >
              {tab === "org" && <Tabs value={organizationType} onChange={value => {
                if (value === "渠道" || value === "项目") { setOrganizationType(value); setQuery(""); }
              }} items={[{value:"渠道",label:"渠道"},{value:"项目",label:"项目"}]}/>}
              {tab === "basics" && (
                <Tabs
                  value={catalogType}
                  onChange={(v) => {
                    if (v === "教材" || v === "反馈分类" || v === "SO" || v === "队伍" || v === "老师标签")
                      setCatalogType(v);
                  }}
                  items={["教材", "反馈分类", "SO", "队伍", "老师标签"].map((v) => ({
                    value: v,
                    label: v === "队伍" ? "队伍与组别" : v,
                  }))}
                />
              )}
              <div className="toolbar">
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="搜索名称"
                />
              </div>
              {tab === "basics" && catalogType === "老师标签" ? (
                <div className="stack" aria-label="老师标签库">{data.catalog.filter(t=>t.type==="老师标签" && t.name.includes(query)).map(tag=><article key={tag.id} className="inset">
                  <div className="row wrap"><strong>{tag.name}</strong><span>{tag.tagCategory || "其他"}</span><span>{({green:"绿色 · 优势",yellow:"黄色 · 需关注",red:"红色 · 风险",purple:"紫色 · 特色"})[tag.tagColor || "green"]}</span><Badge tone={tag.enabled ? "success" : "neutral"}>{tag.enabled ? "启用" : "已停用"}</Badge><Button size="sm" onClick={()=>openEntry({...tag})}>编辑</Button><Button size="sm" onClick={()=>run({type:"catalog.save",entry:{...tag,enabled:!tag.enabled}})}>{tag.enabled ? "停用" : "启用"}</Button></div>
                  <p>{tag.tagMeaning || "未填写释义"}</p><p>{tag.tagExample}</p><small>{tag.tagAdvice}</small>
                </article>)}</div>
              ) : tab === "basics" && catalogType === "队伍" ? (
                <TeamGroupTree catalog={data.catalog} query={query}
                  onEdit={value => openEntry({...value})}
                  onAdd={team => openEntry({id: `c${Date.now()}`, type: "组别", parentId: team.id, name: "", detail: "", enabled: true})}
                />
              ) : tab === "basics" && catalogType === "反馈分类" ? (
                <FeedbackCategoryTree
                  catalog={data.catalog}
                  query={query}
                  onEdit={(value) => openEntry({ ...value })}
                  onAdd={(parent) =>
                    openEntry({
                      id: `c${Date.now()}`,
                      type: "反馈分类",
                      name: "",
                      detail: "",
                      enabled: true,
                      parentId: parent.id,
                    })
                  }
                  onMove={(value) => setMovingCategory({ ...value })}
                  onToggle={async (value) => {
                    if (value.enabled)
                      setCategoryToDisable({ ...value, enabled: false });
                    else
                      await run({
                        type: "catalog.save",
                        entry: { ...value, enabled: true },
                      });
                  }}
                  onDelete={(value) => setCategoryToDelete(value)}
                />
              ) : !catalogRows.length ? (
                <EmptyState title="没有符合条件的资料" />
              ) : (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>名称</th>
                          {showCatalogType && <th>类型</th>}
                          {tab === "org" && <><th>{organizationType === "渠道" ? "合作项目" : "合作渠道"}</th>{organizationType === "项目" && <th>月应上课数</th>}</>}
                          <th>说明</th>
                          <th>状态</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catalogRows.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <strong>{c.name}</strong>
                            </td>
                            {showCatalogType && <td>{c.type}</td>}
                            {tab === "org" && <><td>{c.type === "项目" ? data.catalog.filter(channel=>c.channelIds?.includes(channel.id)).map(channel=>channel.name).join("、") || "暂无合作渠道" : data.catalog.filter(p => p.type === "项目" && p.channelIds?.includes(c.id)).map(p => p.name).join("、") || "暂无合作项目"}</td>{organizationType === "项目" && <td>{c.monthlyLessons ?? "待补录"}</td>}</>}
                            <td>{c.detail || "—"}</td>
                            <td>
                              <Badge tone={c.enabled ? "success" : "neutral"}>
                                {c.enabled ? "启用" : "已停用"}
                              </Badge>
                            </td>
                            <td>
                              <div className="row">
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => openEntry({ ...c })}
                                >
                                  编辑
                                </Button>
                                <Button
                                  size="xs"
                                  onClick={async () =>
                                    await run({
                                      type: "catalog.save",
                                      entry: { ...c, enabled: !c.enabled },
                                    })
                                  }
                                >
                                  {c.enabled ? "停用" : "启用"}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Panel>
          ) : tab === "rules" ? (
            <>
              <Panel title="业务规则与提醒阈值">
                <div className="stack">
                  <section
                    className="settings-rule-conventions"
                    aria-label="系统口径"
                  >
                    <h3 className="settings-rule-conventions-label">
                      系统口径
                    </h3>
                    <dl>
                      <div>
                        <dt>课时单位</dt>
                        <dd>1 课时 = 25 分钟</dd>
                      </div>
                      <div>
                        <dt>排班网格</dt>
                        <dd>30 分钟一格</dd>
                      </div>
                      <div>
                        <dt>晚间时间</dt>
                        <dd>18:00 起</dd>
                      </div>
                      <div>
                        <dt>可固定判断</dt>
                        <dd>向后检查 4 周</dd>
                      </div>
                    </dl>
                  </section>
                  <div className="form-grid settings-rule-threshold">
                    <Field label="课时快用完（剩余课时 ≤）">
                      <input
                        type="number"
                        min="0"
                        value={rules.lowBalance}
                        onChange={(e) =>
                          setRules({
                            ...rules,
                            lowBalance: Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                  </div>
                  <label className="select-row">
                    <input
                      type="checkbox"
                      checked={rules.trainingRequired}
                      onChange={(e) =>
                        setRules({
                          ...rules,
                          trainingRequired: e.target.checked,
                        })
                      }
                    />
                    老师培训达标后才能排课
                  </label>
                  <div className="row">
                    {rulesDirty && (
                      <small className="muted">有未保存的修改</small>
                    )}
                    <Button
                      disabled={!rulesDirty}
                      onClick={() => setRules({ ...data.rules })}
                    >
                      取消修改
                    </Button>
                    <Button
                      variant="primary"
                      disabled={!rulesDirty}
                      onClick={() => setRuleConfirm(true)}
                    >
                      保存规则
                    </Button>
                  </div>
                </div>
              </Panel>
            </>
          ) : tab === "classin" ? (
            <>
              <Panel
                title="ClassIn 同步管理"
                action={
                  <Badge
                    tone={connected ? "success" : "warning"}
                  >
                    {connection}
                  </Badge>
                }
              >
                <div className="stack">
                  <div className={connected ? "ops-state-line" : undefined}>
                    {connected
                      ? "课程连接正常"
                      : connection === "检查中" ? "正在验证 ClassIn API" : "课程连接需要检查"}
                  </div>
                  <div className="inset">
                    <dl className="detail-pairs">
                      <dt>SID</dt>
                      <dd>{classInConnection.data?.sid ?? "—"}</dd>
                      <dt>密钥</dt>
                      <dd>{classInConnection.data?.maskedSecret ?? "—"}</dd>
                    </dl>
                  </div>
                </div>
              </Panel>
              <ClassInSyncManagement connected={connected} />
            </>
          ) : (
            <Panel
              title="操作日志"
              description="日志只读，不能修改或删除。"
              action={
                <DataTransferButton
                  direction="export"
                  size="sm"
                  onClick={() =>
                    exportCsv("操作日志", [
                      ["日期", "操作人", "动作", "内容"],
                      ...data.events.map((e) => [
                        e.date,
                        e.operator,
                        e.type,
                        e.content,
                      ]),
                    ])
                  }
                />
              }
            >
              <div className="toolbar">
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="搜索人员、动作或内容"
                />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>操作人</th>
                      <th>动作</th>
                      <th>内容</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.events
                      .filter((e) =>
                        `${e.operator} ${e.type} ${e.content}`.includes(query),
                      )
                      .map((e) => (
                        <tr key={e.id}>
                          <td>{e.date}</td>
                          <td>{e.operator}</td>
                          <td>{e.type}</td>
                          <td
                            style={{
                              maxWidth: 400,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {e.content}
                          </td>
                          <td>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => setLogId(e.id)}
                            >
                              详情
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!data.events.length && (
                <EmptyState
                  title="还没有操作记录"
                  description="关键业务操作会自动记录在这里。"
                />
              )}
            </Panel>
          )}
        </div>
      </div>
      <Modal
        open={blocker.state === "blocked" || !!discardAction}
        onClose={() => {
          if (blocker.state === "blocked") blocker.reset();
          setDiscardAction(null);
        }}
        title="有未保存的修改"
        width={440}
        footer={
          <>
            <Button
              onClick={() => {
                if (blocker.state === "blocked") blocker.reset();
                setDiscardAction(null);
              }}
            >
              继续编辑
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (blocker.state === "blocked") {
                  discardDrafts();
                  blocker.proceed();
                } else {
                  discardAction?.();
                  setDiscardAction(null);
                }
              }}
            >
              放弃修改
            </Button>
          </>
        }
      >
        <p>离开后，本次尚未保存的修改会丢失。</p>
      </Modal>
      {classInTarget && <Modal
        open
        title="关联 ClassIn 账号"
        width={480}
        onClose={() => setClassInTargetId("")}
      >
        <ClassInLinkForm
          key={classInTarget.id}
          role="staff"
          targetId={classInTarget.id}
          name={classInTarget.name}
          phone={classInTarget.classInAccount || classInTarget.phone}
          roleLabel={data.roles.find(r => r.id === classInTarget.roleId)?.name || "团队成员"}
          onSave={async (classInUid, classInAccount) => {
            await act({type:"account.save", account:{...classInTarget, classInUid, classInAccount}});
            setClassInTargetId(current => current === classInTarget.id ? "" : current);
          }}
        />
      </Modal>}
      {passwordTarget && <AccountPasswordModal key={passwordTarget.id} id={passwordTarget.id} name={passwordTarget.name} onClose={() => setPasswordTarget(null)} />}
      <Modal
        open={!!account}
        onClose={() => passwordSaving ? setAccount(null) : requestClose(() => setAccount(null), accountDirty)}
        title={
          data.accounts.some((a) => a.id === account?.id)
            ? "编辑团队账号"
            : "新建团队账号"
        }
        footer={
          <>
            <Button
              onClick={() => passwordSaving ? setAccount(null) : requestClose(() => setAccount(null), accountDirty)}
            >
              取消
            </Button>
            <Button
              variant="primary"
              loading={passwordSaving}
              disabled={
                passwordSaving ||
                (!savedAccount && !!passwordError(initialPassword, confirmPassword)) ||
                !account?.name.trim() ||
                !account.phone.trim() ||
                (!account.enabled &&
                  (data.students.some((s) => s.ownerAccountId === account.id) ||
                    data.feedback.some(
                      (f) => f.owner === account.name && f.status !== "已完成",
                    )) &&
                  !handover)
              }
              onClick={async () => {
                if (!account) return;
                setPasswordSaving(true); setPasswordSaveError("");
                try {
                  if (!savedAccount && !businessMode()) await setDemoPassword(account.id, initialPassword);
                  const result = await act({ type: "account.save", account, ...(businessMode() && !savedAccount ? { initialPassword } : {}), handoverTo: handover || undefined });
                  toast(result.message);
                  setAccount(null); setInitialPassword(""); setConfirmPassword("");
                } catch (cause) { setPasswordSaveError(cause instanceof Error ? cause.message : "设置密码失败"); }
                finally { setPasswordSaving(false); }
              }}
            >
              {passwordSaving ? (handover ? "正在交接" : "正在保存") : "保存账号"}
            </Button>
          </>
        }
      >
        {account && (
          <div {...(passwordSaving ? {inert:""}: {})} className="stack">
            <div className="form-grid">
              <Field label="姓名" required>
                <input
                  value={account.name}
                  onChange={(e) =>
                    setAccount({ ...account, name: e.target.value })
                  }
                />
              </Field>
              <Field label="登录账号" required>
                <input
                  type="text"
                  value={account.phone}
                  onChange={(e) =>
                    setAccount({ ...account, phone: e.target.value })
                  }
                />
              </Field>
            </div>
            {!savedAccount && <>
              <AccountPasswordField label="初始密码" hint={accountPasswordHint} error={initialPassword ? passwordError(initialPassword, initialPassword) : undefined} value={initialPassword} onChange={setInitialPassword} />
              <AccountPasswordField label="确认密码" error={confirmPassword && initialPassword !== confirmPassword ? "两次输入的密码不一致" : undefined} value={confirmPassword} onChange={setConfirmPassword} />
              {!businessMode() && <small className="muted">密码仅在当前页面有效，刷新后恢复为初始密码 Demo12345。</small>}
            </>}
            {passwordSaveError && <p className="danger" role="alert">{passwordSaveError}</p>}
            <Field label="角色">
              <Select
                value={account.roleId}
                onValueChange={(value) =>
                  setAccount({ ...account, roleId: value, scope: value === "admin" ? "全部" : "本组" })
                }
              >
                {data.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="所属队伍" hint={!hasAvailableTeams ? "暂无可选队伍，请先在基础资料的「队伍与组别」中新增或启用。" : undefined}><Select disabled={!hasAvailableTeams} value={account.team || ""} onValueChange={team => setAccount({...account, team, group:""})}>
              <option value="">待分配</option>{data.catalog.filter(c => c.type === "队伍" && (c.enabled || c.name === account.team)).map(t => <option key={t.id} value={t.name} disabled={!t.enabled}>{t.name}{!t.enabled && "（已停用）"}</option>)}
            </Select></Field>
            <Field label="队内组别" hint={account.team && !hasAvailableGroups ? "该队伍暂无可选组别，请先在基础资料中新增或启用。" : undefined}><Select disabled={!account.team || !hasAvailableGroups} value={account.group || ""} onValueChange={group=>setAccount({...account,group})}>
              <option value="">待分配</option>{data.catalog.filter(c => c.type === "组别" && c.parentId === data.catalog.find(t => t.type === "队伍" && t.name === account.team)?.id && (c.enabled || c.name === account.group)).map(g => <option key={g.id} value={g.name} disabled={!g.enabled}>{g.name}{!g.enabled && "（已停用）"}</option>)}
            </Select></Field>

            <Field label="数据范围">
              <Select
                value={account.scope}
                onValueChange={(value) =>
                  setAccount({ ...account, scope: value })
                }
              >
                {(account.roleId === "admin" ? ["全部"] : ["全部", "本组", "本队"]).map(s =>
                  <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <label className="select-row">
              <input
                type="checkbox"
                checked={account.enabled}
                onChange={(e) =>
                  setAccount({ ...account, enabled: e.target.checked })
                }
              />
              启用账号
            </label>
            {!account.enabled &&
              (data.students.some((s) => s.ownerAccountId === account.id) ||
                data.feedback.some(
                  (f) => f.owner === account.name && f.status !== "已完成",
                )) && (
                <>
                  <div className="notice">
                    <AlertTriangle size={18} />
                    仍负责{" "}
                    {
                      data.students.filter((s) => s.ownerAccountId === account.id)
                        .length
                    }{" "}
                    位学员、
                    {
                      data.feedback.filter(
                        (f) =>
                          f.owner === account.name && f.status !== "已完成",
                      ).length
                    }{" "}
                    条处理中的反馈，请先选择接手人。
                  </div>
                  <ClassInHandoverPreview studentIds={data.students.filter(s=>s.ownerAccountId===account.id).map(s=>s.id)} ownerId={handover}/>
                  <Field label="转交给" required>
                    <Select
                      value={handover}
                      onValueChange={(value) => setHandover(value)}
                    >
                      <option value="">选择接手人</option>
                      {data.accounts
                        .filter((a) => a.id !== account.id && a.enabled && a.roleId === "ops")
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </Select>
                  </Field>
                </>
              )}
            <div className="inset">
              <small>
                这个角色拥有{" "}
                {data.roles.find((r) => r.id === account.roleId)?.permissions
                  .length || 0}{" "}
                项操作权限。敏感字段将根据角色显示。
              </small>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={!!categoryToDelete}
        onClose={() => setCategoryToDelete(null)}
        title="删除反馈分类"
        width={440}
        footer={
          <>
            <Button onClick={() => setCategoryToDelete(null)}>取消</Button>
            <Button
              variant="danger"
              disabled={!!categoryDeleteError}
              onClick={async () =>
                categoryToDelete &&
                await run(
                  { type: "feedback-category.delete", id: categoryToDelete.id },
                  () => setCategoryToDelete(null),
                )
              }
            >
              确认删除
            </Button>
          </>
        }
      >
        {categoryDeleteError ? (
          <div className="notice">
            <AlertTriangle size={18} />
            {categoryDeleteError}
          </div>
        ) : (
          <p>
            确定删除「{categoryToDelete?.name}
            」吗？该分类没有下级且未被反馈使用，删除后无法恢复。
          </p>
        )}
      </Modal>
      <Modal
        open={!!categoryToDisable}
        onClose={() => setCategoryToDisable(null)}
        title="停用反馈分类"
        width={440}
        footer={
          <>
            <Button onClick={() => setCategoryToDisable(null)}>取消</Button>
            <Button
              variant="danger"
              onClick={async () =>
                categoryToDisable &&
                (entry?.id === categoryToDisable.id
                  ? saveEntry()
                  : await run(
                      { type: "catalog.save", entry: categoryToDisable },
                      () => setCategoryToDisable(null),
                    ))
              }
            >
              确认停用
            </Button>
          </>
        }
      >
        <p>
          停用「{categoryToDisable?.name}
          」后，该分类及其{" "}
          {
            data.catalog.filter(
              (item) =>
                item.type === "反馈分类" &&
                item.id !== categoryToDisable?.id &&
                feedbackCategoryPath(data.catalog, item).some(
                  (node) => node.id === categoryToDisable?.id,
                ),
            ).length
          }{" "}
          个下级分类将不再用于新反馈选择，历史反馈中的分类记录保持不变。重新启用上级后，下级需单独启用。
        </p>
      </Modal>
      <Modal
        open={!!movingCategory}
        onClose={() => requestClose(() => setMovingCategory(null), moveDirty)}
        title="调整分类归属"
        width={520}
        footer={
          <>
            <Button
              onClick={() =>
                requestClose(() => setMovingCategory(null), moveDirty)
              }
            >
              取消
            </Button>
            <Button
              variant="primary"
              disabled={!moveDirty}
              onClick={async () =>
                movingCategory &&
                await run({ type: "catalog.save", entry: movingCategory }, () =>
                  setMovingCategory(null),
                )
              }
            >
              确认调整
            </Button>
          </>
        }
      >
        {movingCategory && (
          <div className="stack">
            <div className="settings-category-context">
              <small>当前分类路径</small>
              <p>
                {originalMove &&
                  feedbackCategoryPath(data.catalog, originalMove)
                    .map((node) => node.name)
                    .join(" › ")}
              </p>
            </div>
            <Field label="所属一级分类">
              <Select
                value={moveParentPath[0]?.id || ""}
                onValueChange={(parentId) =>
                  setMovingCategory({ ...movingCategory, parentId })
                }
              >
                <option value="">无上级（作为一级分类）</option>
                {moveOptions
                  .filter((item) => !item.parentId)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </Select>
            </Field>
            {!!moveParentPath[0] && (
              <Field label="所属二级分类">
                <Select
                  value={moveParentPath[1]?.id || ""}
                  onValueChange={(value) =>
                    setMovingCategory({
                      ...movingCategory,
                      parentId: value || moveParentPath[0]?.id || "",
                    })
                  }
                >
                  <option value="">无二级上级（作为二级分类）</option>
                  {moveOptions
                    .filter((item) => item.parentId === moveParentPath[0]?.id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </Select>
              </Field>
            )}
            <div className="settings-category-context">
              <small>调整后路径</small>
              <p>
                {[
                  ...moveParentPath.map((node) => node.name),
                  movingCategory.name,
                ].join(" › ")}
              </p>
            </div>
            <p className="muted">
              将同步移动 {Math.max(0, moveDescendants.length - 1)}{" "}
              个下级分类。历史反馈记录保持不变；已排除会形成循环或超过三级的归属选项。
            </p>
          </div>
        )}
      </Modal>
      <Modal
        open={categoryConfirm}
        onClose={() => setCategoryConfirm(false)}
        title="确认修改上级分类名称"
        width={480}
        footer={
          <>
            <Button onClick={() => setCategoryConfirm(false)}>继续编辑</Button>
            <Button variant="primary" onClick={saveEntry}>
              确认保存
            </Button>
          </>
        }
      >
        <p>
          本次修改包含共用上级分类的名称变更，其下其他分类的显示路径也会同步更新。历史反馈记录保持不变。
        </p>
        <p>
          「{savedEntry?.name}」将改为「{entry?.name.trim()}」，其下{" "}
          {categoryDescendants.length} 个分类的显示路径会同步更新。
        </p>
      </Modal>
      <Modal
        open={!!entry}
        onClose={() => requestClose(() => setEntry(null), entryDirty)}
        title={
          entry
            ? entry.type === "反馈分类"
              ? `${savedEntry ? "编辑" : "新增"}${categoryLevel}级分类`
              : `${savedEntry ? "编辑" : "新增"}${entry.type}`
            : "基础资料"
        }
        footer={
          <>
            <Button
              onClick={() => requestClose(() => setEntry(null), entryDirty)}
            >
              取消
            </Button>
            <Button
              variant="primary"
              disabled={!entry?.name.trim()}
              onClick={() =>
                entry &&
                (entry.type === "反馈分类" &&
                !entry.enabled &&
                savedEntry?.enabled
                  ? setCategoryToDisable(entry)
                  : renamedParent
                    ? setCategoryConfirm(true)
                    : saveEntry())
              }
            >
              保存
            </Button>
          </>
        }
      >
        {entry && (
          <div className="stack">
            {tab === "org" && (
              <Field label="类型">
                <Select
                  disabled
                  value={entry.type}
                  onValueChange={(value) => {
                    if (savedEntry) return;
                    if (value === "项目" || value === "渠道")
                      setEntry({ ...entry, type: value });
                  }}
                >
                  <option>渠道</option>
                  <option>项目</option>
                </Select>
              </Field>
            )}
            {entry.type === "老师标签" && <>
              <Field label="标签分类"><input value={entry.tagCategory || ""} onChange={e=>setEntry({...entry,tagCategory:e.target.value})}/></Field>
              <Field label="标签颜色"><Select value={entry.tagColor || "green"} onValueChange={value=>{const color=(["green","yellow","red","purple"] as const).find(c=>c===value);if(color)setEntry({...entry,tagColor:color});}}><option value="green">绿色 · 优势</option><option value="yellow">黄色 · 需关注</option><option value="red">红色 · 风险</option><option value="purple">紫色 · 特色</option></Select></Field>
              <Field label="标签释义"><textarea value={entry.tagMeaning || ""} onChange={e=>setEntry({...entry,tagMeaning:e.target.value})}/></Field>
              <Field label="具体表现"><textarea value={entry.tagExample || ""} onChange={e=>setEntry({...entry,tagExample:e.target.value})}/></Field>
              <Field label="匹配处理说明" hint="说明供教务参考；自动匹配规则按标准标签执行，新建标签不会仅凭名称产生规则。"><textarea value={entry.tagAdvice || ""} onChange={e=>setEntry({...entry,tagAdvice:e.target.value})}/></Field>
            </>}
            {entry.type === "组别" && <Field label="所属队伍"><input readOnly value={data.catalog.find(t => t.id === entry.parentId)?.name || ""}/></Field>}
            {entry.type === "反馈分类" && (
              <div className="settings-category-context">
                <small>上级分类</small>
                <p>
                  {categoryPath
                    .slice(0, -1)
                    .map((node) => node.name)
                    .join(" › ") || "无上级（一级分类）"}
                </p>
              </div>
            )}
            <Field
              label={
                entry.type === "反馈分类"
                  ? `${categoryLevel}级分类名称`
                  : "名称"
              }
              required
            >
              <input
                value={entry.name}
                onChange={(event) =>
                  setEntry({ ...entry, name: event.target.value })
                }
              />
            </Field>
            {entry.type === "渠道" && <Field label="合作项目"><div className="settings-partner-options">
              {data.catalog.filter(p => p.type === "项目").map(p => <label key={p.id} className="select-row">
                <input type="checkbox" checked={selectedProjectIds.includes(p.id)} disabled={!p.enabled && !p.channelIds?.includes(entry.id)} onChange={e => setSelectedProjectIds(e.target.checked ? [...selectedProjectIds, p.id] : selectedProjectIds.filter(id => id !== p.id))}/>
                {p.name}{!p.enabled && "（已停用）"}
              </label>)}
              {!data.catalog.some(p => p.type === "项目") && <small>暂无可选项目，可先保存渠道，创建项目后再关联。</small>}
            </div></Field>}
            {entry.type === "项目" && <>
              <Field label="合作渠道"><div className="settings-partner-options">
                {data.catalog.filter(c => c.type === "渠道").map(c => <label key={c.id} className="select-row">
                  <input type="checkbox" checked={entry.channelIds?.includes(c.id) || false} disabled={!c.enabled && !entry.channelIds?.includes(c.id)} onChange={e => setEntry({...entry, channelIds: e.target.checked ? [...(entry.channelIds || []), c.id] : (entry.channelIds || []).filter(id => id !== c.id)})}/>
                  {c.name}{!c.enabled && "（已停用）"}
                </label>)}
              </div></Field>
              <Field label="月应上课数" required><input type="number" min={1} step={1} value={entry.monthlyLessons ?? ""} onChange={e => setEntry({...entry, monthlyLessons: e.target.value ? Number(e.target.value) : undefined})}/></Field>
            </>}
            <Field
              label={
                entry.type === "SO"
                  ? "别名"
                  : entry.type === "教材"
                    ? "单元 / 说明"
                    : "说明"
              }
            >
              <textarea
                value={entry.detail}
                onChange={(e) => setEntry({ ...entry, detail: e.target.value })}
                placeholder={
                  entry.type === "教材" ? "可以每行填写一个单元名称。" : ""
                }
              />
            </Field>
            <label className="select-row">
              <input
                type="checkbox"
                checked={entry.enabled}
                onChange={(e) =>
                  setEntry({ ...entry, enabled: e.target.checked })
                }
              />
              启用
            </label>
          </div>
        )}
      </Modal>
      <Modal
        open={roleConfirm}
        onClose={() => setRoleConfirm(false)}
        title="确认修改角色权限"
        width={440}
        footer={
          <>
            <Button onClick={() => setRoleConfirm(false)}>取消</Button>
            <Button
              variant="primary"
              data-diagnostic-action="confirm-role"
              onClick={async () =>
                draftRole &&
                await run({ type: "role.save", role: draftRole }, () => {
                  setRoleConfirm(false);
                  setDraftRole(null);
                })
              }
            >
              确认修改
            </Button>
          </>
        }
      >
        <div className="stack">
          <p>
            这次修改将影响{" "}
            <strong>
              {data.accounts.filter((a) => a.roleId === roleId).length}
            </strong>{" "}
            个团队账号。
          </p>
          <div className="inset">
            <p>
              新增：
              {draftRole?.permissions
                .filter((k) => !chosenRole?.permissions.includes(k))
                .map((k) => permissionLabels[k])
                .join("、") || "无"}
            </p>
            <p style={{ marginTop: 12 }}>
              移除：
              {chosenRole?.permissions
                .filter((k) => !draftRole?.permissions.includes(k))
                .map((k) => permissionLabels[k])
                .join("、") || "无"}
            </p>
          </div>
        </div>
      </Modal>
      <Modal
        open={ruleConfirm}
        onClose={() => setRuleConfirm(false)}
        title="确认修改业务规则"
        width={440}
        footer={
          <>
            <Button onClick={() => setRuleConfirm(false)}>取消</Button>
            <Button
              variant="primary"
              onClick={async () =>
                await run({ type: "rules.save", rules }, () => setRuleConfirm(false))
              }
            >
              确认保存
            </Button>
          </>
        }
      >
        <p>
          规则保存后立即生效，适用于后续操作和列表预警。已确认的扣课记录不会重新计算。
        </p>
      </Modal>
      <Modal
        open={!!log}
        onClose={() => setLogId("")}
        title="操作记录"
        width={560}
      >
        {log && (
          <dl className="detail-pairs">
            <dt>日期</dt>
            <dd>{log.date}</dd>
            <dt>操作人</dt>
            <dd>{log.operator}</dd>
            <dt>动作</dt>
            <dd>{log.type}</dd>
            <dt>内容</dt>
            <dd>{log.content}</dd>
          </dl>
        )}
      </Modal>
      <Modal
        open={deleteRole}
        onClose={() => setDeleteRole(false)}
        title="删除角色"
        width={440}
        footer={
          <>
            <Button onClick={() => setDeleteRole(false)}>取消</Button>
            <Button
              variant="danger-solid"
              disabled={
                deleteName !== role?.name ||
                data.accounts.some((a) => a.roleId === roleId)
              }
              onClick={async () =>
                await run({ type: "role.delete", id: roleId }, () => {
                  setDeleteRole(false);
                  openRole("");
                })
              }
            >
              确认删除
            </Button>
          </>
        }
      >
        <div className="stack">
          {data.accounts.some((a) => a.roleId === roleId) ? (
            <div className="notice">
              <AlertTriangle size={18} />
              仍有账号使用这个角色，请先为这些账号重新分配角色。
            </div>
          ) : (
            <Field label={`输入 ${role?.name} 确认删除`} required>
              <input
                value={deleteName}
                onChange={(e) => setDeleteName(e.target.value)}
              />
            </Field>
          )}
        </div>
      </Modal>
    </div>
  );
}


function AccountPasswordField({
  label,
  hint,
  error,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  error?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <Field label={label} required hint={hint} error={error}>
      <div className="settings-account-password">
        <input
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          aria-label={`${visible ? "隐藏" : "显示"}${label}`}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
    </Field>
  );
}
