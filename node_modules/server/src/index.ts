import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { Server } from 'socket.io'
import {
  createTable,
  type NormalizedPosition,
  type TableGameState,
} from './table.js'

type Player = {
  id: string
  name: string
}

type Room = {
  id: string
  players: Player[]
  table: TableGameState
}

type RoomSuccessResponse = {
  ok: true
  roomId: string
  playerId: string
  players: Player[]
  table: TableGameState
}

type RoomErrorResponse = {
  ok: false
  error: string
}

type RoomResponse =
  | RoomSuccessResponse
  | RoomErrorResponse

type CreateRoomAck = (response: RoomResponse) => void
type JoinRoomAck = (response: RoomResponse) => void

interface ClientToServerEvents {
  'room:create': (
    callback: CreateRoomAck,
  ) => void

  'room:join': (
    roomId: string,
    callback: JoinRoomAck,
  ) => void

  'table:draw': (payload: {
    landingPosition: NormalizedPosition
    spawnFrom?: NormalizedPosition
  }) => void
}

interface ServerToClientEvents {
  'room:players': (players: Player[]) => void
  'table:state': (table: TableGameState) => void
}

interface SocketData {
  roomId?: string
  playerId?: string
}

const PORT = 3001

const rooms = new Map<string, Room>()

const httpServer = createServer()

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>(httpServer, {
  cors: {
    origin: 'http://localhost:5173',
  },
})

function createRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

  let code = ''

  do {
    code = Array.from(
      { length: 4 },
      () => alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join('')
  } while (rooms.has(code))

  return code
}

function createPlayer(room: Room): Player {
  return {
    id: randomUUID(),
    name: `Player ${room.players.length + 1}`,
  }
}

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id)

  socket.on('room:create', (callback) => {
    if (socket.data.roomId) {
      callback({
        ok: false,
        error: 'You are already inside a room.',
      })

      return
    }

    const roomId = createRoomCode()

    const temporaryRoom: Room = {
      id: roomId,
      players: [],
      table: {} as TableGameState,
    }

    const player = createPlayer(temporaryRoom)

    const room: Room = {
      id: roomId,
      players: [player],
      table: createTable(player.id),
    }

    rooms.set(roomId, room)

    socket.join(roomId)

    socket.data.roomId = roomId
    socket.data.playerId = player.id

    console.log(`Room ${roomId} created by ${player.name}`)

    callback({
      ok: true,
      roomId,
      playerId: player.id,
      players: room.players,
      table: room.table,
    })

    io.to(roomId).emit('room:players', room.players)
  })

  socket.on('room:join', (rawRoomId, callback) => {
    if (socket.data.roomId) {
      callback({
        ok: false,
        error: 'You are already inside a room.',
      })

      return
    }

    const roomId = rawRoomId.trim().toUpperCase()

    const room = rooms.get(roomId)

    if (!room) {
      callback({
        ok: false,
        error: 'Room not found.',
      })

      return
    }

    const player = createPlayer(room)

    room.players.push(player)

    room.table.hands.push({
      id: `${player.id}-hand`,
      playerId: player.id,
      cards: [],
    })

    socket.join(roomId)

    socket.data.roomId = roomId
    socket.data.playerId = player.id

    console.log(`${player.name} joined room ${roomId}`)

    callback({
      ok: true,
      roomId,
      playerId: player.id,
      players: room.players,
      table: room.table,
    })

    io.to(roomId).emit('room:players', room.players)
  })

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId
    const playerId = socket.data.playerId

    if (!roomId || !playerId) {
      return
    }

    const room = rooms.get(roomId)

    if (!room) {
      return
    }

    room.players = room.players.filter(
      (player) => player.id !== playerId,
    )

    if (room.players.length === 0) {
      rooms.delete(roomId)

      console.log(`Room ${roomId} deleted`)

      return
    }

    io.to(roomId).emit('room:players', room.players)
  })

  socket.on('table:draw', (payload) => {
    const roomId = socket.data.roomId

    if (!roomId) {
      return
    }

    const room = rooms.get(roomId)

    if (!room) {
      return
    }

    const [drawnCard, ...remainingDeck] =
      room.table.deck

    if (!drawnCard) {
      return
    }

    const maxZIndex = Math.max(
      0,
      ...room.table.looseCards.map(
        (card) => card.zIndex,
      ),
      ...room.table.piles.map(
        (pile) => pile.zIndex,
      ),
    )

    const offset =
      (room.table.looseCards.length % 3) * 0.02

    const looseCard = {
      ...drawnCard,

      faceUp: true,

      position: {
        x: Math.min(
          0.96,
          Math.max(
            0.04,
            payload.landingPosition.x + offset,
          ),
        ),

        y: Math.min(
          0.92,
          Math.max(
            0.08,
            payload.landingPosition.y + offset,
          ),
        ),
      },

      spawnFrom: payload.spawnFrom,

      zIndex: maxZIndex + 1,
    }

    room.table = {
      ...room.table,

      deck: remainingDeck,

      looseCards: [
        ...room.table.looseCards,
        looseCard,
      ],
    }

    io.to(roomId).emit(
      'table:state',
      room.table,
    )
  })
})

httpServer.listen(PORT, () => {
  console.log(`VirtualDecks server running on http://localhost:${PORT}`)
})