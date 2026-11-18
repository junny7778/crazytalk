import { Body, Controller, Get, NotFoundException, Param, Post, Req, Res } from "@nestjs/common";
import { createWriteStream, createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { requireIdentity } from "../auth";
import { scopeState } from "../../../../packages/shared/src/access";
import { database, readState } from "../store";

const uploadSchema = z.object({ data: z.string().regex(/^data:((image\/(png|jpeg|webp|gif)|video\/(mp4|webm)));base64,[A-Za-z0-9+/]+=*$/) });
@Controller("files")
export class FilesController {
  @Post()
  async upload(@Req() request: IncomingMessage, @Body() body: unknown) {
    const identity = await requireIdentity(request, true);
    const input = uploadSchema.parse(body);
    const comma = input.data.indexOf(",");
    const mime = input.data.slice(5, input.data.indexOf(";"));
    const bytes = Buffer.from(input.data.slice(comma + 1), "base64");
    const id = randomUUID();
    const directory = resolve(process.env.UPLOAD_DIRECTORY || ".data/uploads");
    await mkdir(directory, { recursive: true });
    const path = resolve(directory, id);
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
    try {
      await database.attachment.create({ data: { id, ownerId: identity.accountId, mime, size: bytes.length, path } });
    } catch (error) {
      await unlink(path);
      throw error;
    }
    return { id, url: "/api/files/" + id };
  }

  @Post("raw")
  async uploadRaw(@Req() request: IncomingMessage) {
    const identity = await requireIdentity(request, true);
    const mime = z.enum(["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/webm"]).parse(request.headers["content-type"]);
    const id = randomUUID();
    const directory = resolve(process.env.UPLOAD_DIRECTORY || ".data/uploads");
    await mkdir(directory, { recursive: true });
    const path = resolve(directory, id);
    let size = 0;
    const count = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        callback(null, chunk);
      },
    });
    try {
      await pipeline(request, count, createWriteStream(path, { flags: "wx", mode: 0o600 }));
      await database.attachment.create({ data: { id, ownerId: identity.accountId, mime, size, path } });
    } catch (error) {
      await unlink(path).catch(() => {});
      throw error;
    }
    return { id, url: "/api/files/" + id };
  }

  @Get(":id")
  async read(@Req() request: IncomingMessage, @Param("id") id: string, @Res() response: ServerResponse) {
    const identity = await requireIdentity(request);
    const file = await database.attachment.findUnique({ where: { id } });
    if (!file) throw new NotFoundException();
    if (file.ownerId !== identity.accountId) {
      const visible = scopeState(await readState(), identity);
      if (!JSON.stringify(visible).includes("/api/files/" + id)) throw new NotFoundException();
    }
    response.setHeader("Content-Type", file.mime);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "private, no-store");
    const range = request.headers.range;
    response.setHeader("Accept-Ranges", "bytes");
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) { response.writeHead(416, { "Content-Range": "bytes */" + file.size }); response.end(); return; }
      const start = Number(match[1]), end = match[2] ? Math.min(Number(match[2]), file.size - 1) : file.size - 1;
      if (start > end || start >= file.size) { response.writeHead(416, { "Content-Range": "bytes */" + file.size }); response.end(); return; }
      response.writeHead(206, { "Content-Range": "bytes " + start + "-" + end + "/" + file.size, "Content-Length": end - start + 1 });
      await pipeline(createReadStream(file.path, { start, end }), response);
      return;
    }
    response.setHeader("Content-Length", file.size);
    await pipeline(createReadStream(file.path), response);
  }
}
