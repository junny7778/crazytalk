import AccountPasswordModal from "../../components/AccountPasswordModal";
import { passwordError, setDemoPassword } from "../../lib/demoPasswords";
import ClassInSyncManagement from "../../components/ClassInSyncManagement";
import FeedbackCategoryTree from "./FeedbackCategoryTree";
import DataTransferButton from "../../components/DataTransferButton";
import { useEffect, useState } from "react";
import { useBlocker, useSearchParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronRight,
  Pencil,
  Plus,
  Copy,
  Eye,
  Save,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Users,
  Network,
  BookOpen,
  SlidersHorizontal,
  Plug,
  ScrollText,
} from "lucide-react";
import { useDemo } from "@crazytalk/shared/react";
import {
  feedbackCategoryPath,
  feedbackCategoryDeletionError,
  projectLabel, scopeLabel,
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
  useToast,
} from "@crazytalk/ui";
import { exportCsv, useBusinessAction } from "./common";
import "./operations.css";
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
  const { data, can, setRole } = useDemo();
  const navigate = useNavigate();
  const run = useBusinessAction();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const allowed = settingTabs.filter((t) => can(t.permission));
  const tab = params.get("tab") || allowed[0]?.value || "accounts";
  const [query, setQuery] = useState("");
  const roleId = params.get("role") || "";
  const [draftRole, setDraftRole] = useState<Role | null>(null);
  const [roleConfirm, setRoleConfirm] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [initialPassword, setInitialPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordTarget, setPasswordTarget] = useState<Account | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSaveError, setPasswordSaveError] = useState("");

  const [handover, setHandover] = useState("");
  const [catalogType, setCatalogType] = useState<CatalogEntry["type"]>("教材");
  const [entry, setEntry] = useState<CatalogEntry | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<CatalogEntry | null>(
    null,
  );
  const [categoryConfirm, setCategoryConfirm] = useState(false);
  const [movingCategory, setMovingCategory] = useState<CatalogEntry | null>(
    null,
  );
  function openEntry(value: CatalogEntry) {
    setEntry(value);
  }
  const [categoryToDisable, setCategoryToDisable] =
    useState<CatalogEntry | null>(null);
  const [rules, setRules] = useState({ ...data.rules });
  const [ruleConfirm, setRuleConfirm] = useState(false);
  const [credential, setCredential] = useState(false);
  const [sid, setSid] = useState("");
  const [secret, setSecret] = useState("");
  const [tested, setTested] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
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
          scope: "全部",
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
  function testConnection() {
    setTesting(true);
    setTested(false);
    setTimeout(() => {
      setTesting(false);
      if (/^\d{4,}$/.test(sid) && secret.length >= 6) {
        setTested(true);
        toast("演示检查通过。正式连接将在接入机构后验证。", { tone: "info" });
      } else
        toast("请填写至少 4 位机构编号和至少 6 位密钥，再重新检查。", {
          tone: "error",
        });
    }, 600);
  }
  const categoryDeleteError = categoryToDelete
    ? feedbackCategoryDeletionError(data, categoryToDelete.id)
    : null;
  const rulesDirty = JSON.stringify(rules) !== JSON.stringify(data.rules);
  const savedAccount = data.accounts.find((item) => item.id === account?.id);
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
    (savedEntry
      ? JSON.stringify(entry) !== JSON.stringify(savedEntry)
      : !!(entry.name || entry.detail));
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
    moveDirty ||
    (credential && !!(sid || secret));
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
    setCredential(false);
    setSecret("");
    setSid("");
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
  function saveEntry() {
    if (!entry) return;
    run({ type: "catalog.save", entry }, () => {
      setEntry(null);
      setCategoryConfirm(false);
      setCategoryToDisable(null);
    });
  }
  const catalogRows = data.catalog.filter(
    (c) =>
      (tab === "org"
        ? c.type === "项目" || c.type === "渠道"
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
                      scope: "全部",
                      enabled: true,
                    });
                  }}
                >
                  <Plus size={14} />
                  新建账号
                </Button>
              }
            >
              <div className="toolbar">
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="搜索姓名或手机号"
                />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>姓名</th>
                      <th>登录手机号</th>
                      <th>角色与范围</th>
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
                            <strong>{a.name}</strong><small>{[a.team,a.group].filter(Boolean).join(" / ") || (a.roleId==="ops" ? "归属待补录" : "")}</small>
                          </td>
                          <td>
                            {a.phone.slice(0, 3)}****{a.phone.slice(-4)}
                          </td>
                          <td>
                            {data.roles.find((r) => r.id === a.roleId)?.name}
                            <small>
                              {a.scope === "全部"
                                ? "全部数据"
                                : scopeLabel(data.catalog, a.scope)}
                            </small>
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
                              disabled={a.id === "u1"}
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
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => createRole()}
                  >
                    <Plus size={14} />
                    新建角色
                  </Button>
                }
              >
                <p className="ops-subtitle">
                  管理团队角色，进入角色详情查看或编辑权限。
                </p>
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
                              {item.id === "admin" && (
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
                          <Button size="sm" onClick={() => createRole(role)}>
                            <Copy size={14} />
                            复制角色
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => setRole(role.id, true)}
                          >
                            <Eye size={14} />
                            预览角色
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
                    ) : (
                      <p className="muted">
                        {role.description || "暂无角色说明"}
                      </p>
                    )}
                    <div className="row between">
                      <h3>权限配置</h3>
                      <small className="muted">
                        {draftRole
                          ? "修改权限后，保存时将展示变更影响。"
                          : "当前为查看模式"}
                      </small>
                    </div>
                    {permissionGroups.map((group) => (
                      <section
                        className="settings-permission-group"
                        key={group.name}
                      >
                        <h3 style={{ marginBottom: 12 }}>
                          {group.name}{" "}
                          <small>
                            {
                              group.keys.filter((k) =>
                                role.permissions.includes(k),
                              ).length
                            }
                            /{group.keys.length}
                          </small>
                        </h3>
                        <div className="ops-permissions">
                          {group.keys.map((key) => (
                            <label key={key} className="select-row" title={key}>
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
                    ))}

                    {role.id !== "admin" && (
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
                  action={
                    <Button onClick={() => openRole("")}>返回角色列表</Button>
                  }
                />
              </Panel>
            )
          ) : tab === "org" || tab === "basics" ? (
            <Panel
              title={tab === "org" ? "项目与渠道" : "基础资料"}
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    openEntry({
                      id: `c${Date.now()}`,
                      type: tab === "org" ? "渠道" : catalogType,
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
                    ? "新建项目 / 渠道"
                    : catalogType === "反馈分类"
                      ? "新增一级分类"
                      : "新增"}
                </Button>
              }
            >
              {tab === "basics" && (
                <Tabs
                  value={catalogType}
                  onChange={(v) => {
                    if (v === "教材" || v === "反馈分类" || v === "SO")
                      setCatalogType(v);
                  }}
                  items={["教材", "反馈分类", "SO"].map((v) => ({
                    value: v,
                    label: v,
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
              {tab === "basics" && catalogType === "反馈分类" ? (
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
                  onToggle={(value) => {
                    if (value.enabled)
                      setCategoryToDisable({ ...value, enabled: false });
                    else
                      run({
                        type: "catalog.save",
                        entry: { ...value, enabled: true },
                      });
                  }}
                  onDelete={(value) => setCategoryToDelete(value)}
                />
              ) : (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>名称</th>
                          <th>类型</th>
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
                            <td>{c.type}{c.type === "项目" && <small className="muted"> · {data.catalog.find(channel => channel.id === c.parentId)?.name || "渠道待补录"} · {c.monthlyLessons ? `每月 ${c.monthlyLessons} 节` : "月目标待补录"}</small>}</td>
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
                                  onClick={() =>
                                    run({
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
                  {!catalogRows.length && (
                    <EmptyState
                      title="没有符合条件的资料"
                      action={
                        <Button onClick={() => setQuery("")}>清除搜索</Button>
                      }
                    />
                  )}
                </>
              )}
              {!(catalogType === "反馈分类" && tab === "basics") && (
                <p className="ops-subtitle">
                  已使用的资料保留历史记录，不直接删除。停用后不再提供给新业务选择。
                </p>
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
                    tone={data.connection === "正常" ? "success" : "warning"}
                  >
                    {data.connection}
                  </Badge>
                }
              >
                <div className="stack">
                  <div className="ops-state-line">
                    {data.connection === "正常"
                      ? "课程连接正常"
                      : "课程连接需要检查"}
                  </div>
                  <div className="inset">
                    <dl className="detail-pairs">
                      <dt>机构编号</dt>
                      <dd>已配置</dd>
                      <dt>机构密钥</dt>
                      <dd>•••••••••••• · 已保存</dd>
                    </dl>
                  </div>
                  {can("classin.manage") && (
                    <div className="row">
                      <Button
                        onClick={() => {
                          setSid("");
                          setSecret("");
                          setTested(false);
                          setCredential(true);
                        }}
                      >
                        <KeyRound size={16} />
                        修改连接信息
                      </Button>
                    </div>
                  )}
                </div>
              </Panel>
              <ClassInSyncManagement />
            </>
          ) : (
            <Panel
              title="操作日志"
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
              <p className="ops-subtitle">日志只读，不能修改或删除。</p>
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
      {passwordTarget && <AccountPasswordModal key={passwordTarget.id} id={passwordTarget.id} name={passwordTarget.name} onClose={() => setPasswordTarget(null)} />}
      <Modal
        open={!!account}
        onClose={() => requestClose(() => setAccount(null), accountDirty)}
        title={
          data.accounts.some((a) => a.id === account?.id)
            ? "编辑团队账号"
            : "新建团队账号"
        }
        footer={
          <>
            <Button
              onClick={() => requestClose(() => setAccount(null), accountDirty)}
            >
              取消
            </Button>
            <Button
              variant="primary"
              disabled={
                passwordSaving ||
                (!savedAccount && !!passwordError(initialPassword, confirmPassword)) ||
                !account?.name.trim() ||
                !/^1\d{10}$/.test(account.phone) ||
                (!account.enabled &&
                  (data.students.some((s) => s.owner === account.name) ||
                    data.feedback.some(
                      (f) => f.owner === account.name && f.status !== "已完成",
                    )) &&
                  !handover)
              }
              onClick={async () => {
                if (!account) return;
                setPasswordSaving(true); setPasswordSaveError("");
                try {
                  if (!savedAccount) await setDemoPassword(account.id, initialPassword);
                  run({ type: "account.save", account, handoverTo: handover || undefined }, () => {
                    setAccount(null); setInitialPassword(""); setConfirmPassword("");
                  });
                } catch (cause) { setPasswordSaveError(cause instanceof Error ? cause.message : "设置密码失败"); }
                finally { setPasswordSaving(false); }
              }}
            >
              保存账号
            </Button>
          </>
        }
      >
        {account && (
          <div className="stack">
            <div className="form-grid">
              <Field label="姓名" required>
                <input
                  value={account.name}
                  onChange={(e) =>
                    setAccount({ ...account, name: e.target.value })
                  }
                />
              </Field>
              <Field label="登录手机号" required>
                <input
                  type="tel"
                  value={account.phone}
                  onChange={(e) =>
                    setAccount({ ...account, phone: e.target.value })
                  }
                />
              </Field>
            </div>
            {!savedAccount && <>
              <Field label="初始密码" required hint="8–64 个字符，包含字母和数字">
                <input type="password" autoComplete="new-password" value={initialPassword} onChange={e => setInitialPassword(e.target.value)} />
              </Field>
              <Field label="确认密码" required>
                <input type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
              </Field>
              {initialPassword && confirmPassword && passwordError(initialPassword, confirmPassword) && <p role="alert">{passwordError(initialPassword, confirmPassword)}</p>}
              <small className="muted">密码仅在本次页面会话中模拟生效，刷新后恢复演示初始密码 Demo12345。</small>
            </>}
            {passwordSaveError && <p role="alert">{passwordSaveError}</p>}
            <Field label="角色">
              <Select
                value={account.roleId}
                onValueChange={(value) =>
                  setAccount({ ...account, roleId: value })
                }
              >
                {data.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="所属队伍"><Select value={account.team || ""} onValueChange={team => setAccount({...account, team, group:""})}>
              <option value="">待分配</option>{["A队","B队"].map(t => <option key={t}>{t}</option>)}
            </Select></Field>
            <Field label="队内组别"><Select disabled={!account.team} value={account.group || ""} onValueChange={group=>setAccount({...account,group})}>
              <option value="">待分配</option>{Array.from(new Set([...(account.team==="A队"?["一组","二组"]:["一组"]),...data.accounts.filter(a=>a.team===account.team && a.group).map(a=>a.group!),...(account.group?[account.group]:[])])).map(g=><option key={g}>{g}</option>)}
            </Select></Field>
            {account.team && <details><summary>填写其他组名</summary><Field label="组名"><input value={account.group || ""} onChange={e=>setAccount({...account,group:e.target.value})}/></Field></details>}

            <Field label="数据范围">
              <Select
                value={account.scope}
                onValueChange={(value) =>
                  setAccount({ ...account, scope: value })
                }
              >
                {Array.from(new Set(["全部", "本人负责", "本组", "本队", account.scope])).map(s =>
                  <option key={s} value={s}>{scopeLabel(data.catalog, s)}</option>)}
                {data.catalog.filter(c => c.type === "项目" && c.enabled && c.parentId && account.scope !== "project:" + c.id).map(p =>
                  <option key={p.id} value={"project:" + p.id}>{projectLabel(data.catalog, p)}</option>)}
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
              (data.students.some((s) => s.owner === account.name) ||
                data.feedback.some(
                  (f) => f.owner === account.name && f.status !== "已完成",
                )) && (
                <>
                  <div className="notice">
                    <AlertTriangle size={18} />
                    仍负责{" "}
                    {
                      data.students.filter((s) => s.owner === account.name)
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
                  <Field label="转交给" required>
                    <Select
                      value={handover}
                      onValueChange={(value) => setHandover(value)}
                    >
                      <option value="">选择接手人</option>
                      {data.accounts
                        .filter((a) => a.id !== account.id && a.enabled)
                        .map((a) => (
                          <option key={a.id} value={a.name}>
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
              onClick={() =>
                categoryToDelete &&
                run(
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
              onClick={() =>
                categoryToDisable &&
                (entry?.id === categoryToDisable.id
                  ? saveEntry()
                  : run(
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
              onClick={() =>
                movingCategory &&
                run({ type: "catalog.save", entry: movingCategory }, () =>
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
                  disabled={!!savedEntry}
                  value={entry.type}
                  onValueChange={(value) => {
                    if (savedEntry) return;
                    if (value === "项目" || value === "渠道")
                      setEntry({ ...entry, type: value });
                  }}
                >
                  <option>项目</option>
                  <option>渠道</option>
                </Select>
              </Field>
            )}
            {entry.type === "项目" && <>
              <Field label="所属渠道" required><Select value={entry.parentId || ""} onValueChange={parentId => setEntry({...entry, parentId})}>
                <option value="">请选择渠道</option>
                {data.catalog.filter(c => c.type === "渠道" && c.enabled).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select></Field>
              <Field label="月应上课数" required><input type="number" min={1} step={1} value={entry.monthlyLessons ?? ""} onChange={e => setEntry({...entry, monthlyLessons: e.target.value ? Number(e.target.value) : undefined})}/></Field>
            </>}
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
              onClick={() =>
                draftRole &&
                run({ type: "role.save", role: draftRole }, () => {
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
              onClick={() =>
                run({ type: "rules.save", rules }, () => setRuleConfirm(false))
              }
            >
              确认保存
            </Button>
          </>
        }
      >
        <p>
          本演示保存后立即用于后续操作和列表预警，已确认的扣课记录不会重新计算。暂不支持选择未来生效日期。
        </p>
      </Modal>
      <Modal
        open={credential}
        onClose={() =>
          requestClose(
            () => {
              setCredential(false);
              setSecret("");
              setSid("");
              setTested(false);
            },
            !!(sid || secret),
          )
        }
        title="修改 ClassIn 连接信息"
        footer={
          <>
            <Button
              onClick={() =>
                requestClose(
                  () => {
                    setCredential(false);
                    setSecret("");
                    setSid("");
                    setTested(false);
                  },
                  !!(sid || secret),
                )
              }
            >
              取消
            </Button>
            <Button
              variant="primary"
              disabled={!tested}
              onClick={() =>
                run({ type: "connection.save", sid, secret }, () => {
                  setCredential(false);
                  setSecret("");
                })
              }
            >
              保存连接信息
            </Button>
          </>
        }
      >
        <div className="stack">
          <div className="notice notice-info">
            演示只检查填写格式，不会连接真实机构，也不会保存密钥。
          </div>
          <Field label="机构编号（SID）" required>
            <input
              value={sid}
              onChange={(e) => {
                setSid(e.target.value);
                setTested(false);
              }}
            />
          </Field>
          <Field
            label="机构密钥（SECRET）"
            required
            hint="已保存的密钥不会显示。"
          >
            <div className="row">
              <input
                type={showSecret ? "text" : "password"}
                value={secret}
                autoComplete="new-password"
                onChange={(e) => {
                  setSecret(e.target.value);
                  setTested(false);
                }}
              />
              <Button
                size="sm"
                onClick={() => setShowSecret(!showSecret)}
                aria-label="显示或隐藏密钥"
              >
                <Eye size={16} />
              </Button>
            </div>
          </Field>
          <div className="row">
            <Button loading={testing} onClick={testConnection}>
              检查连接信息
            </Button>
            {tested && (
              <span className="success row">
                <CheckCircle2 size={16} />
                格式检查通过
              </span>
            )}
          </div>
          <small>修改后课程更新会使用新连接信息，请核对机构归属。</small>
        </div>
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
              onClick={() =>
                run({ type: "role.delete", id: roleId }, () => {
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
