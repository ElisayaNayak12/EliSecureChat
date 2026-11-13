import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AccessGuard, AuthGuard } from "./auth/guards";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { ChatsModule } from "./chats/chats.module";
import { CommunitiesModule } from "./communities/communities.module";
import { HealthController } from "./health.controller";
import { LanguagesModule } from "./languages/languages.module";
import { SignVideosModule } from "./sign-videos/sign-videos.module";
import { DatasetModule } from "./dataset/dataset.module";
import { KeysModule } from "./keys/keys.module";
import { MessagesModule } from "./messages/messages.module";
import { StoreModule } from "./store/store.module";
import { UploadsModule } from "./uploads/uploads.module";
import { UsersModule } from "./users/users.module";
import { ChatGateway } from "./websocket/chat.gateway";

@Module({
  imports: [StoreModule, AuthModule, UsersModule, ChatsModule, MessagesModule, CommunitiesModule, AdminModule, UploadsModule, LanguagesModule, SignVideosModule, DatasetModule, KeysModule],
  controllers: [HealthController],
  providers: [
    ChatGateway,
    // Order matters: authenticate first, then object-level authorisation.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
})
export class AppModule {}
