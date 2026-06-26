import { useEffect, useState } from 'react'
import { MainMenu } from './screens/MainMenu'
import { GameScreen } from './screens/GameScreen'
import { RulesScreen } from './screens/RulesScreen'
import { OnlineHub } from './screens/OnlineHub'
import type { OnlineChoice } from './screens/OnlineHub'
import { OnlineLobby } from './screens/OnlineLobby'
import { MatchSearch } from './screens/MatchSearch'
import { OnlineScreen } from './screens/OnlineScreen'
import { TournamentHub } from './screens/TournamentHub'
import { TournamentLobby } from './screens/TournamentLobby'
import { ProfileScreen } from './screens/ProfileScreen'
import { ReplayScreen } from './screens/ReplayScreen'
import { EngineSelect } from './screens/EngineSelect'
import { Difficulty } from './game/ai/ai'
import type { Player } from './game/types'
import { AccountButton } from './components/AccountButton'
import { AccountDrawer } from './components/AccountDrawer'
import { handleOAuthRedirect } from './online/auth'
import { normalizeRoomCode } from './online/protocol'
import { applySkin, readStoredSkin } from './theme'
import type { SkinId } from './theme'
import './App.css'

type LocalMode = 'pvp' | 'ai' | 'watch'
type View =
  | 'menu'
  | 'game'
  | 'rules'
  | 'online-hub'
  | 'lobby'
  | 'match'
  | 'online'
  | 'profile'
  | 'replay'
  | 'ai-setup'
  | 'tournament-hub'
  | 'tournament-lobby'

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

/** Dev-only deep link to a screen for visual testing (?screen=online-hub etc).
 *  Stripped from production builds so it never affects real users. */
function readDevScreen(): View | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null
  const s = new URLSearchParams(window.location.search).get('screen')
  const allowed: View[] = ['menu', 'game', 'rules', 'online-hub', 'lobby', 'match', 'profile', 'ai-setup']
  return (allowed as string[]).includes(s ?? '') ? (s as View) : null
}

