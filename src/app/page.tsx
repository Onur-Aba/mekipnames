"use client";

import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Hand, Search, Users, ShieldAlert, Crown, Copy, Settings, ArrowRight, AlertTriangle, ThumbsUp, ThumbsDown, X, Play, LogIn, Lock, Unlock, UserPlus, Info, ScrollText, LogOut, Clock, MessageSquare, Eye, EyeOff, Pencil, Sparkles, RotateCcw, Swords, FastForward, Volume2, VolumeX } from 'lucide-react';
import { Player, Room, Card, Team, Role } from '@/types';
import bcrypt from 'bcryptjs';

const BACKEND_URL = 'https://mekipnamessocket.mekiphub.com';

const FALLBACK_WORDS = ["ELMA", "AJAN", "KÖPEK", "UZAY", "MISIR", "ALTIN", "HÜCRE", "ZAMAN", "KILIÇ", "BOMBA", "MASA", "KEDİ", "KUŞ", "DENİZ", "OKUL", "OYUN", "TELEFON", "KALP", "RÜZGAR", "ATEŞ", "BİLGİSAYAR", "GÖZLÜK", "DUVAR", "KAPI", "PENCERE"];

// BACKEND NE GÖNDERİRSE GÖNDERSİN BUNLAR HER ZAMAN "ÖZEL KELİME" SAYILACAK KALKAN LİSTE
const KNOWN_SPECIALS = [
    'İSTANBUL', 'TÜRKİYE', 'LONDRA', 'İNGİLTERE', 'PARİS', 'FRANSA', 'TOKYO', 'JAPONYA', 
    'BERLİN', 'ALMANYA', 'ROMA', 'İTALYA', 'MADRİD', 'İSPANYA', 'MOSKOVA', 'AMERİKA', 
    'PEKİN', 'ÇİN', 'BAKÜ', 'AZERBAYCAN'
];

// ORTAK CSS: Aralığı açılmış, hareketi DURDURULMUŞ sabit yatay çizgiler
const GlobalStyles = () => (
  <style dangerouslySetInnerHTML={{__html: `
    .static-scanlines {
      background: linear-gradient(to bottom, rgba(0,0,0,0) 50%, rgba(0,0,0,0.3) 50%);
      background-size: 100% 16px;
    }

    /* Yeni blur'lü arka plan katmanı */
    .bg-image-overlay {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(
          to bottom,
          rgba(0,0,0,0.72),
          rgba(8,8,12,0.78)
        ),
        url('/bg.png');

      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;

      filter: blur(5px);
      transform: scale(1.06);

      opacity: 55;

      pointer-events: none;
      z-index: 0;
    }

    .garage-card-perspective {
      perspective: 800px;
      perspective-origin: 50% 50%;
      transform-style: preserve-3d;
    }

    .garage-card-door {
      transform-origin: top center;
      transform-style: preserve-3d;
      backface-visibility: hidden;
    }

    .safe-wrap {
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .bottom-clue-word-scroll {
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.45) transparent;
}

.bottom-clue-word-scroll::-webkit-scrollbar {
  height: 6px;
}

.bottom-clue-word-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.bottom-clue-word-scroll::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.45);
  border-radius: 999px;
}
    
    .card-word-pill-scroll {
      max-width: 100%;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.45) transparent;
    }

    .card-word-pill-scroll::-webkit-scrollbar {
      height: 5px;
    }

    .card-word-pill-scroll::-webkit-scrollbar-track {
      background: transparent;
    }

    .card-word-pill-scroll::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.38);
      border-radius: 999px;
    }
  `}} />
);

