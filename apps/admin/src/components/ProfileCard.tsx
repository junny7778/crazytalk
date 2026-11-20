import TeacherProfileCard from "./TeacherProfileCard";
import { useState } from "react";
import { Copy } from "lucide-react";
import { Button, Modal } from "@crazytalk/ui";
import type { ProfileCardContent } from "../../../../packages/shared/src/profileCards";
import "./ProfileCard.css";


export default function ProfileCard({ content, onClose }: {content: ProfileCardContent; onClose: () => void}) {
  if(content.teacher) return <TeacherProfileCard content={content} fields={content.teacher} onClose={onClose}/>;
  return <TextProfileCard content={content} onClose={onClose}/>;
}
function TextProfileCard({content,onClose}:{content:ProfileCardContent;onClose:()=>void}) {
  const [text,setText]=useState(content.text.replace(/\n{2,}/g, "\n"));
  const [notice,setNotice]=useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(`${content.title}\n\n${text}`); setNotice("文案已复制"); }
    catch { setNotice("复制失败，请选中文本后手动复制"); }
  }
  return <Modal open title="学员画像信息" description="供老师了解学员情况与教学建议，文案可直接点击编辑" onClose={onClose} width={720}>
    <div className="student-profile-content">
      <textarea
        aria-label="画像文案"
        className="student-profile-text"
        rows={Math.max(8, text.split("\n").length + 1)}
        autoFocus
        onFocus={event => event.currentTarget.setSelectionRange(event.currentTarget.value.length, event.currentTarget.value.length)}
        value={text}
        onChange={event => setText(event.target.value)}
      />
      <div className="student-profile-copy-row">
        <Button size="sm" variant="ghost" onClick={copy} aria-label="复制文案" title="复制文案"><Copy size={18} aria-hidden="true" />复制文案</Button>
        {notice && <span role="status" className="muted">{notice}</span>}
      </div>
    </div>
  </Modal>;
}
