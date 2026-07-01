import { IsString, MinLength } from "class-validator";

export class ResolveDeleteRequestDto {
  @IsString()
  @MinLength(1)
  userId!: string;
}

