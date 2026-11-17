import { MaxLength, IsString, MinLength } from "class-validator";

export class EditMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(65536)
  encryptedContent!: string;
}

