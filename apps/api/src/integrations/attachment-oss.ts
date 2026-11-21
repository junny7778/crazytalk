import Credential, { Config } from "@alicloud/credentials";
import OSS from "ali-oss";

const credentials = new Credential(new Config({
  type: "ecs_ram_role",
  enableIMDSv2: true,
  disableIMDSv1: true,
}));

export function newAttachmentBucket() {
  const { OSS_BUCKET, OSS_REGION } = process.env;
  if (Boolean(OSS_BUCKET) !== Boolean(OSS_REGION)) {
    throw new Error("Set both OSS_BUCKET and OSS_REGION to enable OSS attachment storage");
  }
  return OSS_BUCKET;
}

export async function attachmentOss(bucket: string) {
  const region = process.env.OSS_REGION;
  if (!region) throw new Error("Set OSS_REGION to read OSS attachments");
  const { accessKeyId, accessKeySecret, securityToken } = await credentials.getCredential();
  if (!accessKeyId || !accessKeySecret || !securityToken) {
    throw new Error("The ECS instance role did not provide temporary OSS credentials");
  }
  return new OSS({
    bucket,
    region: "oss-" + region,
    internal: true,
    secure: true,
    authorizationV4: true,
    accessKeyId,
    accessKeySecret,
    stsToken: securityToken,
  });
}
