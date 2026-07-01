import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class CreateCommunityDto {
  @IsString()
  ownerId!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsIn(["PUBLIC", "PRIVATE"])
  @IsOptional()
  privacy?: "PUBLIC" | "PRIVATE";
}

