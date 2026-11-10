import { useEffect, useMemo, useRef, useState } from 'react'
import { HomeScreen } from './components/home/HomeScreen'
import { TableSurface } from './components/table/TableSurface'
import { socket } from './multiplayer/socket'
import type { Player } from './types/player'
import type { TableGameState } from './types/game'

type AppScreen = 'home' | 'table'
type RoomSession = {
  roomId: string
  currentPlayerId: string
  players: Player[]
  table: TableGameState
}
type ResumeCredentials = { roomId: string; playerId: string; token: string }
type RoomResponse =
  | { ok: true; roomId: string; playerId: string; resumeToken: string; players: Player[]; table: TableGameState }
  | { ok: false; error: string }
type LeaveResponse = { ok: true } | { ok: false; error: string }
type ConnectionStatus = 'connected' | 'reconnecting' | 'resuming'

const SESSION_KEY = 'virtualdecks:room-session:v1'

function getSavedSession(): ResumeCredentials | null {
  try {
    const value = sessionStorage.getItem(SESSION_KEY)
    if (!value) return null
    const candidate: unknown = JSON.parse(value)
    if (!candidate || typeof candidate !== 'object') return null
    const { roomId, playerId, token } = candidate as Record<string, unknown>
    if (typeof roomId !== 'string' || !/^[A-Z2-9]{4}$/.test(roomId) ||
      typeof playerId !== 'string' || !/^[\w-]{20,50}$/.test(playerId) ||
      typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null
    return { roomId, playerId, token }
  } catch {
    return null
  }
}

function saveSession(session: ResumeCredentials | null) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Storage can be disabled. Multiplayer still works until this tab reloads.
  }
}

function saveNickname(nickname: string) {
  try { localStorage.setItem('virtualdecks:last-nickname', nickname) } catch { /* optional */ }
}

