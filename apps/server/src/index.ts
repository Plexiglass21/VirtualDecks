import { createServer } from 'node:http'
import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { Server } from 'socket.io'
import { addPlayer, applyAction, newGame, removePlayer, viewFor, type DeckKind, type Game } from './game.js'
import { WindowRateLimiter, normalizeNickname } from './guardrails.js'
import { loadConfig } from './config.js'
import { clientIp, ConnectionQuota } from './network.js'
import { bearerAuthorized, Telemetry } from './observability.js'

type PublicPlayer = { id: string; name: string; online: boolean; isHost: boolean }
type RoomPlayer = { id: string; name: string; token: string; socketId?: string; offlineSince?: number }
type Room = {
  id: string
  players: RoomPlayer[]
  hostPlayerId: string
  game: Game
  emptySince: number | null
  completedActions: Map<string, Map<string, ReturnType<typeof applyAction>>>
}
type RoomResponse =
  | { ok: true; roomId: string; playerId: string; resumeToken: string; players: PublicPlayer[]; table: ReturnType<typeof viewFor> }
  | { ok: false; error: string }
type ActionResponse = ReturnType<typeof applyAction>
type LeaveResponse = { ok: true } | { ok: false; error: string }
type SocketData = { roomId?: string; playerId?: string }

interface ClientToServerEvents {
  'room:create': (deckKind: DeckKind, nickname: unknown, ack: (response: RoomResponse) => void) => void
  'room:join': (roomCode: string, nickname: unknown, ack: (response: RoomResponse) => void) => void
  'room:resume': (credentials: unknown, ack: (response: RoomResponse) => void) => void
  'room:leave': (ack: (response: LeaveResponse) => void) => void
  'table:action': (action: unknown, ack: (response: ActionResponse) => void) => void
}
interface ServerToClientEvents {
  'room:players': (players: PublicPlayer[]) => void
  'table:state': (table: ReturnType<typeof viewFor>) => void
  'room:notice': (message: string) => void
}

const config = loadConfig() // fail fast on unsafe or malformed production settings
const telemetry = new Telemetry(config)
const quota = new ConnectionQuota(config.maxConnections, config.maxConnectionsPerIp)
const allowedOrigins = config.allowedOrigins
const MAX_PLAYERS = 8
// Limits are intentionally conservative for a single-process private beta.
// Multi-instance deployments need a shared limiter and shared room state.
const MAX_ROOMS = config.maxRooms
const MAX_PACKET_BYTES = config.maxPacketBytes
const createLimiter = new WindowRateLimiter(config.maxRateLimiterKeys)
const joinLimiter = new WindowRateLimiter(config.maxRateLimiterKeys)
const resumeLimiter = new WindowRateLimiter(config.maxRateLimiterKeys)
const actionLimiter = new WindowRateLimiter(config.maxRateLimiterKeys)
const inboundLimiter = new WindowRateLimiter(config.maxRateLimiterKeys)
const connectionLimiter = new WindowRateLimiter(config.maxRateLimiterKeys)
const ROOM_EMPTY_TTL_MS = config.roomEmptyTtlMs
const CLEANUP_INTERVAL_MS = config.cleanupIntervalMs
const HOST_OFFLINE_GRACE_MS = config.hostOfflineGraceMs
const OFFLINE_SEAT_TTL_MS = config.offlineSeatTtlMs
const ACTION_CACHE_LIMIT = 128
const roomCodes = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const rooms = new Map<string, Room>()
let shuttingDown = false
const httpServer = createServer((req, res) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, headers)
    res.end(JSON.stringify({ ok: true }))
    return
  }
  if (req.method === 'GET' && req.url === '/ready') {
    res.writeHead(shuttingDown ? 503 : 200, headers)
    res.end(JSON.stringify({ ready: !shuttingDown }))
    return
  }
  if (req.method === 'GET' && req.url === '/metrics') {
    if (!config.metricsToken) { res.writeHead(404); res.end(); return }
    if (!bearerAuthorized(req.headers.authorization, config.metricsToken)) {
      res.writeHead(403, { 'Cache-Control': 'no-store' }); res.end(); return
    }
    const onlinePlayers = [...rooms.values()].reduce((sum, room) => sum + room.players.filter((p) => p.socketId).length, 0)
    res.writeHead(200, headers)
    res.end(JSON.stringify(telemetry.snapshot({ rooms: rooms.size, onlinePlayers, connections: quota.active })))
    return
  }
  res.writeHead(404)
  res.end()
})
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
  cors: { origin: allowedOrigins },
  maxHttpBufferSize: MAX_PACKET_BYTES,
  // CORS alone does not protect WebSocket. The check covers both transports.
  allowRequest: (request, callback) => {
    const origin = request.headers.origin
    const address = clientIp(request.socket.remoteAddress, request.headers['x-forwarded-for'], config.trustedProxyIps)
    let reason: 'origin' | 'rate' | 'capacity' | 'shutdown' | null = null
    if (shuttingDown) reason = 'shutdown'
    else if ((config.requireOrigin && !origin) || (origin && !allowedOrigins.includes(origin))) reason = 'origin'
    else if (!connectionLimiter.allow(address, config.connectionAttemptsPerMinute, 60_000)) reason = 'rate'
    else if (!quota.canConnect(address)) reason = 'capacity'
    if (reason) {
      telemetry.increment('handshakesRejected')
      if (reason === 'rate') telemetry.increment('rateLimitsHit')
      return callback('Connection not allowed.', false)
    }
    callback(null, true)
  },
})

