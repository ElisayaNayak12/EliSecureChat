import { SetMetadata, createParamDecorator, type ExecutionContext } from "@nestjs/common";

export const IS_PUBLIC = "auth:public";
export const ALLOW_QUERY_TOKEN = "auth:queryToken";
export const ALLOW_OTHER_USER = "auth:otherUser";

/** No user login required (auth endpoints, health, public model files, admin routes that check x-admin-token). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Accepts `?access_token=` as well as the Authorization header. Only for GET media URLs used in
 * <img>/<video src>, which cannot send headers. Tokens are short-lived (15 min).
 */
export const AllowQueryToken = () => SetMetadata(ALLOW_QUERY_TOKEN, true);

/** The route may name a different user (e.g. viewing someone's public profile). */
export const AllowOtherUser = () => SetMetadata(ALLOW_OTHER_USER, true);

export type AuthUser = { userId: string; sessionId: string };

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});
