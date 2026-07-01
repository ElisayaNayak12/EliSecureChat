import { IsString } from "class-validator";

export class PinMessageDto {
  @IsString()
  userId!: string;
}