// Engine.IO transport connections are counted even if a client never joins
// the Socket.IO namespace. This prevents handshake-only clients occupying RAM.
io.engine.on('connection', (transport) => {
  const address = clientIp(transport.request.socket.remoteAddress, transport.request.headers['x-forwarded-for'], config.trustedProxyIps)
  const release = quota.opened(address)
  telemetry.increment('connectionsAccepted')
  transport.once('close', release)
})

const resumeToken = () => randomBytes(32).toString('hex')
const publicPlayers = (room: Room): PublicPlayer[] => room.players.map((player) => ({
  id: player.id,
  name: player.name,
  online: Boolean(player.socketId),
  isHost: player.id === room.hostPlayerId,
}))

function roomCode(): string {
  let code: string
  do {
    code = Array.from({ length: 4 }, () => roomCodes[randomInt(roomCodes.length)]).join('')
  } while (rooms.has(code))
  return code
}

function playerIp(socket: { handshake: { address: string; headers: Record<string, string | string[] | undefined> } }): string {
  return clientIp(socket.handshake.address, socket.handshake.headers['x-forwarded-for'], config.trustedProxyIps)
}

function nicknameTaken(room: Room, nickname: string): boolean {
  const key = nickname.toLocaleLowerCase()
  return room.players.some((player) => player.name.toLocaleLowerCase() === key)
}

function tokenMatches(expected: string, provided: unknown): boolean {
  if (typeof provided !== 'string' || !/^[a-f0-9]{64}$/.test(provided)) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'))
}

function publish(room: Room) {
  // The full Game contains private cards. Only send the per-player sanitized GameView.
  for (const player of room.players) {
    if (player.socketId) {
      io.to(`${room.id}:${player.id}`).emit('table:state', viewFor(room.game, player.id))
    }
  }
}

function broadcast(room: Room) {
  io.to(room.id).emit('room:players', publicPlayers(room))
  publish(room)
}

function roomResponse(room: Room, player: RoomPlayer): RoomResponse {
  return {
    ok: true, roomId: room.id, playerId: player.id, resumeToken: player.token,
    players: publicPlayers(room), table: viewFor(room.game, player.id),
  }
}

function connectedIds(room: Room): ReadonlySet<string> {
  return new Set(room.players.filter((player) => player.socketId).map((player) => player.id))
}

function expiredRoom(room: Room, now: number): boolean {
  if (room.emptySince === null || now - room.emptySince < ROOM_EMPTY_TTL_MS) return false
  rooms.delete(room.id)
  return true
}

// The first connected player in join order is preferred for handover.
// A transferred host does NOT regain ownership automatically on reconnect.
function preferOnlineHost(room: Room): boolean {
  const next = room.players.find((player) => player.socketId) ?? room.players[0]
  if (!next || next.id === room.hostPlayerId) return false
  room.hostPlayerId = next.id
  io.to(room.id).emit('room:notice', `${next.name} is now the room host.`)
  return true
}

