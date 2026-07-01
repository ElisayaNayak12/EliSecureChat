import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class SignUpDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(5)
  phone!: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

