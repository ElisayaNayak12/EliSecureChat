import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class SignUpDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(20)
  phone!: string;

  /** A blank email field means "no email". */
  @Transform(({ value }) => (typeof value === "string" && value.trim() === "" ? undefined : value))
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsIn(["web", "native"])
  client?: "web" | "native";
}
