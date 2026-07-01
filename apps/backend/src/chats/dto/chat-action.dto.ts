import { IsString, MinLength } from "class-validator";

export class ChatActionDto {
  @IsString()
  @MinLength(1)
  userId!: string;
}

