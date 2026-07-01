import { Module } from "@nestjs/common";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { ChatsModule } from "./chats/chats.module";
import { CommunitiesModule } from "./communities/communities.module";
import { HealthController } from "./health.controller";
import { MessagesModule } from "./messages/messages.module";
import { StoreModule } from "./store/store.module";
import { UploadsModule } from "./uploads/uploads.module";
import { UsersModule } from "./users/users.module";
import { ChatGateway } from "./websocket/chat.gateway";

@Module({
  imports: [StoreModule, AuthModule, UsersModule, ChatsModule, MessagesModule, CommunitiesModule, AdminModule, UploadsModule],
  controllers: [HealthController],
  providers: [ChatGateway],
})
export class AppModule {}
