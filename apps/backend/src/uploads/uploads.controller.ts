import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { existsSync, mkdirSync, statSync } from "fs";
import { createReadStream } from "fs";
import { diskStorage } from "multer";
import { extname, join, resolve } from "path";
import { FileInterceptor } from "@nestjs/platform-express";

const uploadsDir = resolve(process.cwd(), "apps/backend/uploads");
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

@Controller("uploads")
export class UploadsController {
  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: uploadsDir,
        filename: (
          _req: unknown,
          file: Express.Multer.File,
          cb: (error: Error | null, filename: string) => void,
        ) => {
          const safeBase = file.originalname
            .replace(/\.[^/.]+$/, "")
            .replace(/[^a-zA-Z0-9-_]/g, "_")
            .slice(0, 40);
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${safeBase || "file"}-${unique}${extname(file.originalname)}`);
        },
      }),
      limits: {
        fileSize: 25 * 1024 * 1024,
      },
    }),
  )
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("FILE_REQUIRED");
    }
    return {
      url: `/api/uploads/${file.filename}`,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
    };
  }

  @Get(":fileName")
  read(@Param("fileName") fileName: string) {
    const filePath = join(uploadsDir, fileName);
    if (!existsSync(filePath)) {
      throw new NotFoundException("FILE_NOT_FOUND");
    }
    const stream = createReadStream(filePath);
    return new StreamableFile(stream, {
      length: statSync(filePath).size,
    });
  }
}