// An explicit leave OR an expired offline seat revokes credentials, returns the
// player's cards to the deck and cleans up all per-player server state.
function removeSeat(room: Room, playerId: string): boolean {
  const player = room.players.find((candidate) => candidate.id === playerId)
  if (!player) return false
  if (player.socketId) {
    const leavingSocket = io.sockets.sockets.get(player.socketId)
    leavingSocket?.leave(room.id)
    leavingSocket?.leave(`${room.id}:${player.id}`)
    if (leavingSocket) {
      leavingSocket.data.roomId = undefined
      leavingSocket.data.playerId = undefined
    }
  }
  removePlayer(room.game, playerId)
  room.players = room.players.filter((candidate) => candidate.id !== playerId)
  room.completedActions.delete(playerId)
  if (!room.players.length) {
    rooms.delete(room.id)
    return true
  }
  if (room.hostPlayerId === playerId) preferOnlineHost(room)
  room.emptySince = room.players.some((candidate) => candidate.socketId) ? null : Date.now()
  return true
}

function depart(room: Room, playerId: string) {
  if (removeSeat(room, playerId) && room.players.length) broadcast(room)
}

// Lifecycle is evaluated both by the periodic sweep AND on room operations.
// This ensures expired credentials and full rooms are handled even if the
// cleanup interval has not fired yet.
function reconcileRoom(room: Room, now = Date.now()): boolean {
  if (expiredRoom(room, now)) return false
  // If everybody is offline, the ROOM_EMPTY_TTL controls recovery instead.
  // Do not evict the hands from a fully disconnected (but resumable) room.
  if (!room.players.some((player) => player.socketId)) return true
  let changed = false
  for (const player of [...room.players]) {
    if (!player.socketId && player.offlineSince !== undefined && now - player.offlineSince >= OFFLINE_SEAT_TTL_MS) {
      removeSeat(room, player.id)
      changed = true
      io.to(room.id).emit('room:notice', `${player.name} was removed after being offline too long.`)
    }
  }
  const host = room.players.find((player) => player.id === room.hostPlayerId)
  if (host && !host.socketId && host.offlineSince !== undefined && now - host.offlineSince >= HOST_OFFLINE_GRACE_MS) {
    if (preferOnlineHost(room)) changed = true
  }
  if (changed && room.players.length) broadcast(room)
  return rooms.has(room.id)
}

