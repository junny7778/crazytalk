import { useEffect, useState } from "react";
import { Button, Modal, defaultAvatarSource } from "@crazytalk/ui";
import type { ProfileCardContent, TeacherCardFields } from "../../../../packages/shared/src/profileCards";
import { useTeacherMediaSource } from "../lib/demoTeacherMedia";

const labels: {key:keyof TeacherCardFields;label:string}[] = [
  {key:"name",label:"老师姓名"},{key:"specialties",label:"教学专长"},{key:"certificates",label:"资质认证"},
  {key:"education",label:"教育背景"},{key:"experience",label:"教学经验"},{key:"message",label:"教师寄语与教学特色"},
];
const font='"HarmonyOS Sans SC", Inter, sans-serif';
async function loadImage(source:string) {
  const image=new Image();image.crossOrigin="anonymous";image.src=source;await image.decode();return image;
}
export async function renderTeacherCard(fields:TeacherCardFields,photoSource:string | undefined) {
  await Promise.all([document.fonts.load(`400 14px ${font}`),document.fonts.load(`500 16px ${font}`),document.fonts.load(`600 24px ${font}`)]);
  await document.fonts.ready;
  const [banner,logo,photo]=await Promise.all([loadImage("/brand/teacher-card-mountains.png"),loadImage("/brand/logo.webp"),loadImage(photoSource || defaultAvatarSource(fields.name))]);
  const canvas=document.createElement("canvas");
  const ctx=canvas.getContext("2d")!;
  function wrap(text:string,width:number,size:number,weight:number) {
    ctx.font=`${weight} ${size}px ${font}`;
    const lines:string[]=[];
    for(const paragraph of text.split("\n")) {
      let line="";
      for(const token of paragraph.match(/[A-Za-z0-9]+|\s+|[^A-Za-z0-9\s]/gu) || []) {
        if(line && ctx.measureText(line+token).width>width){lines.push(line.trimEnd());line="";}
        for(const char of token) {
          if(!line && /\s/.test(char)) continue;
          if(line && ctx.measureText(line+char).width>width){lines.push(line);line="";}
          line+=char;
        }
      }
      lines.push(line);
    }
    return lines;
  }
  const nameLines=wrap(fields.name,504,24,600);
  const rows=labels.slice(1,5).filter(({key})=>fields[key].trim()).map(({key,label})=>({label,lines:wrap(fields[key],408,14,400)}));
  const message=fields.message.trim() ? wrap(fields.message,504,14,400) : [];
  const bodyTop=282+nameLines.length*34;
  const rowsHeight=rows.reduce((height,row)=>height+Math.max(26,row.lines.length*24)+16,0);
  const height=bodyTop+rowsHeight+(message.length ? 68+message.length*24 : 0)+160;
  canvas.width=1200;canvas.height=Math.ceil(height*2);ctx.scale(2,2);
  ctx.save();ctx.beginPath();ctx.roundRect(16,16,568,height-32,24);
  ctx.shadowColor="rgba(25,35,45,0.10)";ctx.shadowBlur=16;ctx.shadowOffsetY=4;
  ctx.fillStyle="#fff";ctx.fill();ctx.restore();
  ctx.save();ctx.beginPath();ctx.roundRect(16,16,568,height-32,24);ctx.clip();ctx.fillStyle="#fff";ctx.fillRect(16,16,568,height-32);
  const cropHeight=banner.width*170/568;
  ctx.drawImage(banner,0,(banner.height-cropHeight)/2,banner.width,cropHeight,16,16,568,170);
  ctx.restore();
  ctx.save();ctx.beginPath();ctx.arc(112,186,66,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();ctx.beginPath();ctx.arc(112,186,62,0,Math.PI*2);ctx.clip();
  const side=Math.min(photo.width,photo.height);ctx.drawImage(photo,(photo.width-side)/2,(photo.height-side)/2,side,side,50,124,124,124);
  ctx.restore();ctx.textAlign="left";ctx.textBaseline="top";
  function text(lines:string[],x:number,y:number,size:number,weight:number,lineHeight:number){ctx.font=`${weight} ${size}px ${font}`;ctx.fillStyle="#292d31";lines.forEach((line,i)=>ctx.fillText(line,x,y+i*lineHeight));}
  text(nameLines,48,266,24,600,34);
  let y=bodyTop;
  for(const row of rows){text([row.label],48,y,16,500,26);text(row.lines,144,y+1,14,400,24);y+=Math.max(26,row.lines.length*24)+16;}
  if(message.length){y+=8;ctx.strokeStyle="#e5e7eb";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(48,y);ctx.lineTo(552,y);ctx.stroke();y+=24;text(["教师寄语与教学特色"],48,y,16,500,26);y+=36;text(message,48,y,14,400,24);y+=message.length*24;}
  const logoWidth=104,logoHeight=logo.height/logo.width*logoWidth;
  ctx.drawImage(logo,(600-logoWidth)/2,height-44-logoHeight,logoWidth,logoHeight);
  ctx.beginPath();ctx.roundRect(16,16,568,height-32,24);ctx.strokeStyle="#e5e7eb";ctx.lineWidth=1;ctx.stroke();
  return canvas.toDataURL("image/png");
}

export default function TeacherProfileCard({content,fields,onClose}:{content:ProfileCardContent;fields:TeacherCardFields;onClose:()=>void}) {
  const [image,setImage]=useState(""),[error,setError]=useState("");
  const photo=useTeacherMediaSource(content.photo || "");
  useEffect(()=>{
    let active=true;setImage("");setError("");
    if(content.photo && !photo) return;
    renderTeacherCard(fields,photo).then(url=>{if(active)setImage(url);}).catch(()=>{if(active)setError("图片生成失败，请检查头像或图片资源后重新打开。");});
    return ()=>{active=false;};
  },[fields,photo,content.photo]);
  function download(){const link=document.createElement("a");link.href=image;link.download=`${fields.name} · 老师简介.png`;link.click();}
  return <Modal open title={content.title} width={700} onClose={onClose} footer={<><Button onClick={onClose}>关闭</Button><Button variant="primary" disabled={!image} onClick={download}>导出图片</Button></>}>
    <div className="profile-card-layout">
      {error ? <p role="alert">{error}</p> : image ? <img className="teacher-card-image" src={image} alt="老师简介卡预览"/> : <p role="status">正在生成简介卡…</p>}
    </div>
  </Modal>;
}
