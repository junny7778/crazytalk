import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const text = readFileSync(new URL("../apps/admin/.env.local", import.meta.url), "utf8");
const values = Object.fromEntries(text.split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {
  const index = line.indexOf("=");
  return [line.slice(0,index),line.slice(index+1).trim().replace(/^["']|["']$/g,"")];
}));
for (const key of ["CLASSIN_API_BASE","CLASSIN_SID","CLASSIN_SECRET"])
  if (!values[key]) throw new Error("缺少 " + key);
const timestamp=String(Math.floor(Date.now()/1000));
const path = process.env.CLASSIN_CHECK_PATH || "/partner/api/cloud.api.php";
const action = process.env.CLASSIN_CHECK_ACTION || "getFolderList";
if (!["/partner/api/cloud.api.php:getFolderList"].includes(path+":"+action)) throw new Error("Only documented read-only probes are allowed");
const url=new URL(path+"?action="+action,values.CLASSIN_API_BASE);
if(url.protocol!=="https:")throw new Error("ClassIn API requires HTTPS");
const response=await fetch(url,{method:"POST",redirect:"error",signal:AbortSignal.timeout(10000),body:new URLSearchParams({
  SID:values.CLASSIN_SID,timeStamp:timestamp,safeKey:createHash("md5").update(values.CLASSIN_SECRET+timestamp).digest("hex"),page:"1",perpage:"1"
})});
const body=await response.text();
let data;
try { data=JSON.parse(body); } catch { console.log(JSON.stringify({http:response.status,format:"non-json",contentType:response.headers.get("content-type"),length:body.length,readOnly:true})); process.exit(1); }
console.log(JSON.stringify({http:response.status,errno:data.error_info?.errno,readOnly:true}));
const accepted = action === "getFolderList" ? [1, 106] : [1];
if(!response.ok||!accepted.includes(Number(data.error_info?.errno)))process.exitCode=1;
