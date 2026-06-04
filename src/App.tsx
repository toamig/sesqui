import { useEffect, useState } from 'react'
import { MainMenu } from './screens/MainMenu'
import { GameScreen } from './screens/GameScreen'
import { RulesScreen } from './screens/RulesScreen'
import { OnlineLobby } from './screens/OnlineLobby'
import { OnlineScreen } from './screens/OnlineScreen'
import { normalizeRoomCode } from './online/protocol'
import { applySkin, readStoredSkin } from './theme'
import type { SkinId } from './theme'
import './App.css'

type LocalMode = 'pvp' | 'ai' | 'watch'
type View = 'menu' | 'game' | 'rules' | 'lobby' | 'online'

interface RoomSession {
  room: string
  role: 'host' | 'guest'
}

/** A ?room=CODE query param is a shared invite link: jump straight into that
 *  room as the guest. Read once on load. */
function readInviteRoom(): RoomSession | null {
  if (typeof window === 'undefined') return null
  const code = normalizeRoomCode(new URLSearchParams(window.location.search).get('room') ?? '')
  return code.length >= 4 ? { room: code, role: 'guest' } : null
}

export default function App() {
  const [skin, setSkin] = useState<SkinId>(readStoredSkin)
  const invite = readInviteRoom()
  const [view, setView] = useState<View>(invite ? 'online' : 'menu')
  const [session, setSession] = useState<RoomSession | null>(invite)
  const [localMode, setLocalMode] = useState<LocalMode>('pvp')

  const changeSkin = (next: SkinId) => {
    setSkin(next)
    applySkin(next)
  }

  // Once an invite link has been consumed, strip ?room= from the URL so a
  // refresh doesn't force-rejoin and the address bar stays clean.
  useEffect(() => {
    if (invite && typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('room')
      window.history.replaceState({}, '', url.toString())
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const enterRoom = (room: string, role: 'host' | 'guest') => {
    setSession({ room, role })
    setView('online')
  }

  const leaveRoom = () => {
    setSession(null)
    setView('menu')
  }

  /** Menu choices route to the right screen. */
  const handleMenuSelect = (target: 'online' | 'pvp' | 'ai' | 'watch' | 'rules') => {
    if (target === 'online') setView('lobby')
    else if (target === 'rules') setView('rules')
    else {
      setLocalMode(target)
      setView('game')
    }
  }

  if (view === 'rules') {
    return <RulesScreen onBack={() => setView('menu')} />
  }

  if (view === 'lobby') {
    return <OnlineLobby onEnter={enterRoom} onBack={() => setView('menu')} />
  }

  if (view === 'online' && session) {
    return (
      <OnlineScreen
        key={`${session.room}-${session.role}`}
        room={session.room}
        role={session.role}
        onLeave={leaveRoom}
      />
    )
  }

  if (view === 'game') {
    return (
      <GameScreen
        mode={localMode}
        onBack={() => setView('menu')}
        onShowRules={() => setView('rules')}
      />
    )
  }

  return <MainMenu skin={skin} onSkinChange={changeSkin} onSelect={handleMenuSelect} />
}