io.on('connection', (socket) => {
  // Every incoming event, including unknown events, is subject to a quota.
  // Closing on excess prevents unhandled event flooding and memory exhaustion.
  socket.use((_packet, next) => {
    if (!inboundLimiter.allow(socket.id, 120, 10_000)) {
      telemetry.increment('rateLimitsHit')
      socket.disconnect(true)
      return
    }
    next()
  })

  function occupy(room: Room, player: RoomPlayer) {
    // Only one socket at a time may act as a player; an old socket loses authority.
    if (player.socketId && player.socketId !== socket.id) {
      const previous = io.sockets.sockets.get(player.socketId)
      if (previous) {
        previous.data.roomId = undefined
        previous.data.playerId = undefined
        previous.disconnect(true)
      }
    }
    player.socketId = socket.id
    player.offlineSince = undefined
    room.emptySince = null
    socket.data.roomId = room.id
    socket.data.playerId = player.id
    socket.join(room.id)
    socket.join(`${room.id}:${player.id}`)
  }

  socket.on('room:create', (deckKind, rawNickname, ack) => {
    if (typeof ack !== 'function') return
    if (socket.data.roomId) return ack({ ok: false, error: 'You are already in a room.' })
    if (!createLimiter.allow(playerIp(socket), 12, 60_000)) { telemetry.increment('rateLimitsHit'); return ack({ ok: false, error: 'Too many rooms created. Try again later.' }) }
    if (deckKind !== 'french' && deckKind !== 'italian') return ack({ ok: false, error: 'Unknown deck type.' })
    const nickname = normalizeNickname(rawNickname)
    if (!nickname) return ack({ ok: false, error: 'Nickname must be 2–20 characters (letters, numbers, spaces, . _ - or apostrophe).' })
    if (rooms.size >= MAX_ROOMS) return ack({ ok: false, error: 'Server is at room capacity. Try again later.' })
    const id = roomCode()
    const player: RoomPlayer = { id: randomUUID(), name: nickname, token: resumeToken() }
    const room: Room = {
      id, players: [player], hostPlayerId: player.id,
      game: newGame(player.id, deckKind), emptySince: null, completedActions: new Map(),
    }
    rooms.set(id, room)
    telemetry.increment('roomsCreated')
    occupy(room, player)
    ack(roomResponse(room, player))
    broadcast(room)
  })

  socket.on('room:join', (rawCode, rawNickname, ack) => {
    if (typeof ack !== 'function') return
    if (socket.data.roomId) return ack({ ok: false, error: 'You are already in a room.' })
    if (!joinLimiter.allow(playerIp(socket), 40, 60_000)) { telemetry.increment('rateLimitsHit'); return ack({ ok: false, error: 'Too many room attempts. Try again later.' }) }
    if (typeof rawCode !== 'string' || !/^[A-Z2-9]{4}$/i.test(rawCode.trim())) return ack({ ok: false, error: 'Invalid room code.' })
    const nickname = normalizeNickname(rawNickname)
    if (!nickname) return ack({ ok: false, error: 'Nickname must be 2–20 characters (letters, numbers, spaces, . _ - or apostrophe).' })
    const room = rooms.get(rawCode.trim().toUpperCase())
    if (!room || !reconcileRoom(room)) return ack({ ok: false, error: 'Room unavailable.' })
    if (room.players.length >= MAX_PLAYERS) return ack({ ok: false, error: 'Room unavailable.' })
    if (nicknameTaken(room, nickname)) return ack({ ok: false, error: 'Nickname already used in this room.' })
    const player: RoomPlayer = { id: randomUUID(), name: nickname, token: resumeToken() }
    room.players.push(player)
    telemetry.increment('roomJoinSucceeded')
    addPlayer(room.game, player.id)
    occupy(room, player)
    reconcileRoom(room)
    ack(roomResponse(room, player))
    broadcast(room)
  })

  socket.on('room:resume', (credentials, ack) => {
    if (typeof ack !== 'function') return
    if (!resumeLimiter.allow(playerIp(socket), 30, 60_000)) { telemetry.increment('rateLimitsHit'); return ack({ ok: false, error: 'Too many reconnection attempts. Try again later.' }) }
    if (socket.data.roomId) return ack({ ok: false, error: 'You are already in a room.' })
    if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) return ack({ ok: false, error: 'Invalid session.' })
    const { roomId, playerId, token } = credentials as Record<string, unknown>
    if (typeof roomId !== 'string' || typeof playerId !== 'string') return ack({ ok: false, error: 'Invalid session.' })
    const room = rooms.get(roomId)
    const player = room?.players.find((candidate) => candidate.id === playerId)
    if (!room || !player || !tokenMatches(player.token, token) || !reconcileRoom(room) || !room.players.includes(player)) return ack({ ok: false, error: 'Session not found or expired.' })
    occupy(room, player)
    reconcileRoom(room)
    telemetry.increment('resumesSucceeded')
    ack(roomResponse(room, player))
    broadcast(room)
  })

  socket.on('room:leave', (ack) => {
    if (typeof ack !== 'function') return
    const { roomId, playerId } = socket.data
    const room = roomId ? rooms.get(roomId) : undefined
    if (!room || !playerId || !room.players.some((player) => player.id === playerId && player.socketId === socket.id)) {
      return ack({ ok: false, error: 'You are not in an active room.' })
    }
    depart(room, playerId)
    ack({ ok: true })
  })

  socket.on('table:action', (action, ack) => {
    if (typeof ack !== 'function') return
    if (!actionLimiter.allow(socket.id, 60, 10_000)) { telemetry.increment('rateLimitsHit'); return ack({ ok: false, error: 'Too many actions. Slow down a moment.' }) }
    const { roomId, playerId } = socket.data
    const room = roomId ? rooms.get(roomId) : undefined
    if (room) reconcileRoom(room)
    const player = room?.players.find((candidate) => candidate.id === playerId)
    if (!room || !player || player.socketId !== socket.id) {
      return ack({ ok: false, error: 'You are not in an active room.' })
    }
    if (!action || typeof action !== 'object' || Array.isArray(action)) return ack({ ok: false, error: 'Invalid action.' })
    const { type, actionId } = action as Record<string, unknown>
    if (typeof actionId !== 'string' || !/^[0-9a-f-]{36}$/.test(actionId)) {
      return ack({ ok: false, error: 'Invalid action ID.' })
    }
    let cache = room.completedActions.get(player.id)
    if (!cache) {
      cache = new Map()
      room.completedActions.set(player.id, cache)
    }
    if (cache.has(actionId)) return ack(cache.get(actionId)!)
    if (type === 'reset' && room.hostPlayerId !== player.id) {
      return ack({ ok: false, error: 'Only the room host can reset the table.' })
    }
    // Invalid input is rejected by applyAction. Recover from unexpected failures
    // without exposing exception text or leaving a partially mutated game.
    const snapshot = structuredClone(room.game)
    let result: ActionResponse
    try {
      result = applyAction(room.game, player.id, action, connectedIds(room))
    } catch {
      room.game = snapshot
      telemetry.increment('serverErrors')
      telemetry.log('error', 'action_exception')
      return ack({ ok: false, error: 'Unable to process action.' })
    }
    cache.set(actionId, result)
    if (cache.size > ACTION_CACHE_LIMIT) cache.delete(cache.keys().next().value!)
    if (result.ok) telemetry.increment('actionsAccepted')
    else telemetry.increment('actionsRejected')
    ack(result)
    if (result.ok) publish(room)
  })

  socket.on('disconnect', () => {
    const { roomId, playerId } = socket.data
    const room = roomId ? rooms.get(roomId) : undefined
    if (room) reconcileRoom(room)
    const player = room?.players.find((candidate) => candidate.id === playerId)
    if (!room || !player || player.socketId !== socket.id) return
    player.socketId = undefined
    player.offlineSince = Date.now()
    // A temporary disconnect retains the seat and the private hand. Stop showing
    // previously revealed cards until the owner chooses to share them again.
    applyAction(room.game, player.id, { type: 'hide-hand' })
    for (const hand of room.game.hands) {
      hand.revealedToPlayerIds = hand.revealedToPlayerIds.filter((id) => id !== player.id)
    }
    if (!room.players.some((candidate) => candidate.socketId)) room.emptySince = Date.now()
    broadcast(room)
  })
})

