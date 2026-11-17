import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class SignInDto {
  /** Phone number (any format) or email address. */
  @IsString()
  @MinLength(5)
  @MaxLength(254)
  phone!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  /** "native" = mobile app: refresh token returned in the body instead of a cookie. */
  @IsOptional()
  @IsIn(["web", "native"])
  client?: "web" | "native";
}
