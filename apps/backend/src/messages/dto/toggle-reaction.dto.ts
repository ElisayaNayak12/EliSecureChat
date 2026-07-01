import { IsString, MaxLength, MinLength } from "class-validator";

export class ToggleReactionDto {
  @IsString()
  userId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8)
  emoji!: string;
}
