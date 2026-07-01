import { IsOptional, IsString } from "class-validator";

export class CreateDeleteRequestDto {
  @IsString()
  chatId!: string;

  @IsString()
  requestedBy!: string;

  @IsString()
  @IsOptional()
  targetUserId?: string;
}