function App() {
  const initialScreen = useMemo<AppScreen>(() => window.location.hash === '#table' ? 'table' : 'home', [])
  const [screen, setScreen] = useState<AppScreen>(initialScreen)
  const [roomSession, setRoomSession] = useState<RoomSession | null>(null)
  const [isConnecting, setIsConnecting] = useState(Boolean(getSavedSession()))
  const [roomError, setRoomError] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('reconnecting')
  const [connectionIssue, setConnectionIssue] = useState<string | null>(null)
  // StrictMode may set up the connection effect twice. Resume only once per socket.
  const resumeInFlight = useRef<string | null>(null)
  const boundSocketId = useRef<string | null>(null)

  function enterRoom(response: Extract<RoomResponse, { ok: true }>) {
    boundSocketId.current = socket.id ?? null
    saveSession({ roomId: response.roomId, playerId: response.playerId, token: response.resumeToken })
    setRoomSession({
      roomId: response.roomId,
      currentPlayerId: response.playerId,
      players: response.players,
      table: response.table,
    })
    setIsConnecting(false)
    setRoomError(null)
    setConnectionIssue(null)
    setConnectionStatus('connected')
    window.location.hash = 'table'
    setScreen('table')
  }

  useEffect(() => {
    function handlePlayers(players: Player[]) {
      setRoomSession((current) => current ? { ...current, players } : null)
    }

    function handleConnect() {
      const saved = getSavedSession()
      const connectionId = socket.id
      if (!saved || !connectionId || boundSocketId.current === connectionId || resumeInFlight.current === connectionId) return
      resumeInFlight.current = connectionId
      setIsConnecting(true)
      setConnectionStatus('resuming')
      setConnectionIssue(null)
      socket.timeout(8000).emit('room:resume', saved, (error: Error | null, response?: RoomResponse) => {
        console.log('[VirtualDecks] Resume result:', {
          connected: socket.connected,
          socketId: socket.id,
          success: response?.ok ?? false,
          error: error?.message ??
            (response?.ok === false ? response.error : null),
        })
        if (resumeInFlight.current !== connectionId) return // Reply from a superseded connection.
        resumeInFlight.current = null
        if (error || !response) {
          setConnectionStatus('reconnecting')
          setConnectionIssue('Could not restore the session. Check your connection and reconnect.')
          setIsConnecting(false)
          return
        }
        if (response.ok === false) {
          saveSession(null)
          setRoomSession(null)
          setIsConnecting(false)
          setConnectionIssue(null)
          setRoomError(response.error)
          window.location.hash = ''
          setScreen('home')
          return
        }
        enterRoom(response)
      })
    }

    function handleDisconnect(reason: string) {
      resumeInFlight.current = null
      boundSocketId.current = null
      if (!getSavedSession()) return
      setConnectionStatus('reconnecting')
      setConnectionIssue(reason === 'io server disconnect'
        ? 'This session was opened in another tab. Refresh this tab to take it back.'
        : null)
    }

    function handleConnectError(error: Error) {
      setIsConnecting(false)
      if (getSavedSession()) {
        setConnectionStatus('reconnecting')
        setConnectionIssue(`Connection interrupted: ${error.message}`)
      } else {
        setRoomError(error.message)
      }
    }

    function handleHashChange() {
      // Keep the table visible if its URL hash is temporarily changed.
      setScreen(window.location.hash === '#table' ? 'table' : 'home')
    }

    socket.on('room:players', handlePlayers)
    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect_error', handleConnectError)
    window.addEventListener('hashchange', handleHashChange)

    if (getSavedSession()) {
      if (socket.connected) handleConnect()
      else socket.connect()
    }

    return () => {
      socket.off('room:players', handlePlayers)
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('connect_error', handleConnectError)
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  function handleRoomResponse(response: RoomResponse | undefined, error: Error | null) {
    setIsConnecting(false)
    if (error || !response) {
      setRoomError('The server did not respond. Try again.')
      return
    }
    if (response.ok === false) {
      setRoomError(response.error)
      return
    }
    enterRoom(response)
  }

  function createRoom(deckKind: 'french' | 'italian', nickname: string) {
    setRoomError(null)
    setIsConnecting(true)
    if (!socket.connected) socket.connect()
    socket.timeout(8000).emit('room:create', deckKind, nickname, (error: Error | null, response?: RoomResponse) => {
      if (response?.ok) saveNickname(nickname)
      handleRoomResponse(response, error)
    })
  }

  function joinRoom(roomId: string, nickname: string) {
    setRoomError(null)
    setIsConnecting(true)
    if (!socket.connected) socket.connect()
    socket.timeout(8000).emit('room:join', roomId, nickname, (error: Error | null, response?: RoomResponse) => {
      if (response?.ok) saveNickname(nickname)
      handleRoomResponse(response, error)
    })
  }

  function openHome() {
    if (!window.confirm('Leave this room permanently? Your hand will be returned to the deck.')) return
    if (!socket.connected) {
      setConnectionIssue('Reconnect to the server before leaving the room.')
      return
    }
    socket.timeout(8000).emit('room:leave', (error: Error | null, response?: LeaveResponse) => {
      if (error || !response || response.ok === false) {
        setConnectionIssue(response && response.ok === false ? response.error : 'Could not leave the room. Try again.')
        return
      }
      saveSession(null)
      resumeInFlight.current = null
      boundSocketId.current = null
      socket.disconnect()
      setRoomSession(null)
      setRoomError(null)
      setConnectionIssue(null)
      setIsConnecting(false)
      window.location.hash = ''
      setScreen('home')
    })
  }

  function retryConnection() {
    if (!getSavedSession()) return
    setConnectionStatus('resuming')
    setConnectionIssue(null)
    socket.disconnect()
    socket.connect()
  }

  if (screen === 'table' && roomSession) {
    return (
      <TableSurface
        onBackHome={openHome}
        currentPlayerId={roomSession.currentPlayerId}
        roomId={roomSession.roomId}
        players={roomSession.players}
        initialTableState={roomSession.table}
        connectionStatus={connectionStatus}
        connectionIssue={connectionIssue}
        onRetryConnection={retryConnection}
      />
    )
  }

  if (!roomSession && getSavedSession()) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-night text-ivory">
        <h1 className="font-display text-3xl">
          VirtualDecks
        </h1>

        <p className="text-sm text-ivory/60">
          {connectionStatus === 'resuming'
            ? 'Restoring your session...'
            : 'Reconnecting to your table...'}
        </p>

        {connectionIssue && (
          <p className="max-w-md text-center text-sm text-red-400">
            {connectionIssue}
          </p>
        )}

        <button
          type="button"
          onClick={retryConnection}
          className="rounded-md border border-ivory/30 px-5 py-2 text-sm"
        >
          Retry connection
        </button>
      </main>
    )
  }

  return (
    <HomeScreen
      onCreateRoom={createRoom}
      onJoinRoom={joinRoom}
      isConnecting={isConnecting}
      roomError={roomError}
    />
  )
}

export default App
