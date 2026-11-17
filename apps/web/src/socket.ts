import { io } from "socket.io-client";
import { getAccessToken } from "./session";
import { SOCKET_URL } from "./config";
export const socket = io(`${SOCKET_URL}/chat`, {
  autoConnect: false,
  path: "/socket.io",
  // Evaluated on every connection attempt, so reconnects always use the current access token.
  auth: (cb) => cb({ token: getAccessToken() }),
});
