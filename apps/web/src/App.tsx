import { useEffect, useMemo, useState } from 'react'
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

type RoomResponse =
  | {
    ok: true
    roomId: string
    playerId: string
    players: Player[]
    table: TableGameState
  }
  | {
    ok: false
    error: string
  }

function getScreenFromHash(): AppScreen {
  return window.location.hash === '#table'
    ? 'table'
    : 'home'
}

function App() {
  const initialScreen = useMemo(() => getScreenFromHash(), [])

  const [screen, setScreen] = useState<AppScreen>(initialScreen)

  const [roomSession, setRoomSession] =
    useState<RoomSession | null>(null)

  const [isConnecting, setIsConnecting] = useState(false)

  const [roomError, setRoomError] =
    useState<string | null>(null)

  useEffect(() => {
    const handleHashChange = () => {
      setScreen(getScreenFromHash())
    }

    window.addEventListener('hashchange', handleHashChange)

    return () => {
      window.removeEventListener(
        'hashchange',
        handleHashChange,
      )
    }
  }, [])

  useEffect(() => {
    function handlePlayers(players: Player[]) {
      setRoomSession((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          players,
        }
      })
    }

    function handleConnectError(error: Error) {
      setIsConnecting(false)
      setRoomError(error.message)
    }

    socket.on('room:players', handlePlayers)
    socket.on('connect_error', handleConnectError)

    return () => {
      socket.off('room:players', handlePlayers)
      socket.off('connect_error', handleConnectError)
    }
  }, [])

  function enterRoom(response: RoomResponse) {
    setIsConnecting(false)

    if (!response.ok) {
      setRoomError(response.error)
      return
    }

    setRoomSession({
      roomId: response.roomId,
      currentPlayerId: response.playerId,
      players: response.players,
      table: response.table,
    })

    setRoomError(null)

    window.location.hash = 'table'
    setScreen('table')
  }

  function createRoom() {
    setRoomError(null)
    setIsConnecting(true)

    if (!socket.connected) {
      socket.connect()
    }

    socket.emit(
      'room:create',
      (response: RoomResponse) => {
        enterRoom(response)
      },
    )
  }

  function joinRoom(roomId: string) {
    setRoomError(null)
    setIsConnecting(true)

    if (!socket.connected) {
      socket.connect()
    }

    socket.emit(
      'room:join',
      roomId,
      (response: RoomResponse) => {
        enterRoom(response)
      },
    )
  }

  function openHome() {
    socket.disconnect()

    setRoomSession(null)
    setRoomError(null)
    setIsConnecting(false)

    window.location.hash = ''
    setScreen('home')
  }

  if (screen === 'table' && roomSession) {
    return (
      <TableSurface
        onBackHome={openHome}
        currentPlayerId={roomSession.currentPlayerId}
        roomId={roomSession.roomId}
        players={roomSession.players}
        initialTableState={roomSession.table}
      />
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