export default function App() {
  const [skin, setSkin] = useState<SkinId>(readStoredSkin)
  const invite = readInviteRoom()
  const devScreen = readDevScreen()
  const [view, setView] = useState<View>(devScreen ?? (invite ? 'online' : 'menu'))
  const [session, setSession] = useState<RoomSession | null>(invite)
  const [localMode, setLocalMode] = useState<LocalMode>('pvp')
  const [matchRanked, setMatchRanked] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  // Where "Back" returns to from the profile page (the screen it was opened from).
  const [profileReturn, setProfileReturn] = useState<View>('menu')
  // The replay currently open in the step-through viewer.
  const [replayId, setReplayId] = useState<number | null>(null)
  const [tournamentCode, setTournamentCode] = useState<string | null>(null)
  const [tournamentReturn, setTournamentReturn] = useState<string | null>(null)
  // vs-Computer pre-game choices (engine + side); the nonce forces a fresh game
  // each time "Start" is pressed, even with unchanged settings.
  const [aiEngine, setAiEngine] = useState<Difficulty>(Difficulty.Neural)
  const [aiSide, setAiSide] = useState<Player>('V')
  const [aiStart, setAiStart] = useState(0)

  const changeSkin = (next: SkinId) => {
    setSkin(next)
    applySkin(next)
  }

  // On mount: complete any Google OAuth return (exchange ?code= for a session,
  // clean the URL), then strip a consumed ?room= invite param. If we just came
  // back from a Google sign-in, reopen the account drawer so the player sees
  // their now-signed-in account.
  useEffect(() => {
    handleOAuthRedirect().then((wasOAuth) => {
      if (wasOAuth) setAccountOpen(true)
    })
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

  // Enter a tournament match game, remembering the bracket to return to.
  const playTournamentMatch = (gameCode: string, role: 'host' | 'guest') => {
    setTournamentReturn(tournamentCode)
    enterRoom(gameCode, role)
  }
  const watchTournamentMatch = (gameCode: string) => {
    setTournamentReturn(tournamentCode)
    enterRoom(gameCode, 'guest')
  }
  // Leaving an online game returns to its tournament bracket if it came from one,
  // otherwise to the menu.
  const leaveOnlineGame = () => {
    if (tournamentReturn) {
      setSession(null)
      setTournamentCode(tournamentReturn)
      setTournamentReturn(null)
      setView('tournament-lobby')
    } else {
      leaveRoom()
    }
  }

  /** Menu choices route to the right screen. */
  const handleMenuSelect = (target: 'online' | 'pvp' | 'ai' | 'watch' | 'rules') => {
    if (target === 'online') setView('online-hub')
    else if (target === 'rules') setView('rules')
    else if (target === 'ai') {
      setLocalMode('ai')
      setView('ai-setup')
    } else {
      setLocalMode(target)
      setView('game')
    }
  }

  /** Online hub choices: friend room, or casual/ranked matchmaking. */
  const handleOnlineChoice = (choice: OnlineChoice) => {
    if (choice === 'friend') setView('lobby')
    else if (choice === 'tournaments') setView('tournament-hub')
    else {
      setMatchRanked(choice === 'ranked')
      setView('match')
    }
  }

  /** Open the full profile page from the account drawer, remembering where we
   *  were so "Back" returns there. */
  const openProfile = () => {
    setProfileReturn(view)
    setAccountOpen(false)
    setView('profile')
  }

  /** Open a saved replay in the step-through viewer (from the profile list). */
  const openReplay = (id: number) => {
    setReplayId(id)
    setView('replay')
  }

  // The active screen. The account button + drawer render globally on top of
  // whichever screen this is, so the account is reachable from anywhere without
  // navigating away (you keep your place, even mid-game).
  let screen
  if (view === 'rules') {
    screen = <RulesScreen onBack={() => setView('menu')} />
  } else if (view === 'online-hub') {
    screen = (
      <OnlineHub
        onChoose={handleOnlineChoice}
        onBack={() => setView('menu')}
        onRequireAuth={() => setAccountOpen(true)}
      />
    )
  } else if (view === 'lobby') {
    screen = <OnlineLobby onEnter={enterRoom} onBack={() => setView('online-hub')} />
  } else if (view === 'match') {
    screen = (
      <MatchSearch
        ranked={matchRanked}
        onCancel={() => setView('online-hub')}
        onMatched={enterRoom}
      />
    )
  } else if (view === 'tournament-hub') {
    screen = (
      <TournamentHub
        onBack={() => setView('online-hub')}
        onEnterLobby={(code) => {
          setTournamentCode(code)
          setView('tournament-lobby')
        }}
      />
    )
  } else if (view === 'tournament-lobby' && tournamentCode) {
    screen = (
      <TournamentLobby
        key={tournamentCode}
        code={tournamentCode}
        onLeave={() => setView('tournament-hub')}
        onPlayMatch={playTournamentMatch}
        onWatchMatch={watchTournamentMatch}
      />
    )
  } else if (view === 'online' && session) {
    screen = (
      <OnlineScreen
        key={`${session.room}-${session.role}`}
        room={session.room}
        role={session.role}
        onLeave={leaveOnlineGame}
      />
    )
  } else if (view === 'profile') {
    screen = (
      <ProfileScreen
        onBack={() => setView(profileReturn)}
        onAccount={() => setAccountOpen(true)}
        onOpenReplay={openReplay}
      />
    )
  } else if (view === 'replay' && replayId !== null) {
    screen = <ReplayScreen key={replayId} replayId={replayId} onBack={() => setView('profile')} />
  } else if (view === 'ai-setup') {
    screen = (
      <EngineSelect
        initialEngine={aiEngine}
        initialSide={aiSide}
        onStart={(engine, side) => {
          setAiEngine(engine)
          setAiSide(side)
          setAiStart((n) => n + 1)
          setView('game')
        }}
        onBack={() => setView('menu')}
      />
    )
  } else if (view === 'game') {
    screen = (
      <GameScreen
        key={localMode === 'ai' ? `ai-${aiStart}` : localMode}
        mode={localMode}
        initialDifficulty={localMode === 'ai' ? aiEngine : undefined}
        initialHumanColor={localMode === 'ai' ? aiSide : undefined}
        onChangeOpponent={localMode === 'ai' ? () => setView('ai-setup') : undefined}
        onBack={() => setView('menu')}
        onShowRules={() => setView('rules')}
      />
    )
  } else {
    screen = <MainMenu onSelect={handleMenuSelect} />
  }

  return (
    <>
      {screen}
      <AccountButton onOpen={() => setAccountOpen(true)} />
      <AccountDrawer
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        onViewProfile={openProfile}
        skin={skin}
        onSkinChange={changeSkin}
      />
    </>
  )
}
