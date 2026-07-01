import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class DevLoginDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(5)
  phone!: string;

  @IsEmail()
  @IsOptional()
  email?: string;
}

