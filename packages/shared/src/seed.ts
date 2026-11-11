import { initializePayroll } from "./payroll";
import { migrateFeedbackCatalog } from "./feedbackCatalog";
import { emptyStudentProfile } from "./model";
import {
  type DemoState,
  type Student,
  type Teacher,
  type Lesson,
  type AvailabilitySlot,
  permissionGroups,
  addDays,
  DEMO_TODAY,
} from "./model";
const hours = (
  days: number[],
  ranges: [string, string][],
): AvailabilitySlot[] =>
  days.flatMap((day) => ranges.map(([start, end]) => ({ day, start, end })));
const teacherAvailability: AvailabilitySlot[][] = [
  hours([1, 2, 3, 4, 5, 6], [["10:00", "18:00"]]),
  [
    ...hours([3, 4, 5], [["18:00", "22:00"]]),
    ...hours([6, 0], [["10:00", "22:00"]]),
  ],
  hours([1, 2, 4, 5, 6, 0], [["17:00", "22:00"]]),
  [
    ...hours([2, 3, 4, 5], [["18:00", "22:00"]]),
    ...hours([6, 0], [["14:00", "20:00"]]),
  ],
  [
    ...hours(
      [1, 2, 3, 4],
      [
        ["16:00", "18:00"],
        ["19:00", "22:00"],
      ],
    ),
    ...hours(
      [6, 0],
      [
        ["10:00", "12:00"],
        ["13:00", "18:00"],
        ["19:00", "22:00"],
      ],
    ),
  ],
  [
    ...hours([2, 3, 4, 5], [["16:00", "21:30"]]),
    ...hours([6, 0], [["15:00", "21:30"]]),
  ],
  [],
  [],
];
export function createSeed(): DemoState {
  const teacherNames = [
    "Carol",
    "Destiny",
    "Rhea",
    "Kathy",
    "Micha",
    "Glyzel",
    "Jasshiel",
    "Erika",
  ];
  const teachers: Teacher[] = teacherNames.map((name, i) => ({
    id: `t${i + 1}`,
    name: `T. ${name}`,
    so: [
      "BigBrains",
      "BigBrains",
      "CleverOaks",
      "WeTalk",
      "Mellany",
      "CleverOaks",
      "BigBrains",
      "Mellany",
    ][i],
    accent: ["B+", "A", "B+", "B", "A", "B+", "B", "A"][i],
    level: i % 3 ? "B" : "A",
    categories: i === 6 ? ["成人", "商务"] : ["少儿", "成人", "雅思"],
    status: i === 7 ? "培训中" : "在职",
    trained: i !== 7,
    needConfirm: i === 1,
    phone: `1390000120${i}`,
    bio: "耐心、有亲和力，善于通过互动引导学员表达。拥有三年以上线上教学经验。",
    rate: 180 + i * 10,
    availability: teacherAvailability[i],
    availabilityFrom: "",
    availabilityNote:
      i === 6
        ? "原表：周一至周四、周日18:00–22:00，20号开始，具体日期待核实"
        : "",
    availabilitySource: i === 7 ? "entered" : "reference",
    tags: i % 2 ? ["活泼", "互动性强"] : ["耐心", "发音清晰"],
  }));
  const names = [
    "Jayden",
    "Molly",
    "Miya",
    "Lucy",
    "Leo",
    "Anna",
    "Kimi",
    "Nancy",
    "Lily",
    "Angela",
    "Eric",
    "Ken",
    "Lucas",
    "Emily",
    "Oliver",
    "Chloe",
    "Sophia",
    "Oscar",
    "Eva",
    "Zoe",
    "Alex",
    "Emma",
    "Ethan",
    "Ella",
  ];
  const students: Student[] = names.map((name, i) => ({
    ...emptyStudentProfile(),
    balanceKnown: true,
    teacherChanges: [],
    serviceStopResults: [],
    id: `s${i + 1}`,
    code: `${["X", "R", "CT", "EP"][i % 4]}${String(i + 7).padStart(4, "0")}`,
    name,
    chineseName: ["王子轩", "李沐晴", "陈米娅", "林可欣", "张乐乐", "周安娜"][
      i % 6
    ],
    age: i % 7 === 6 ? 18 : 7 + (i % 8),
    project: ["K12", "14", "乐说"][i % 3],
    channel: ["许老师", "ToC", "黄子妈妈", "艺动"][i % 4],
    owner: i % 3 ? "Rita" : "Roma",
    phone: `1380000${String(1234 + i)}`,
    status:
      i === 3 || i === 13 || i === 20
        ? "待排课"
        : i === 5
          ? "退费"
          : i === 9 || i === 17
            ? "停课"
            : "在读",
    level: ["A2", "A1", "Pre-A1", "B1"][i % 4],
    material: ["Power Up 3", "Power Up 1", "Power Up Starter", "Think 1"][
      i % 4
    ],
    unit: `Unit ${(i % 8) + 1} / P${(i % 8) * 6 + 4}`,
    teacherId: i === 3 || i === 13 || i === 20 ? "" : `t${(i % 7) + 1}`,
    balance: [18, 3, 24, 12, 1, 0, 8, -1, 32, 16, 4, 48][i % 12],
    preferences: i % 2 ? "喜欢活泼、互动多的老师" : "希望老师耐心，语速适中",
    goal: "培养开口表达的信心，提升自然拼读与阅读能力。",
    createdAt: "2026-09-01",
    lastLesson: i === 17 ? "2026-10-10" : "2026-10-30",
  }));
  Object.assign(students[0], {
    sourceSequence: "1",
    groupName: "Crazy Talk 学习群",
    orderStatus: "正常",
    purchaseDate: "2026-09-01",
    totalUnits: 48,
    teacherName:
      teachers.find((item) => item.id === students[0].teacherId)?.name || "",
    scheduleText: "周二、周四 19:00",
    frequencyText: "2*25mins",
    firstLessonDate: "2026-09-03",
    gender: "男",
    personality: "喜欢表达",
    foreignTeacherExperience: "有",
    renewalStatus: "",
    legacyComplaints: "0",
    legacyCompensations: "",
    legacyMissed: "",
    originalTeacher: "",
    firstChangedTeacher: "",
    secondChangedTeacher: "",
    monthlyRecords: [
      {
        id: "month-demo-1",
        month: "2026-10",
        planned: 8,
        actual: null,
        note: "本月上课次数待核对",
      },
    ],
  });
  const lessons: Lesson[] = [];
  const makeLesson = (
    student: Student,
    date: string,
    time: string,
    status: Lesson["status"],
    index: number,
  ): Lesson => ({
    id: `l${index}`,
    studentId: student.id,
    teacherId: student.teacherId || "t1",
    date,
    time,
    duration: index % 6 === 0 ? 50 : 25,
    kind: index % 4 === 0 ? "临时课" : "固定课",
    status,
    attendance: "正常",
    deducted: status === "已完成",
    confirmedUnits: index % 6 === 0 ? 2 : 1,
    sync: "已同步",
    syncReason: "",
    material: student.material,
    note: "",
    teacherIn: status === "已完成" ? time : "",
    teacherOut: status === "已完成" ? endTime(time, index % 6 === 0 ? 50 : 25) : "",
    studentIn: status === "已完成" ? time : "",
    studentOut: status === "已完成" ? endTime(time, index % 6 === 0 ? 50 : 25) : "",
    leaveFlag: false,
    conflict: false,
  });
  let n = 1;
  for (let d = -5; d < 15; d++) {
    students
      .slice(0, 18)
      .filter((s) => s.status === "在读")
      .forEach((s, i) => {
        if ((i + d + 20) % 3 !== 0) return;
        const time = `${18 + Math.floor(i / 4)}:${i % 2 ? "30" : "00"}`;
        lessons.push(
          makeLesson(
            s,
            addDays(DEMO_TODAY, d),
            time,
            d < 0 ? "已完成" : "未开始",
            n++,
          ),
        );
      });
  }
  students
    .filter((s) => s.status === "在读")
    .slice(0, 9)
    .forEach((s, i) => {
      const l = makeLesson(
        s,
        "2026-10-30",
        `${18 + Math.floor(i / 2)}:${i % 2 ? "30" : "00"}`,
        "待确认",
        n++,
      );
      l.attendance =
        i < 4
          ? "正常"
          : i === 4
            ? "学员缺席"
            : i === 5
              ? "老师缺席"
              : i === 6
                ? "老师迟到"
                : i === 7
                  ? "无数据"
                  : "账号待关联";
      if (l.attendance === "学员缺席") {
        l.studentIn = "";
        l.studentOut = "";
      }
      if (l.attendance === "老师缺席") {
        l.teacherIn = "";
        l.teacherOut = "";
      }
      if (l.attendance === "老师迟到") l.teacherIn = endTime(l.time, 8);
      if (l.attendance === "无数据") {
        l.teacherIn = "";
        l.teacherOut = "";
        l.studentIn = "";
        l.studentOut = "";
      }
      lessons.push(l);
    });
  if (lessons[6]) {
    lessons[6].sync = "未同步";
    lessons[6].syncReason = "课程时间还未更新到 ClassIn，请重新更新。";
  }
  const seed: DemoState = {
    version: 1,
    revision: 0,
    students,
    teachers,
    lessons,
    referrals: [],
    tasks: [
      {
        id: "task-demo-1",
        studentId: students[0].id,
        title: "回访学习情况",
        owner: students[0].owner,
        dueDate: DEMO_TODAY,
        note: "示例待办，可在学生档案记录处理结果。",
        status: "待处理",
        result: "",
        completedAt: "",
      },
    ],
    feedback: [
      {
        source: "",
        teacherName: "",
        so: "",
        stage: "课中问题",
        grade: "",
        categories: [],
        customerProgress: "",
        customerResult: "",
        jointVerdict: "",
        tmResult: "",
        tmDate: "",
        tmNote: "",
        screenshots: [],
        followUps: [],
        id: "FB20261030-0001",
        studentId: "s7",
        teacherId: "t4",
        lessonId: "",
        date: "2026-10-30",
        rating: "差评",
        category: "老师相关 / 设备网络 / 音频问题超过 3 分钟",
        content:
          "老师麦克风声音很小，孩子有几次听不清楚。希望下次课前检查一下设备。",
        status: "待处理",
        owner: "Roma",
        processNote: "",
        verdict: "",
        measures: [],
        repeat: true,
      },
      {
        source: "",
        teacherName: "",
        so: "",
        stage: "课中问题",
        grade: "",
        categories: [],
        customerProgress: "",
        customerResult: "",
        jointVerdict: "",
        tmResult: "",
        tmDate: "",
        tmNote: "",
        screenshots: [],
        followUps: [],
        id: "FB20261029-0002",
        studentId: "s1",
        teacherId: "t1",
        lessonId: "",
        date: "2026-10-29",
        rating: "差评",
        category: "老师相关 / 教学问题 / 缺乏互动",
        content: "今天老师讲得比较多，Jayden 开口的机会不够。",
        status: "等待判定",
        owner: "Rita",
        processNote: "已与老师核实，建议增加引导式提问。",
        verdict: "",
        measures: [],
        repeat: false,
      },
      {
        source: "",
        teacherName: "",
        so: "",
        stage: "课中问题",
        grade: "",
        categories: [],
        customerProgress: "",
        customerResult: "",
        jointVerdict: "",
        tmResult: "",
        tmDate: "",
        tmNote: "",
        screenshots: [],
        followUps: [],
        id: "FB20261028-0003",
        studentId: "s2",
        teacherId: "t1",
        lessonId: "",
        date: "2026-10-28",
        rating: "好评",
        category: "教学表扬",
        content: "孩子很喜欢老师的小游戏，愿意主动表达了。",
        status: "已完成",
        owner: "Rita",
        processNote: "已转达老师，感谢老师的用心。",
        verdict: "老师无责",
        measures: ["提醒"],
        repeat: false,
      },
      {
        source: "",
        teacherName: "",
        so: "",
        stage: "课中问题",
        grade: "",
        categories: [],
        customerProgress: "",
        customerResult: "",
        jointVerdict: "",
        tmResult: "",
        tmDate: "",
        tmNote: "",
        screenshots: [],
        followUps: [],
        id: "FB20261027-0004",
        studentId: "s9",
        teacherId: "t3",
        lessonId: "",
        date: "2026-10-27",
        rating: "差评",
        category: "老师相关 / 职业素养 / 迟到",
        content: "老师迟到 8 分钟，家长希望得到说明。",
        status: "处理中",
        owner: "Roma",
        processNote: "正在核对上课时间。",
        verdict: "",
        measures: [],
        repeat: false,
      },
    ],
    credits: students.map((s, i) => ({
      id: `c${i}`,
      studentId: s.id,
      date: "2026-10-01",
      type: "期初课时",
      units: s.balance,
      balance: s.balance,
      note: "演示课包",
      operator: "Rita",
    })),
    events: [
      {
        id: "ev1",
        studentId: "s1",
        teacherId: "t1",
        date: "2026-10-29",
        type: "回访",
        content: "家长反馈孩子最近更愿意开口，继续观察阅读进度。",
        operator: "Rita",
      },
    ],
    actions: [
      {
        id: "a1",
        teacherId: "t4",
        feedbackId: "",
        date: "2026-10-29",
        type: "扣款",
        amount: 100,
        reason: "音频问题，待 TM 确认",
        status: "待确认",
      },
      {
        id: "a2",
        teacherId: "t1",
        feedbackId: "",
        date: "2026-10-14",
        type: "扣款",
        amount: 50,
        reason: "迟到 8 分钟",
        status: "已确认",
      },
    ],
    payroll: [
      {
        id: "p-sep-t1",
        teacherId: "t1",
        month: "2026-09",
        lessons: 72,
        adjustment: 0,
        adjustmentNote: "",
        status: "已确认" as const,
      },
      ...teachers.map((t, i) => ({
        id: `p${i + 1}`,
        teacherId: t.id,
        month: "2026-10",
        lessons: 68 + i * 7,
        adjustment: i === 2 ? 100 : 0,
        adjustmentNote: i === 2 ? "代课奖励" : "",
        status:
          i === 2
            ? ("已确认" as const)
            : i === 5
              ? ("已发放" as const)
              : ("待确认" as const),
      })),
    ],
    reports: [],
    roles: [
      {
        id: "admin",
        name: "超级管理员",
        description: "管理全部业务和系统设置",
        permissions: permissionGroups.flatMap((g) => g.keys),
        scope: "全部",
      },
      {
        id: "ops",
        name: "教务",
        description: "学员服务、排班与课后确认",
        permissions: [
          "dashboard.overview",
          "dashboard.utilization",
          "student.view",
          "student.create",
          "student.edit",
          "student.reschedule",
          "credit.add",
          "credit.compensate",
          "schedule.view",
          "schedule.create",
          "lesson.view",
          "lesson.confirm",
          "lesson.correct",
          "sync.retry",
          "classin_account.link",
          "feedback.view",
          "feedback.create",
          "feedback.process",
          "teacher.view",
        ],
        scope: "K12",
      },
      {
        id: "tm",
        name: "老师管理",
        description: "老师资料、教学质量与责任判定",
        permissions: [
          "dashboard.overview",
          "teacher.view",
          "teacher.edit",
          "teacher.leave",
          "teacher.offboard",
          "availability.edit",
          "training.edit",
          "feedback.view",
          "feedback.process",
          "feedback.verdict",
          "teacher_action.deduct",
          "teacher_action.confirm",
          "lesson.view",
        ],
        scope: "全部",
      },
      {
        id: "finance",
        name: "财务",
        description: "课酬核对与薪资发放",
        permissions: [
          "payroll.view",
          "payroll.adjust",
          "payroll.confirm",
          "payroll.mark_paid",
          "field.pay_amount",
          "pay_rate.edit",
          "teacher.view",
        ],
        scope: "全部",
      },
    ],
    accounts: [
      {
        id: "u1",
        name: "管理员",
        phone: "13800000000",
        roleId: "admin",
        scope: "全部",
        enabled: true,
      },
      {
        id: "u2",
        name: "Rita",
        phone: "13800001234",
        roleId: "ops",
        scope: "K12",
        enabled: true,
      },
      {
        id: "u3",
        name: "Roma",
        team:"B队", group:"一组",
        phone: "13900005678",
        roleId: "ops",
        scope: "14",
        enabled: true,
      },
      {
        id: "u4",
        name: "Tina",
        phone: "13700009012",
        roleId: "tm",
        scope: "全部",
        enabled: true,
      },
    ],
    catalog: [
      ...["Power Up Starter", "Power Up 1", "Power Up 3", "Think 1"].map(
        (name, i) => ({
          id: `m${i}`,
          type: "教材" as const,
          name,
          detail: "9 个单元",
          enabled: true,
        }),
      ),
      ...["BigBrains", "CleverOaks", "Mellany", "WeTalk"].map((name, i) => ({
        id: `so${i}`,
        type: "SO" as const,
        name,
        detail: i === 0 ? "别名 BigBrain" : "",
        enabled: true,
      })),
      ...["K12", "14", "乐说"].map((name, i) => ({
        id: `pr${i}`,
        type: "项目" as const,
        name,
        detail: "启用项目",
        enabled: true,
      })),
      ...["许老师", "ToC", "黄子妈妈", "艺动"].map((name, i) => ({
        id: `ch${i}`,
        type: "渠道" as const,
        name,
        detail: [
          "K12 · 前缀 X",
          "14 · 前缀 R",
          "K12 · 前缀 EP",
          "乐说 · 前缀 YD",
        ][i],
        enabled: true,
      })),
      ...[
        "老师相关 / 设备网络 / 音频问题超过 3 分钟",
        "老师相关 / 教学问题 / 缺乏互动",
        "老师相关 / 教学问题 / 用错教材",
      ].map((name, i) => ({
        id: `fc${i}`,
        type: "反馈分类" as const,
        name,
        detail: "已启用",
        enabled: true,
      })),
      ...["取消原因", "补偿原因", "学员性格", "老师标签"].map((name, i) => ({
        id: `op${i}`,
        type: "下拉选项" as const,
        name,
        detail: "可维护选项",
        enabled: true,
      })),
    ],
    leaves: [],
    rules: {
      lowBalance: 4,
      trainingRequired: true,
    },
    connection: "正常",
    language: "en",
  };
  for (const record of seed.feedback) {
    const learner = students.find((item) => item.id === record.studentId);
    const tutor = teachers.find((item) => item.id === record.teacherId);
    record.source = learner?.project || "";
    record.teacherName = tutor?.name || "";
    record.so = tutor?.so || "";
    record.categories = record.category ? [record.category] : [];
    record.grade = record.rating === "好评" ? "五星" : "二星";
    record.customerProgress =
      record.status === "待处理"
        ? "未处理"
        : record.status === "等待判定"
          ? "待TM判定"
          : record.status === "已完成"
            ? "已完成"
            : "处理中";
    if (record.status === "已完成") {
      record.customerResult = "处理成功";
      record.tmResult = "处理成功";
      record.tmDate = record.date;
      record.tmNote = "已将好评同步老师，鼓励老师继续保持。";
    }
    if (record.processNote)
      record.followUps.push({
        id: `follow-${record.id}`,
        date: `${record.date}T08:00:00.000Z`,
        operator: record.owner,
        section: "客服处理",
        content: record.processNote,
      });
  }
  for (const p of seed.payroll) {
    if (p.status === "待确认") continue;
    const base =
      p.lessons * (seed.teachers.find((t) => t.id === p.teacherId)?.rate || 0);
    const deductions = seed.actions
      .filter(
        (a) =>
          a.teacherId === p.teacherId &&
          a.date.startsWith(p.month) &&
          a.status === "已确认",
      )
      .reduce((sum, a) => sum + a.amount, 0);
    p.snapshot = { base, deductions, total: base - deductions + p.adjustment };
  }
  for (const record of seed.students) {
    if (!record.orderStatus)
      record.orderStatus =
        record.status === "退费"
          ? "退款"
          : record.status === "在读" || record.status === "待排课"
            ? "正常"
            : record.status;
    if (!record.groupName) record.groupName = `${record.name}专属学习群`;
    if (!record.teacherName && record.teacherId)
      record.teacherName =
        seed.teachers.find((teacher) => teacher.id === record.teacherId)
          ?.name || "";
  }
  seed.catalog = migrateFeedbackCatalog(seed.catalog);
  initializePayroll(seed);
  for (const payroll of seed.payroll) {
    if (payroll.status === "待确认" && payroll.opening) {
      payroll.opening.source = "演示期初课酬（预设汇总减可追溯课酬），非真实结算凭据";
    }
  }
  return seed;
}

function endTime(time: string, duration: number) {
  const [h, m] = time.split(":").map(Number);
  const value = h * 60 + m + duration;
  return (
    String(Math.floor(value / 60)).padStart(2, "0") +
    ":" +
    String(value % 60).padStart(2, "0")
  );
}
