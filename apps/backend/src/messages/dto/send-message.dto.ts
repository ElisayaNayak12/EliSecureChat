import { IsIn, IsNumber, IsOptional, IsString, MinLength } from "class-validator";

export class SendMessageDto {
  @IsString()
  chatId!: string;

  @IsString()
  senderId!: string;

  @IsString()
  @MinLength(1)
  encryptedContent!: string;

  @IsString()
  @IsOptional()
  nonce?: string;

  @IsIn(["TEXT", "IMAGE", "VIDEO", "AUDIO", "FILE", "SYSTEM"])
  @IsOptional()
  messageType?: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "FILE" | "SYSTEM";

  @IsString()
  @IsOptional()
  replyToMessageId?: string;

  @IsString()
  @IsOptional()
  attachmentUrl?: string;

  @IsString()
  @IsOptional()
  fileName?: string;

  @IsString()
  @IsOptional()
  mimeType?: string;

  @IsOptional()
  @IsNumber()
  fileSize?: number;
}
