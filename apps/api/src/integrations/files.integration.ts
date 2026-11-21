import assert from "node:assert/strict";

export async function verifyFileStreaming(origin: string, headers: Record<string, string>) {
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9sAAAAASUVORK5CYII=", "base64");
  const imageUpload = await fetch(origin + "/api/files", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ data: "data:image/png;base64," + image.toString("base64") }),
  });
  assert.equal(imageUpload.status, 201, await imageUpload.clone().text());
  const imageFile = await imageUpload.json();
  const imageRead = await fetch(origin + imageFile.url, { headers });
  assert.equal(imageRead.status, 200);
  assert.equal(imageRead.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await imageRead.arrayBuffer()), image);

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
  assert.equal(range.headers.get("content-range"), "bytes 1048576-1048585/16777216");
  const invalidRange = await fetch(origin + file.url, { headers: { ...headers, Range: "bytes=16777216-" } });
  assert.equal(invalidRange.status, 416);
  const denied = await fetch(origin + file.url);
  assert.equal(denied.status, 401);
  console.log("PASS image round-trip, 16 MB streaming upload, valid and invalid byte ranges, anonymous access denied");
}
