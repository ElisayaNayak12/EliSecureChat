import { io } from "socket.io-client";
const SOCKET_BASE = import.meta.env.VITE_SOCKET_URL ?? window.location.origin;
export const socket = io(`${SOCKET_BASE}/chat`, {
  autoConnect: false,
  path: "/socket.io",
});
