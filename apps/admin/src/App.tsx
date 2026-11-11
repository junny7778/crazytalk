import AccountPasswordModal from "./components/AccountPasswordModal";
import { hasSyncIssue, syncManagementPath } from "./lib/lessonSync";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useDemo } from "@crazytalk/shared/react";
import {
  Avatar,
  Button,
  Drawer,
  EmptyState,
  Modal,
  SearchInput,
  useToast,
} from "@crazytalk/ui";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  ClipboardCheck,
  MessagesSquare,
  GraduationCap,
  Wallet,
  Settings,
  Bell,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  LogOut,
  Smartphone,
  RotateCcw,
  Check,
} from "lucide-react";
import Students, { StudentDetail } from "./pages/Students";
import Dashboard from "./pages/Dashboard";
import { StudentQuickView } from "./components/StudentActions";
const Schedule = lazy(() => import("./pages/Schedule"));
const Lessons = lazy(() => import("./pages/operations/Lessons"));
const Feedback = lazy(() => import("./pages/operations/Feedback"));
const Teachers = lazy(() => import("./pages/operations/Teachers"));
const Payroll = lazy(() => import("./pages/operations/Payroll"));
const SettingsPage = lazy(() => import("./pages/operations/Settings"));
const TeacherApp = lazy(() => import("../../teacher/src/App"));
const nav = [
  {
    path: "/",
    label: "数据看板",
    icon: LayoutDashboard,
    permission: "dashboard.overview",
  },
  {
    path: "/students",
    label: "学员中心",
    icon: Users,
    permission: "student.view",
  },
  {
    path: "/teachers",
    label: "老师中心",
    icon: GraduationCap,
    permission: "teacher.view",
  },
  {
    path: "/schedule",
    label: "排课管理",
    icon: CalendarDays,
    permission: "schedule.view",
  },
  {
    path: "/lessons",
    label: "上课记录",
    icon: ClipboardCheck,
    permission: "lesson.view",
  },
  {
    path: "/feedback",
    label: "反馈",
    icon: MessagesSquare,
    permission: "feedback.view",
  },
  { path: "/payroll", label: "薪资", icon: Wallet, permission: "payroll.view" },
];
function Loading() {
  return (
    <div className="stack">
      <div className="skeleton" style={{ height: 44, width: 260 }} />
      <div className="skeleton" style={{ height: 400 }} />
    </div>
  );
}
export default function App() {
  const { data, can, roleId, accountId, setRole, preview, reset, scope } = useDemo();
  const navigate = useNavigate();
  const location = useLocation();
  const isSettings = location.pathname === "/settings";
  const lastWorkLocation = useRef(location);
  useEffect(() => {
    if (!isSettings) lastWorkLocation.current = location;
  }, [isSettings, location]);
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem("ct-sidebar")
      ? localStorage.getItem("ct-sidebar") === "closed"
      : window.innerWidth < 1440,
  );
  const [mobileNav, setMobileNav] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [quick, setQuick] = useState<string | null>(null);
  const [userMenu, setUserMenu] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const toast = useToast();
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (isSettings) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [isSettings]);
  useEffect(() => {
    setMobileNav(false);
    setUserMenu(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!userMenu) return;
    const dismissOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !userMenuRef.current?.contains(event.target)
      ) {
        setUserMenu(false);
      }
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setUserMenu(false);
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [userMenu]);
  if (
    location.pathname === "/teacher" ||
    location.pathname.startsWith("/teacher/")
  )
    return (
      <Suspense fallback={<Loading />}>
        <TeacherApp />
      </Suspense>
    );
  const pending = data.lessons.filter((l) => l.status === "待确认").length;
  const feedbackCount = data.feedback.filter(
    (f) => f.status !== "已完成",
  ).length;
  const settingVisible = [
    "account.manage",
    "role.manage",
    "org.manage",
    "basics.manage",
    "rule.manage",
    "classin.view",
    "audit.view",
  ].some(can);
  const first = nav.find((n) => can(n.permission))?.path || "/students";
  const searchKeyword = search.trim().toLowerCase();
  const searchStudent =
    searchKeyword && can("student.view")
      ? data.students.filter((s) =>
          `${s.name} ${s.groupName} ${s.phone}`
            .toLowerCase()
            .includes(searchKeyword),
        )
      : [];
  const searchTeacher =
    searchKeyword && can("teacher.view")
      ? data.teachers.filter((t) =>
          t.name.toLowerCase().includes(searchKeyword),
        )
      : [];
  const guard = (permission: string, element: React.ReactNode) =>
    can(permission) ? (
      element
    ) : (
      <EmptyState
        title="这个页面不在你的工作权限内"
        description="可以返回你有权限的页面，或请管理员调整角色。"
        action={
          <Button onClick={() => navigate(first)}>返回我的工作页面</Button>
        }
      />
    );
  return (
    <div
      className={`app-shell ${collapsed ? "sidebar-collapsed" : ""} ${mobileNav ? "mobile-nav-open" : ""} ${isSettings ? "settings-shell" : ""}`}
    >
      {!isSettings && mobileNav && (
        <button
          className="mobile-nav-backdrop"
          aria-label="关闭导航"
          onClick={() => setMobileNav(false)}
        />
      )}
      {!isSettings && (
        <aside className="sidebar">
          <NavLink
            className="brand-logo"
            to={first}
            aria-label="Crazy Talk 首页"
          >
            <img
              className="brand-logo-image"
              src={collapsed ? "/brand/logo-symbol.webp" : "/brand/logo.webp"}
              alt="Crazy Talk"
              width={collapsed ? 144 : 480}
              height={collapsed ? 81 : 366}
              decoding="async"
            />
          </NavLink>
          <nav>
            {nav
              .filter((n) => can(n.permission))
              .map((n) => (
                <NavLink
                  key={n.path}
                  to={n.path}
                  end={n.path === "/"}
                  title={collapsed ? n.label : undefined}
                  className={({ isActive }) =>
                    `nav-item ${isActive ? "active" : ""}`
                  }
                >
                  <n.icon size={18} />
                  <span className="nav-label">{n.label}</span>
                  {n.path === "/lessons" &&
                    pending > 0 &&
                    can("lesson.confirm") && (
                      <b className="nav-count">{pending}</b>
                    )}
                  {n.path === "/feedback" &&
                    feedbackCount > 0 &&
                    can("feedback.process") && (
                      <b className="nav-count">{feedbackCount}</b>
                    )}
                </NavLink>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <button
              className="sidebar-collapse"
              aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
              onClick={() => {
                const value = !collapsed;
                setCollapsed(value);
                localStorage.setItem("ct-sidebar", value ? "closed" : "open");
              }}
            >
              {collapsed ? (
                <PanelLeftOpen size={18} />
              ) : (
                <>
                  <PanelLeftClose size={18} />
                  <span>收起导航</span>
                </>
              )}
            </button>
          </div>
        </aside>
      )}
      <div className="app-main">
        <header className="topbar">
          {isSettings ? (
            <div className="settings-topbar-heading">
              <Button
                variant="ghost"
                onClick={() => {
                  const previous = lastWorkLocation.current;
                  navigate(
                    previous.pathname === "/settings"
                      ? "/"
                      : {
                          pathname: previous.pathname,
                          search: previous.search,
                          hash: previous.hash,
                        },
                    { state: previous.state },
                  );
                }}
              >
                <ArrowLeft size={16} />
                返回工作台
              </Button>
              <span className="settings-topbar-divider" />
              <h1>设置</h1>
            </div>
          ) : (
            <>
              <button
                className="icon-button mobile-menu"
                aria-label="打开导航"
                onClick={() => setMobileNav(true)}
              >
                <PanelLeftOpen size={20} />
              </button>
              <button
                className="global-search"
                onClick={() => setSearchOpen(true)}
              >
                <Search size={16} />
                <span>搜索学员或老师</span>
                <kbd>⌘ K</kbd>
              </button>
            </>
          )}
          <div className="topbar-actions">
            {!isSettings && (
              <button
                className="icon-button topbar-icon notification-button"
                aria-label="通知"
                onClick={() => setNotifications(true)}
              >
                <Bell size={18} />
                <i />
              </button>
            )}
            {!isSettings && settingVisible && (
              <button
                className="icon-button topbar-icon"
                aria-label="设置"
                title="系统设置"
                onClick={() => navigate("/settings")}
              >
                <Settings size={18} />
              </button>
            )}
            {passwordOpen && <AccountPasswordModal id={accountId || "u2"} name={data.accounts.find(a => a.id === accountId)?.name || "Rita"} personal onClose={() => setPasswordOpen(false)} />}
            <div className="relative" ref={userMenuRef}>
              <button
                aria-expanded={userMenu}
                className="user-button"
                onClick={() => setUserMenu(!userMenu)}
              >
                <Avatar name="Rita" size={42} />
                <span>
                  {preview
                    ? data.roles.find((r) => r.id === roleId)?.name
                    : data.accounts.find(a => a.id === accountId)?.name || "Rita"}
                  <small>{preview ? "角色预览" : "教务运营"}</small>
                </span>
                <ChevronDown size={12} />
              </button>
              {userMenu && (
                <div className="dropdown user-dropdown">
                  <button onClick={() => { setUserMenu(false); setPasswordOpen(true); }}>修改密码</button>
                  <small>演示身份</small>
                  {data.roles.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setRole(r.id);
                        setUserMenu(false);
                        navigate(
                          nav.find((n) => r.permissions.includes(n.permission))
                            ?.path || "/",
                        );
                      }}
                    >
                      {r.name}
                      {roleId === r.id && <Check size={14} />}
                    </button>
                  ))}
                  <small>切换团队账号</small>
                  {data.accounts.filter(a => a.enabled).map(a => <button key={a.id} onClick={() => {
                    setRole(a.roleId, false, a.id); setUserMenu(false);
                    navigate(nav.find(n => data.roles.find(r => r.id === a.roleId)?.permissions.includes(n.permission))?.path || "/");
                  }}>{a.name} · {a.scope}</button>)}
                  <hr />
                  <button
                    onClick={() => {
                      setResetOpen(true);
                      setUserMenu(false);
                    }}
                  >
                    <RotateCcw size={14} />
                    恢复演示数据
                  </button>
                  <button
                    onClick={() =>
                      window.open("/teacher", "_blank", "noopener")
                    }
                  >
                    <Smartphone size={14} />
                    老师端演示
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {preview && (
          <div className="role-preview">
            正在预览：{data.roles.find((r) => r.id === roleId)?.name} ·
            操作仅供查看
            <Button size="xs" variant="ghost" onClick={() => setRole("admin")}>
              退出预览
            </Button>
          </div>
        )}
        {scope !== "全部" && !preview && (
          <div className="scope-bar">
            当前负责范围：{scope}
            <Button size="xs" variant="ghost" onClick={() => setRole("admin")}>
              切回管理员
            </Button>
          </div>
        )}
        <main
          className={`main-content ${location.pathname === "/schedule" ? "wide-content" : ""}`}
        >
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route
                path="/"
                element={
                  can("dashboard.overview") ? (
                    <Dashboard />
                  ) : (
                    <Navigate to={first} replace />
                  )
                }
              />
              <Route
                path="/students"
                element={guard("student.view", <Students />)}
              />
              <Route
                path="/students/:id"
                element={guard("student.view", <StudentDetail />)}
              />
              <Route
                path="/schedule"
                element={guard("schedule.view", <Schedule />)}
              />
              <Route
                path="/lessons"
                element={guard("lesson.view", <Lessons />)}
              />
              <Route
                path="/feedback"
                element={guard("feedback.view", <Feedback />)}
              />
              <Route
                path="/feedback/:id"
                element={guard("feedback.view", <Feedback />)}
              />
              <Route
                path="/teachers"
                element={guard("teacher.view", <Teachers />)}
              />
              <Route
                path="/teachers/:id"
                element={guard("teacher.view", <Teachers />)}
              />
              <Route
                path="/payroll"
                element={guard("payroll.view", <Payroll />)}
              />
              <Route
                path="/settings"
                element={
                  settingVisible ? (
                    <SettingsPage />
                  ) : (
                    <Navigate to={first} replace />
                  )
                }
              />
              <Route
                path="*"
                element={
                  <EmptyState
                    title="这个页面不存在"
                    action={
                      <Button onClick={() => navigate(first)}>返回首页</Button>
                    }
                  />
                }
              />
            </Routes>
          </Suspense>
          <footer className="app-footer">
            <span>演示数据 · 2026 年 10 月</span>
          </footer>
        </main>
      </div>
      <Modal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="搜索"
        description="输入学生名字、群名、手机号或老师姓名，快速查找。"
        width={640}
      >
        <div className="unified-search">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="搜索学生名字、群名、手机号或老师姓名"
          />
          <div
            className="unified-search-results stack"
            role="region"
            aria-label="搜索结果"
          >
            {searchStudent.length > 0 && (
              <>
                <small>学员</small>
                {searchStudent.map((s) => (
                  <button
                    className="search-result"
                    key={s.id}
                    onClick={() => {
                      setQuick(s.id);
                      setSearchOpen(false);
                    }}
                  >
                    <Avatar name={s.name} />
                    <div>
                      <strong>{s.name}</strong>
                      <small>
                        {s.groupName || "群名未填写"} ·{" "}
                        {s.phone
                          ? can("field.student_phone")
                            ? s.phone
                            : `****${s.phone.slice(-4)}`
                          : "手机号未填写"}
                      </small>
                    </div>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
              </>
            )}
            {searchTeacher.length > 0 && (
              <>
                <small>老师</small>
                {searchTeacher.map((t) => (
                  <button
                    className="search-result"
                    key={t.id}
                    onClick={() => {
                      navigate(`/teachers/${t.id}`);
                      setSearchOpen(false);
                    }}
                  >
                    <Avatar name={t.name} />
                    <div>
                      <strong>{t.name}</strong>
                      <small>
                        {t.so} · {t.accent}
                      </small>
                    </div>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
              </>
            )}
            {!searchKeyword && (
              <p className="muted">输入关键词查找学员或老师。</p>
            )}
            {searchKeyword &&
              !searchStudent.length &&
              !searchTeacher.length && (
                <EmptyState
                  title="没有找到匹配结果"
                  description="试试学生名字、群名、手机号或老师姓名。"
                />
              )}
          </div>
        </div>
      </Modal>
      <StudentQuickView id={quick} onClose={() => setQuick(null)} />
      <Drawer
        open={notifications}
        onClose={() => setNotifications(false)}
        title="通知"
        width={420}
      >
        <div className="stack">
          {data.tasks.filter(t=>t.sourceType==="teacher" && t.status==="待处理" && (roleId==="admin" || !accountId || t.owner===data.accounts.find(a=>a.id===accountId)?.name)).map(t=><div className="inset" key={t.id}>
            <strong>{t.title}</strong><p>{t.owner} · {t.note}</p>
            <Button size="sm" onClick={()=>{navigate("/lessons?student="+encodeURIComponent(t.studentId));setNotifications(false);}}>查看受影响课程</Button>
          </div>)}
          {data.lessons.some(hasSyncIssue) && (
            <div className="inset">
              <strong>课程同步需要处理</strong>
              <p className="muted" style={{ marginTop: 8 }}>
                有 {data.lessons.filter(hasSyncIssue).length}{" "}
                节课存在同步问题，请前往同步管理查看。
              </p>
              {can("classin.view") && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigate(syncManagementPath);
                    setNotifications(false);
                  }}
                >
                  去同步管理 <ArrowRight size={14} />
                </Button>
              )}
            </div>
          )}
          <div className="inset">
            <strong>欢迎使用 Crazy Talk</strong>
            <p className="muted" style={{ marginTop: 8 }}>
              从学员档案出发，安排课程、跟进反馈，让每次服务都有记录。
            </p>
          </div>
        </div>
      </Drawer>
      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="恢复初始演示数据"
        description="本浏览器中的演示操作会被清除，恢复为最初的学员、课程和反馈。"
        footer={
          <>
            <Button onClick={() => setResetOpen(false)}>取消</Button>
            <Button
              variant="danger-solid"
              onClick={() => {
                reset();
                setResetOpen(false);
                toast("演示数据已恢复");
              }}
            >
              恢复初始数据
            </Button>
          </>
        }
      >
        <p>正式业务数据不会受到影响。本地演示中新增的记录将清除。</p>
      </Modal>
    </div>
  );
}
