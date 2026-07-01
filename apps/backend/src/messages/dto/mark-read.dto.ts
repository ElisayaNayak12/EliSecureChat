import { IsArray, IsOptional, IsString } from "class-validator";

export class MarkReadDto {
  @IsString()
  userId!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  messageIds?: string[];
}

