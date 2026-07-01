import { IsArray, IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class CreateChatDto {
  @IsIn(["ONE_TO_ONE", "COMMUNITY"])
  type!: "ONE_TO_ONE" | "COMMUNITY";

  @IsArray()
  @IsString({ each: true })
  memberIds!: string[];

  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;
}

