import { createServer } from 'node:http'
import { randomInt, randomUUID } from 'node:crypto'
import { Server } from 'socket.io'
import { addPlayer, applyAction, newGame, viewFor, type DeckKind, type Game } from './game.js'

type Player = { id: string; name: string }
type Room = { id: string; players: Player[]; game: Game }
type RoomResponse =
  | { ok: true; roomId: string; playerId: string; players: Player[]; table: ReturnType<typeof viewFor> }
  | { ok: false; error: string }
type ActionResponse = ReturnType<typeof applyAction>
type SocketData = { roomId?: string; playerId?: string }

interface ClientToServerEvents {
  'room:create': (deckKind: DeckKind, ack: (response: RoomResponse) => void) => void
  'room:join': (roomCode: string, ack: (response: RoomResponse) => void) => void
  'table:action': (action: unknown, ack: (response: ActionResponse) => void) => void
}
interface ServerToClientEvents {
  'room:players': (players: Player[]) => void
  'table:state': (table: ReturnType<typeof viewFor>) => void
}

const PORT = Number(process.env.PORT || 3001)
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((origin) => origin.trim())
const MAX_PLAYERS = 8
const roomCodes = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const rooms = new Map<string, Room>()
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(createServer(), {
  cors: { origin: allowedOrigins },
})

function roomCode() {
  let code: string
  do {
    code = Array.from({ length: 4 }, () => roomCodes[randomInt(roomCodes.length)]).join('')
  } while (rooms.has(code))
  return code
}

function publish(room: Room) {
  // Never io.to(room.id).emit('table:state', room.game): its deck and hands are confidential!
  for (const player of room.players) {
    io.to(`${room.id}:${player.id}`).emit('table:state', viewFor(room.game, player.id))
  }
}

io.on('connection', (socket) => {
  socket.on('room:create', (deckKind, ack) => {
    if (typeof ack !== 'function') return
    if (socket.data.roomId) return ack({ ok: false, error: 'You are already in a room.' })
    if (deckKind !== 'french' && deckKind !== 'italian') return ack({ ok: false, error: 'Unknown deck type.' })

    const id = roomCode()
    const player: Player = { id: randomUUID(), name: 'Player 1' }
    const room: Room = { id, players: [player], game: newGame(player.id, deckKind) }
    rooms.set(id, room)
    socket.data.roomId = id
    socket.data.playerId = player.id
    socket.join(id)
    socket.join(`${id}:${player.id}`)
    ack({ ok: true, roomId: id, playerId: player.id, players: room.players, table: viewFor(room.game, player.id) })
    io.to(id).emit('room:players', room.players)
  })

  socket.on('room:join', (rawCode, ack) => {
    if (typeof ack !== 'function') return
    if (socket.data.roomId) return ack({ ok: false, error: 'You are already in a room.' })
    if (typeof rawCode !== 'string' || !/^[A-Z2-9]{4}$/i.test(rawCode)) return ack({ ok: false, error: 'Invalid room code.' })
    const id = rawCode.trim().toUpperCase()
    const room = rooms.get(id)
    if (!room) return ack({ ok: false, error: 'Room not found.' })
    if (room.players.length >= MAX_PLAYERS) return ack({ ok: false, error: 'Room is full.' })

    const player: Player = { id: randomUUID(), name: `Player ${room.players.length + 1}` }
    room.players.push(player)
    addPlayer(room.game, player.id)
    socket.data.roomId = id
    socket.data.playerId = player.id
    socket.join(id)
    socket.join(`${id}:${player.id}`)
    ack({ ok: true, roomId: id, playerId: player.id, players: room.players, table: viewFor(room.game, player.id) })
    io.to(id).emit('room:players', room.players)
    publish(room)
  })

  socket.on('table:action', (action, ack) => {
    if (typeof ack !== 'function') return
    const { roomId, playerId } = socket.data
    const room = roomId ? rooms.get(roomId) : undefined
    if (!room || !playerId || !room.players.some((player) => player.id === playerId)) {
      return ack({ ok: false, error: 'You are not in an active room.' })
    }
    const result = applyAction(room.game, playerId, action, new Set(room.players.map((player) => player.id)))
    ack(result)
    if (result.ok) publish(room)
  })

  socket.on('disconnect', () => {
    const { roomId, playerId } = socket.data
    const room = roomId ? rooms.get(roomId) : undefined
    if (!room || !playerId) return
    // A departing player must not leave an orphaned public reveal on the table.
    applyAction(room.game, playerId, { type: 'hide-hand' })
    room.players = room.players.filter((player) => player.id !== playerId)
    for (const hand of room.game.hands) {
      hand.revealedToPlayerIds = hand.revealedToPlayerIds.filter((id) => id !== playerId )
    }
    // In this first block, disconnected users lose their session. Rejoin tokens
    // and disconnect grace periods are explicitly part of Block 3.
    if (!room.players.length) {
      rooms.delete(room.id)
    } else {
      io.to(room.id).emit('room:players', room.players)
      publish(room)
    }
  })
})

io.httpServer.listen(PORT, () => console.log(`VirtualDecks server listening on http://localhost:${PORT}`))