export default function CodenamesGame() {
  // GÖRÜNÜM YÖNETİMİ
  const [view, setView] = useState<'login' | 'room_list' | 'lobby' | 'playing'>('login');
  const [playerName, setPlayerName] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [rooms, setRooms] = useState<any[]>([]);
  const [room, setRoom] = useState<any | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [hostPresent, setHostPresent] = useState(true);

  // ÇOKLU SEKME (MULTI-TAB) YÖNETİMİ
  const [sessionConflict, setSessionConflict] = useState(false);
  const myTabId = useRef(Math.random().toString(36).substring(2, 10));

  // VİDEODAKİ KUTU AÇILMA ANİMASYONU İÇİN DURUMLAR
  const [isDealingPhase, setIsDealingPhase] = useState(false);
  const hasDealtRef = useRef(false);
  
  // SIRA DEĞİŞTİ ANİMASYONU İÇİN
  const [showTurnBanner, setShowTurnBanner] = useState<Team | null>(null);
  const prevTurnRef = useRef<Team | null>(null);

  // İPUCU ANİMASYONU İÇİN (Ortadan Sola Uçuş)
  const [clueBanner, setClueBanner] = useState<{word: string, count: number|string, team: string} | null>(null);
  const [winnerBanner, setWinnerBanner] = useState<Team | null>(null);
  const [assassinRevealCard, setAssassinRevealCard] = useState<any | null>(null);

  // YAZIYA GİZLİCE BAKMA (PEEKING) İÇİN LOKAL STATE
  const [peekedCards, setPeekedCards] = useState<Set<number>>(new Set());

  // ÖZEL KELİME EKLEME DURUMLARI (MODAL VE LOBİ YÖNETİMİ)
  const [showWordModal, setShowWordModal] = useState(false);
  const [customWordsInput, setCustomWordsInput] = useState('');
  const [customWordProb, setCustomWordProb] = useState<number>(0);

  // GENEL SES SEVİYESİ (Default 100% -> 1)
  const [volume, setVolume] = useState(1);

  const roomRef = useRef<any>(null);
  useEffect(() => { roomRef.current = room; }, [room]);

  // ORTAK DEĞİŞKENLER
  const mePlayer = room?.players?.find((p: any) => p.sessionId === sessionId);
  const isMyTurn = room?.currentTurn === mePlayer?.team;
  const isSpymasterTurn = room?.turnPhase === 'spymaster';
  const isOperativeTurn = room?.turnPhase === 'operative';
  const isGameOver = room?.status?.includes('_won') || false;

  // ODA OLUŞTURMA
  const [createName, setCreateName] = useState('');
  const [createPass, setCreatePass] = useState('');
  const [pendingRoomId, setPendingRoomId] = useState<string | null>(null);

  // TANIŞMA (MEETING) SİSTEMİ VE TAKIM İSİMLERİ
  const [meetingView, setMeetingView] = useState(false);
  const [introTarget, setIntroTarget] = useState<any | null>(null);
  const [introTimer, setIntroTimer] = useState(0);
  const [meetingResults, setMeetingScores] = useState<Record<string, any>>({}); 
  const [localRedName, setLocalRedName] = useState('KIRMIZI TAKIM');
  const [localBlueName, setLocalBlueName] = useState('MAVİ TAKIM');
  
  // TAKIM İSMİ DÜZENLEME DURUMLARI
  const [isEditingRed, setIsEditingRed] = useState(false);
  const [isEditingBlue, setIsEditingBlue] = useState(false);

  // AYRILMA ONAY MODALI
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // KICK ENTEGRASYONU
  const [kickEnabled, setKickEnabled] = useState(false);
  const [kickChannelName, setKickChannelName] = useState('');
  const [kickConfirmed, setKickConfirmed] = useState(false);
  const [lobbyVotes, setLobbyVotes] = useState<Record<string, string>>({});
  const [kickVotes, setKickVotes] = useState({ likes: 0, dislikes: 0, voters: new Set<string>() });

  // OYUN İÇİ (PLAYING)
  const [clueWord, setClueWord] = useState('');
  const [clueCount, setClueCount] = useState<number | 'unlimited'>(1);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [turnTimer, setTurnTimer] = useState(60);
  const [showRoomCode, setShowRoomCode] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameModalInput, setNameModalInput] = useState('');

  // SES EFEKTİ REFERANSI
  const tickAudioRef = useRef<HTMLAudioElement | null>(null);

  // SES SEVİYESİ DEĞİŞTİĞİNDE UYGULA
  useEffect(() => {
    if (tickAudioRef.current) {
        tickAudioRef.current.volume = volume;
    }
  }, [volume]);

  // ÇOKLU SEKME (MULTI-TAB) YÖNETİMİ
  useEffect(() => {
      localStorage.setItem('codenames_active_tab', myTabId.current);
      
      const handleStorage = (e: StorageEvent) => {
          if (e.key !== 'codenames_active_tab') return;

          if (e.newValue && e.newValue !== myTabId.current) {
              setSessionConflict(true);
          } else if (e.newValue === myTabId.current) {
              setSessionConflict(false);
          }
      };

      const handleFocus = () => {
          const activeTab = localStorage.getItem('codenames_active_tab');
          if (activeTab && activeTab !== myTabId.current) {
              setSessionConflict(true);
          }
      };
      
      window.addEventListener('storage', handleStorage);
      window.addEventListener('focus', handleFocus);
      return () => {
          window.removeEventListener('storage', handleStorage);
          window.removeEventListener('focus', handleFocus);
      };
  }, []);

  const resolveConflict = () => {
      localStorage.setItem('codenames_active_tab', myTabId.current);
      setSessionConflict(false);

      if (socket && !socket.connected) {
          socket.connect();
      }

      const currentRoom = roomRef.current;
      if (currentRoom?.id) {
          socket?.emit('joinRoom', currentRoom.id);
      }
  };

  // SOCKET.IO BAĞLANTISI BAŞLATMA
  useEffect(() => {
    const newSocket = io(BACKEND_URL);
    setSocket(newSocket);
    return () => { newSocket.disconnect(); };
  }, []);

  // 1. OTURUM VE URL KONTROLÜ
  useEffect(() => {
    const stored = localStorage.getItem('codenames_session');
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get('room');

    if (joinId) setPendingRoomId(joinId);

    if (stored) {
      const data = JSON.parse(stored);
      if (data.expiresAt > Date.now()) {
        setSessionId(data.sessionId);
        setPlayerName(data.playerName);
        if (joinId) {
          handleJoinRoom(joinId, data.sessionId, data.playerName);
          setPendingRoomId(null);
        } else {
          setView('room_list');
        }
      } else {
        localStorage.removeItem('codenames_session');
      }
    }
    
    if (joinId) window.history.replaceState(null, '', window.location.pathname);

    if (typeof window !== 'undefined') {
        tickAudioRef.current = new Audio('/tick.mp3');
        if (tickAudioRef.current) tickAudioRef.current.volume = volume;
    }
  }, []);

  useEffect(() => {
    if (view === 'room_list') fetchRooms();
  }, [view]);

  const fetchRooms = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/rooms`);
      if (res.ok) {
        const data = await res.json();
        setRooms(data);
      }
    } catch (e) {
      console.error("Odalar çekilemedi:", e);
    }
  };

  const getRoomAfterPlayerLeaves = (currentRoom: any, leavingSessionId: string) => {
    if (!currentRoom?.players) return currentRoom;

    const leavingPlayer = currentRoom.players.find((p: any) => p.sessionId === leavingSessionId);
    const remainingPlayers = currentRoom.players.filter((p: any) => p.sessionId !== leavingSessionId);

    if (remainingPlayers.length === 0) {
      return { ...currentRoom, players: [], status: 'deleted' };
    }

    if (leavingPlayer?.isHost || !remainingPlayers.some((p: any) => p.isHost)) {
      const reassignedPlayers = remainingPlayers.map((p: any, index: number) => ({
        ...p,
        isHost: index === 0
      }));

      const stillHasHost = reassignedPlayers.some((p: any) => p.isHost);

        if (!stillHasHost && reassignedPlayers.length > 0) {
            reassignedPlayers[0] = {
                ...reassignedPlayers[0],
                isHost: true
            };
        }

        return {
            ...currentRoom,
            players: reassignedPlayers
        };
    }

    return { ...currentRoom, players: remainingPlayers };
  };

  useEffect(() => {
    if (room?.settings?.redName) setLocalRedName(room.settings.redName);
    if (room?.settings?.blueName) setLocalBlueName(room.settings.blueName);
    
    // SIRA DEĞİŞTİ ANİMASYONU KONTROLÜ
    if (room?.currentTurn && prevTurnRef.current !== null && prevTurnRef.current !== room.currentTurn && !room.status.includes('_won') && view === 'playing') {
        setShowTurnBanner(room.currentTurn);
        setTimeout(() => setShowTurnBanner(null), 3000);
    }
    prevTurnRef.current = room?.currentTurn || null;

    if (room?.status === 'red_won') {
        setWinnerBanner('red');
        setTimeout(() => setWinnerBanner(null), 4200);
    } else if (room?.status === 'blue_won') {
        setWinnerBanner('blue');
        setTimeout(() => setWinnerBanner(null), 4200);
    }

  }, [room?.settings?.redName, room?.settings?.blueName, room?.currentTurn, room?.status, view]);

  // YENİ İPUCU GELDİĞİNDE ANİMASYONU TETİKLEME VE TEMİZLEME
  useEffect(() => {
      if (clueBanner) {
          const timer = setTimeout(() => setClueBanner(null), 3000);
          return () => clearTimeout(timer);
      }
  }, [clueBanner]);

  // Oyun içi zamanlayıcı ve Süre Bittiğinde Sıra Değişimi
  useEffect(() => {
     if (view === 'playing' && room && !room.status.includes('_won')) {
        const timeLimit = room.turnPhase === 'spymaster' ? room.settings.spymasterTime : room.settings.operativeTime;
        setTurnTimer(timeLimit);
        
        if (tickAudioRef.current) {
            tickAudioRef.current.pause();
            tickAudioRef.current.currentTime = 0;
        }
     }
  }, [room?.currentTurn, room?.turnPhase, view]);

  // BACKEND ZAMANLAYICI DİNLEYİCİSİ
  useEffect(() => {
    if (!socket) return;
    const handleTimerUpdate = (timeLeft: number) => {
        setTurnTimer(timeLeft);
    };
    socket.on('timerUpdate', handleTimerUpdate);
    return () => {
        socket.off('timerUpdate', handleTimerUpdate);
    };
  }, [socket]);

  // HOST TARAFINDAN BACKEND ZAMANLAYICISINI TETİKLEME
  useEffect(() => {
     if (view === 'playing' && room && !room.status.includes('_won') && mePlayer?.isHost) {
        // Animasyon sürerken sayacı durdur
        if (isDealingPhase) {
            socket?.emit('stopTimer', room.id);
            return;
        }
        // Animasyon bittiğinde veya sıra değiştiğinde sayacı başlat
        const timeLimit = room.turnPhase === 'spymaster' ? room.settings.spymasterTime : room.settings.operativeTime;
        socket?.emit('startTimer', { roomId: room.id, duration: timeLimit });
     }
  }, [room?.currentTurn, room?.turnPhase, room?.status, isDealingPhase, mePlayer?.isHost, view]);

  // SÜRE BİTİMİ VE SES EFEKTİ KONTROLÜ
  useEffect(() => {
     if (view === 'playing') {
         // Son 10 saniye uyarı sesi
         if (turnTimer === 10 && turnTimer > 0) {
             if (tickAudioRef.current) {
                 tickAudioRef.current.currentTime = 0;
                 tickAudioRef.current.play().catch(e => console.log("Ses oynatılamadı:", e));
             }
         } 
         // Süre yeniden 10'dan büyükse veya 0'sa sesi durdur
         else if ((turnTimer > 10 || turnTimer === 0) && tickAudioRef.current) {
             tickAudioRef.current.pause();
             tickAudioRef.current.currentTime = 0;
         }

         // Süre Sıfırlandığında OTOMATİK SIRA DEĞİŞİMİ
         if (turnTimer === 0 && room && !room.status.includes('_won') && mePlayer?.isHost && !isDealingPhase) {
             let updatedRoom = { ...room };
             
             const log = { id: Date.now(), type: 'timeout', team: updatedRoom.currentTurn, playerName: 'Sistem', word: 'SÜRE BİTTİ', color: 'neutral' };
             updatedRoom.gameLogs = [...(updatedRoom.gameLogs || []), log];

             updatedRoom.turnPhase = 'spymaster';
             updatedRoom.currentTurn = updatedRoom.currentTurn === 'red' ? 'blue' : 'red';
             updatedRoom.currentClue = null;
             updatedRoom.cards = clearAllCardVotes(updatedRoom.cards || []);
             
             broadcastSync(updatedRoom);
         }
     }
  }, [turnTimer, view, isDealingPhase]);

  if (room?.status?.includes('_won')) {
     socket?.emit('stopTimer', room.id);
     if (tickAudioRef.current) {
         tickAudioRef.current.pause();
         tickAudioRef.current.currentTime = 0;
     }
  }

  // 2. KICK WEBSOCKET BAĞLANTISI
  useEffect(() => {
    if (!mePlayer?.isHost || !kickEnabled || !kickConfirmed || !introTarget || !kickChannelName.trim()) return;

    let ws: WebSocket | null = null;
    let cancelled = false;
    const controllers = new Set<AbortController>();

    const normalizeKickChannelName = (value: string) => {
      return value
        .trim()
        .replace(/^@/, '')
        .replace(/^https?:\/\/(www\.)?kick\.com\//i, '')
        .split(/[/?#]/)[0]
        .trim();
    };

    const fetchJsonWithTimeout = async (url: string) => {
      const controller = new AbortController();
      controllers.add(controller);
      const timeout = window.setTimeout(() => controller.abort(), 8000);

      try {
        const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const text = await res.text();
        if (!text) throw new Error('Boş Kick cevabı');

        return JSON.parse(text);
      } finally {
        window.clearTimeout(timeout);
        controllers.delete(controller);
      }
    };

    const getChatroomId = async (channelName: string) => {
      const safeChannelName = normalizeKickChannelName(channelName);
      if (!safeChannelName) return null;

      const kickUrls = [
        `https://kick.com/api/v2/channels/${encodeURIComponent(safeChannelName)}/chatroom`,
        `https://kick.com/api/v2/channels/${encodeURIComponent(safeChannelName)}`
      ];

      const makeProxyUrls = (url: string) => [
        url,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        `https://corsproxy.io/?${encodeURIComponent(url)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
      ];

      for (const kickUrl of kickUrls) {
        for (const requestUrl of makeProxyUrls(kickUrl)) {
          if (cancelled) return null;

          try {
            const data = await fetchJsonWithTimeout(requestUrl);
            const chatroomId = data?.id || data?.chatroom?.id || data?.chatroom_id;
            if (chatroomId) return String(chatroomId);
          } catch (err) {
            if (cancelled) return null;
          }
        }
      }

      return null;
    };

    const connectToKick = async () => {
      try {
        const chatroomId = await getChatroomId(kickChannelName);
        if (cancelled || !chatroomId) return;

        ws = new WebSocket('wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=7.6.0&flash=false');

        ws.onopen = () => {
          if (!ws || cancelled) return;
          ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { auth: '', channel: `chatrooms.${chatroomId}.v2` } }));
        };

        ws.onmessage = (e) => {
          if (cancelled) return;

          try {
            const wsData = JSON.parse(e.data);

            if (wsData.event === 'pusher:ping' && ws) {
              ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
              return;
            }

            if (!String(wsData.event || '').includes('ChatMessageEvent')) return;

            const chat = typeof wsData.data === 'string' ? JSON.parse(wsData.data) : wsData.data;
            const msg = String(chat?.content ?? '').trim();
            const user = String(chat?.sender?.username || chat?.sender?.slug || chat?.sender?.id || '').trim();

            if ((msg === '1' || msg === '0') && user) {
              setKickVotes(prev => {
                if (prev.voters.has(user)) return prev;

                const voters = new Set(prev.voters);
                voters.add(user);

                const updated = {
                  likes: msg === '1' ? prev.likes + 1 : prev.likes,
                  dislikes: msg === '0' ? prev.dislikes + 1 : prev.dislikes,
                  voters
                };

                socket?.emit('kickUpdate', {
                  roomId: roomRef.current?.id,
                  payload: { likes: updated.likes, dislikes: updated.dislikes }
                });

                return updated;
              });
            }
          } catch (err) {
            console.warn('Kick mesajı okunamadı:', err);
          }
        };

        ws.onerror = () => {
          if (!cancelled) console.warn('Kick websocket bağlantısı hata verdi.');
        };
      } catch (err) {
        if (!cancelled) console.warn('Kick bağlantısı kurulamadı:', err);
      }
    };

    connectToKick();

    return () => {
      cancelled = true;
      controllers.forEach(controller => controller.abort());
      controllers.clear();
      if (ws) ws.close();
    };
  }, [introTarget, kickEnabled, kickConfirmed, kickChannelName, mePlayer?.isHost, socket]);

  // 3. SOCKET.IO SİSTEMİ (Odaya Katılma ve Senkronizasyon)
  useEffect(() => {
    if (!room?.id || !socket) return;
    
    socket.emit('joinRoom', room.id);

    const handleSync = (payload: any) => {
        const syncRoom = payload.room;
        const currentRoom = roomRef.current;
        
        // KURUCU ODADAN ÇIKTI VEYA SİLDİYSE
        const me = currentRoom?.players?.find((p: any) => p.sessionId === sessionId);
        if (syncRoom.status === 'deleted') {
            if (me && !me.isHost) {
                alert("Lobi kurucusu ayrıldığı için lobi silindi. Lobi listesine yönlendiriliyorsunuz.");
            }
            
            // HER ŞEYİ SIFIRLA VE UNUT
            socket?.emit('stopTimer', syncRoom.id);
            if (tickAudioRef.current) {
                tickAudioRef.current.pause();
                tickAudioRef.current.currentTime = 0;
            }
            setTurnTimer(60);
            setClueWord('');
            setClueCount(1);
            setIsDealingPhase(false);
            hasDealtRef.current = false;
            setShowTurnBanner(null);
            setClueBanner(null);
            prevTurnRef.current = null;
            setPeekedCards(new Set());
            setMeetingScores({});
            setIntroTarget(null);
            setIntroTimer(0);
            setLobbyVotes({});
            setKickVotes({ likes: 0, dislikes: 0, voters: new Set() });
            setShowNameModal(false);

            setRoom(null);
            setView('room_list');
            setShowLeaveConfirm(false);
            setMeetingView(false);
            return;
        }

        // SİYAH KART (ASSASSIN) AÇILMA ANİMASYONUNU HERKES İÇİN YAKALA (EŞ ZAMANLI)
        if (currentRoom && currentRoom.status === 'playing' && syncRoom.status.includes('_won')) {
            const oldCards = currentRoom.cards || [];
            const newCards = syncRoom.cards || [];
            const revealedAssassin = newCards.find((c: any) => c.color === 'assassin' && c.revealed && !oldCards.find((oc: any) => oc.id === c.id)?.revealed);
            
            if (revealedAssassin) {
                setAssassinRevealCard(revealedAssassin);
                setTimeout(() => setAssassinRevealCard(null), 2600);
            }
        }

        // YENİ İPUCU KONTROLÜ
        const oldClue = currentRoom?.currentClue;
        const newClue = syncRoom.currentClue;
        if (newClue && (!oldClue || newClue.word !== oldClue.word || newClue.count !== oldClue.count)) {
            setClueBanner({ word: newClue.word, count: newClue.count, team: syncRoom.currentTurn });
        }

        // yeni host'u anında algıla
        const updatedMe = syncRoom.players?.find(
          (p: any) => p.sessionId === sessionId
        );

        if (updatedMe) {
          setHostPresent(updatedMe.isHost);
        }
        setRoom(syncRoom);
        if (syncRoom.meetingScores) setMeetingScores(syncRoom.meetingScores);
        
        if (syncRoom.isMeetingActive !== undefined) {
           setMeetingView(syncRoom.isMeetingActive);
        }

        if (syncRoom.status === 'waiting' && view === 'playing') {
            hasDealtRef.current = false;
            setPeekedCards(new Set());
            setView('lobby');
        }

        // OYUN BAŞLAMA ANİMASYONU (ALT TAB SORUNUNU GİDEREN MUTLAK ZAMANLAMA)
        if (syncRoom.status === 'playing' && view !== 'playing') {
            const now = Date.now();
            const startedAt = syncRoom.startedAt || now;
            const elapsed = now - startedAt;

            if (!hasDealtRef.current) {
                hasDealtRef.current = true;
                if (elapsed < 4500) {
                    setIsDealingPhase(true);
                    setTimeout(() => {
                        setIsDealingPhase(false);
                    }, 4500 - elapsed);
                }
            }
            setView('playing');
            setMeetingView(false);
        }
    };

    const handleRequestSync = (payload: any) => {
        const currentRoom = roomRef.current;
        const me = currentRoom?.players?.find((p: any) => p.sessionId === sessionId);
        
        if (me?.isHost && !currentRoom?.isSyncing) {
           const exists = currentRoom?.players?.some((p: any) => p.sessionId === payload.newPlayer.sessionId);
           let updatedRoom = { ...currentRoom };
           
           if (!exists && currentRoom?.players) {
               updatedRoom.players = [...currentRoom.players, payload.newPlayer];
               setRoom(updatedRoom);
           }
           socket.emit('sync', { roomId: currentRoom.id, room: updatedRoom });
        }
    };

    const handleStartIntro = (target: any) => {
        setIntroTarget(target);
        setLobbyVotes({});
        setKickVotes({ likes: 0, dislikes: 0, voters: new Set() });
        setIntroTimer(10);
    };

    const handleLobbyVote = (payload: any) => {
        setLobbyVotes(prev => ({ ...prev, [payload.voterId]: payload.vote }));
    };

    const handleKickUpdate = (payload: any) => {
        const data = payload?.payload || payload;
        setKickVotes(prev => ({
            ...prev,
            likes: Number(data?.likes) || 0,
            dislikes: Number(data?.dislikes) || 0
        }));
    };

    const handleEndIntro = () => {
        setIntroTarget(null);
    };

    socket.on('sync', handleSync);
    socket.on('requestSync', handleRequestSync);
    socket.on('startIntro', handleStartIntro);
    socket.on('lobbyVote', handleLobbyVote);
    socket.on('kickUpdate', handleKickUpdate);
    socket.on('endIntro', handleEndIntro);

    if (roomRef.current?.isSyncing) {
       const newPlayer = { id: sessionId, sessionId, name: playerName, team: 'spectator', role: 'operative', isHost: false, connected: true };
       socket.emit('requestSync', { roomId: room.id, newPlayer });
    }

    return () => { 
        socket.off('sync', handleSync);
        socket.off('requestSync', handleRequestSync);
        socket.off('startIntro', handleStartIntro);
        socket.off('lobbyVote', handleLobbyVote);
        socket.off('kickUpdate', handleKickUpdate);
        socket.off('endIntro', handleEndIntro);
    };
  }, [room?.id, socket, sessionId, playerName, view]);

  // 4. OTOMATİK SİLİNME (SADECE ODADA KİMSE YOKSA)
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (room && room.players && room.players.length === 0) {
        timeout = setTimeout(async () => {
            try {
                await fetch(`${BACKEND_URL}/api/rooms/${room.id}`, { method: 'DELETE' });
            } catch (e) {}
        }, 5 * 60 * 1000); 
    }
    return () => clearTimeout(timeout);
  }, [room?.players?.length]);

  // 5. KURUCU VEYA OYUNCU TARAYICIYI KAPATIRSA ANLIK LOBİDEN DÜŞÜRME
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const currentRoom = roomRef.current;
      if (currentRoom) {
          const updatedRoom = getRoomAfterPlayerLeaves(currentRoom, sessionId);
          socket?.emit('sync', { roomId: currentRoom.id, room: updatedRoom });

          if (updatedRoom.status === 'deleted') {
              socket?.emit('stopTimer', currentRoom.id);
              fetch(`${BACKEND_URL}/api/rooms/${currentRoom.id}`, { method: 'DELETE', keepalive: true }).catch(()=>{});
          }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [socket, sessionId]);

  useEffect(() => {
    if (introTimer > 0) {
      const t = setTimeout(() => setIntroTimer(introTimer - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [introTimer]);

  // --- AKSİYONLAR ---

  const handleLogin = (e: any) => {
    e.preventDefault();
    const safeName = playerName.replace(/[<>{}[\]]/g, '').substring(0, 20).trim();
    if (safeName.length < 3) return;
    
    const newSid = Math.random().toString(36).substring(2, 15);
    setSessionId(newSid);
    localStorage.setItem('codenames_session', JSON.stringify({ sessionId: newSid, playerName: safeName, expiresAt: Date.now() + 43200000 }));
    setPlayerName(safeName);

    if (pendingRoomId) {
      handleJoinRoom(pendingRoomId, newSid, safeName);
      setPendingRoomId(null);
    } else {
      setView('room_list');
    }
  };

  const handleCreateRoom = async (e: any) => {
    e.preventDefault();
    if (!createName.trim()) return;
    const roomId = Math.random().toString(36).substring(2, 9);
    const hash = createPass ? bcrypt.hashSync(createPass, 10) : null;
    
    // Rastgele ilk başlayan takımı seç
    const initialStart = Math.random() < 0.5 ? 'red' : 'blue';

    const host: Player = { id: sessionId, sessionId, name: playerName, team: 'spectator', role: 'operative', isHost: true, connected: true };
    const newRoom = {
      id: roomId, name: createName, password: hash, status: 'waiting', players: [host],
      settings: { 
          spymasterTime: 90, 
          operativeTime: 90, 
          redName: 'KIRMIZI TAKIM', 
          blueName: 'MAVİ TAKIM', 
          introMode: false, 
          lastStartingTeam: initialStart,
          customWords: [],
          customWordProb: 0 
      }, 
      cards: [], currentTurn: initialStart, turnPhase: 'spymaster', meetingScores: {}, currentClue: null, guessesLeft: 0, timeRemaining: 0, introCompleted: false, gameLogs: [], isMeetingActive: false
    };

    try {
        const res = await fetch(`${BACKEND_URL}/api/rooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: roomId, name: createName, password: hash, status: 'waiting' })
        });
        
        if (!res.ok) {
            alert("HATA: Oda veritabanına kaydedilemedi! Lütfen backend terminalini kontrol et.");
            return;
        }
    } catch(err) {
        console.error("API Oda oluşturma hatası:", err);
        alert("HATA: Sunucuya bağlanılamadı. BACKEND_URL veya CORS ayarlarını kontrol et.");
        return;
    }
    
    setRoom(newRoom);
    setView('lobby');
  };

  const handleJoinRoom = async (roomId: string, sid = sessionId, sname = playerName) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/rooms/${roomId}`);
      if (!res.ok) {
         alert("Oda bulunamadı veya silinmiş olabilir. Backend bağlantını kontrol et.");
         return;
      }
      const data = await res.json();
      
      if (data.password) {
        const pass = prompt("Oda şifresini girin:");
        if (!pass || !bcrypt.compareSync(pass, data.password)) return alert("Yanlış şifre!");
      }

      setRoom({ id: roomId, name: data.name, isSyncing: true, players: [] });
      setView('lobby');
    } catch (e) {
      console.error("Join Room Hatası:", e);
      alert("Sunucuya bağlanılamadı.");
    }
  };

  const broadcastSync = async (updatedRoom: any) => {
    setRoom(updatedRoom);
    socket?.emit('sync', { roomId: updatedRoom.id, room: updatedRoom });
    
    if (updatedRoom.id && updatedRoom.status !== 'waiting') {
      try {
          await fetch(`${BACKEND_URL}/api/rooms/${updatedRoom.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: updatedRoom.status })
          });
      } catch (e) {}
    }
  };

  const getNextIntroTarget = (scores: Record<string, any> = meetingResults) => {
    if (!room?.players) return null;
    return room.players.find((p: any) => (p.team === 'red' || p.team === 'blue') && !scores[p.sessionId]) || null;
  };

  const triggerMeetingIntro = (target: Player) => {
    if (!target || !room?.id) return;
    socket?.emit('startIntro', { roomId: room.id, target });
    setIntroTarget(target);
    setLobbyVotes({});
    setKickVotes({ likes: 0, dislikes: 0, voters: new Set() });
    setIntroTimer(10);
  };

  const startMeetingIntro = (target: Player) => {
    if (!mePlayer?.isHost) return;
    if (meetingResults[target.sessionId]) return; 

    triggerMeetingIntro(target);
  };

  const endMeetingIntro = () => {
    const totalKick = kickVotes.likes + kickVotes.dislikes;
    const kickPercent = totalKick === 0 ? 0 : Math.round((kickVotes.likes / totalKick) * 100);
    const lobbyLikes = Object.values(lobbyVotes).filter(v => v === 'like').length;
    const lobbyDislikes = Object.values(lobbyVotes).filter(v => v === 'dislike').length;

    const newScores = { 
      ...meetingResults, 
      [introTarget.sessionId]: { lobbyLikes, lobbyDislikes, kickPercent } 
    };
    
    setMeetingScores(newScores);
    broadcastSync({ ...room, meetingScores: newScores });
    socket?.emit('endIntro', room.id);
    setIntroTarget(null);
  };

  const castLobbyVote = (vote: 'like' | 'dislike') => {
    setLobbyVotes(prev => ({ ...prev, [sessionId]: vote }));
    socket?.emit('lobbyVote', { roomId: room.id, payload: { voterId: sessionId, vote } });
  };

  function clearAllCardVotes(cards: any[] = []) {
    return cards.map((c: any) => ({ ...c, votes: [] }));
  }

  const switchRole = (team: Team, role: Role) => {
    const updated = room.players.map((p: any) => p.sessionId === sessionId ? { ...p, team, role } : p);
    broadcastSync({ ...room, players: updated });
  };

  const openLobbyNameModal = () => {
    setNameModalInput(playerName);
    setShowNameModal(true);
  };

  const saveLobbyPlayerName = () => {
    const safeName = nameModalInput.replace(/[<>{}\[\]]/g, '').substring(0, 20).trim();
    if (safeName.length < 3 || !room) return;

    setPlayerName(safeName);
    localStorage.setItem('codenames_session', JSON.stringify({
      sessionId,
      playerName: safeName,
      expiresAt: Date.now() + 43200000
    }));

    const updatedPlayers = room.players.map((p: any) =>
      p.sessionId === sessionId ? { ...p, name: safeName } : p
    );
    broadcastSync({ ...room, players: updatedPlayers });
    setShowNameModal(false);
  };

  const handleStartOperation = () => {
    if (room.settings.introMode) {
      const resetScores = room.introCompleted ? {} : (room.meetingScores || meetingResults || {});
      const updatedRoom = { ...room, introCompleted: false, meetingScores: resetScores, isMeetingActive: true };

      setMeetingScores(resetScores);
      setMeetingView(true);
      broadcastSync(updatedRoom); 
    } else {
      startGame();
    }
  };

  const startGame = async () => {
    if (!room) return;
    
    let dbWords: string[] = [];
    try {
      const res = await fetch(`${BACKEND_URL}/api/words`);
      if (res.ok) {
         const data = await res.json();
         if (Array.isArray(data) && data.length > 0) {
           
           // Backend'den gelen veriyi "is_special" hatalarına karşı TAM KORUMAYA (Zırha) alıyoruz.
           const mappedData = data.map((d: any) => {
              if (typeof d === 'string') {
                  return { word: d, is_special: KNOWN_SPECIALS.includes(d.toUpperCase()) };
              }
              // Backend is_special kolonunu düzgün iletmezse diye bilinen şehirlere de fallback attık
              const isSpec = d.is_special === true || d.is_special === 'true' || d.is_special === 1 || d.is_special === '1' || d.is_special === 't' || KNOWN_SPECIALS.includes((d.word || '').toUpperCase());
              return { word: d.word || '', is_special: isSpec };
           }).filter((d: any) => d.word);
           
           // Ayrıştırma işlemi
           const specialWords = mappedData.filter((d: any) => d.is_special).map((d: any) => d.word).sort(() => 0.5 - Math.random());
           const normalWords = mappedData.filter((d: any) => !d.is_special).map((d: any) => d.word).sort(() => 0.5 - Math.random());
           
           // ÖZEL KELİMELERİ ASLA VE ASLA MAKS 3Ü GEÇMEYECEK ŞEKİLDE ZORLUYORUZ
           const maxSpecialAllowed = Math.min(3, specialWords.length);
           const specialCount = Math.floor(Math.random() * (maxSpecialAllowed + 1)); 
           const selectedSpecials = specialWords.slice(0, specialCount);

           // ÖZEL KELİME HAVUZU (CUSTOM WORDS) SEÇİMİ
           let selectedCustoms: string[] = [];
           const customWords = room.settings?.customWords || [];
           const customProb = room.settings?.customWordProb || 0;
           
           if (customWords.length > 0 && customProb > 0) {
               const poolSize = customWords.length;
               let pickCount = 0;
               if (customProb === 1) { // az
                   pickCount = Math.floor(Math.random() * (Math.max(2, poolSize * 0.3))); 
               } else if (customProb === 2) { // biraz
                   pickCount = Math.floor(Math.random() * (Math.max(3, poolSize * 0.6))); 
               } else if (customProb === 3) { // çok
                   // En az 1 garantili, gerisi ihtimalli
                   pickCount = 1 + Math.floor(Math.random() * poolSize);
               }
               
               pickCount = Math.min(pickCount, poolSize); // Limit to pool
               pickCount = Math.min(pickCount, 25 - selectedSpecials.length); // Limit to available slots
               
               const shuffledCustoms = [...customWords].sort(() => 0.5 - Math.random());
               selectedCustoms = shuffledCustoms.slice(0, pickCount);
           }
           
           // Kalan boşlukları NORMAL kelimelerle TAM OLARAK 25'e tamamlıyoruz
           const neededNormal = 25 - selectedSpecials.length - selectedCustoms.length;
           // Özel havuzdakilerle normal havuzdakiler çakışmasın diye filtreliyoruz
           const availableNormalWords = normalWords.filter((w: string) => !selectedCustoms.includes(w));
           const selectedNormals = availableNormalWords.slice(0, neededNormal);
           
           let combined = [...selectedSpecials, ...selectedCustoms, ...selectedNormals];
           
           // Eğer yeterli veri yoksa ve 25 olmadıysa, sabit dosyadaki normal kelimelerle dolduruyoruz
           if (combined.length < 25) {
             const remaining = 25 - combined.length;
             const fallbacks = FALLBACK_WORDS.filter(w => !combined.includes(w)).slice(0, remaining);
             combined = [...combined, ...fallbacks];
           }
           
           dbWords = combined.sort(() => 0.5 - Math.random()); 
         }
      }
    } catch (e) { console.error("Kelime çekme hatası", e); }

    const sourceWords = dbWords.length === 25 ? dbWords : [...FALLBACK_WORDS].sort(() => 0.5 - Math.random()).slice(0, 25);
    const selectedWords = [...sourceWords].sort(() => 0.5 - Math.random()).slice(0, 25);
    
    // Başlangıç takımı seçimi (Sırayla değişir veya ilk kurulumdan gelir)
    const startTeam = room.currentTurn || 'red';
    // Başlayan takımın kartı 9, diğerinin 8 olur. Suikastçi her zaman 1, Nötr 7
    const redCount = startTeam === 'red' ? 9 : 8;
    const blueCount = startTeam === 'blue' ? 9 : 8;
    

    const hasBadAdjacency = (gridColors: string[]) => {
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      for (let i = 0; i < 25; i++) {
        const row = Math.floor(i / 5);
        const col = i % 5;
        const color = gridColors[i];
        if (color !== 'red' && color !== 'blue') continue;

        let sameNeighbors = 0;
        for (const [dx, dy] of dirs) {
          const nr = row + dx;
          const nc = col + dy;
          if (nr < 0 || nr >= 5 || nc < 0 || nc >= 5) continue;
          const ni = nr * 5 + nc;
          if (gridColors[ni] === color) sameNeighbors++;
        }

        if (sameNeighbors >= 3) {
          return true;
        }
      }
      return false;
    };

    let colors = [...Array(redCount).fill('red'), ...Array(blueCount).fill('blue'), ...Array(7).fill('neutral'), 'assassin'];

    let shuffleAttempts = 0;
    do {
      colors = [...colors].sort(() => 0.5 - Math.random());
      shuffleAttempts++;
    } while (hasBadAdjacency(colors as string[]) && shuffleAttempts < 300);


    // İZİN VERİLEN KART TASARIMLARI (DOSYA İSİMLERİ)
    const allowedDesigns = {
      assassin: [1],
      blue: [1, 2, 3, 4, 5],
      red: [1, 2, 3, 4, 5],
      neutral: [1, 2, 3, 4, 5]
    };

    const cards: Card[] = selectedWords.map((word, i) => {
      const cardColor = colors[i] as any;
      const validDesigns = allowedDesigns[cardColor as keyof typeof allowedDesigns] || [1];
      const randomDesignId = validDesigns[Math.floor(Math.random() * validDesigns.length)];

      return {
        id: i, word, color: cardColor, revealed: false, votes: [], designId: randomDesignId 
      };
    });

    const updatedRoom = { 
        ...room, 
        status: 'playing',
        startedAt: Date.now(), // Alt-tab animasyon senkronu için mutlak zaman damgası eklendi
        turnPhase: 'spymaster', 
        currentTurn: startTeam, 
        cards,
        currentClue: null,
        guessesLeft: 0,
        gameLogs: room.gameLogs || [],
        introCompleted: true,
        isMeetingActive: false
    };
    
    if (!hasDealtRef.current) {
        hasDealtRef.current = true;
        setIsDealingPhase(true);
        setTimeout(() => setIsDealingPhase(false), 4500); 
    }

    broadcastSync(updatedRoom);
    setView('playing');
    setMeetingView(false);
  };

  const skipTurn = () => {
      if (!room || !isMyTurn || room.turnPhase !== 'operative') return;
      
      let updatedRoom = { ...room };
      const log = { id: Date.now(), type: 'pass', team: updatedRoom.currentTurn, playerName: mePlayer?.name || 'Ajan', word: 'PAS GEÇİLDİ' };
      updatedRoom.gameLogs = [...(updatedRoom.gameLogs || []), log];

      updatedRoom.turnPhase = 'spymaster';
      updatedRoom.currentTurn = updatedRoom.currentTurn === 'red' ? 'blue' : 'red';
      updatedRoom.currentClue = null;
      updatedRoom.cards = clearAllCardVotes(updatedRoom.cards || []);
      
      broadcastSync(updatedRoom);
  };

  // OYUN İÇİ FONKSİYONLARI VE LOG EKLENTİSİ
  const voteCard = (cardId: number) => {
    if (!room || room.turnPhase !== 'operative') return;

    const updatedCards = room.cards.map((c: any) => {
      if (c.id !== cardId) return c;

      const alreadyVoted = c.votes.includes(sessionId);

      return {
        ...c,
        votes: alreadyVoted
          ? c.votes.filter((id: string) => id !== sessionId)
          : [...c.votes, sessionId]
      };
    });

    broadcastSync({ ...room, cards: updatedCards });
  };

  const revealCard = (cardId: number) => {
    if (!room || room.turnPhase !== 'operative') return;
    const card = room.cards.find((c: any) => c.id === cardId);
    if (!card || card.revealed) return;

    let updatedRoom = { ...room };
    const previousTurn = updatedRoom.currentTurn;
    
    const log = { id: Date.now(), type: 'reveal', team: updatedRoom.currentTurn, playerName: mePlayer?.name || 'Ajan', word: card.word, color: card.color, relatedClue: updatedRoom.currentClue?.word };
    updatedRoom.gameLogs = [...(updatedRoom.gameLogs || []), log];

    const updatedCards = updatedRoom.cards.map((c: any) => {
      if (c.id === cardId) return { ...c, revealed: true };
      return { ...c}; 
    });
    updatedRoom.cards = updatedCards;
    
    // TAHMİN HAKKI KONTROLÜ VE AZALTILMASI
    const rawGuessesLeft = Number(updatedRoom.guessesLeft ?? updatedRoom.currentClue?.count ?? 1);
    const currentGuessesLeft = Number.isFinite(rawGuessesLeft) ? rawGuessesLeft : 1;
    updatedRoom.guessesLeft = Math.max(0, currentGuessesLeft - 1);

    if (card.color === 'assassin') {
        // Suikastçi açılınca oyunu bitiren oyuncunun ekranında da animasyonu anında tetikle
        setAssassinRevealCard(card);
        setTimeout(() => setAssassinRevealCard(null), 2600);
        updatedRoom.status = updatedRoom.currentTurn === 'red' ? 'blue_won' : 'red_won';
    } else if (card.color !== updatedRoom.currentTurn) {
        // Hatalı renk seçimi: Sıra direkt karşıya geçer
        updatedRoom.turnPhase = 'spymaster';
        updatedRoom.currentTurn = updatedRoom.currentTurn === 'red' ? 'blue' : 'red';
        updatedRoom.currentClue = null;
    } else {
        // Doğru renk seçimi: Hakları bitti mi kontrol et
        if (updatedRoom.guessesLeft <= 0) {
            updatedRoom.turnPhase = 'spymaster';
            updatedRoom.currentTurn = updatedRoom.currentTurn === 'red' ? 'blue' : 'red';
            updatedRoom.currentClue = null;
        }
    }

    if (previousTurn !== updatedRoom.currentTurn) {
        updatedRoom.cards = clearAllCardVotes(updatedRoom.cards || []);
    }

    const redLeft = updatedRoom.cards.filter((c: any) => c.color === 'red' && !c.revealed).length;
    const blueLeft = updatedRoom.cards.filter((c: any) => c.color === 'blue' && !c.revealed).length;
    if (redLeft === 0) updatedRoom.status = 'red_won';
    if (blueLeft === 0) updatedRoom.status = 'blue_won';

    broadcastSync(updatedRoom);
  };

  const submitClue = () => {
    if (!clueWord.trim() || !room) return;

    const normalizedClueCount = clueCount === 'unlimited' ? 'unlimited' : Math.max(1, Number(clueCount) || 1);
    
    const updatedRoom = {
      ...room,
      currentClue: { word: clueWord.toLocaleUpperCase('tr-TR'), count: normalizedClueCount },
      // Tahmin hakkı: Şefin verdiği tam sayı kadar (ekstra +1 yok)
      guessesLeft: normalizedClueCount === 'unlimited' ? 99 : normalizedClueCount,
      turnPhase: 'operative' as const
    };

    const log = { id: Date.now(), type: 'clue', team: updatedRoom.currentTurn, playerName: mePlayer?.name || 'Şef', word: clueWord.toUpperCase(), count: normalizedClueCount };
    updatedRoom.gameLogs = [...(updatedRoom.gameLogs || []), log];

    // ŞEFİN EKRANINDA ANINDA GÖSTER (Göz kırpmayı önler, doğrudan tetikler)
    setClueBanner({ word: updatedRoom.currentClue.word, count: updatedRoom.currentClue.count, team: updatedRoom.currentTurn });

    broadcastSync(updatedRoom);
    setClueWord('');
    setClueCount(1);
  };

  const returnToLobby = () => {
    if (!room) return;

    const latestMe = room.players?.find((p: any) => p.sessionId === sessionId);

    // host değişmişse yeni host anında butonu görsün
    if (!latestMe?.isHost) return;
    
    // OYUN İÇİ STATELERİ SIFIRLA
    socket?.emit('stopTimer', room.id);
    if (tickAudioRef.current) {
        tickAudioRef.current.pause();
        tickAudioRef.current.currentTime = 0;
    }
    
    hasDealtRef.current = false;
    setPeekedCards(new Set());
    setTurnTimer(60);
    setShowTurnBanner(null);
    setClueBanner(null);
    prevTurnRef.current = null;
    setClueWord('');
    setClueCount(1);
    setIsDealingPhase(false);
    setMeetingScores({});
    setMeetingView(false);
    setIntroTarget(null);
    setIntroTimer(0);
    setLobbyVotes({});
    setKickVotes({ likes: 0, dislikes: 0, voters: new Set() });
    
    // BİR SONRAKİ ELİN BAŞLAMA SIRASINI DEĞİŞTİRİYORUZ
    const nextStart = room.settings?.lastStartingTeam === 'red' ? 'blue' : 'red';
    
    const updatedRoom = { 
        ...room, 
        status: 'waiting',
        currentTurn: nextStart,
        settings: { ...room.settings, lastStartingTeam: nextStart },
        turnPhase: 'spymaster',
        currentClue: null,
        guessesLeft: 0,
        gameLogs: [],
        meetingScores: {},
        introCompleted: false,
        isMeetingActive: false,
        cards: [] // Kartları temizle ki tekrar başlatırken yenileri gelsin
    };
    broadcastSync(updatedRoom);
    setView('lobby');
  }

  const leaveRoom = async () => {
    if (!room) {
        setView('room_list');
        return;
    }
    
    // ZAMANLAYICIYI VE SESİ DURDUR
    socket?.emit('stopTimer', room.id);
    if (tickAudioRef.current) {
        tickAudioRef.current.pause();
        tickAudioRef.current.currentTime = 0;
    }

    const updatedRoom = getRoomAfterPlayerLeaves(room, sessionId);

    if (updatedRoom.status === 'deleted') {
        socket?.emit('sync', { roomId: room.id, room: updatedRoom });
        try {
            await fetch(`${BACKEND_URL}/api/rooms/${room.id}`, { method: 'DELETE' });
        } catch (e) {}
    } else {
        broadcastSync(updatedRoom);
    }

    // ESKİ OYUNA DAİR HER ŞEYİ SİL VE SIFIRLA (Kullanıcı adı hariç)
    setTurnTimer(60);
    setClueWord('');
    setClueCount(1);
    setIsDealingPhase(false);
    hasDealtRef.current = false;
    roomRef.current = null; // Stale state yarışını önlemek için anında sıfırla
    setShowTurnBanner(null);
    setClueBanner(null);
    prevTurnRef.current = null;
    setPeekedCards(new Set());
    setMeetingScores({});
    setMeetingView(false);
    setIntroTarget(null);
    setIntroTimer(0);
    setLobbyVotes({});
    setKickVotes({ likes: 0, dislikes: 0, voters: new Set() });
    setShowNameModal(false);

    setView('room_list');
    setRoom(null);
    setShowLeaveConfirm(false);
    setPendingRoomId(null);
    // SOCKET ODAYI TAM TERK ETSİN
    socket?.emit('leaveRoom', {
        roomId: room.id,
        sessionId
    });

    // eski sync cache temizliği
    setHostPresent(true);

    // stale sync engeli
    roomRef.current = null;
  };

  // --- RENDER BİLEŞENLERİ ---

  return (
    <>
      <GlobalStyles />
      {/* ÇOKLU SEKME ÇAKIŞMASI UYARI MODALI */}
      <AnimatePresence>
        {sessionConflict && (
          <div className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center p-4 backdrop-blur-xl">
             <div className="bg-[#110D17] border border-red-500/50 rounded-3xl p-8 max-w-md w-full text-center shadow-[0_0_50px_rgba(239,68,68,0.2)]">
                <AlertTriangle size={48} className="text-red-500 mx-auto mb-4" />
                <h3 className="text-2xl font-black text-white mb-2">Oturum Çakışması!</h3>
                <p className="text-white/60 mb-8 font-medium leading-relaxed">Hesabınız başka bir sekmede veya cihazda açıldı. Bu sekmede oynamaya devam etmek istiyor musunuz? (Diğer sekme devre dışı kalacaktır.)</p>
                <div className="flex gap-4">
                   <button onClick={resolveConflict} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg active:scale-95">Evet, Burayı Kullan</button>
                </div>
             </div>
          </div>
        )}
      </AnimatePresence>

      {view === 'login' && (
        <div className="w-[100vw] h-[100vh] bg-gradient-to-b from-black to-[#1a0b2e] flex items-center justify-center p-4 relative overflow-hidden text-white">
          <div className="static-scanlines absolute inset-0 pointer-events-none z-0"></div>
          {/* MekipHub Neon Background */}
          <div className="neon-bg absolute inset-0 pointer-events-none z-0">
            <div className="neon-stars neon-stars-1"></div>
            <div className="neon-stars neon-stars-2"></div>
            <div className="neon-stars neon-stars-3"></div>
          </div>
          
          <motion.form initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onSubmit={handleLogin} className="w-full max-w-md bg-white/[0.06] border border-white/10 p-8 rounded-3xl shadow-2xl backdrop-blur-xl relative z-10">
            <div className="flex justify-center mb-6 mt-4">
               <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/40 via-blue-500/40 to-cyan-400/40 shadow-xl shadow-cyan-400/20">
                  <Sparkles size={40} className="text-cyan-300" />
               </div>
            </div>
            <h1 className="text-4xl font-black text-center mb-8 tracking-tighter">
              <span className="bg-gradient-to-r from-cyan-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">AJAN GİRİŞİ</span>
            </h1>
            
            <input suppressHydrationWarning autoFocus value={playerName} onChange={e => setPlayerName(e.target.value)} className="w-full bg-black/40 border border-white/10 p-4 rounded-xl mb-4 text-white focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 outline-none transition-all placeholder:text-white/30" placeholder="Kod Adınız..." />
            <button type="submit" className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-black p-4 rounded-xl shadow-[0_0_15px_rgba(34,211,238,0.4)] transition-all active:scale-95">SİSTEME SIZ</button>
          </motion.form>
        </div>
      )}

      {view === 'room_list' && (
        <div className="w-[100vw] h-[100vh] bg-gradient-to-b from-black to-[#1a0b2e] p-6 md:p-12 flex gap-8 flex-col md:flex-row relative overflow-hidden text-white">
          <div className="static-scanlines absolute inset-0 pointer-events-none z-0"></div>
          {/* MekipHub Neon Background */}
          <div className="neon-bg absolute inset-0 pointer-events-none z-0">
            <div className="neon-stars neon-stars-1"></div>
            <div className="neon-stars neon-stars-2"></div>
            <div className="neon-stars neon-stars-3"></div>
          </div>

          <div className="w-full md:w-1/3 relative z-10">
            <div className="bg-white/[0.06] backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl">
              <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20"><Crown size={16} className="text-cyan-300"/></div> ODA KUR
              </h2>
              <input suppressHydrationWarning value={createName} onChange={e => setCreateName(e.target.value)} className="w-full bg-black/40 border border-white/10 p-4 rounded-xl mb-4 text-white outline-none focus:border-cyan-400 transition-colors placeholder:text-white/30" placeholder="Oda Adı" />
              <input suppressHydrationWarning value={createPass} onChange={e => setCreatePass(e.target.value)} type="password" className="w-full bg-black/40 border border-white/10 p-4 rounded-xl mb-6 text-white outline-none focus:border-cyan-400 transition-colors placeholder:text-white/30" placeholder="Şifre (Opsiyonel)" />
              <button onClick={handleCreateRoom} className="w-full bg-cyan-500 hover:bg-cyan-400 p-4 rounded-xl font-black text-black shadow-[0_0_15px_rgba(34,211,238,0.3)] transition-all">OLUŞTUR VE GİR</button>
            </div>
          </div>
          
          <div className="flex-1 relative z-10 overflow-y-auto">
            <div className="flex justify-between items-center mb-6 sticky top-0 bg-[#0c0515]/90 backdrop-blur-md p-4 rounded-2xl z-20">
               <h2 className="text-2xl font-black text-white">AKTİF LOBİLER</h2>
               <button onClick={fetchRooms} className="text-sm bg-white/10 text-white/70 px-4 py-2 rounded-xl hover:bg-white/20 transition-colors">Yenile</button>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {rooms.map(r => (
                <div key={r.id} className="bg-white/[0.04] backdrop-blur-md border border-white/10 p-6 rounded-2xl flex justify-between items-center hover:border-cyan-400/50 hover:bg-white/[0.08] transition-all group">
                  <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">{r.name} {r.password && <Lock size={16} className="text-violet-400"/>}</h3>
                    <p className="text-white/50 text-sm font-mono mt-1">ID: {r.id}</p>
                  </div>
                  {r.status === 'playing' ? (
                    <button disabled className="bg-black/40 p-3 px-6 rounded-xl font-bold text-white/30 transition-all flex items-center gap-2 cursor-not-allowed">OYUN DEVAM EDİYOR</button>
                  ) : (
                    <button onClick={() => handleJoinRoom(r.id)} className="bg-white/10 group-hover:bg-cyan-500 group-hover:text-black p-3 px-6 rounded-xl font-bold text-white transition-all flex items-center gap-2 shadow-lg shadow-black/20">KATIL <LogIn size={18}/></button>
                  )}
                </div>
              ))}
              {rooms.length === 0 && <div className="text-white/40 italic p-8 text-center border border-dashed border-white/10 rounded-2xl">Şu an aktif operasyon bulunmuyor...</div>}
            </div>
          </div>
        </div>
      )}

      {view === 'lobby' && (() => {
        if (room?.isSyncing) {
            return <div className="w-[100vw] h-[100vh] bg-gradient-to-b from-black to-[#1a0b2e] flex flex-col items-center justify-center text-cyan-400 text-2xl font-black relative overflow-hidden">
               <div className="static-scanlines absolute inset-0 pointer-events-none z-0"></div>
               <div className="neon-bg absolute inset-0 pointer-events-none"><div className="neon-stars neon-stars-1"></div></div>
               <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }} className="mb-6 relative z-10"><ShieldAlert size={80} /></motion.div>
               <p className="animate-pulse relative z-10">SUNUCUYA BAĞLANILIYOR... VERİ BEKLENİYOR</p>
            </div>
        }

        const redTeam = room.players.filter((p: any) => p.team === 'red');
        const blueTeam = room.players.filter((p: any) => p.team === 'blue');
        const spectators = room.players.filter((p: any) => p.team === 'spectator');

        const hasRedSpymaster = redTeam.some((p: any) => p.role === 'spymaster');
        const hasBlueSpymaster = blueTeam.some((p: any) => p.role === 'spymaster');
        const hasRedOperative = redTeam.some((p: any) => p.role === 'operative');
        const hasBlueOperative = blueTeam.some((p: any) => p.role === 'operative');
        
        // Oyun başlama kilitleri
        const ruleSpymasters = hasRedSpymaster && hasBlueSpymaster;
        const ruleMin2Red = redTeam.length >= 2;
        const ruleMin2Blue = blueTeam.length >= 2;
        const ruleAllAssigned = spectators.length === 0;
        const canStartGame = ruleSpymasters && ruleMin2Red && ruleMin2Blue && ruleAllAssigned;

        const renderEmptySlots = (currentCount: number, team: Team) => {
            const slots = [];
            const emptyCount = Math.max(0, 5 - currentCount);
            for(let i=0; i<emptyCount; i++) {
               slots.push(
                 <button
                   key={`empty-${team}-${i}`}
                   type="button"
                   onClick={() => switchRole(team, 'operative')}
                   className="bg-black/25 hover:bg-white/10 border border-white/10 hover:border-white/25 rounded-[10px] p-4 flex justify-center items-center h-12 transition-all cursor-pointer"
                 >
                   <span className="text-white/35 hover:text-white/70 font-bold text-sm text-center">boş slot</span>
                 </button>
               );
            }
            return slots;
        };

        return (
          <div className="w-[100vw] h-[100vh] bg-gradient-to-b from-black to-[#1a0b2e] font-sans flex flex-col relative overflow-y-auto overflow-x-hidden">
            <div className="static-scanlines absolute inset-0 pointer-events-none z-0"></div>
            {/* ARKA PLAN YILDIZLAR */}
            <div className="neon-bg absolute inset-0 pointer-events-none z-0">
              <div className="neon-stars neon-stars-1"></div>
              <div className="neon-stars neon-stars-2"></div>
            </div>

            {/* ÇIKIŞ ONAY MODALI */}
            <AnimatePresence>
              {showLeaveConfirm && (
                <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
                   <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#110D17] border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
                      <AlertTriangle size={48} className="text-red-500 mx-auto mb-4" />
                      <h3 className="text-2xl font-black text-white mb-2">Ayrılmak İstiyor Musunuz?</h3>
                      <p className="text-white/60 mb-8 font-medium">Oda bağlantınız kesilecek ve lobi listesine döneceksiniz.</p>
                      <div className="flex gap-4">
                         <button onClick={() => setShowLeaveConfirm(false)} className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition-colors">Hayır, Kal</button>
                         <button onClick={leaveRoom} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-colors shadow-[0_0_15px_rgba(239,68,68,0.3)]">Evet, Ayrıl</button>
                      </div>
                   </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* LOBİ İSİM DEĞİŞTİRME MODALI */}
            <AnimatePresence>
              {showNameModal && (
                <div className="fixed inset-0 bg-black/80 z-[110] flex items-center justify-center p-4 backdrop-blur-md">
                   <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#110D17] border border-white/10 rounded-3xl p-8 max-w-sm w-full shadow-2xl relative">
                      <button onClick={() => setShowNameModal(false)} className="absolute top-5 right-5 text-white/50 hover:text-white transition-colors"><X size={22}/></button>
                      <h3 className="text-2xl font-black text-white mb-2">Ajan İsmini Değiştir</h3>
                      <p className="text-white/45 text-sm font-medium mb-6">Lobide görünen isminizi güncelleyin.</p>
                      <input suppressHydrationWarning
                        autoFocus
                        value={nameModalInput}
                        onChange={(e) => setNameModalInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveLobbyPlayerName();
                          if (e.key === 'Escape') setShowNameModal(false);
                        }}
                        className="w-full bg-black/40 border border-white/10 p-4 rounded-xl mb-5 text-white outline-none focus:border-cyan-400 transition-colors placeholder:text-white/30"
                        placeholder="Yeni ajan ismi"
                        maxLength={20}
                      />
                      <button onClick={saveLobbyPlayerName} className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-black p-4 rounded-xl transition-all active:scale-95 shadow-[0_0_15px_rgba(34,211,238,0.3)]">KAYDET</button>
                   </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* TANIŞMA MODU EKRANI (POPUP) */}
            <AnimatePresence>
              {meetingView && (
                <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="fixed inset-0 bg-gradient-to-b from-black to-[#1a0b2e] z-40 p-12 overflow-y-auto">
                  <div className="static-scanlines absolute inset-0 pointer-events-none z-0"></div>
                  <div className="neon-bg absolute inset-0 pointer-events-none"><div className="neon-stars neon-stars-1"></div></div>
                  {mePlayer?.isHost && (
                     <button onClick={() => {
                         setMeetingView(false);
                         broadcastSync({ ...room, isMeetingActive: false });
                     }} className="absolute top-8 right-8 text-white/50 hover:text-white z-50"><X size={40}/></button>
                  )}
                  <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-violet-300 to-red-400 text-center mb-16 tracking-tighter relative z-10">EKİP TANIŞMA</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-7xl mx-auto relative z-10">
                    {/* KIRMIZI */}
                    <div className="space-y-4">
                       <h3 className="text-3xl font-black text-red-500 border-b-2 border-red-900/50 pb-2">{localRedName}</h3>
                       {redTeam.map((p: any) => (
                         <div key={p.sessionId} onClick={() => startMeetingIntro(p)} className={`p-6 bg-white/[0.04] backdrop-blur-md rounded-2xl border transition-all ${mePlayer?.isHost ? 'cursor-pointer hover:border-red-500/50 hover:bg-white/[0.08]' : 'cursor-default'} ${introTarget?.sessionId === p.sessionId ? 'border-cyan-400 scale-105 shadow-[0_0_30px_rgba(34,211,238,0.2)]' : 'border-white/10'} ${meetingResults[p.sessionId] ? 'opacity-50' : ''}`}>
                            <div className="flex justify-between items-center">
                              <span className="text-2xl font-bold text-white">{p.name}</span>
                              {meetingResults[p.sessionId] && (
                                <div className="flex gap-4 text-sm font-black">
                                  <span className="text-cyan-400">L: {meetingResults[p.sessionId].lobbyLikes}</span>
                                  <span className="text-red-500">D: {meetingResults[p.sessionId].lobbyDislikes}</span>
                                  <span className="text-violet-400">K: %{meetingResults[p.sessionId].kickPercent}</span>
                                </div>
                              )}
                            </div>
                         </div>
                       ))}
                    </div>
                    {/* MAVİ */}
                    <div className="space-y-4">
                       <h3 className="text-3xl font-black text-cyan-400 border-b-2 border-cyan-900/50 pb-2">{localBlueName}</h3>
                       {blueTeam.map((p: any) => (
                         <div key={p.sessionId} onClick={() => startMeetingIntro(p)} className={`p-6 bg-white/[0.04] backdrop-blur-md rounded-2xl border transition-all ${mePlayer?.isHost ? 'cursor-pointer hover:border-cyan-500/50 hover:bg-white/[0.08]' : 'cursor-default'} ${introTarget?.sessionId === p.sessionId ? 'border-red-500 scale-105 shadow-[0_0_30px_rgba(239,68,68,0.2)]' : 'border-white/10'} ${meetingResults[p.sessionId] ? 'opacity-50' : ''}`}>
                            <div className="flex justify-between items-center">
                              <span className="text-2xl font-bold text-white">{p.name}</span>
                              {meetingResults[p.sessionId] && (
                                <div className="flex gap-4 text-sm font-black">
                                  <span className="text-cyan-400">L: {meetingResults[p.sessionId].lobbyLikes}</span>
                                  <span className="text-red-500">D: {meetingResults[p.sessionId].lobbyDislikes}</span>
                                  <span className="text-violet-400">K: %{meetingResults[p.sessionId].kickPercent}</span>
                                </div>
                              )}
                            </div>
                         </div>
                       ))}
                    </div>
                  </div>
                  {mePlayer?.isHost && room.settings.introMode && !room.introCompleted && (
                     <div className="flex justify-center mt-12 relative z-10">
                        <button onClick={() => { broadcastSync({...room, introCompleted: true}); setMeetingView(false); startGame(); }} className="bg-cyan-500 hover:bg-cyan-400 text-black font-black px-12 py-6 rounded-full shadow-[0_0_30px_rgba(34,211,238,0.4)] flex items-center gap-4 text-xl transition-transform active:scale-95">
                           TÜM TANIŞMALARI BİTİR VE OYUNA GEÇ <Play size={24}/>
                        </button>
                     </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* TANIŞMA OYLAMA POPUP */}
            <AnimatePresence>
              {introTarget && (
                <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-md">
                   <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="bg-[#110D17] border border-cyan-500/50 rounded-3xl w-full max-w-3xl overflow-hidden shadow-[0_0_100px_rgba(34,211,238,0.15)]">
                      <div className="p-10 text-center border-b border-white/10 bg-white/[0.02]">
                        <h2 className="text-5xl font-black text-white mb-2">{introTarget.name}</h2>
                        <p className="text-cyan-400 font-bold uppercase tracking-widest">Hakkındaki Karar Nedir?</p>
                      </div>
                      <div className="p-10 space-y-10">
                        <div className="flex justify-center gap-12">
                          <div className="relative">
                            <button onClick={() => castLobbyVote('like')} className={`p-8 rounded-full border-2 transition-all ${lobbyVotes[sessionId] === 'like' ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.3)]' : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'}`}><ThumbsUp size={48}/></button>
                            <div className="absolute -top-3 -right-6 bg-[#110D17] text-cyan-400 px-3 py-1 rounded-full text-xs font-bold border border-cyan-500/30 shadow-lg">
                              {Object.entries(lobbyVotes).filter(([_, v]) => v === 'like').length} Oy
                            </div>
                          </div>
                          <div className="relative">
                            <button onClick={() => castLobbyVote('dislike')} className={`p-8 rounded-full border-2 transition-all ${lobbyVotes[sessionId] === 'dislike' ? 'bg-red-500/20 border-red-500 text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]' : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'}`}><ThumbsDown size={48}/></button>
                            <div className="absolute -top-3 -right-6 bg-[#110D17] text-red-500 px-3 py-1 rounded-full text-xs font-bold border border-red-500/30 shadow-lg">
                              {Object.entries(lobbyVotes).filter(([_, v]) => v === 'dislike').length} Oy
                            </div>
                          </div>
                        </div>
                        <div className="bg-black/40 p-6 rounded-2xl border border-white/10">
                           <div className="flex justify-between mb-3 font-bold text-sm">
                             <span className="text-cyan-400">👍 {kickVotes.likes} (Chate 1)</span>
                             <span className="text-red-500">👎 {kickVotes.dislikes} (Chate 0)</span>
                           </div>
                           <div className="h-6 bg-red-500/20 rounded-full overflow-hidden flex border border-white/5">
                             <motion.div animate={{ width: `${(kickVotes.likes + kickVotes.dislikes) === 0 ? 50 : (kickVotes.likes / (kickVotes.likes + kickVotes.dislikes)) * 100}%` }} className="h-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]"/>
                           </div>
                        </div>
                        {mePlayer?.isHost && (
                          <div className="flex flex-col items-center gap-4">
                             <div className="text-2xl font-black text-white bg-white/10 px-6 py-2 rounded-xl border border-white/5">00:{introTimer < 10 ? `0${introTimer}` : introTimer}</div>
                             <button onClick={endMeetingIntro} className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-black p-4 rounded-xl text-lg transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)]">TANIŞMAYI BİTİR VE KAYDET</button>
                          </div>
                        )}
                      </div>
                   </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* ÖZEL KELİME EKLEME MODALI */}
            <AnimatePresence>
              {showWordModal && (
                <div className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-4 backdrop-blur-md">
                   <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#110D17] border border-white/10 rounded-3xl p-8 max-w-lg w-full shadow-2xl relative flex flex-col">
                      <button onClick={() => setShowWordModal(false)} className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors"><X size={24}/></button>
                      <h3 className="text-2xl font-black text-white mb-2 flex items-center gap-2"><Pencil size={24} className="text-emerald-400"/> ÖZEL KELİME EKLE</h3>
                      <p className="text-white/40 text-xs font-medium mb-6">Her satıra bir kelime yazın. Sadece benzersiz olanlar eklenecektir.</p>
                      
                      <textarea 
                        value={customWordsInput}
                        onChange={(e) => setCustomWordsInput(e.target.value)}
                        className="w-full h-48 bg-black/40 border border-white/10 rounded-xl p-4 text-white text-sm outline-none focus:border-emerald-400/50 resize-none font-mono tracking-widest placeholder:text-white/20"
                        placeholder="ELMA&#10;ARMUT&#10;KİRAZ"
                      />
                      <div className="mt-2 text-xs font-bold text-emerald-400">
                        Benzersiz Kelime: {Array.from(new Set(customWordsInput.split('\n').map(w => w.trim().toUpperCase()).filter(w => w.length > 0))).length}
                      </div>

                      <div className="mt-8 bg-white/5 p-4 rounded-xl border border-white/5">
                         <div className="flex justify-between items-center text-white/50 text-xs font-bold mb-3"><span>Çıkma İhtimali</span> <span className="text-white bg-white/10 px-2 py-0.5 rounded">{['Yok', 'Az', 'Biraz', 'Çok'][customWordProb]}</span></div>
                         <input suppressHydrationWarning type="range" min="0" max="3" step="1" value={customWordProb} onChange={(e) => setCustomWordProb(parseInt(e.target.value))} className="w-full accent-emerald-500 bg-black/50 h-1.5 rounded-full appearance-none outline-none cursor-pointer" />
                         <div className="flex justify-between text-[10px] font-bold text-white/40 mt-3 px-1">
                            <span className={customWordProb === 0 ? 'text-emerald-400' : ''}>Yok</span>
                            <span className={customWordProb === 1 ? 'text-emerald-400' : ''}>Az</span>
                            <span className={customWordProb === 2 ? 'text-emerald-400' : ''}>Biraz</span>
                            <span className={customWordProb === 3 ? 'text-emerald-400' : ''}>Çok</span>
                         </div>
                      </div>

                      <button onClick={() => {
                         const unique = Array.from(new Set(customWordsInput.split('\n').map(w => w.trim().toUpperCase()).filter(w => w.length > 0)));
                         broadcastSync({...room, settings: {...room.settings, customWords: unique, customWordProb}});
                         setShowWordModal(false);
                      }} className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black p-4 rounded-xl mt-6 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-95">KAYDET</button>
                   </motion.div>
                </div>
              )}
            </AnimatePresence>

            <div className="flex-1 flex flex-col p-4 md:p-8 max-w-[1400px] w-full mx-auto relative z-10 min-h-max">
                {/* LOBİ UI HEADER */}
                <header className="flex flex-wrap justify-between items-center mb-8 gap-4 bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 rounded-3xl shadow-xl">
                   <div className="flex items-center gap-4">
                       <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-400 shadow-lg shadow-cyan-400/20">
                          <Sparkles size={24} className="text-white" />
                       </div>
                       <div>
                           <h1 className="text-3xl font-black text-white leading-none tracking-tight">Mekip<span className="text-cyan-300">Hub</span></h1>
                           <p className="text-xs text-white/50 font-medium uppercase tracking-widest mt-0.5">Operasyon Lobisi</p>
                       </div>
                   </div>
                   
                   <div className="flex items-center gap-3 bg-black/40 px-6 py-3 rounded-2xl border border-white/5">
                      <span className="text-white/50 font-bold text-sm">ODA:</span>
                      <span className="text-white font-black tracking-[0.3em] flex items-center text-xl">
                         {showRoomCode ? room.id : (
                           <span className="flex gap-1">
                             <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
                             <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" style={{animationDelay: "0.2s"}}></span>
                             <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" style={{animationDelay: "0.4s"}}></span>
                           </span>
                         )}
                      </span>
                      <button onClick={() => setShowRoomCode(!showRoomCode)} className="text-white/40 hover:text-cyan-300 ml-4 transition-colors">{showRoomCode ? <EyeOff size={20}/> : <Eye size={20}/>}</button>
                      <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${room.id}`)} className="text-white/40 hover:text-cyan-300 ml-1 transition-colors"><Copy size={20}/></button>
                   </div>
                   
                   <div className="flex flex-wrap items-center gap-3">
                      <span className="bg-white/5 border border-white/10 px-5 py-3 rounded-2xl text-base font-bold flex items-center gap-2 text-white"><Users size={20} className="text-cyan-400"/> {room.players.length} Ajan</span>
                      
                      {/* TAKIM VE ROL VURGUSU */}
                      <button type="button" onClick={openLobbyNameModal} className={`border px-5 py-3 rounded-2xl text-xl font-black flex items-center gap-2 uppercase tracking-wide shadow-lg transition-all hover:border-cyan-300/60 hover:bg-white/10
                        ${mePlayer?.team === 'red' ? 'bg-red-500/20 border-red-500/50 text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 
                          mePlayer?.team === 'blue' ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.2)]' : 
                          'bg-white/5 border-white/10 text-white'}
                      `}>
                          {mePlayer?.role === 'spymaster' ? <Settings size={24} className="animate-spin-slow"/> : <Search size={24}/>} 
                          {mePlayer?.name} <span className="text-[11px] opacity-60 font-medium tracking-normal ml-1">({mePlayer?.role === 'spymaster' ? 'Şef' : 'Ajan'})</span>
                          <Pencil size={16} className="opacity-50"/>
                      </button>

                      <button onClick={() => setShowLeaveConfirm(true)} className="bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white px-5 py-3 rounded-2xl text-base font-bold flex items-center gap-2 transition-all"><LogOut size={20}/> Çıkış</button>
                   </div>
                </header>

                {/* LOBİ İÇERİK IZGARASI */}
                <div className="flex-1 flex flex-col lg:flex-row gap-6 relative z-10">
                   {/* SOL KISIM: TAKIM KARTLARI VE SEYİRCİLER */}
                   <div className="flex-1 flex flex-col gap-6">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* KIRMIZI TAKIM KARTI */}
                          <div className="bg-red-950/40 backdrop-blur-xl border-2 border-red-500/50 rounded-[24px] p-6 h-fit shadow-[0_0_25px_rgba(239,68,68,0.15)] relative overflow-hidden group">
                             <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-red-500/10 blur-3xl transition group-hover:bg-red-500/20"></div>
                             <div className="flex justify-between items-center mb-6 relative z-10">
                                <div className="flex items-center gap-3 w-full">
                                   <div className="w-4 h-4 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)] shrink-0"></div>
                                   {isEditingRed ? (
                                       <input suppressHydrationWarning autoFocus value={localRedName} onChange={(e) => setLocalRedName(e.target.value)} onBlur={() => { setIsEditingRed(false); broadcastSync({...room, settings: {...room.settings, redName: localRedName}}); }} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="bg-black/50 text-white font-black text-xl w-full border border-red-500/50 rounded-lg px-3 py-1 outline-none uppercase tracking-wide focus:ring-2 focus:ring-red-500/50"/>
                                   ) : (
                                       <div className="flex items-center gap-2 group/edit flex-1">
                                           <span className="text-white font-black text-2xl uppercase tracking-wide truncate max-w-[12rem] drop-shadow-md">{localRedName}</span>
                                           {mePlayer?.isHost && (
                                               <button onClick={() => setIsEditingRed(true)} className="text-white/30 hover:text-red-400 transition-colors"><Pencil size={16}/></button>
                                           )}
                                       </div>
                                   )}
                                </div>
                                <div className="flex items-center gap-3 shrink-0 ml-2">
                                   <span className="bg-red-500/10 text-red-400 px-3 py-1.5 rounded-xl text-xs font-bold border border-red-500/20">{redTeam.length} Üye</span>
                                   {!(mePlayer?.team === 'red' && mePlayer?.role === 'operative') && <button onClick={() => switchRole('red', 'operative')} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-[0_0_10px_rgba(239,68,68,0.4)]">KATIL</button>}
                                </div>
                             </div>
                             <div className="grid grid-cols-2 gap-3 relative z-10">
                                {hasRedSpymaster ? (
                                   <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 flex justify-center items-center relative h-14 shadow-inner">
                                      <span className="text-white font-bold text-sm text-center">{redTeam.find((p:any)=>p.role==='spymaster')?.name}</span>
                                      <span className="absolute -top-2.5 left-4 bg-red-600 px-2 py-0.5 rounded-md text-[10px] text-white font-black tracking-widest shadow-md">ŞEF</span>
                                   </div>
                                ) : (
                                   <button onClick={() => switchRole('red', 'spymaster')} className="border-2 border-dashed border-red-500/30 hover:border-red-400 hover:bg-red-500/10 rounded-xl p-2 flex flex-col justify-center items-center h-14 transition-all">
                                      <span className="text-red-400/70 font-black text-[10px] tracking-widest text-center leading-tight">İSTİHBARAT ŞEFİ<br/>OL</span>
                                   </button>
                                )}
                                {redTeam.filter((p:any)=>p.role==='operative').map((p:any) => (
                                   <div key={p.sessionId} className="bg-black/40 border border-white/5 rounded-xl p-3 flex justify-center items-center h-14 hover:border-white/10 transition-colors">
                                      <span className="text-white/90 font-bold text-sm text-center">{p.name}</span>
                                   </div>
                                ))}
                                {renderEmptySlots(redTeam.filter((p:any)=>p.role==='operative').length, 'red')}
                             </div>
                          </div>

                          {/* MAVİ TAKIM KARTI */}
                          <div className="bg-blue-950/70 backdrop-blur-xl border-2 border-blue-400/60 rounded-[24px] p-6 h-fit shadow-[0_0_30px_rgba(37,99,235,0.28)] relative overflow-hidden group">
                             <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-blue-500/25 blur-3xl transition group-hover:bg-blue-500/35"></div>
                             <div className="flex justify-between items-center mb-6 relative z-10">
                                <div className="flex items-center gap-3 w-full">
                                   <div className="w-4 h-4 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)] shrink-0"></div>
                                   {isEditingBlue ? (
                                       <input suppressHydrationWarning autoFocus value={localBlueName} onChange={(e) => setLocalBlueName(e.target.value)} onBlur={() => { setIsEditingBlue(false); broadcastSync({...room, settings: {...room.settings, blueName: localBlueName}}); }} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="bg-black/50 text-white font-black text-xl w-full border border-cyan-500/50 rounded-lg px-3 py-1 outline-none uppercase tracking-wide focus:ring-2 focus:ring-cyan-500/50"/>
                                   ) : (
                                       <div className="flex items-center gap-2 group/edit flex-1">
                                           <span className="text-white font-black text-2xl uppercase tracking-wide truncate max-w-[12rem] drop-shadow-md">{localBlueName}</span>
                                           {mePlayer?.isHost && (
                                               <button onClick={() => setIsEditingBlue(true)} className="text-white/30 hover:text-cyan-400 transition-colors"><Pencil size={16}/></button>
                                           )}
                                       </div>
                                   )}
                                </div>
                                <div className="flex items-center gap-3 shrink-0 ml-2">
                                   <span className="bg-cyan-500/10 text-cyan-300 px-3 py-1.5 rounded-xl text-xs font-bold border border-cyan-500/20">{blueTeam.length} Üye</span>
                                   {!(mePlayer?.team === 'blue' && mePlayer?.role === 'operative') && <button onClick={() => switchRole('blue', 'operative')} className="bg-cyan-500 hover:bg-cyan-400 text-black px-4 py-2 rounded-xl text-xs font-black transition-all shadow-[0_0_10px_rgba(34,211,238,0.4)]">KATIL</button>}
                                </div>
                             </div>
                             <div className="grid grid-cols-2 gap-3 relative z-10">
                                {hasBlueSpymaster ? (
                                   <div className="bg-cyan-950/40 border border-cyan-500/30 rounded-xl p-3 flex justify-center items-center relative h-14 shadow-inner">
                                      <span className="text-white font-bold text-sm text-center">{blueTeam.find((p:any)=>p.role==='spymaster')?.name}</span>
                                      <span className="absolute -top-2.5 left-4 bg-cyan-500 px-2 py-0.5 rounded-md text-[10px] text-black font-black tracking-widest shadow-md">ŞEF</span>
                                   </div>
                                ) : (
                                   <button onClick={() => switchRole('blue', 'spymaster')} className="border-2 border-dashed border-cyan-500/30 hover:border-cyan-400 hover:bg-cyan-500/10 rounded-xl p-2 flex flex-col justify-center items-center h-14 transition-all">
                                      <span className="text-cyan-400/70 font-black text-[10px] tracking-widest text-center leading-tight">İSTİHBARAT ŞEFİ<br/>OL</span>
                                   </button>
                                )}
                                {blueTeam.filter((p:any)=>p.role==='operative').map((p:any) => (
                                   <div key={p.sessionId} className="bg-black/40 border border-white/5 rounded-xl p-3 flex justify-center items-center h-14 hover:border-white/10 transition-colors">
                                      <span className="text-white/90 font-bold text-sm text-center">{p.name}</span>
                                   </div>
                                ))}
                                {renderEmptySlots(blueTeam.filter((p:any)=>p.role==='operative').length, 'blue')}
                             </div>
                          </div>
                       </div>

                       {/* SEYİRCİLER (ATANMAMIŞ) KARTI */}
                       <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[24px] p-6 flex-1 shadow-xl">
                          <div className="flex justify-between items-center mb-6">
                             <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/5 rounded-lg border border-white/10"><Users size={20} className="text-white/60"/></div>
                                <span className="text-white/80 font-black text-base uppercase tracking-widest drop-shadow-sm">ATANMAMIŞ AJANLAR</span>
                             </div>
                             <span className="bg-black/40 border border-white/10 text-white/60 px-4 py-2 rounded-xl text-xs font-bold">{spectators.length} Kişi Bekliyor</span>
                          </div>
                          <div className="flex flex-wrap gap-3">
                             {spectators.map((p: any) => (
                                <div key={p.sessionId} className="bg-black/30 border border-white/10 rounded-xl px-5 py-3 flex items-center gap-3 hover:border-violet-500/30 hover:bg-white/5 transition-all">
                                   <div className="w-2 h-2 rounded-full bg-white/30"></div>
                                   <span className="text-white/90 font-bold text-sm">{p.name}</span>
                                   {p.isHost && <Crown size={16} className="text-amber-400 ml-1 drop-shadow-[0_0_5px_rgba(251,191,36,0.6)]"/>}
                                </div>
                             ))}
                             {spectators.length === 0 && (
                                <div className="w-full h-24 flex items-center justify-center border-2 border-dashed border-white/10 rounded-2xl text-white/40 font-medium text-sm bg-black/20">
                                   Bütün ajanlar aktif görevde.
                                </div>
                             )}
                          </div>
                       </div>
                   </div>

                   {/* SAĞ KISIM: DURUM VE AYARLAR */}
                   <div className="w-full lg:w-96 flex flex-col gap-6">
                     
                      {/* OYUN DURUMU KARTI */}
                      <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[24px] p-6 shadow-xl relative overflow-hidden group">
                         <div className="absolute -left-20 -bottom-20 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl transition group-hover:bg-violet-500/20"></div>
                         <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4 relative z-10">
                            <h3 className="text-white font-black text-sm tracking-widest uppercase flex items-center gap-2"><Info size={16} className="text-violet-400"/> OYUN DURUMU</h3>
                            {canStartGame ? (
                              <button onClick={handleStartOperation} className="bg-cyan-500 hover:bg-cyan-400 text-black px-4 py-2 rounded-xl text-xs font-black shadow-[0_0_15px_rgba(34,211,238,0.4)] transition-transform active:scale-95">BAŞLAT</button>
                            ) : (
                              <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2"><div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"/> BEKLİYOR</span>
                            )}
                         </div>
                         
                         <div className="space-y-4 text-sm font-semibold relative z-10">
                            <div className={`flex justify-between items-center p-3 rounded-xl border ${hasBlueSpymaster ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300' : 'bg-black/20 border-white/5 text-white/40'}`}>
                               <div className="flex items-center gap-3">
                                 {hasBlueSpymaster ? <CheckCircle2 size={18}/> : <div className="w-4 h-4 rounded-full border-2 border-white/20"/>}
                                 {localBlueName} İst. Şefi
                               </div>
                            </div>
                            <div className={`flex justify-between items-center p-3 rounded-xl border ${hasRedSpymaster ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-black/20 border-white/5 text-white/40'}`}>
                               <div className="flex items-center gap-3">
                                 {hasRedSpymaster ? <CheckCircle2 size={18}/> : <div className="w-4 h-4 rounded-full border-2 border-white/20"/>}
                                 {localRedName} İst. Şefi
                               </div>
                            </div>
                            <div className={`flex justify-between items-center p-3 rounded-xl border ${ruleMin2Blue ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300' : 'bg-black/20 border-white/5 text-white/40'}`}>
                               <div className="flex items-center gap-3">
                                 {ruleMin2Blue ? <CheckCircle2 size={18}/> : <div className="w-4 h-4 rounded-full border-2 border-white/20"/>}
                                 {localBlueName} min 2 kişi
                               </div>
                               <span className="text-xs bg-black/30 px-2 py-1 rounded-md">{blueTeam.length}/2+</span>
                            </div>
                            <div className={`flex justify-between items-center p-3 rounded-xl border ${ruleMin2Red ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-black/20 border-white/5 text-white/40'}`}>
                               <div className="flex items-center gap-3">
                                 {ruleMin2Red ? <CheckCircle2 size={18}/> : <div className="w-4 h-4 rounded-full border-2 border-white/20"/>}
                                 {localRedName} min 2 kişi
                               </div>
                               <span className="text-xs bg-black/30 px-2 py-1 rounded-md">{redTeam.length}/2+</span>
                            </div>
                            <div className={`flex justify-between items-center p-3 rounded-xl border ${ruleAllAssigned ? 'bg-white/10 border-white/20 text-white' : 'bg-black/20 border-white/5 text-white/40'}`}>
                               <div className="flex items-center gap-3">
                                 {ruleAllAssigned ? <CheckCircle2 size={18} className="text-emerald-400"/> : <div className="w-4 h-4 rounded-full border-2 border-white/20"/>}
                                 Herkes takımlarda
                               </div>
                               {!ruleAllAssigned && <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-1 rounded-md">{spectators.length} boşta</span>}
                            </div>
                         </div>
                      </div>

                      {/* AYARLAR KARTI */}
                      <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[24px] p-6 flex flex-col gap-6 shadow-xl relative z-10">
                         {/* Tanışma Sekansı */}
                         <div className="border-b border-white/10 pb-6">
                            <div className="flex justify-between items-center mb-3">
                               <div className="flex items-center gap-3 text-white font-bold text-sm"><div className="p-1.5 bg-white/5 rounded-md border border-white/10"><Users size={16} className="text-cyan-400"/></div> Tanışma Sekansı</div>
                               <button disabled={!mePlayer?.isHost} onClick={() => {
                                    if (!room.settings.introMode && (!kickEnabled || !kickConfirmed || !kickChannelName.trim())) {
                                       alert("Tanıtım modunu açmak için Kick entegrasyonu açık, kanal adı yazılı ve onaylanmış olmalıdır!");
                                       return;
                                    }
                                    const nextIntroMode = !room.settings.introMode;
                                    if (nextIntroMode) setMeetingScores({});
                                    broadcastSync({...room, settings: {...room.settings, introMode: nextIntroMode}, meetingScores: nextIntroMode ? {} : (room.meetingScores || {}), introCompleted: false, isMeetingActive: false});
                                  }} className={`w-12 h-6 rounded-full relative transition-colors border ${room.settings?.introMode ? 'bg-cyan-500 border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.4)]' : 'bg-black/50 border-white/10'}`}>
                                  <div className={`absolute top-[3px] w-4 h-4 bg-white rounded-full transition-all ${room.settings?.introMode ? 'left-[26px]' : 'left-[3px]'}`}/>
                               </button>
                            </div>
                            <p className="text-white/40 text-xs font-medium pl-10">İlk oyun başında oyuncular sırayla kendini tanıtır.</p>
                         </div>

                         {/* Zamanlayıcı */}
                         <div className="border-b border-white/10 pb-6">
                            <div className="flex items-center gap-3 text-white font-bold text-sm mb-5"><div className="p-1.5 bg-white/5 rounded-md border border-white/10"><Clock size={16} className="text-violet-400"/></div> Zamanlayıcı</div>
                            <div className="space-y-5 pl-2">
                               <div>
                                 <div className="flex justify-between text-white/50 text-xs font-bold mb-3"><span>Şef Süresi</span> <span className="text-white bg-white/10 px-2 py-0.5 rounded">{(room.settings?.spymasterTime || 60)}s</span></div>
                                 <input suppressHydrationWarning type="range" min="30" max="180" step="10" value={room.settings?.spymasterTime || 60} disabled={!mePlayer?.isHost} onChange={(e) => broadcastSync({...room, settings: {...room.settings, spymasterTime: parseInt(e.target.value)}})} className="w-full accent-violet-500 bg-black/50 h-1.5 rounded-full appearance-none outline-none" />
                               </div>
                               <div>
                                 <div className="flex justify-between text-white/50 text-xs font-bold mb-3"><span>Ajan Süresi</span> <span className="text-white bg-white/10 px-2 py-0.5 rounded">{(room.settings?.operativeTime || 60)}s</span></div>
                                 <input suppressHydrationWarning type="range" min="30" max="180" step="10" value={room.settings?.operativeTime || 60} disabled={!mePlayer?.isHost} onChange={(e) => broadcastSync({...room, settings: {...room.settings, operativeTime: parseInt(e.target.value)}})} className="w-full accent-cyan-500 bg-black/50 h-1.5 rounded-full appearance-none outline-none" />
                               </div>
                            </div>
                         </div>

                         {/* Kick Chat */}
                         <div className="border-b border-white/10 pb-6">
                            <div className="flex justify-between items-center mb-4">
                               <div className="flex items-center gap-3 text-white font-bold text-sm"><div className="p-1.5 bg-white/5 rounded-md border border-white/10"><MessageSquare size={16} className="text-red-400"/></div> Kick Chat</div>
                               <button disabled={!mePlayer?.isHost} onClick={() => {
                                    const newState = !kickEnabled;
                                    setKickEnabled(newState);
                                    if (!newState) setKickConfirmed(false);
                                    if (!newState && room.settings.introMode) broadcastSync({...room, settings: {...room.settings, introMode: false}, introCompleted: false, isMeetingActive: false});
                                  }} className={`w-12 h-6 rounded-full relative transition-colors border ${kickEnabled ? 'bg-red-500 border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.4)]' : 'bg-black/50 border-white/10'}`}>
                                  <div className={`absolute top-[3px] w-4 h-4 bg-white rounded-full transition-all ${kickEnabled ? 'left-[26px]' : 'left-[3px]'}`}/>
                               </button>
                            </div>
                            <div className="flex gap-2 mb-3">
                               <input suppressHydrationWarning value={kickChannelName} onChange={(e) => setKickChannelName(e.target.value)} disabled={kickConfirmed || !mePlayer?.isHost} className="flex-1 bg-black/40 border border-white/10 p-3 rounded-xl text-sm text-white outline-none focus:border-red-400 transition-colors" placeholder="Kanal adı" />
                               {mePlayer?.isHost && kickEnabled && (
                                  !kickConfirmed ? 
                                    <button onClick={() => {
                                      const safeChannelName = kickChannelName
                                        .trim()
                                        .replace(/^@/, '')
                                        .replace(/^https?:\/\/(www\.)?kick\.com\//i, '')
                                        .split(/[/?#]/)[0]
                                        .trim();
                                      if (!safeChannelName) return alert("Kick kanal adı girilmelidir.");
                                      setKickChannelName(safeChannelName);
                                      setKickConfirmed(true);
                                    }} className="bg-white/10 hover:bg-red-500 p-3 rounded-xl text-white transition-colors"><CheckCircle2 size={18}/></button> :
                                    <button onClick={() => setKickConfirmed(false)} className="bg-red-500/20 text-red-400 p-3 rounded-xl transition-colors border border-red-500/30"><X size={18}/></button>
                               )}
                            </div>
                            {kickConfirmed ? (
                               <div className="bg-cyan-500/10 border border-cyan-500/20 p-4 rounded-xl flex items-start gap-3">
                                  <CheckCircle2 size={16} className="text-cyan-400 shrink-0 mt-0.5"/>
                                  <div>
                                     <p className="text-cyan-300 text-xs font-bold">Chat entegrasyon aktif</p>
                                     <p className="text-cyan-400/60 text-[10px] leading-relaxed mt-1">Tanışma aşamasında chatten '1' beğeni, '0' beğenmeme olarak sayılacak.</p>
                                  </div>
                               </div>
                            ) : (
                               <div className="bg-black/20 border border-white/5 p-3 rounded-xl">
                                  <p className="text-white/40 text-xs font-bold text-center">Chat entegrasyonu kapalı</p>
                               </div>
                            )}
                         </div>

                         {/* Özel Kelimeler */}
                         <div className="pt-2">
                            <div className="flex justify-between items-center mb-4">
                               <div className="flex items-center gap-3 text-white font-bold text-sm"><div className="p-1.5 bg-white/5 rounded-md border border-white/10"><Pencil size={16} className="text-emerald-400"/></div> Özel Kelimeler</div>
                               <button disabled={!mePlayer?.isHost} onClick={() => {
                                    setCustomWordsInput(room.settings?.customWords?.join('\n') || "");
                                    setCustomWordProb(room.settings?.customWordProb || 0);
                                    setShowWordModal(true);
                                  }} className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 px-4 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                                  DÜZENLE
                               </button>
                            </div>
                            <div className="bg-black/20 border border-white/5 p-3 rounded-xl flex justify-between items-center">
                               <p className="text-white/40 text-xs font-bold">Havuz: <span className="text-white/80">{room.settings?.customWords?.length || 0} kelime</span></p>
                               <p className="text-white/40 text-xs font-bold">İhtimal: <span className="text-emerald-400">{['Yok', 'Az', 'Biraz', 'Çok'][room.settings?.customWordProb || 0]}</span></p>
                            </div>
                         </div>
                      </div>
                   </div>
                </div>
            </div>
          </div>
        );
      })()}

      {/* --- OYUN TAHTASI (BOARD - RESİMDEKİ TASARIM) --- */}
      {view === 'playing' && room && (() => {
        const isGameOver = room.status.includes('_won');
        const redLeft = room.cards?.filter((c: any) => c.color === 'red' && !c.revealed).length || 0;
        const blueLeft = room.cards?.filter((c: any) => c.color === 'blue' && !c.revealed).length || 0;

        const renderBottomClue = () => (
          <AnimatePresence mode="wait">
            {!clueBanner && room.currentClue && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.24, ease: "easeOut" }}
                style={{ willChange: "transform, opacity" }}
className={`flex-1 min-w-0 h-[5.75rem] max-h-[5.75rem] overflow-hidden border-2 rounded-2xl px-8 py-4 flex items-center justify-center gap-4 text-center ${room.currentTurn === 'red' ? 'bg-red-950/85 border-red-500/70 shadow-[0_6px_0_rgba(127,29,29,0.45),0_0_22px_rgba(239,68,68,0.25)]' : 'bg-cyan-950/85 border-cyan-400/70 shadow-[0_6px_0_rgba(8,47,73,0.45),0_0_22px_rgba(34,211,238,0.25)]'}`}              >
                <Info size={20} className="shrink-0 text-white/70" />
                <div className="bottom-clue-word-scroll px-2 pb-1 uppercase font-black tracking-wider leading-none text-white drop-shadow-sm text-2xl md:text-3xl lg:text-5xl">
  {room.currentClue.word} <span className="opacity-50 text-xl md:text-2xl mx-2">x</span>{room.currentClue.count}
</div>
              </motion.div>
            )}
          </AnimatePresence>
        );

        return (
          <div className="w-[100vw] h-[100vh] bg-gradient-to-b from-black to-[#1a0b2e] flex flex-col text-slate-100 relative overflow-hidden font-sans">
            <GlobalStyles />
<div className="bg-image-overlay"></div>
            <div className="static-scanlines absolute inset-0 pointer-events-none z-0"></div>
            <div className="bg-image-overlay"></div>
            {/* MekipHub Neon Background for Game Board */}
            <div className="neon-bg absolute inset-0 pointer-events-none z-0">
              <div className="neon-stars neon-stars-1"></div>
              <div className="neon-stars neon-stars-2"></div>
            </div>

            {/* SABİT TAKIM BİLGİSİ (SOL ALT) */}
            {mePlayer && (
                <div className={`fixed bottom-6 left-6 z-[200] px-5 py-3 rounded-2xl border shadow-2xl backdrop-blur-xl flex items-center gap-3 transition-all ${
                    mePlayer.team === 'red' ? 'bg-red-900/60 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.3)] text-red-200' :
                    mePlayer.team === 'blue' ? 'bg-cyan-900/60 border-cyan-500/50 shadow-[0_0_20px_rgba(34,211,238,0.3)] text-cyan-200' :
                    'bg-zinc-900/60 border-zinc-500/50 text-zinc-300'
                }`}>
                    {mePlayer.role === 'spymaster' ? <Settings size={24} className="animate-spin-slow"/> : <Search size={24}/>}
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 leading-none mb-1">
                            SİZİN TAKIMINIZ
                        </p>
                        <p className="text-lg font-black leading-none uppercase">
                            {mePlayer.team === 'red' ? localRedName : mePlayer.team === 'blue' ? localBlueName : 'Siviller'}
                        </p>
                    </div>
                </div>
            )}
            
            {/* SIRA DEĞİŞTİ BANNER ANİMASYONU */}
            <AnimatePresence>
               {showTurnBanner && (
                   <motion.div
                       initial={{ x: "-100%", opacity: 0 }}
                       animate={{ x: 0, opacity: 1 }}
                       exit={{ x: "100%", opacity: 0 }}
                       transition={{ type: "spring", stiffness: 100, damping: 15 }}
                       className={`absolute top-1/2 left-0 right-0 -translate-y-1/2 z-[150] py-8 flex items-center justify-center border-y-4 shadow-2xl backdrop-blur-md ${showTurnBanner === 'red' ? 'bg-red-900/80 border-red-500' : 'bg-cyan-900/80 border-cyan-400'}`}
                   >
                       <div className="flex items-center gap-6">
                          <Swords size={60} className={showTurnBanner === 'red' ? 'text-red-300' : 'text-cyan-200'} />
                          <h2 className="text-7xl font-black text-white uppercase tracking-tighter drop-shadow-xl">
                              {showTurnBanner === 'red' ? localRedName : localBlueName} SIRASI
                          </h2>
                          <Swords size={60} className={showTurnBanner === 'red' ? 'text-red-300' : 'text-cyan-200'} />
                       </div>
                   </motion.div>
               )}
            </AnimatePresence>

            {/* İPUCU GELDİ ANİMASYONU (ORTADAN ÇIKIP SOLA GİDEN) */}
            <AnimatePresence>
               {clueBanner && (
                   <div className="fixed inset-0 z-[160] flex items-center justify-center pointer-events-none">
                       <motion.div
                           initial={{ scale: 0.5, opacity: 0 }}
                           animate={{ scale: 1, opacity: 1 }}
                           exit={{ scale: 0.8, opacity: 0 }}
                           transition={{ type: "spring", stiffness: 200, damping: 20 }}
                           style={{ willChange: "transform, opacity" }}
                           className={`max-w-[min(90vw,900px)] px-16 py-10 rounded-[3rem] border-4 shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col items-center backdrop-blur-xl ${clueBanner.team === 'red' ? 'bg-red-950/90 border-red-500' : 'bg-cyan-950/90 border-cyan-400'}`}
                       >
                           <div className="flex items-center gap-3 text-white/50 font-bold mb-4 uppercase tracking-widest text-lg">
                               <Info size={28}/> ŞEF İSTİHBARAT VERDİ
                           </div>
                           <div className={`max-w-full text-center safe-wrap text-5xl md:text-8xl font-black uppercase tracking-widest leading-tight drop-shadow-xl ${clueBanner.team === 'red' ? 'text-red-100' : 'text-cyan-100'}`}>
                               {clueBanner.word} <span className="opacity-50 text-6xl">x</span>{clueBanner.count}
                           </div>
                       </motion.div>
                   </div>
               )}
            </AnimatePresence>

            {/* KUTU AÇILIŞ ANİMASYONU */}
            <AnimatePresence>
                {isDealingPhase && (
                    <div className="fixed inset-0 z-[160] flex items-center justify-center pointer-events-none">
                        {/* Siyah Karartı */}
                        <motion.div
                            initial={{ opacity: 1 }}
                            animate={{ opacity: [1, 1, 0, 0] }}
                            transition={{ duration: 4.5, times: [0, 0.11, 0.266, 1], ease: "easeInOut" }}
                            className="absolute inset-0 bg-[#0A070E] z-[160]"
                        />
                        {/* Kutu (DİKDÖRTGEN TASARIM İÇİN GÜNCELLENDİ) */}
                        <motion.div
                            initial={{ y: "-20vh", scale: 1.5 }}
                            animate={{ y: ["-20vh", "-20vh", "35vh", "35vh", "150vh", "150vh"], scale: [1.5, 1.5, 1, 1, 1, 1] }}
                            transition={{ duration: 4.5, times: [0, 0.11, 0.266, 0.444, 0.622, 1], ease: "easeInOut" }}
                            className="absolute w-[24rem] h-[32rem] z-[170] flex items-center justify-center drop-shadow-[0_0_80px_rgba(0,0,0,0.9)]"
                            style={{ 
                                backgroundImage: "url('/box.png')", 
                                backgroundSize: "contain", 
                                backgroundRepeat: "no-repeat", 
                                backgroundPosition: "center",
                                willChange: "transform"
                            }}
                        >
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ÇIKIŞ ONAY MODALI */}
            <AnimatePresence>
              {showLeaveConfirm && (
                <div className="fixed inset-0 bg-black/80 z-[150] flex items-center justify-center p-4 backdrop-blur-md">
                   <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#110D17] border-2 border-white/10 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
                      <AlertTriangle size={48} className="text-red-500 mx-auto mb-4" />
                      <h3 className="text-2xl font-black text-white mb-2">Ayrılmak İstiyor Musunuz?</h3>
                      <p className="text-white/60 mb-8 font-medium">Oda bağlantınız kesilecek ve lobi listesine döneceksiniz.</p>
                      <div className="flex gap-4">
                         <button onClick={() => setShowLeaveConfirm(false)} className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition-colors">Hayır, Kal</button>
                         <button onClick={leaveRoom} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-colors">Evet, Ayrıl</button>
                      </div>
                   </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* OYUN İÇİ ÜST BAR (Lobi ui'dan bağımsız yeni şık bar) */}
            <header className="h-16 bg-white/[0.04] backdrop-blur-xl border-b border-white/10 flex flex-wrap justify-between items-center px-6 shrink-0 z-20 gap-4">
               <div className="flex items-center gap-3 bg-black/40 px-4 py-1.5 rounded-lg border border-white/5">
                  <span className="text-white/50 font-bold text-sm">Oda Kodu:</span>
                  <span className="text-white font-black tracking-[0.2em] text-sm">
                     {showRoomCode ? room.id : '••••••'}
                  </span>
                  <button onClick={() => setShowRoomCode(!showRoomCode)} className="text-white/40 hover:text-cyan-300 ml-2 transition-colors">{showRoomCode ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
                  <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${room.id}`)} className="text-white/40 hover:text-cyan-300 ml-1 transition-colors"><Copy size={16}/></button>
               </div>
               
               <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                     <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-400">
                        <Sparkles size={12} className="text-white" />
                     </div>
                     <span className="text-white font-black text-base tracking-tight hidden sm:block">Mekip<span className="text-cyan-300">Hub</span></span>
                  </div>
                  <span className="bg-black/40 text-white/50 border border-white/5 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2"><Users size={16}/> {room.players.length}</span>
                  <div className="bg-black/40 border border-white/5 px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2">
                     <span className="text-white/50">Sırası:</span>
                     <span className={room.currentTurn === 'red' ? 'text-red-400' : 'text-cyan-400'}>{room.currentTurn === 'red' ? (room.settings?.redName || 'KIRMIZI TAKIM') : (room.settings?.blueName || 'MAVİ TAKIM')}</span>
                  </div>
               </div>
               
               <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5" title="Oyun Sesi">
                      {volume === 0 ? <VolumeX size={16} className="text-white/40"/> : <Volume2 size={16} className="text-cyan-400"/>}
                      <input suppressHydrationWarning 
                          type="range" min="0" max="1" step="0.01" 
                          value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} 
                          className="w-16 sm:w-20 h-1.5 bg-white/10 rounded-full appearance-none outline-none accent-cyan-400 cursor-pointer"
                      />
                  </div>

                  <span className="bg-black/40 text-white/80 border border-white/5 px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2"><Settings size={16} className="text-violet-400"/> {mePlayer?.name}</span>
                  <button onClick={() => setShowLeaveConfirm(true)} className="bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500 hover:text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"><LogOut size={16}/></button>
               </div>
            </header>

            <div className="flex-1 flex gap-4 p-4 overflow-hidden z-10 w-full max-w-[1920px] mx-auto">
                
                {/* SOL PANEL (KIRMIZI TAKIM VE ZAMANLAYICI) */}
                <aside className="w-72 flex flex-col gap-4 shrink-0 overflow-y-auto hidden md:flex h-full min-h-0">
                    {/* TAKIM KARTI (KIRMIZI) Daha Koyu Arkaplan ile */}
                    <div className="bg-[#3a0008] rounded-2xl p-4 flex flex-col items-center border-2 border-red-500/90 shadow-[0_0_30px_rgba(239,68,68,0.25)] relative overflow-hidden text-center min-h-[340px] shrink-0">
                        <h2 className="text-xl font-black text-red-100 mb-2 relative z-10 uppercase tracking-wide drop-shadow-sm">{room.settings?.redName || 'KIRMIZI TAKIM'}</h2>
                        {/* KALAN KART SAYISI (BEYAZ RENK) */}
                        <div className="text-8xl font-black text-white mb-1 relative z-10 leading-none drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">{redLeft}</div>
                        <div className="text-xs font-bold text-red-200/50 mb-6 relative z-10 uppercase tracking-[0.3em]">KALAN KART</div>
                        
                        <div className="space-y-2 w-full relative z-10">
                            {room.players.filter((p:any)=>p.team==='red'&&p.role==='spymaster').map((p:any)=> 
                               <div key={p.sessionId} className="bg-red-500/30 border border-red-500/45 text-red-100 font-bold text-sm py-2 px-3 rounded-xl flex items-center justify-center gap-2"><ShieldAlert size={16} className="text-red-400"/> {p.name}</div>
                            )}
                            <div className="grid grid-cols-2 gap-2 mt-2">
                               {room.players.filter((p:any)=>p.team==='red'&&p.role==='operative').map((p:any)=> 
                                  <div key={p.sessionId} className="bg-black/60 border border-white/10 text-white/85 font-medium text-sm py-2 px-2 rounded-xl truncate hover:border-white/15 transition-colors">{p.name}</div>
                               )}
                            </div>
                        </div>
                    </div>

                    {/* SÜRE KARTI */}
                    <div className="bg-white/[0.04] backdrop-blur-md rounded-2xl p-6 border border-white/10 flex flex-col items-center justify-center shadow-lg relative shrink-0">
                       {turnTimer === 0 && !isGameOver && (
                           <div className="absolute top-2 right-2 flex items-center gap-1 text-red-500 animate-pulse">
                               <AlertTriangle size={16}/>
                               <span className="text-xs font-black uppercase">Sıra Değişti</span>
                           </div>
                       )}
                       <div className="flex items-center gap-2 text-violet-400 text-xs font-bold uppercase tracking-widest mb-3">
                          <Clock size={16}/> {room.turnPhase === 'spymaster' ? 'İstihbarat Şefi Süresi' : 'Ajan Süresi'}
                       </div>
                       <div className={`text-5xl font-black mb-3 font-mono drop-shadow-md ${turnTimer <= 10 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                          0:{turnTimer.toString().padStart(2, '0')}
                       </div>
                       <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden border border-white/5">
                          <div className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all duration-1000 ease-linear" style={{ width: `${(turnTimer / (room.turnPhase === 'spymaster' ? room.settings.spymasterTime : room.settings.operativeTime)) * 100}%` }}></div>
                       </div>
                    </div>

               <AnimatePresence>
                 {winnerBanner && (
                   <motion.div
                     initial={{ scale: 0.3, opacity: 0, y: 200 }}
                     animate={{ scale: 1.15, opacity: 1, y: 0 }}
                     exit={{ scale: 0.8, opacity: 0, y: 300 }}
                     transition={{ duration: 1.1, ease: "easeInOut" }}
                     className="fixed inset-0 pointer-events-none z-[190] flex items-end justify-center pb-10"
                   >
                     <motion.div
                       animate={{ y: [0, -220], scale: [1.15, 0.72] }}
                       transition={{ delay: 2.2, duration: 1.4, ease: "easeInOut" }}
                       className={`px-14 py-8 rounded-3xl border-4 shadow-2xl backdrop-blur-xl ${winnerBanner === 'red' ? 'bg-red-900/90 border-red-400' : 'bg-cyan-900/90 border-cyan-300'}`}
                     >
                       <div className="flex items-center gap-5">
                         <Crown size={64} className={winnerBanner === 'red' ? 'text-red-300' : 'text-cyan-200'} />
                         <div>
                           <div className="text-white/70 font-black tracking-[0.4em] text-sm">OYUN BİTTİ</div>
                           <div className="text-5xl font-black text-white">
                             {winnerBanner === 'red' ? localRedName : localBlueName} KAZANDI
                           </div>
                         </div>
                       </div>
                     </motion.div>
                   </motion.div>
                 )}
               </AnimatePresence>

               <AnimatePresence>
                 {assassinRevealCard && (
                   <motion.div
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     exit={{ opacity: 0 }}
                     className="fixed inset-0 z-[220] flex items-center justify-center pointer-events-none"
                   >
                     <motion.div
                       initial={{ scale: 0.2, rotate: -12 }}
                       animate={{ scale: [0.2, 1.4, 1], rotate: [0, 4, 0] }}
                       exit={{ scale: 0.3, opacity: 0 }}
                       transition={{ duration: 2.3, ease: "easeInOut" }}
                       className="bg-black border-[6px] border-yellow-400 rounded-[40px] p-12 shadow-[0_0_80px_rgba(250,204,21,0.45)]"
                     >
                       <div className="text-center">
                         <div className="text-yellow-400 text-sm font-black tracking-[0.6em] mb-4">SUİKASTÇİ</div>
                         <div className="text-7xl font-black text-white tracking-widest">{assassinRevealCard.word}</div>
                       </div>
                     </motion.div>
                   </motion.div>
                 )}
               </AnimatePresence>
                </aside>

                {/* ORTA OYUN IZGARASI VE INPUT - SCROLL EDILEBILIR ALAN */}
<main className="flex-1 flex flex-col items-center justify-between pt-4 pb-4 overflow-hidden h-full min-h-0 relative w-full">                  {/* GRID - KART BOYUTLARI DİNAMİK OLARAK SAYFA İLE BÜYÜYÜP KÜÇÜLECEK */}
<div className="grid grid-cols-5 grid-rows-5 gap-2 sm:gap-3 md:gap-4 w-full max-w-none flex-1 min-h-0 relative mx-auto px-2 sm:px-4">                    {room.cards.map((card: any, index: number) => {
                      const amISpymaster = mePlayer?.role === 'spymaster';
                      const isActuallyRevealed = card.revealed; 
                      const isColorVisibleToSpymaster = amISpymaster;
                      const showColor = isActuallyRevealed || isColorVisibleToSpymaster || isGameOver;
                      const isPeeked = peekedCards.has(card.id);
                      
                      const imgColor = card.color === 'neutral' ? 'white' : card.color === 'assassin' ? 'black' : card.color;
                      
                      const getCardStyle = () => {
                        if (isActuallyRevealed) {
                            let baseOuter = "";
                            let peekPill = "";
                            let peekText = "";
                            if (card.color === 'red') { baseOuter = "bg-[#651d20] border border-[#9f4a4a]"; peekPill = "bg-[#2a1111] border-2 border-[#b86b62]"; peekText = "text-[#ffe8df] drop-shadow-sm"; }
                            else if (card.color === 'blue') { baseOuter = "bg-[#1f4c65] border border-[#5f8fa4]"; peekPill = "bg-[#102333] border-2 border-[#78aabc]"; peekText = "text-[#e5f8ff] drop-shadow-sm"; }
                            else if (card.color === 'neutral') { baseOuter = "bg-[#cfc5ad] border border-[#a99d80]"; peekPill = "bg-[#ddd2b9] border-2 border-[#9f9274]"; peekText = "text-[#332d22]"; }
                            else { baseOuter = "bg-zinc-900 border border-zinc-500"; peekPill = "bg-black/90 border-2 border-white/20"; peekText = "text-white"; }
                            
                            return { 
                                outer: baseOuter, 
                                pill: isPeeked ? peekPill : "hidden", 
                                text: isPeeked ? peekText : "hidden" 
                            };
                        }

                        if (showColor) {
                            if (card.color === 'red') return { outer: "bg-[#651d20] border-2 border-[#9f4a4a] shadow-[0_0_26px_rgba(101,29,32,0.28)]", pill: "bg-[#2a1111] border-2 border-[#b86b62]", text: "text-[#ffe8df] drop-shadow-sm" };
                            if (card.color === 'blue') return { outer: "bg-[#1f4c65] border-2 border-[#5f8fa4] shadow-[0_0_30px_rgba(31,76,101,0.32)]", pill: "bg-[#102333] border-2 border-[#78aabc]", text: "text-[#e5f8ff] drop-shadow-sm" };
                            if (card.color === 'neutral') return { outer: "bg-[#cfc5ad] border-2 border-[#a99d80] shadow-[0_0_22px_rgba(207,197,173,0.20)] backdrop-blur-md", pill: "bg-[#ddd2b9] border-2 border-[#9f9274]", text: "text-[#332d22] drop-shadow-sm" };
                            return { outer: "bg-[#07070b] border-2 border-red-500/80 shadow-[0_0_28px_rgba(239,68,68,0.24)]", pill: "bg-red-950/95 border-2 border-red-400/80", text: "text-white drop-shadow-sm" };
                        }

                        // OYUN İÇİNDE AJANLARIN GÖRDÜĞÜ KAPALI KARTLAR (KREM VE TAM OPAK)
                        return { outer: "bg-[#cfc5ad] border-2 border-[#a99d80] shadow-[0_6px_0_rgba(92,80,56,0.42),0_0_18px_rgba(207,197,173,0.16)]", pill: "bg-[#ddd2b9] text-[#2f2a20] border-2 border-[#9f9274]", text: "text-[#332d22] font-black drop-shadow-sm" };
                      };
                      
                      const style = getCardStyle();
                      const votingPlayers = card.votes
                          .map((vId: string) => room.players.find((p: any) => p.sessionId === vId))
                          .filter((p: any) => p !== undefined);

                      // Yüzdelik (Fluid) animasyon hesaplamaları
                      const col = index % 5;
                      const row = Math.floor(index / 5);
                      const startX = `${(2 - col) * 105}%`;
                      const startY = `calc(${(2 - row) * 105}% + 40vh)`;
                      const deckX = startX;
                      const deckY = `calc(${(2 - row) * 105}% - 5vh)`; 

                      const initialProps = isDealingPhase 
                          ? { opacity: 0, x: startX, y: startY, rotateZ: 0 }
                          : { opacity: 1, x: 0, y: 0, rotateZ: 0 };

                      const duration = 4.5;
                      const t1 = 0.266; 
                      const t2 = 0.400; 
                      
                      // AYNI ANDA TETİKLENME (Stagger tamamen kaldırıldı)
                      const flyStart = 2.0; 
                      const flyEnd = 2.4;
                      const tFlyStart = flyStart / duration;
                      const tFlyEnd = flyEnd / duration;

                      const animateProps = isDealingPhase
                          ? { 
                              opacity: [0, 0, 1, 1, 1, 1], 
                              x: [startX, startX, deckX, deckX, 0, 0], 
                              y: [startY, startY, deckY, deckY, 0, 0], 
                              scale: [0.5, 0.5, 1, 1, 1, 1],
                              rotateZ: [0, 0, 0, 0, 0, 0]
                            }
                          : { opacity: 1, x: 0, y: 0, scale: 1, rotateZ: 0 };

                      const transitionProps = isDealingPhase
                          ? {
                              duration: duration, 
                              times: [0, t1, t2, tFlyStart, tFlyEnd, 1], 
                              ease: "easeInOut"
                            }
                          : { duration: 0 };

                      return (
                        <div key={card.id} className="relative z-10 w-full h-full min-h-0 garage-card-perspective">
                            <motion.div
                              onClick={() => {
                                if (isActuallyRevealed) {
                                    setPeekedCards(prev => {
                                        const next = new Set(prev);
                                        if (next.has(card.id)) next.delete(card.id);
                                        else next.add(card.id);
                                        return next;
                                    });
                                    return;
                                }
                                if (isGameOver) return;
                                if (amISpymaster || !isMyTurn || !isOperativeTurn) return;
                                voteCard(card.id);
                              }}
                              initial={initialProps}
                              animate={animateProps as any}
                              transition={transitionProps as any}
                              whileHover={(!isActuallyRevealed && !amISpymaster && isMyTurn && isOperativeTurn && !isGameOver) ? { y: -2, boxShadow: '0 8px 15px rgba(0,0,0,0.3)' } : {}}
                              whileTap={(!isActuallyRevealed && !amISpymaster && isMyTurn && isOperativeTurn && !isGameOver) ? { y: 2, boxShadow: '0 0 0 transparent' } : {}}
                              style={{ willChange: "transform, opacity" }}
                              className={`absolute inset-0 rounded-xl flex items-center justify-center cursor-pointer select-none transition-all duration-200 overflow-visible group p-2 ${style.outer} ${isActuallyRevealed ? 'shadow-none' : ''}`}
                            >
                              {!isActuallyRevealed && (
                                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.045] z-0">
                                    <span className="font-black text-2xl md:text-3xl lg:text-5xl tracking-[0.3em] text-white uppercase select-none drop-shadow-md">MEKIP</span>
                                 </div>
                              )}
                              
                              {isActuallyRevealed && (
                                 <motion.div 
                                   initial={{ rotateX: 0, y: 0, scale: 1 }}
                                   animate={{ rotateX: isPeeked ? 55 : 0, y: isPeeked ? -5 : 0, scale: isPeeked ? 1.01 : 1 }} 
                                   transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                                   className={`absolute inset-0 w-full h-full bg-cover bg-center z-10 rounded-xl transition-opacity duration-300 garage-card-door ${isPeeked ? 'pointer-events-none shadow-[0_22px_42px_rgba(0,0,0,0.42)]' : 'opacity-100'}`}
                                   style={{ backgroundImage: `url(/cards/${imgColor}/${card.designId}.png)`, willChange: "transform, opacity" }}
                                 />
                              )}

                              {(!isActuallyRevealed || isPeeked) && (
                                  <div className={`w-[96%] min-h-[3.15rem] max-h-[3.35rem] absolute bottom-2.5 flex items-center justify-center px-3 py-2.5 shadow-sm z-20 rounded-xl backdrop-blur-md transition-all duration-300 overflow-hidden ${style.pill}`}>
                                      <div className="card-word-pill-scroll">
                                          <span className={`block min-w-max text-center font-black text-lg md:text-xl tracking-wider uppercase leading-tight whitespace-nowrap ${style.text || ''}`}>{card.word}</span>
                                      </div>
                                  </div>
                              )}

                              {!isActuallyRevealed && votingPlayers.length > 0 && (
                                <div className="absolute top-1.5 left-1.5 flex flex-col gap-1 z-30 pointer-events-none">
                                  {votingPlayers.map((p: any) => (
                                    <div key={p.sessionId} className={`px-2 py-0.5 rounded-md shadow-lg text-[11px] font-black border tracking-wider backdrop-blur-sm ${p.team === 'red' ? 'bg-red-600/90 border-red-400/50 text-white' : 'bg-cyan-600/90 border-cyan-400/50 text-white'}`}>
                                      {p.name}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {amISpymaster && !isActuallyRevealed && card.color === 'assassin' && (
                                <div className="absolute top-2 left-2 opacity-80 z-30 bg-black/50 p-1.5 rounded-lg border border-red-500/30 backdrop-blur-md"><Search size={20} className="text-red-400 drop-shadow-sm"/></div>
                              )}
                            </motion.div>

                            {!isActuallyRevealed && !amISpymaster && isMyTurn && isOperativeTurn && !isGameOver && card.votes.includes(sessionId) && (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); revealCard(card.id); }} 
                                  className={`absolute -top-3 -right-3 text-white p-2.5 rounded-xl transition-all active:translate-y-1 active:shadow-[0_0_0_transparent] flex items-center justify-center z-[100] cursor-pointer border ${room.currentTurn === 'red' ? 'bg-gradient-to-br from-red-400 to-red-600 hover:from-red-300 hover:to-red-500 shadow-[0_4px_0_#991b1b,0_10px_15px_-3px_rgba(239,68,68,0.5)] border-red-200/50 hover:shadow-[0_6px_0_#991b1b,0_10px_20px_-3px_rgba(239,68,68,0.6)]' : 'bg-gradient-to-br from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 shadow-[0_4px_0_#1e40af,0_10px_15px_-3px_rgba(34,211,238,0.5)] border-cyan-200/50 hover:shadow-[0_6px_0_#1e40af,0_10px_20px_-3px_rgba(34,211,238,0.6)]'}`}
                                  title="Kartı Aç"
                                >
                                  <Hand size={24} className="drop-shadow-md" />
                                </button>
                            )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="w-full max-w-[1000px] flex gap-3 shrink-0 relative z-10 mx-auto mt-4">
                     {isGameOver ? (
                         <div className="flex-1 bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-2xl px-8 py-5 flex items-center justify-between shadow-lg">
                            <div className="flex items-center gap-4">
                               <Crown size={32} className={room.status === 'red_won' ? 'text-red-400' : 'text-cyan-400'} />
                               <div>
                                   <h2 className="text-xl font-black uppercase text-white tracking-widest">{room.status === 'red_won' ? localRedName : localBlueName} KAZANDI</h2>
                                   <p className="text-white/40 text-sm font-bold uppercase mt-1">OPERASYON TAMAMLANDI</p>
                               </div>
                            </div>
                            {mePlayer?.isHost ? (
                                <button onClick={returnToLobby} className="bg-cyan-500 hover:bg-cyan-400 text-black px-6 py-3 rounded-xl font-black transition-all shadow-[0_0_15px_rgba(34,211,238,0.4)] flex items-center gap-2 active:scale-95">
                                    <RotateCcw size={20} /> LOBİYE ÇEK
                                </button>
                            ) : (
                                <p className="text-white/30 text-base font-bold animate-pulse">Kurucunun lobiyi kurması bekleniyor...</p>
                            )}
                         </div>
                     ) : mePlayer?.role === 'spymaster' && isMyTurn && isSpymasterTurn && !room.status.includes('_won') ? (
                        <>
                           <div className="flex-1 bg-black/45 backdrop-blur-xl border-2 border-white/20 rounded-2xl p-2.5 flex shadow-[0_0_28px_rgba(34,211,238,0.12)] ring-1 ring-cyan-400/10 transition-all focus-within:border-cyan-300/80 focus-within:bg-black/60 focus-within:shadow-[0_0_34px_rgba(34,211,238,0.28)]">
                              <div className="pl-4 pr-2 flex items-center text-white/55"><Pencil size={22}/></div>
                              <input suppressHydrationWarning 
                                value={clueWord}
                                onChange={e => setClueWord(e.target.value.replace(/\s/g, ''))}
                                placeholder="Tek kelimelik ipucu yazın..."
                                className="flex-1 bg-transparent text-white px-2 py-2.5 outline-none uppercase font-black text-lg tracking-widest placeholder:text-white/35 placeholder:font-semibold placeholder:tracking-normal"
                              />
                           </div>
                           <div className="flex items-center bg-black/45 backdrop-blur-xl border-2 border-white/20 rounded-2xl overflow-hidden shrink-0 shadow-[0_0_28px_rgba(34,211,238,0.12)] ring-1 ring-cyan-400/10 p-2 transition-all focus-within:border-cyan-300/80 focus-within:bg-black/60 focus-within:shadow-[0_0_34px_rgba(34,211,238,0.28)]">
                              <button onClick={() => setClueCount(prev => typeof prev === 'number' ? Math.max(1, prev - 1) : 1)} className="w-12 h-12 rounded-xl flex items-center justify-center hover:bg-white/10 text-white font-black transition-colors">-</button>
                              <input suppressHydrationWarning 
                                type="text" 
                                value={clueCount === 'unlimited' ? '∞' : clueCount}
                                onChange={e => { const val = parseInt(e.target.value); if (!isNaN(val)) setClueCount(Math.min(9, Math.max(1, val))); }}
                                className="w-12 bg-transparent text-center text-cyan-200 font-black outline-none text-2xl drop-shadow-[0_0_8px_rgba(34,211,238,0.45)]"
                              />
                              <button onClick={() => setClueCount(prev => typeof prev === 'number' ? Math.min(9, prev + 1) : 1)} className="w-12 h-12 rounded-xl flex items-center justify-center hover:bg-white/10 text-white font-black transition-colors">+</button>
                           </div>
                           <button onClick={submitClue} disabled={!clueWord} className={`text-white px-8 py-4 rounded-2xl font-black text-base tracking-widest transition-all shrink-0 border border-white/10 disabled:border-transparent disabled:from-white/5 disabled:to-white/5 disabled:text-white/20 disabled:shadow-none bg-gradient-to-r ${room.currentTurn === 'red' ? 'from-red-500 to-red-700 hover:from-red-400 hover:to-red-600 shadow-[0_0_20px_rgba(239,68,68,0.3)]' : 'from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 shadow-[0_0_20px_rgba(34,211,238,0.3)]'}`}>GÖNDER</button>
                        </>
                     ) : mePlayer?.role === 'operative' && isMyTurn && isOperativeTurn && !room.status.includes('_won') ? (
                         <div className="flex w-full gap-3 min-w-0">
                             {renderBottomClue()}
                             <button onClick={skipTurn} className={`flex items-center gap-2 text-white px-8 rounded-2xl font-black text-base tracking-widest transition-all shrink-0 border border-white/10 shadow-lg bg-gradient-to-r ${room.currentTurn === 'red' ? 'from-red-900 to-black hover:from-red-800 border-red-500/30' : 'from-cyan-900 to-black hover:from-cyan-800 border-cyan-500/30'}`}>
                                 <FastForward size={20} /> PAS GEÇ
                             </button>
                         </div>
                     ) : (
                        <div className="flex w-full gap-3 min-w-0">
                            {renderBottomClue()}
                        </div>
                     )}
                  </div>
                </main>

                {/* SAĞ PANEL (MAVİ TAKIM VE LOG) */}
                <aside className="w-72 flex flex-col gap-4 shrink-0 hidden md:flex h-full min-h-0">
                    {/* TAKIM KARTI (MAVİ) Daha Koyu Arkaplan ile */}
                    <div className="bg-[#003a66] rounded-2xl p-4 flex flex-col items-center border-2 border-blue-400/80 shadow-[0_0_38px_rgba(37,99,235,0.34)] relative overflow-hidden text-center min-h-[340px] shrink-0">
                        <h2 className="text-xl font-black text-cyan-100 mb-2 relative z-10 uppercase tracking-wide drop-shadow-sm">{room.settings?.blueName || 'MAVİ TAKIM'}</h2>
                        {/* KALAN KART SAYISI (BEYAZ RENK) */}
                        <div className="text-8xl font-black text-white mb-1 relative z-10 leading-none drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">{blueLeft}</div>
                        <div className="text-xs font-bold text-cyan-200/50 mb-6 relative z-10 uppercase tracking-[0.3em]">KALAN KART</div>
                        
                        <div className="space-y-2 w-full relative z-10">
                            {room.players.filter((p:any)=>p.team==='blue'&&p.role==='spymaster').map((p:any)=> 
                               <div key={p.sessionId} className="bg-cyan-500/30 border border-cyan-500/45 text-cyan-100 font-bold text-sm py-2 px-3 rounded-xl flex items-center justify-center gap-2"><ShieldAlert size={16} className="text-cyan-400"/> {p.name}</div>
                            )}
                            <div className="grid grid-cols-2 gap-2 mt-2">
                               {room.players.filter((p:any)=>p.team==='blue'&&p.role==='operative').map((p:any)=> 
                                  <div key={p.sessionId} className="bg-black/60 border border-white/10 text-white/85 font-medium text-sm py-2 px-2 rounded-xl truncate hover:border-white/15 transition-colors">{p.name}</div>
                               )}
                            </div>
                        </div>
                    </div>

                    {/* GÜNLÜK (OYUN KAYDI) */}
                    <div className="bg-white/[0.04] backdrop-blur-md rounded-2xl border border-white/10 flex-1 flex flex-col overflow-hidden min-h-0 shadow-lg">
                       <div className="p-4 border-b border-white/5 flex items-center gap-2 text-white/80 font-bold text-sm tracking-widest uppercase bg-black/20 shrink-0">
                          <ScrollText size={16} className="text-violet-400"/> İSTİHBARAT GÜNLÜĞÜ
                       </div>
                       <div className="flex-1 overflow-y-auto p-4 space-y-3">
                          {room.currentClue && (
                             <div className={`mb-5 border p-3 rounded-xl text-sm font-medium text-white/80 shadow-md ${room.currentTurn === 'red' ? 'bg-gradient-to-r from-red-500/20 to-black/20 border-red-500/30' : 'bg-gradient-to-r from-cyan-500/20 to-black/20 border-cyan-500/30'}`}>
                                <div className="flex items-center gap-2 mb-1.5 opacity-70"><Info size={14}/> Aktif İpucu:</div>
                                <strong className={`uppercase tracking-wider text-base block max-w-full leading-tight safe-wrap ${room.currentTurn === 'red' ? 'text-red-400' : 'text-cyan-300'}`}>{room.currentClue.word} <span className="opacity-50">x</span>{room.currentClue.count}</strong>
                             </div>
                          )}
                          <div className="space-y-4">
                            {room.gameLogs?.slice().reverse().map((log: any, idx: number) => {
                               let wordColorClass = "text-white/80";
                               if (log.type === 'reveal' && log.color) {
                                   if (log.color === 'red') wordColorClass = "text-red-400";
                                   else if (log.color === 'blue') wordColorClass = "text-cyan-400";
                                   else if (log.color === 'assassin') wordColorClass = "text-zinc-400 bg-black px-1 rounded";
                                   else wordColorClass = "text-white/60";
                               }

                               return (
                                   <div key={log.id} className="text-xs leading-relaxed relative pl-3 before:absolute before:left-0 before:top-1.5 before:w-1 before:h-1 before:rounded-full before:bg-white/20 safe-wrap">
                                      <span className={log.team === 'red' ? 'text-red-400 font-bold' : 'text-cyan-400 font-bold'}>{log.team === 'red' ? 'KRMIZI' : 'MAVİ'}</span>{' '}
                                      <span className="text-white/40 truncate max-w-[50px] inline-block align-bottom">{log.playerName}</span>{' '}
                                      
                                      {log.type === 'clue' ? (
                                         <span className="text-white/60 text-[11px]">ipucu verdi: <strong className={`uppercase tracking-wider text-xs inline-block max-w-full align-bottom leading-tight safe-wrap ${log.team === 'red' ? 'text-red-400' : 'text-cyan-400'}`}>{log.word} <span className="opacity-50 text-[11px]">x</span>{log.count}</strong></span>
                                      ) : log.type === 'timeout' ? (
                                         <span className="text-amber-400 font-bold ml-1">SÜRESİ BİTTİ</span>
                                      ) : log.type === 'pass' ? (
                                         <span className="font-bold ml-1 text-white/50 bg-white/10 px-1.5 py-0.5 rounded">PAS GEÇİLDİ</span>
                                      ) : (
                                         <div className="mt-1 bg-black/20 p-1.5 rounded-lg border border-white/5">
                                            {log.relatedClue && <div className="text-[10px] text-white/30 uppercase mb-0.5 leading-tight safe-wrap">'{log.relatedClue}' için açıldı:</div>}
                                            <span className={`uppercase font-black tracking-wider leading-tight safe-wrap ${wordColorClass}`}>{log.word}</span>
                                            <span className={`font-bold ml-2 px-1.5 py-0.5 rounded text-[10px] float-right ${log.color === log.team ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' : log.color === 'assassin' ? 'bg-red-900/50 text-red-500 border border-red-500/50' : 'bg-amber-500/20 text-amber-400 border border-amber-500/20'}`}>
                                               {log.color === log.team ? 'DOĞRU' : log.color === 'assassin' ? 'SUİKASTÇİ' : 'YANLIŞ'}
                                            </span>
                                         </div>
                                      )}
                                   </div>
                               );
                            })}
                          </div>
                          {(!room.gameLogs || room.gameLogs.length === 0) && <div className="text-white/30 italic text-sm font-medium text-center mt-10">Henüz hamle yapılmadı.</div>}
                       </div>
                    </div>
                </aside>
            </div>
          </div>
        );
      })()}
    </>
  );
}