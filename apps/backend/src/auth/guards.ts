import { ForbiddenException, Inject, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { InMemoryStore } from "../store/in-memory.store";
import { AuthService } from "./auth.service";
import { ALLOW_OTHER_USER, ALLOW_QUERY_TOKEN, IS_PUBLIC, type AuthUser } from "./decorators";

type AuthedRequest = Request & { user?: AuthUser };

/** Global: every route needs a valid access token bound to a live session, unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== "http") return true; // sockets authenticate in the gateway
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    let token = "";
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) token = header.slice(7).trim();
    else if (req.method === "GET" && this.reflector.getAllAndOverride<boolean>(ALLOW_QUERY_TOKEN, targets) && typeof req.query.access_token === "string") {
      token = req.query.access_token;
    }
    if (!token) throw new UnauthorizedException("AUTH_REQUIRED");
    const user = this.auth.authenticate(token);
    if (!user) throw new UnauthorizedException("INVALID_OR_EXPIRED_TOKEN");
    req.user = user;
    return true;
  }
}

/** Fields that identify "the acting user" in existing request shapes. They must equal the authenticated user. */
const SUBJECT_FIELDS = ["userId", "senderId", "uploadedBy", "requestedBy", "ownerId"] as const;

/**
 * Global, after AuthGuard: object-level authorisation.
 * NOTE: multipart (file upload) bodies are parsed AFTER guards run, so upload handlers must check
 * acting-user fields themselves (see sign-videos upload).
 *  - any acting-user field in params/query/body must be the caller (no acting on behalf of others);
 *  - any chatId must be a chat the caller belongs to;
 *  - any messageId / delete requestId must belong to such a chat.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(InMemoryStore) private readonly store: InMemoryStore,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== "http") return true;
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const me = req.user?.userId;
    if (!me) throw new UnauthorizedException("AUTH_REQUIRED");
    const allowOther = this.reflector.getAllAndOverride<boolean>(ALLOW_OTHER_USER, targets);
    const sources = [req.params ?? {}, (req.query ?? {}) as Record<string, unknown>, (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>];

    if (!allowOther) {
      for (const src of sources) {
        for (const f of SUBJECT_FIELDS) {
          const v = (src as Record<string, unknown>)[f];
          if (v !== undefined && v !== me) throw new ForbiddenException("NOT_YOUR_ACCOUNT");
        }
      }
    }

    const isMember = (chatId: string) => {
      const chat = this.store.chats.find((c) => c.id === chatId);
      return !chat || chat.memberIds.includes(me); // unknown chats fall through to the controller's 404
    };
    for (const src of sources) {
      const chatId = (src as Record<string, unknown>).chatId;
      if (typeof chatId === "string" && !isMember(chatId)) throw new ForbiddenException("NOT_A_CHAT_MEMBER");
    }
    const messageId = req.params?.messageId;
    if (messageId) {
      const msg = this.store.messages.find((m) => m.id === messageId);
      if (msg && !isMember(msg.chatId)) throw new ForbiddenException("NOT_A_CHAT_MEMBER");
    }
    const requestId = req.params?.requestId;
    if (requestId && req.path.includes("delete-requests")) {
      const r = this.store.deleteRequests.find((x) => x.id === requestId);
      if (r && !isMember(r.chatId)) throw new ForbiddenException("NOT_A_CHAT_MEMBER");
    }
    return true;
  }
}
