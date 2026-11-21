import { Body, Controller, Get, NotFoundException, Param, Post, Req, Res } from "@nestjs/common";
import { createWriteStream, createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, open, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { requireIdentity } from "../auth";
import { scopeState } from "../../../../packages/shared/src/access";
import { database, readState } from "../store";
import { randomUUID } from "node:crypto";
import { attachmentOss, newAttachmentBucket } from "./attachment-oss";

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
    return this.save(identity.accountId, mime, Readable.from([bytes]));
  }

  @Post("raw")
  async uploadRaw(@Req() request: IncomingMessage) {
    const identity = await requireIdentity(request, true);
    const mime = z.enum(["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/webm"]).parse(request.headers["content-type"]);
    return this.save(identity.accountId, mime, request);
  }

  private async save(ownerId: string, mime: string, source: Readable) {
    const bucket = newAttachmentBucket();
    const id = randomUUID();
    const key = "attachments/" + id;
    const directory = resolve(process.env.UPLOAD_DIRECTORY || ".data/uploads");
    await mkdir(directory, { recursive: true });
    const localPath = resolve(directory, id);
    const path = bucket ? "oss://" + bucket + "/" + key : localPath;
    const handle = await open(localPath, "wx", 0o600);
    let size = 0;
    const count = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        callback(null, chunk);
      },
    });
    let uploaded = false;
    let saved = false;
    let client: Awaited<ReturnType<typeof attachmentOss>> | undefined;
    try {
      await pipeline(source, count, handle.createWriteStream());
      if (bucket) {
        client = await attachmentOss(bucket);
        await client.put(key, localPath, { mime });
        uploaded = true;
      }
      await database.attachment.create({ data: { id, ownerId, mime, size, path } });
      saved = true;
    } catch (error) {
      if (client && uploaded) {
        await client.delete(key).catch(() => {
          process.stderr.write("Could not remove an OSS object after an attachment database error.\n");
        });
      }
      throw error;
    } finally {
      if (bucket || !saved) await unlink(localPath).catch(() => {
        process.stderr.write("Could not remove an attachment staging file.\n");
      });
    }
    return { id, url: "/api/files/" + id };
  }

  private async openAttachment(path: string, range?: { start: number; end: number }): Promise<Readable> {
    if (!path.startsWith("oss://")) return createReadStream(path, range);
    const locator = new URL(path);
    const client = await attachmentOss(locator.hostname);
    const headers = range ? { Range: "bytes=" + range.start + "-" + range.end } : undefined;
    const { stream, res } = await client.getStream(locator.pathname.slice(1), { headers });
    if (!(stream instanceof Readable) || (range && res.status !== 206)) {
      if (stream instanceof Readable) stream.destroy();
      throw new Error("OSS did not return the requested attachment stream");
    }
    return stream;
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
      const stream = await this.openAttachment(file.path, { start, end });
      response.writeHead(206, { "Content-Range": "bytes " + start + "-" + end + "/" + file.size, "Content-Length": end - start + 1 });
      await pipeline(stream, response);
      return;
    }
    const stream = await this.openAttachment(file.path);
    response.setHeader("Content-Length", file.size);
    await pipeline(stream, response);
  }
}
