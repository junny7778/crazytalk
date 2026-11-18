import assert from "node:assert/strict";

export async function verifyFileStreaming(origin: string, headers: Record<string, string>) {
  const bytes = Buffer.alloc(16 * 1024 * 1024, 7);
  const uploadHeaders = new Headers(headers);
  uploadHeaders.set("content-type", "video/mp4");
  const upload = await fetch(origin + "/api/files/raw", {
    method: "POST", headers: uploadHeaders, body: bytes,
  });
  assert.equal(upload.status, 201, await upload.clone().text());
  const file = await upload.json();
  const range = await fetch(origin + file.url, { headers: { ...headers, Range: "bytes=1048576-1048585" } });
  assert.equal(range.status, 206);
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), Buffer.alloc(10, 7));
  const denied = await fetch(origin + file.url);
  assert.equal(denied.status, 401);
  console.log("PASS 16 MB streaming upload, authorized video range, anonymous access denied");
}
