import { IsString, MinLength } from "class-validator";

export class SignInDto {
  @IsString()
  @MinLength(5)
  phone!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

