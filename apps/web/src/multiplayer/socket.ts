import { io } from 'socket.io-client'

const serverUrl =
  import.meta.env.VITE_SERVER_URL ||
  (import.meta.env.DEV ? 'http://localhost:3001' : undefined)

export const socket = io(serverUrl, {
  autoConnect: false,
})