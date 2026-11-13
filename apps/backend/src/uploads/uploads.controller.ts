import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { randomBytes } from "crypto";
import { createReadStream, existsSync, mkdirSync, statSync } from "fs";
import type { Request, Response } from "express";
import { diskStorage } from "multer";
import { extname, join, resolve } from "path";
import { AuthService } from "../auth/auth.service";
import { CurrentUser, Public, type AuthUser } from "../auth/decorators";
import { InMemoryStore } from "../store/in-memory.store";

const uploadsDir = process.env.UPLOADS_DIR ? resolve(process.env.UPLOADS_DIR) : resolve(process.cwd(), "apps/backend/uploads");
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

/** Allowed upload types. Anything executable by a browser (HTML, SVG, JS) is refused. */
const ALLOWED: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"], "image/gif": [".gif"],
  "video/mp4": [".mp4"], "video/webm": [".webm"], "video/quicktime": [".mov"],
  "audio/webm": [".webm", ".weba"], "audio/ogg": [".ogg", ".oga"], "audio/mpeg": [".mp3"], "audio/mp4": [".m4a", ".mp4"], "audio/wav": [".wav"],
  "application/pdf": [".pdf"], "text/plain": [".txt"],
  "application/zip": [".zip"],
  "application/msword": [".doc"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-powerpoint": [".ppt"], "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
};
/** Types the browser may display inline; everything else is forced to download. */
const INLINE = /^(image\/(jpeg|png|webp|gif)|video\/|audio\/)/;

function baseMime(m: string) {
  return m.split(";")[0].trim().toLowerCase();
}

@Controller("uploads")
export class UploadsController {
  constructor(
    @Inject(InMemoryStore) private readonly store: InMemoryStore,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: uploadsDir,
        // Random server-chosen name; the original name is kept only as metadata.
        filename: (_req: unknown, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
          const ext = extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 6);
          cb(null, `${randomBytes(16).toString("hex")}${ext}`);
        },
      }),
      limits: { fileSize: 25 * 1024 * 1024, files: 1 },
      fileFilter: (_req, file, cb) => {
        const mime = baseMime(file.mimetype);
        const ext = extname(file.originalname).toLowerCase();
        const exts = ALLOWED[mime];
        if (!exts || (ext && !exts.includes(ext))) cb(new BadRequestException(`File type not allowed (${mime || "unknown"}${ext ? `, ${ext}` : ""}).`), false);
        else cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() me: AuthUser) {
    if (!file) throw new BadRequestException("FILE_REQUIRED");
    this.store.uploads.push({ fileName: file.filename, ownerId: me.userId, mimeType: baseMime(file.mimetype), createdAt: new Date().toISOString() });
    this.store.persist();
    return { url: `/api/uploads/${file.filename}`, fileName: file.originalname.slice(0, 200), mimeType: baseMime(file.mimetype), fileSize: file.size };
  }

  /**
   * Media URLs are used in <img>/<video>, which cannot send headers, so the short-lived access token may
   * come as ?access_token=. Access: the uploader, anyone for a profile photo, or members of a chat where it was sent.
   */
  @Public()
  @Get(":fileName")
  read(@Param("fileName") fileName: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!/^[\w.-]+$/.test(fileName)) throw new NotFoundException("FILE_NOT_FOUND");
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : typeof req.query.access_token === "string" ? req.query.access_token : "";
    const me = token ? this.auth.authenticate(token) : null;
    if (!me) throw new UnauthorizedException("AUTH_REQUIRED");

    const url = `/api/uploads/${fileName}`;
    const record = this.store.uploads.find((u) => u.fileName === fileName);
    const isOwner = record?.ownerId === me.userId;
    const isAvatar = this.store.users.some((u) => u.avatarUrl === url);
    const inMyChat = this.store.messages.some(
      (m) => m.attachmentUrl === url && this.store.chats.some((c) => c.id === m.chatId && c.memberIds.includes(me.userId)),
    );
    if (!isOwner && !isAvatar && !inMyChat) throw new ForbiddenException("NO_ACCESS_TO_FILE");

    const filePath = join(uploadsDir, fileName);
    if (!existsSync(filePath)) throw new NotFoundException("FILE_NOT_FOUND");
    const msg = this.store.messages.find((m) => m.attachmentUrl === url);
    const mime = record?.mimeType ?? baseMime(msg?.mimeType ?? "application/octet-stream");
    const inline = INLINE.test(mime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Content-Disposition", inline ? "inline" : `attachment; filename="${(msg?.fileName ?? fileName).replace(/[^\w.\- ]/g, "_")}"`);
    return new StreamableFile(createReadStream(filePath), { type: inline ? mime : "application/octet-stream", length: statSync(filePath).size });
  }
}
