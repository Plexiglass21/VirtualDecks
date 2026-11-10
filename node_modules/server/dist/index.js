import { createServer } from 'node:http';
import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { Server } from 'socket.io';
import { addPlayer, applyAction, newGame, removePlayer, viewFor } from './game.js';
const PORT = Number(process.env.PORT || 3001);
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((origin) => origin.trim());
const MAX_PLAYERS = 8;
// Defaults are one hour and one minute; values may be lowered in integration tests.
const ROOM_EMPTY_TTL_MS = Math.max(500, Number(process.env.ROOM_EMPTY_TTL_MS || 60 * 60 * 1000));
const CLEANUP_INTERVAL_MS = Math.max(100, Number(process.env.ROOM_CLEANUP_INTERVAL_MS || 60 * 1000));
const ACTION_CACHE_LIMIT = 128;
const roomCodes = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rooms = new Map();
const io = new Server(createServer(), {
    cors: { origin: allowedOrigins },
});
const resumeToken = () => randomBytes(32).toString('hex');
const publicPlayers = (room) => room.players.map((player) => ({
    id: player.id,
    name: player.name,
    online: Boolean(player.socketId),
    isHost: player.id === room.hostPlayerId,
}));
function roomCode() {
    let code;
    do {
        code = Array.from({ length: 4 }, () => roomCodes[randomInt(roomCodes.length)]).join('');
    } while (rooms.has(code));
    return code;
}
function tokenMatches(expected, provided) {
    if (typeof provided !== 'string' || !/^[a-f0-9]{64}$/.test(provided))
        return false;
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
}
function publish(room) {
    // The full Game contains private cards. Only send the per-player sanitized GameView.
    for (const player of room.players) {
        if (player.socketId) {
            io.to(`${room.id}:${player.id}`).emit('table:state', viewFor(room.game, player.id));
        }
    }
}
function broadcast(room) {
    io.to(room.id).emit('room:players', publicPlayers(room));
    publish(room);
}
function roomResponse(room, player) {
    return {
        ok: true, roomId: room.id, playerId: player.id, resumeToken: player.token,
        players: publicPlayers(room), table: viewFor(room.game, player.id),
    };
}
function connectedIds(room) {
    return new Set(room.players.filter((player) => player.socketId).map((player) => player.id));
}
// An explicit leave is different from an interrupted connection: it revokes the token
// and returns the player's cards to the deck before removing their seat.
function depart(room, playerId) {
    const player = room.players.find((candidate) => candidate.id === playerId);
    if (!player)
        return;
    if (player.socketId) {
        const leavingSocket = io.sockets.sockets.get(player.socketId);
        leavingSocket?.leave(room.id);
        leavingSocket?.leave(`${room.id}:${player.id}`);
        if (leavingSocket) {
            leavingSocket.data.roomId = undefined;
            leavingSocket.data.playerId = undefined;
        }
    }
    removePlayer(room.game, playerId);
    room.players = room.players.filter((candidate) => candidate.id !== playerId);
    room.completedActions.delete(playerId);
    if (room.hostPlayerId === playerId && room.players.length)
        room.hostPlayerId = room.players[0].id;
    if (!room.players.length) {
        rooms.delete(room.id);
        return;
    }
    room.emptySince = room.players.some((candidate) => candidate.socketId) ? null : Date.now();
    broadcast(room);
}
io.on('connection', (socket) => {
    function occupy(room, player) {
        // Only one socket at a time may act as a player; an old socket loses authority.
        if (player.socketId && player.socketId !== socket.id) {
            const previous = io.sockets.sockets.get(player.socketId);
            if (previous) {
                previous.data.roomId = undefined;
                previous.data.playerId = undefined;
                previous.disconnect(true);
            }
        }
        player.socketId = socket.id;
        room.emptySince = null;
        socket.data.roomId = room.id;
        socket.data.playerId = player.id;
        socket.join(room.id);
        socket.join(`${room.id}:${player.id}`);
    }
    socket.on('room:create', (deckKind, ack) => {
        if (typeof ack !== 'function')
            return;
        if (socket.data.roomId)
            return ack({ ok: false, error: 'You are already in a room.' });
        if (deckKind !== 'french' && deckKind !== 'italian')
            return ack({ ok: false, error: 'Unknown deck type.' });
        const id = roomCode();
        const player = { id: randomUUID(), name: 'Player 1', token: resumeToken() };
        const room = {
            id, players: [player], hostPlayerId: player.id, nextPlayerNumber: 2,
            game: newGame(player.id, deckKind), emptySince: null, completedActions: new Map(),
        };
        rooms.set(id, room);
        occupy(room, player);
        ack(roomResponse(room, player));
        broadcast(room);
    });
    socket.on('room:join', (rawCode, ack) => {
        if (typeof ack !== 'function')
            return;
        if (socket.data.roomId)
            return ack({ ok: false, error: 'You are already in a room.' });
        if (typeof rawCode !== 'string' || !/^[A-Z2-9]{4}$/i.test(rawCode.trim()))
            return ack({ ok: false, error: 'Invalid room code.' });
        const room = rooms.get(rawCode.trim().toUpperCase());
        if (!room)
            return ack({ ok: false, error: 'Room not found or expired.' });
        if (room.players.length >= MAX_PLAYERS)
            return ack({ ok: false, error: 'Room is full.' });
        const player = { id: randomUUID(), name: `Player ${room.nextPlayerNumber++}`, token: resumeToken() };
        room.players.push(player);
        addPlayer(room.game, player.id);
        occupy(room, player);
        ack(roomResponse(room, player));
        broadcast(room);
    });
    socket.on('room:resume', (credentials, ack) => {
        if (typeof ack !== 'function')
            return;
        if (socket.data.roomId)
            return ack({ ok: false, error: 'You are already in a room.' });
        if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials))
            return ack({ ok: false, error: 'Invalid session.' });
        const { roomId, playerId, token } = credentials;
        if (typeof roomId !== 'string' || typeof playerId !== 'string')
            return ack({ ok: false, error: 'Invalid session.' });
        const room = rooms.get(roomId);
        const player = room?.players.find((candidate) => candidate.id === playerId);
        if (!room || !player || !tokenMatches(player.token, token))
            return ack({ ok: false, error: 'Session not found or expired.' });
        occupy(room, player);
        ack(roomResponse(room, player));
        broadcast(room);
    });
    socket.on('room:leave', (ack) => {
        if (typeof ack !== 'function')
            return;
        const { roomId, playerId } = socket.data;
        const room = roomId ? rooms.get(roomId) : undefined;
        if (!room || !playerId || !room.players.some((player) => player.id === playerId && player.socketId === socket.id)) {
            return ack({ ok: false, error: 'You are not in an active room.' });
        }
        depart(room, playerId);
        ack({ ok: true });
    });
    socket.on('table:action', (action, ack) => {
        if (typeof ack !== 'function')
            return;
        const { roomId, playerId } = socket.data;
        const room = roomId ? rooms.get(roomId) : undefined;
        const player = room?.players.find((candidate) => candidate.id === playerId);
        if (!room || !player || player.socketId !== socket.id) {
            return ack({ ok: false, error: 'You are not in an active room.' });
        }
        if (!action || typeof action !== 'object' || Array.isArray(action))
            return ack({ ok: false, error: 'Invalid action.' });
        const { type, actionId } = action;
        if (typeof actionId !== 'string' || !/^[0-9a-f-]{36}$/.test(actionId)) {
            return ack({ ok: false, error: 'Invalid action ID.' });
        }
        let cache = room.completedActions.get(player.id);
        if (!cache) {
            cache = new Map();
            room.completedActions.set(player.id, cache);
        }
        if (cache.has(actionId))
            return ack(cache.get(actionId));
        if (type === 'reset' && room.hostPlayerId !== player.id) {
            return ack({ ok: false, error: 'Only the room host can reset the table.' });
        }
        const result = applyAction(room.game, player.id, action, connectedIds(room));
        cache.set(actionId, result);
        if (cache.size > ACTION_CACHE_LIMIT)
            cache.delete(cache.keys().next().value);
        ack(result);
        if (result.ok)
            publish(room);
    });
    socket.on('disconnect', () => {
        const { roomId, playerId } = socket.data;
        const room = roomId ? rooms.get(roomId) : undefined;
        const player = room?.players.find((candidate) => candidate.id === playerId);
        if (!room || !player || player.socketId !== socket.id)
            return;
        player.socketId = undefined;
        // A temporary disconnect retains the seat and the private hand. Stop showing
        // previously revealed cards until the owner chooses to share them again.
        applyAction(room.game, player.id, { type: 'hide-hand' });
        for (const hand of room.game.hands) {
            hand.revealedToPlayerIds = hand.revealedToPlayerIds.filter((id) => id !== player.id);
        }
        if (!room.players.some((candidate) => candidate.socketId))
            room.emptySince = Date.now();
        broadcast(room);
    });
});
// No persistent database in V1. An empty room can be resumed for one hour;
// after expiry both room code and all resume tokens cease to work.
const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
        if (room.emptySince !== null && now - room.emptySince >= ROOM_EMPTY_TTL_MS)
            rooms.delete(room.id);
    }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();
io.httpServer.listen(PORT, () => console.log(`VirtualDecks server listening on http://localhost:${PORT}`));
