import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  businessMode,
  businessRequest,
  useDemo,
} from "@crazytalk/shared/react";

const schema = z.object({
  classes: z.array(
    z.object({ studentId: z.string(), courseId: z.string(), name: z.string() }),
  ),
});
export default function ClassInHandoverPreview({
  studentIds,
  ownerId,
}: {
  studentIds: string[];
  ownerId: string;
}) {
  const { data } = useDemo();
  const query = useQuery({
    queryKey: ["handover-classes", data.revision],
    enabled: businessMode() && !!ownerId,
    queryFn: async () =>
      schema.parse(await businessRequest("/classin-classes")),
  });
  const owner = data.accounts.find((a) => a.id === ownerId);
  if (!owner) return null;
  const groups =
    query.data?.classes.filter((c) => studentIds.includes(c.studentId)) ?? [];
  return (
    <div className="inset" role="status">
      <p>
        {studentIds.length} 位学员及其课程将由 {owner.name}{" "}
        负责，课程时间和授课老师保持原安排。
      </p>
      {businessMode() && (
        <>
          {query.isLoading ? (
            <p>正在读取相关班级…</p>
          ) : query.error ? (
            <p>班级预览读取失败，保存时会重新检查。</p>
          ) : (
            <p>
              涉及 {groups.length} 个 ClassIn 班级：
              {groups.map((c) => c.name).join("、") || "暂无已创建班级"}。
            </p>
          )}
          {!!groups.length && !owner.classInUid && (
            <p>请先关联接手教务的 ClassIn 账号。</p>
          )}
          <p>
            接手教务加入相关班级；能设为班主任时同步设置，平台明确不支持时保留成员身份。
          </p>
        </>
      )}
    </div>
  );
}
