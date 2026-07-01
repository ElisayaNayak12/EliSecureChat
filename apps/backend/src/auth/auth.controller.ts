import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Inject,
  Post,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { InMemoryStore } from "../store/in-memory.store";
import { PublicUser } from "../store/models";
import { AdminSignInDto } from "./dto/admin-sign-in.dto";
import { DevLoginDto } from "./dto/dev-login.dto";
import { SignInDto } from "./dto/sign-in.dto";
import { SignUpDto } from "./dto/sign-up.dto";

@Controller("auth")
export class AuthController {
  constructor(@Inject(InMemoryStore) private readonly store: InMemoryStore) {}

  @Post("sign-up")
  signUp(@Body() dto: SignUpDto) {
    const existingByPhone = this.store.findUserByPhone(dto.phone);
    if (existingByPhone) {
      // If suspended, give a special error
      if ((existingByPhone.status ?? "ACTIVE") === "SUSPENDED") {
        throw new ForbiddenException({
          code: "ACCOUNT_SUSPENDED",
          userId: existingByPhone.id,
          reason: existingByPhone.suspensionReason ?? "Account suspended due to policy violation.",
          message: "ACCOUNT_SUSPENDED",
        });
      }
      throw new ConflictException("PHONE_ALREADY_REGISTERED");
    }
    if (dto.email && this.store.findUserByEmail(dto.email)) {
      throw new ConflictException("EMAIL_ALREADY_REGISTERED");
    }

    const user = this.store.createUser({
      name: dto.name,
      phone: dto.phone,
      email: dto.email,
      passwordHash: this.store.hashPassword(dto.password),
    });

    return this.authResponse(user);
  }

  @Post("sign-in")
  signIn(@Body() dto: SignInDto) {
    const user = this.store.findUserByPhone(dto.phone);
    if (!user) {
      throw new UnauthorizedException("INVALID_CREDENTIALS");
    }
    if (!this.store.verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedException("INVALID_CREDENTIALS");
    }

    // Check suspension AFTER password verification (so we know it's really them)
    if ((user.status ?? "ACTIVE") === "SUSPENDED") {
      throw new ForbiddenException({
        code: "ACCOUNT_SUSPENDED",
        userId: user.id,
        reason: user.suspensionReason ?? "Your account has been suspended due to a policy violation.",
        message: "ACCOUNT_SUSPENDED",
      });
    }

    return this.authResponse(user);
  }

  @Post("admin/sign-in")
  adminSignIn(@Body() dto: AdminSignInDto) {
    const ok = this.store.verifyAdminCredentials(dto.username, dto.password);
    if (!ok) {
      throw new UnauthorizedException("INVALID_ADMIN_CREDENTIALS");
    }
    return {
      adminToken: this.store.createAdminSession(),
      username: dto.username,
      tokenType: "Bearer",
    };
  }

  @Post("reset-password")
  resetPassword(@Body() dto: { phone: string; name: string; newPassword: string }) {
    const user = this.store.findUserByPhone(dto.phone);
    if (!user) {
      throw new BadRequestException("USER_NOT_FOUND");
    }
    if (user.name.trim().toLowerCase() !== dto.name.trim().toLowerCase()) {
      throw new BadRequestException("INVALID_VERIFICATION_DETAILS");
    }
    user.passwordHash = this.store.hashPassword(dto.newPassword);
    this.store.persist();
    return { success: true };
  }

  @Post("dev-login")
  devLogin(@Body() dto: DevLoginDto) {
    let user = this.store.findUserByPhone(dto.phone);
    if (!user) {
      user = this.store.createUser({
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        passwordHash: this.store.hashPassword(randomUUID()),
      });
    }

    return this.authResponse(user);
  }

  private authResponse(user: { passwordHash: string } & PublicUser) {
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return {
      user: publicUser,
      accessToken: `user_${randomUUID()}`,
      tokenType: "Bearer",
    };
  }
}
