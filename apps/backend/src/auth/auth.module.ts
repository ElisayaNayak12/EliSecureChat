import { Global, Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { VerificationService } from "./verification.service";
import { NotificationService } from "../notifications/notification.service";

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, NotificationService, VerificationService],
  exports: [AuthService, NotificationService, VerificationService],
})
export class AuthModule {}