// No persistent database in V1. An empty room can be resumed for one hour;
// after expiry both room code and all resume tokens cease to work.
const cleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const room of rooms.values()) reconcileRoom(room, now)
  createLimiter.sweep(now)
  joinLimiter.sweep(now)
  resumeLimiter.sweep(now)
  actionLimiter.sweep(now)
  inboundLimiter.sweep(now)
  connectionLimiter.sweep(now)
}, CLEANUP_INTERVAL_MS)
cleanupTimer.unref()

// Aggregate heartbeat for operators. Does not contain IPs, room IDs or cards.
const heartbeatTimer = setInterval(() => {
  const current = telemetry.snapshot({
    rooms: rooms.size,
    onlinePlayers: [...rooms.values()].reduce((n, room) => n + room.players.filter((p) => p.socketId).length, 0),
    connections: quota.active,
  })
  telemetry.log('info', 'server_heartbeat', {
    rooms: current.gauges.rooms,
    onlinePlayers: current.gauges.onlinePlayers,
    connections: current.gauges.connections,
    actionsAccepted: current.counters.actionsAccepted,
    actionsRejected: current.counters.actionsRejected,
    rateLimitsHit: current.counters.rateLimitsHit,
  })
}, 5 * 60_000)
heartbeatTimer.unref()

httpServer.on('error', () => {
  telemetry.increment('serverErrors')
  telemetry.log('error', 'http_server_error')
  process.exitCode = 1
})
httpServer.listen(config.port, config.host, () => telemetry.log('info', 'server_listening', { port: config.port }))

function shutdown(signal: 'SIGTERM' | 'SIGINT') {
  if (shuttingDown) return
  shuttingDown = true
  telemetry.log('info', 'shutdown_started', { signal })
  clearInterval(cleanupTimer)
  clearInterval(heartbeatTimer)
  const watchdog = setTimeout(() => {
    telemetry.log('error', 'shutdown_timeout')
    process.exit(1)
  }, config.shutdownTimeoutMs)
  io.close(() => {
    clearTimeout(watchdog)
    telemetry.log('info', 'shutdown_complete')
    process.exitCode = 0
  })
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('uncaughtException', () => {
  telemetry.log('error', 'uncaught_exception')
  process.exit(1)
})
process.on('unhandledRejection', () => {
  telemetry.log('error', 'unhandled_rejection')
  process.exit(1)
})
