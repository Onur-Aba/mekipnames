"use client";

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Hand, Search, Users, ShieldAlert, Crown, Copy, Settings, ArrowRight, AlertTriangle, ThumbsUp, ThumbsDown, X, Play, LogIn, Lock, Unlock, UserPlus, Info, ScrollText, LogOut, Clock, MessageSquare, Eye, EyeOff, Pencil, Sparkles, RotateCcw } from 'lucide-react';
import { Player, Room, Card, Team, Role } from '@/types';
import bcrypt from 'bcryptjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lutfen-env-dosyasi-olustur.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'lutfen-key-ekle';
const supabase = createClient(supabaseUrl, supabaseKey);

const FALLBACK_WORDS = ["ELMA", "AJAN", "KÖPEK", "UZAY", "MISIR", "ALTIN", "HÜCRE", "ZAMAN", "KILIÇ", "BOMBA", "MASA", "KEDİ", "KUŞ", "DENİZ", "OKUL", "OYUN", "TELEFON", "KALP", "RÜZGAR", "ATEŞ", "BİLGİSAYAR", "GÖZLÜK", "DUVAR", "KAPI", "PENCERE"];

export default function CodenamesGame() {
  // GÖRÜNÜM YÖNETİMİ
  const [view, setView] = useState<'login' | 'room_list' | 'lobby' | 'playing'>('login');
  const [playerName, setPlayerName] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [rooms, setRooms] = useState<any[]>([]);
  const [room, setRoom] = useState<any | null>(null);
  const [channel, setChannel] = useState<any>(null);
  const [hostPresent, setHostPresent] = useState(true);

  // VİDEODAKİ KUTU AÇILMA ANİMASYONU İÇİN DURUMLAR
  const [isDealingPhase, setIsDealingPhase] = useState(false);
  const hasDealtRef = useRef(false);

  const roomRef = useRef<any>(null);
  useEffect(() => { roomRef.current = room; }, [room]);

  // ORTAK DEĞİŞKEN
  const mePlayer = room?.players?.find((p: any) => p.sessionId === sessionId);

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

  const isEnvMissing = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
  }, []);

  useEffect(() => {
    if (view === 'room_list') fetchRooms();
  }, [view]);

  const fetchRooms = async () => {
    if (isEnvMissing) return;
    const { data } = await supabase.from('active_codenames_rooms').select('*');
    if (data) setRooms(data);
  };

  useEffect(() => {
    if (room?.settings?.redName) setLocalRedName(room.settings.redName);
    if (room?.settings?.blueName) setLocalBlueName(room.settings.blueName);
  }, [room?.settings?.redName, room?.settings?.blueName]);

  // Oyun içi zamanlayıcı ve Süre Bittiğinde Sıra Değişimi
  useEffect(() => {
     if (view === 'playing' && room && !room.status.includes('_won')) {
        const timeLimit = room.turnPhase === 'spymaster' ? room.settings.spymasterTime : room.settings.operativeTime;
        setTurnTimer(timeLimit);
     }
  }, [room?.currentTurn, room?.turnPhase, view]);

  useEffect(() => {
     if (view === 'playing' && turnTimer > 0 && room && !room.status.includes('_won')) {
         const t = setTimeout(() => setTurnTimer(turnTimer - 1), 1000);
         return () => clearTimeout(t);
     } else if (view === 'playing' && turnTimer === 0 && room && !room.status.includes('_won') && mePlayer?.isHost) {
         // Süre bittiğinde sırayı karşıya geçir (Sadece Host Tetikler)
         let updatedRoom = { ...room };
         
         const log = { id: Date.now(), type: 'timeout', team: updatedRoom.currentTurn, playerName: 'Sistem', word: 'SÜRE BİTTİ', color: 'neutral' };
         updatedRoom.gameLogs = [...(updatedRoom.gameLogs || []), log];

         updatedRoom.turnPhase = 'spymaster';
         updatedRoom.currentTurn = updatedRoom.currentTurn === 'red' ? 'blue' : 'red';
         updatedRoom.currentClue = null;
         
         broadcastSync(updatedRoom);
     }
  }, [turnTimer, view, room?.status]);

  // 2. KICK WEBSOCKET BAĞLANTISI
  useEffect(() => {
    if (!mePlayer?.isHost || !kickConfirmed || !introTarget || !kickChannelName) return;

    let ws: WebSocket;
    const connectToKick = async () => {
      try {
        const targetUrl = encodeURIComponent(`https://kick.com/api/v2/channels/${kickChannelName}`);
        const proxyUrl = `https://corsproxy.io/?${targetUrl}`;

        const proxyRes = await fetch(proxyUrl);
        if (!proxyRes.ok) return;

        const data = await proxyRes.json();
        if (!data?.chatroom?.id) return;

        ws = new WebSocket('wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=7.6.0&flash=false');
        ws.onopen = () => ws.send(JSON.stringify({ event: "pusher:subscribe", data: { auth: "", channel: `chatrooms.${data.chatroom.id}.v2` } }));
        ws.onmessage = (e) => {
          const wsData = JSON.parse(e.data);
          if (wsData.event === 'App\\Events\\ChatMessageEvent') {
            const chat = JSON.parse(wsData.data);
            const msg = chat.content.trim();
            const user = chat.sender.username;
            if (msg === '1' || msg === '0') {
              setKickVotes(prev => {
                if (prev.voters.has(user)) return prev;
                const updated = {
                  likes: msg === '1' ? prev.likes + 1 : prev.likes,
                  dislikes: msg === '0' ? prev.dislikes + 1 : prev.dislikes,
                  voters: new Set(prev.voters).add(user)
                };
                channel?.send({ type: 'broadcast', event: 'kickUpdate', payload: { likes: updated.likes, dislikes: updated.dislikes } });
                return updated;
              });
            }
          }
        };
      } catch (err) { console.error("Kick Error:", err); }
    };
    connectToKick();
    return () => { if (ws) ws.close(); };
  }, [introTarget, kickConfirmed, kickChannelName, mePlayer]);

  // 3. SUPABASE REALTIME & HANDSHAKE & PRESENCE SİSTEMİ
  useEffect(() => {
    if (!room?.id || isEnvMissing) return;
    const roomChannel = supabase.channel(`room:${room.id}`);
    
    roomChannel
      .on('broadcast', { event: 'sync' }, ({ payload }) => {
        setRoom(payload.room);
        if (payload.room.meetingScores) setMeetingScores(payload.room.meetingScores);
        
        if (payload.room.isMeetingActive !== undefined) {
           setMeetingView(payload.room.isMeetingActive);
        }

        // Lobiye Dönüş Durumu
        if (payload.room.status === 'waiting' && view === 'playing') {
            hasDealtRef.current = false;
            setView('lobby');
        }

        if (payload.room.status === 'playing' && view !== 'playing') {
            // DİĞER OYUNCULAR İÇİN KUTU ANİMASYONUNU TETİKLEME (ALT-TAB KORUMALI)
            if (!hasDealtRef.current) {
                hasDealtRef.current = true;
                if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                    setIsDealingPhase(true);
                    setTimeout(() => setIsDealingPhase(false), 2600); // Toplam 2.5s süren animasyon için
                }
            }
            setView('playing');
            setMeetingView(false);
        }
      })
      .on('broadcast', { event: 'requestSync' }, ({ payload }) => {
        const currentRoom = roomRef.current;
        const me = currentRoom?.players?.find((p: any) => p.sessionId === sessionId);
        
        if (me?.isHost && !currentRoom?.isSyncing) {
           const exists = currentRoom.players.some((p: any) => p.sessionId === payload.newPlayer.sessionId);
           let updatedRoom = { ...currentRoom };
           
           if (!exists) {
               updatedRoom.players = [...currentRoom.players, payload.newPlayer];
               setRoom(updatedRoom);
           }
           roomChannel.send({ type: 'broadcast', event: 'sync', payload: { room: updatedRoom } });
        }
      })
      .on('broadcast', { event: 'startIntro' }, ({ payload }) => {
        setIntroTarget(payload);
        setLobbyVotes({});
        setKickVotes({ likes: 0, dislikes: 0, voters: new Set() });
        setIntroTimer(10);
      })
      .on('broadcast', { event: 'lobbyVote' }, ({ payload }) => {
        setLobbyVotes(prev => ({ ...prev, [payload.voterId]: payload.vote }));
      })
      .on('broadcast', { event: 'kickUpdate' }, ({ payload }) => {
        setKickVotes(prev => ({ ...prev, likes: payload.likes, dislikes: payload.dislikes }));
      })
      .on('broadcast', { event: 'endIntro' }, () => setIntroTarget(null))
      .on('presence', { event: 'sync' }, () => {
         const state = roomChannel.presenceState();
         const allUsers = Object.values(state).flat();
         const hasHost = allUsers.some((u: any) => u.isHost);
         setHostPresent(hasHost);
      })
      .subscribe(async (status) => { 
         if (status === 'SUBSCRIBED') {
            setChannel(roomChannel);
            const me = roomRef.current?.players?.find((p: any) => p.sessionId === sessionId);
            await roomChannel.track({ sessionId, isHost: me?.isHost });

            if (roomRef.current?.isSyncing) {
               const newPlayer = { id: sessionId, sessionId, name: playerName, team: 'spectator', role: 'operative', isHost: false, connected: true };
               roomChannel.send({ type: 'broadcast', event: 'requestSync', payload: { newPlayer } });
            }
         } 
      });

    return () => { supabase.removeChannel(roomChannel); };
  }, [room?.id, isEnvMissing, sessionId, playerName, view]);

  // 4. OTOMATİK SİLİNME (SADECE ODADA KİMSE YOKSA)
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (room && room.players && room.players.length === 0) {
        timeout = setTimeout(async () => {
            if (isEnvMissing) return;
            await supabase.from('active_codenames_rooms').delete().eq('id', room.id);
        }, 5 * 60 * 1000); 
    }
    return () => clearTimeout(timeout);
  }, [room?.players?.length]);

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

    const host: Player = { id: sessionId, sessionId, name: playerName, team: 'spectator', role: 'operative', isHost: true, connected: true };
    const newRoom = {
      id: roomId, name: createName, password: hash, status: 'waiting', players: [host],
      settings: { spymasterTime: 90, operativeTime: 90, redName: 'KIRMIZI TAKIM', blueName: 'MAVİ TAKIM', introMode: false }, 
      cards: [], currentTurn: 'red', turnPhase: 'spymaster', meetingScores: {}, currentClue: null, guessesLeft: 0, timeRemaining: 0, introCompleted: false, gameLogs: [], isMeetingActive: false
    };

    if (!isEnvMissing) {
      await supabase.from('active_codenames_rooms').insert([{ id: roomId, name: createName, password: hash, status: 'waiting' }]);
    }
    setRoom(newRoom);
    setView('lobby');
  };

  const handleJoinRoom = async (roomId: string, sid = sessionId, sname = playerName) => {
    if (isEnvMissing) return alert("Veritabanı bağlı değil!");
    
    const { data, error } = await supabase.from('active_codenames_rooms').select('*').eq('id', roomId).single();
    if (error || !data) {
       console.error("Join Room Hatası:", error);
       alert("Oda bulunamadı veya silinmiş olabilir.");
       return;
    }

    if (data.password) {
      const pass = prompt("Oda şifresini girin:");
      if (!pass || !bcrypt.compareSync(pass, data.password)) return alert("Yanlış şifre!");
    }

    setRoom({ id: roomId, name: data.name, isSyncing: true, players: [] });
    setView('lobby');
  };

  const broadcastSync = async (updatedRoom: any) => {
    setRoom(updatedRoom);
    channel?.send({ type: 'broadcast', event: 'sync', payload: { room: updatedRoom } });
    if (!isEnvMissing && updatedRoom.id && updatedRoom.status !== 'waiting') {
      await supabase.from('active_codenames_rooms').update({ status: updatedRoom.status }).eq('id', updatedRoom.id);
    }
  };

  const startMeetingIntro = (target: Player) => {
    if (!mePlayer?.isHost) return;
    if (meetingResults[target.sessionId]) return; 

    channel?.send({ type: 'broadcast', event: 'startIntro', payload: target });
    setIntroTarget(target);
    setLobbyVotes({});
    setKickVotes({ likes: 0, dislikes: 0, voters: new Set() });
    setIntroTimer(10);
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
    channel?.send({ type: 'broadcast', event: 'endIntro' });
    setIntroTarget(null);
  };

  const castLobbyVote = (vote: 'like' | 'dislike') => {
    setLobbyVotes(prev => ({ ...prev, [sessionId]: vote }));
    channel?.send({ type: 'broadcast', event: 'lobbyVote', payload: { voterId: sessionId, vote } });
  };

  const switchRole = (team: Team, role: Role) => {
    const updated = room.players.map((p: any) => p.sessionId === sessionId ? { ...p, team, role } : p);
    broadcastSync({ ...room, players: updated });
  };

  const handleStartOperation = () => {
    if (room.settings.introMode && !room.introCompleted) {
      setMeetingView(true);
      broadcastSync({ ...room, isMeetingActive: true }); 
    } else {
      startGame();
    }
  };

  const startGame = async () => {
    if (!room) return;
    
    let dbWords: string[] = [];
    if (!isEnvMissing) {
      try {
        const { data } = await supabase.from('codenames_words').select('word').limit(50);
        if (data && data.length >= 25) {
          dbWords = data.map(d => d.word);
        }
      } catch (e) { console.error("Kelime çekme hatası", e); }
    }

    const sourceWords = dbWords.length >= 25 ? dbWords : FALLBACK_WORDS;
    const selectedWords = [...sourceWords].sort(() => 0.5 - Math.random()).slice(0, 25);
    const colors = [...Array(9).fill('red'), ...Array(8).fill('blue'), ...Array(7).fill('neutral'), 'assassin'].sort(() => 0.5 - Math.random());

    const cards: Card[] = selectedWords.map((word, i) => ({
      id: i, word, color: colors[i] as any, revealed: false, votes: []
    }));

    const updatedRoom = { 
        ...room, 
        status: 'playing', 
        turnPhase: 'spymaster', 
        currentTurn: 'red', 
        cards,
        currentClue: null,
        guessesLeft: 0,
        gameLogs: room.gameLogs || [],
        introCompleted: true,
        isMeetingActive: false
    };
    
    // HOST İÇİN KUTU ANİMASYONUNU TETİKLEME (ALT-TAB KORUMALI)
    if (!hasDealtRef.current) {
        hasDealtRef.current = true;
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
            setIsDealingPhase(true);
            setTimeout(() => setIsDealingPhase(false), 2600); 
        }
    }

    broadcastSync(updatedRoom);
    setView('playing');
    setMeetingView(false);
  };

  // OYUN İÇİ FONKSİYONLARI VE LOG EKLENTİSİ
  const voteCard = (cardId: number) => {
    if (!room || room.turnPhase !== 'operative') return;
    const updatedCards = room.cards.map((c: any) => {
      const newVotes = c.votes.filter((id: string) => id !== sessionId);
      if (c.id === cardId) newVotes.push(sessionId);
      return { ...c, votes: newVotes };
    });
    broadcastSync({ ...room, cards: updatedCards });
  };

  const revealCard = (cardId: number) => {
    if (!room || room.turnPhase !== 'operative') return;
    const card = room.cards.find((c: any) => c.id === cardId);
    if (!card || card.revealed) return;

    let updatedRoom = { ...room };
    
    const log = { id: Date.now(), type: 'reveal', team: updatedRoom.currentTurn, playerName: mePlayer?.name || 'Ajan', word: card.word, color: card.color };
    updatedRoom.gameLogs = [...(updatedRoom.gameLogs || []), log];

    const updatedCards = updatedRoom.cards.map((c: any) => {
      if (c.id === cardId) return { ...c, revealed: true, votes: [] };
      return { ...c, votes: [] }; 
    });
    updatedRoom.cards = updatedCards;
    
    // GÜNCELLENMİŞ TAHMİN HAKKI KONTROLÜ
    updatedRoom.guessesLeft--;

    if (card.color === 'assassin') {
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

    const redLeft = updatedRoom.cards.filter((c: any) => c.color === 'red' && !c.revealed).length;
    const blueLeft = updatedRoom.cards.filter((c: any) => c.color === 'blue' && !c.revealed).length;
    if (redLeft === 0) updatedRoom.status = 'red_won';
    if (blueLeft === 0) updatedRoom.status = 'blue_won';

    broadcastSync(updatedRoom);
  };

  const submitClue = () => {
    if (!clueWord.trim() || !room) return;
    
    const updatedRoom = {
      ...room,
      currentClue: { word: clueWord.toUpperCase(), count: clueCount },
      // Tahmin hakkı: Şefin verdiği sayı + 1 ekstra hak
      guessesLeft: clueCount === 'unlimited' ? 99 : (clueCount as number) + 1,
      turnPhase: 'operative' as const
    };

    const log = { id: Date.now(), type: 'clue', team: updatedRoom.currentTurn, playerName: mePlayer?.name || 'Şef', word: clueWord.toUpperCase(), count: clueCount };
    updatedRoom.gameLogs = [...(updatedRoom.gameLogs || []), log];

    broadcastSync(updatedRoom);
    setClueWord('');
    setClueCount(1);
  };

  const returnToLobby = () => {
    if (!room || !mePlayer?.isHost) return;
    hasDealtRef.current = false;
    const updatedRoom = { 
        ...room, 
        status: 'waiting',
        currentTurn: 'red',
        turnPhase: 'spymaster',
        currentClue: null,
        guessesLeft: 0,
        gameLogs: [],
        cards: [] // Kartları temizle ki tekrar başlatırken yenileri gelsin
    };
    broadcastSync(updatedRoom);
    setView('lobby');
  }

  const leaveRoom = () => {
    if (!room) {
        setView('room_list');
        return;
    }
    const updatedPlayers = room.players.filter((p: any) => p.sessionId !== sessionId);
    const updatedRoom = { ...room, players: updatedPlayers };
    broadcastSync(updatedRoom);
    setView('room_list');
    setRoom(null);
    setShowLeaveConfirm(false);
  };

  // --- RENDER BİLEŞENLERİ ---

  if (view === 'login') {
    return (
      <div className="min-h-screen bg-[#0A070E] flex items-center justify-center p-4 relative overflow-hidden text-white">
        {/* MekipHub Neon Background */}
        <div className="neon-bg absolute inset-0 pointer-events-none">
          <div className="neon-stars neon-stars-1"></div>
          <div className="neon-stars neon-stars-2"></div>
          <div className="neon-stars neon-stars-3"></div>
        </div>
        
        <motion.form initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onSubmit={handleLogin} className="w-full max-w-md bg-white/[0.06] border border-white/10 p-8 rounded-3xl shadow-2xl backdrop-blur-xl relative z-10">
          {isEnvMissing && (
            <div className="absolute top-0 left-0 w-full bg-red-600/80 text-white text-xs font-bold text-center py-1">
              DİKKAT: .env.local yapılandırılmadı!
            </div>
          )}
          
          <div className="flex justify-center mb-6 mt-4">
             <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/40 via-blue-500/40 to-cyan-400/40 shadow-xl shadow-cyan-400/20">
                <Sparkles size={40} className="text-cyan-300" />
             </div>
          </div>
          <h1 className="text-4xl font-black text-center mb-8 tracking-tighter">
            <span className="bg-gradient-to-r from-cyan-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">AJAN GİRİŞİ</span>
          </h1>
          
          <input autoFocus value={playerName} onChange={e => setPlayerName(e.target.value)} className="w-full bg-black/40 border border-white/10 p-4 rounded-xl mb-4 text-white focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 outline-none transition-all placeholder:text-white/30" placeholder="Kod Adınız..." />
          <button type="submit" className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-black p-4 rounded-xl shadow-[0_0_15px_rgba(34,211,238,0.4)] transition-all active:scale-95">SİSTEME SIZ</button>
        </motion.form>
      </div>
    );
  }

  if (view === 'room_list') {
    return (
      <div className="min-h-screen bg-[#0A070E] p-6 md:p-12 flex gap-8 flex-col md:flex-row relative overflow-hidden text-white">
        {/* MekipHub Neon Background */}
        <div className="neon-bg absolute inset-0 pointer-events-none">
          <div className="neon-stars neon-stars-1"></div>
          <div className="neon-stars neon-stars-2"></div>
          <div className="neon-stars neon-stars-3"></div>
        </div>

        <div className="w-full md:w-1/3 relative z-10">
          <div className="bg-white/[0.06] backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl">
            <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20"><Crown size={16} className="text-cyan-300"/></div> ODA KUR
            </h2>
            <input value={createName} onChange={e => setCreateName(e.target.value)} className="w-full bg-black/40 border border-white/10 p-4 rounded-xl mb-4 text-white outline-none focus:border-cyan-400 transition-colors placeholder:text-white/30" placeholder="Oda Adı" />
            <input value={createPass} onChange={e => setCreatePass(e.target.value)} type="password" className="w-full bg-black/40 border border-white/10 p-4 rounded-xl mb-6 text-white outline-none focus:border-cyan-400 transition-colors placeholder:text-white/30" placeholder="Şifre (Opsiyonel)" />
            <button onClick={handleCreateRoom} className="w-full bg-cyan-500 hover:bg-cyan-400 p-4 rounded-xl font-black text-black shadow-[0_0_15px_rgba(34,211,238,0.3)] transition-all">OLUŞTUR VE GİR</button>
          </div>
        </div>
        
        <div className="flex-1 relative z-10">
          <div className="flex justify-between items-center mb-6">
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
    );
  }

  if (view === 'lobby') {
    if (room?.isSyncing) {
        return <div className="min-h-screen bg-[#0A070E] flex flex-col items-center justify-center text-cyan-400 text-2xl font-black relative overflow-hidden">
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

    const renderEmptySlots = (currentCount: number, isHost: boolean) => {
        const slots = [];
        const emptyCount = Math.max(0, 5 - currentCount);
        for(let i=0; i<emptyCount; i++) {
           slots.push(<div key={`empty-${i}`} className="bg-black/20 border border-white/5 rounded-[10px] p-4 flex justify-center items-center h-12"><span className="text-white/20 font-bold text-sm text-center">boş slot</span></div>);
        }
        return slots;
    };

    return (
      <div className="min-h-screen bg-[#0A070E] font-sans flex flex-col relative overflow-hidden">
        {/* ARKA PLAN MEKİP YAZISI (PATTERN) & NEON STARS */}
        <div className="neon-bg absolute inset-0 pointer-events-none z-0">
          <div className="neon-stars neon-stars-1"></div>
          <div className="neon-stars neon-stars-2"></div>
        </div>
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] flex flex-wrap content-start -rotate-12 scale-150 z-0 select-none overflow-hidden">
            {Array.from({ length: 200 }).map((_, i) => (
                <span key={i} className="text-9xl font-black text-white px-8 py-4 tracking-tighter">MEKIP</span>
            ))}
        </div>

        {/* ÇIKIŞ ONAY MODALI */}
        <AnimatePresence>
          {showLeaveConfirm && (
            <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
               <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#110D17] border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
                  <AlertTriangle size={48} className="text-fuchsia-500 mx-auto mb-4" />
                  <h3 className="text-2xl font-black text-white mb-2">Ayrılmak İstiyor Musunuz?</h3>
                  <p className="text-white/60 mb-8 font-medium">Oda bağlantınız kesilecek ve lobi listesine döneceksiniz.</p>
                  <div className="flex gap-4">
                     <button onClick={() => setShowLeaveConfirm(false)} className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition-colors">Hayır, Kal</button>
                     <button onClick={leaveRoom} className="flex-1 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold py-3 rounded-xl transition-colors shadow-[0_0_15px_rgba(217,70,239,0.3)]">Evet, Ayrıl</button>
                  </div>
               </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* TANIŞMA MODU EKRANI (POPUP) */}
        <AnimatePresence>
          {meetingView && (
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="fixed inset-0 bg-[#0A070E] z-40 p-12 overflow-y-auto">
              <div className="neon-bg absolute inset-0 pointer-events-none"><div className="neon-stars neon-stars-1"></div></div>
              {mePlayer?.isHost && (
                 <button onClick={() => {
                     setMeetingView(false);
                     broadcastSync({ ...room, isMeetingActive: false });
                 }} className="absolute top-8 right-8 text-white/50 hover:text-white z-50"><X size={40}/></button>
              )}
              <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-violet-300 to-fuchsia-300 text-center mb-16 tracking-tighter relative z-10">EKİP TANIŞMA</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-7xl mx-auto relative z-10">
                {/* KIRMIZI */}
                <div className="space-y-4">
                   <h3 className="text-3xl font-black text-fuchsia-400 border-b-2 border-fuchsia-900/50 pb-2">{localRedName}</h3>
                   {redTeam.map((p: any) => (
                     <div key={p.sessionId} onClick={() => startMeetingIntro(p)} className={`p-6 bg-white/[0.04] backdrop-blur-md rounded-2xl border transition-all ${mePlayer?.isHost ? 'cursor-pointer hover:border-fuchsia-500/50 hover:bg-white/[0.08]' : 'cursor-default'} ${introTarget?.sessionId === p.sessionId ? 'border-cyan-400 scale-105 shadow-[0_0_30px_rgba(34,211,238,0.2)]' : 'border-white/10'} ${meetingResults[p.sessionId] ? 'opacity-50' : ''}`}>
                        <div className="flex justify-between items-center">
                          <span className="text-2xl font-bold text-white">{p.name}</span>
                          {meetingResults[p.sessionId] && (
                            <div className="flex gap-4 text-sm font-black">
                              <span className="text-cyan-400">L: {meetingResults[p.sessionId].lobbyLikes}</span>
                              <span className="text-fuchsia-400">D: {meetingResults[p.sessionId].lobbyDislikes}</span>
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
                     <div key={p.sessionId} onClick={() => startMeetingIntro(p)} className={`p-6 bg-white/[0.04] backdrop-blur-md rounded-2xl border transition-all ${mePlayer?.isHost ? 'cursor-pointer hover:border-cyan-500/50 hover:bg-white/[0.08]' : 'cursor-default'} ${introTarget?.sessionId === p.sessionId ? 'border-fuchsia-400 scale-105 shadow-[0_0_30px_rgba(217,70,239,0.2)]' : 'border-white/10'} ${meetingResults[p.sessionId] ? 'opacity-50' : ''}`}>
                        <div className="flex justify-between items-center">
                          <span className="text-2xl font-bold text-white">{p.name}</span>
                          {meetingResults[p.sessionId] && (
                            <div className="flex gap-4 text-sm font-black">
                              <span className="text-cyan-400">L: {meetingResults[p.sessionId].lobbyLikes}</span>
                              <span className="text-fuchsia-400">D: {meetingResults[p.sessionId].lobbyDislikes}</span>
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
                        <button onClick={() => castLobbyVote('dislike')} className={`p-8 rounded-full border-2 transition-all ${lobbyVotes[sessionId] === 'dislike' ? 'bg-fuchsia-500/20 border-fuchsia-400 text-fuchsia-300 shadow-[0_0_20px_rgba(217,70,239,0.3)]' : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'}`}><ThumbsDown size={48}/></button>
                        <div className="absolute -top-3 -right-6 bg-[#110D17] text-fuchsia-400 px-3 py-1 rounded-full text-xs font-bold border border-fuchsia-500/30 shadow-lg">
                          {Object.entries(lobbyVotes).filter(([_, v]) => v === 'dislike').length} Oy
                        </div>
                      </div>
                    </div>
                    <div className="bg-black/40 p-6 rounded-2xl border border-white/10">
                       <div className="flex justify-between mb-3 font-bold text-sm">
                         <span className="text-cyan-400">👍 {kickVotes.likes} (Chate 1)</span>
                         <span className="text-fuchsia-400">👎 {kickVotes.dislikes} (Chate 0)</span>
                       </div>
                       <div className="h-6 bg-fuchsia-500/20 rounded-full overflow-hidden flex border border-white/5">
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

        <div className="flex-1 flex flex-col p-4 md:p-8 max-w-[1400px] w-full mx-auto relative z-10">
            {/* LOBİ UI HEADER */}
            <header className="flex flex-wrap justify-between items-center mb-8 gap-4 bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 rounded-3xl shadow-xl">
               <div className="flex items-center gap-4">
                   <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-400 shadow-lg shadow-cyan-400/20">
                      <Sparkles size={24} className="text-white" />
                   </div>
                   <div>
                       <h1 className="text-2xl font-black text-white leading-none tracking-tight">Mekip<span className="text-cyan-300">Hub</span></h1>
                       <p className="text-xs text-white/50 font-medium uppercase tracking-widest mt-0.5">Operasyon Lobisi</p>
                   </div>
               </div>
               
               <div className="flex items-center gap-3 bg-black/40 px-6 py-3 rounded-2xl border border-white/5">
                  <span className="text-white/50 font-bold text-sm">ODA:</span>
                  <span className="text-white font-black tracking-[0.3em] flex items-center text-lg">
                     {showRoomCode ? room.id : (
                       <span className="flex gap-1">
                         <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
                         <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" style={{animationDelay: "0.2s"}}></span>
                         <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" style={{animationDelay: "0.4s"}}></span>
                       </span>
                     )}
                  </span>
                  <button onClick={() => setShowRoomCode(!showRoomCode)} className="text-white/40 hover:text-cyan-300 ml-4 transition-colors">{showRoomCode ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
                  <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${room.id}`)} className="text-white/40 hover:text-cyan-300 ml-1 transition-colors"><Copy size={18}/></button>
               </div>
               
               <div className="flex gap-3">
                  <span className="bg-white/5 border border-white/10 px-5 py-3 rounded-2xl text-sm font-bold flex items-center gap-2 text-white"><Users size={18} className="text-cyan-400"/> {room.players.length} Ajan</span>
                  <span className="bg-white/5 border border-white/10 px-5 py-3 rounded-2xl text-sm font-bold flex items-center gap-2 text-white"><Settings size={18} className="text-violet-400"/> {mePlayer?.name}</span>
                  <button onClick={() => setShowLeaveConfirm(true)} className="bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 hover:bg-fuchsia-500 hover:text-white px-5 py-3 rounded-2xl text-sm font-bold flex items-center gap-2 transition-all"><LogOut size={18}/> Çıkış</button>
               </div>
            </header>

            {/* LOBİ İÇERİK IZGARASI */}
            <div className="flex-1 flex flex-col lg:flex-row gap-6 relative z-10">
               {/* SOL KISIM: TAKIM KARTLARI VE SEYİRCİLER */}
               <div className="flex-1 flex flex-col gap-6">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* KIRMIZI TAKIM KARTI */}
                      <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[24px] p-6 h-fit shadow-xl relative overflow-hidden group">
                         <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-fuchsia-500/10 blur-3xl transition group-hover:bg-fuchsia-500/20"></div>
                         <div className="flex justify-between items-center mb-6 relative z-10">
                            <div className="flex items-center gap-3 w-full">
                               <div className="w-4 h-4 rounded-full bg-fuchsia-500 shadow-[0_0_12px_rgba(217,70,239,0.8)] shrink-0"></div>
                               {isEditingRed ? (
                                   <input autoFocus value={localRedName} onChange={(e) => setLocalRedName(e.target.value)} onBlur={() => { setIsEditingRed(false); broadcastSync({...room, settings: {...room.settings, redName: localRedName}}); }} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="bg-black/50 text-white font-black text-xl w-full border border-fuchsia-500/50 rounded-lg px-3 py-1 outline-none uppercase tracking-wide focus:ring-2 focus:ring-fuchsia-500/50"/>
                               ) : (
                                   <div className="flex items-center gap-2 group/edit flex-1">
                                       <span className="text-white font-black text-2xl uppercase tracking-wide truncate max-w-[12rem] drop-shadow-md">{localRedName}</span>
                                       {mePlayer?.isHost && (
                                           <button onClick={() => setIsEditingRed(true)} className="text-white/30 hover:text-fuchsia-400 transition-colors"><Pencil size={16}/></button>
                                       )}
                                   </div>
                               )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0 ml-2">
                               <span className="bg-fuchsia-500/10 text-fuchsia-300 px-3 py-1.5 rounded-xl text-xs font-bold border border-fuchsia-500/20">{redTeam.length} Üye</span>
                               {mePlayer?.team !== 'red' && <button onClick={() => switchRole('red', 'operative')} className="bg-fuchsia-600 hover:bg-fuchsia-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-[0_0_10px_rgba(217,70,239,0.4)]">KATIL</button>}
                            </div>
                         </div>
                         <div className="grid grid-cols-2 gap-3 relative z-10">
                            {hasRedSpymaster ? (
                               <div className="bg-fuchsia-950/40 border border-fuchsia-500/30 rounded-xl p-3 flex justify-center items-center relative h-14 shadow-inner">
                                  <span className="text-white font-bold text-sm text-center">{redTeam.find((p:any)=>p.role==='spymaster')?.name}</span>
                                  <span className="absolute -top-2.5 left-4 bg-fuchsia-600 px-2 py-0.5 rounded-md text-[10px] text-white font-black tracking-widest shadow-md">ŞEF</span>
                               </div>
                            ) : (
                               <button onClick={() => switchRole('red', 'spymaster')} className="border-2 border-dashed border-fuchsia-500/30 hover:border-fuchsia-400 hover:bg-fuchsia-500/10 rounded-xl p-2 flex flex-col justify-center items-center h-14 transition-all">
                                  <span className="text-fuchsia-400/70 font-black text-[10px] tracking-widest text-center leading-tight">İSTİHBARAT ŞEFİ<br/>OL</span>
                               </button>
                            )}
                            {redTeam.filter((p:any)=>p.role==='operative').map((p:any) => (
                               <div key={p.sessionId} className="bg-black/40 border border-white/5 rounded-xl p-3 flex justify-center items-center h-14 hover:border-white/10 transition-colors">
                                  <span className="text-white/90 font-bold text-sm text-center">{p.name}</span>
                               </div>
                            ))}
                            {renderEmptySlots(redTeam.filter((p:any)=>p.role==='operative').length, mePlayer?.isHost)}
                         </div>
                      </div>

                      {/* MAVİ TAKIM KARTI */}
                      <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[24px] p-6 h-fit shadow-xl relative overflow-hidden group">
                         <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl transition group-hover:bg-cyan-500/20"></div>
                         <div className="flex justify-between items-center mb-6 relative z-10">
                            <div className="flex items-center gap-3 w-full">
                               <div className="w-4 h-4 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)] shrink-0"></div>
                               {isEditingBlue ? (
                                   <input autoFocus value={localBlueName} onChange={(e) => setLocalBlueName(e.target.value)} onBlur={() => { setIsEditingBlue(false); broadcastSync({...room, settings: {...room.settings, blueName: localBlueName}}); }} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="bg-black/50 text-white font-black text-xl w-full border border-cyan-500/50 rounded-lg px-3 py-1 outline-none uppercase tracking-wide focus:ring-2 focus:ring-cyan-500/50"/>
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
                               {mePlayer?.team !== 'blue' && <button onClick={() => switchRole('blue', 'operative')} className="bg-cyan-500 hover:bg-cyan-400 text-black px-4 py-2 rounded-xl text-xs font-black transition-all shadow-[0_0_10px_rgba(34,211,238,0.4)]">KATIL</button>}
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
                            {renderEmptySlots(blueTeam.filter((p:any)=>p.role==='operative').length, mePlayer?.isHost)}
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
                        <div className={`flex justify-between items-center p-3 rounded-xl border ${hasRedSpymaster ? 'bg-fuchsia-500/10 border-fuchsia-500/20 text-fuchsia-300' : 'bg-black/20 border-white/5 text-white/40'}`}>
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
                        <div className={`flex justify-between items-center p-3 rounded-xl border ${ruleMin2Red ? 'bg-fuchsia-500/10 border-fuchsia-500/20 text-fuchsia-300' : 'bg-black/20 border-white/5 text-white/40'}`}>
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
                                broadcastSync({...room, settings: {...room.settings, introMode: !room.settings.introMode}});
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
                             <input type="range" min="30" max="180" step="10" value={room.settings?.spymasterTime || 60} disabled={!mePlayer?.isHost} onChange={(e) => broadcastSync({...room, settings: {...room.settings, spymasterTime: parseInt(e.target.value)}})} className="w-full accent-violet-500 bg-black/50 h-1.5 rounded-full appearance-none outline-none" />
                           </div>
                           <div>
                             <div className="flex justify-between text-white/50 text-xs font-bold mb-3"><span>Ajan Süresi</span> <span className="text-white bg-white/10 px-2 py-0.5 rounded">{(room.settings?.operativeTime || 60)}s</span></div>
                             <input type="range" min="30" max="180" step="10" value={room.settings?.operativeTime || 60} disabled={!mePlayer?.isHost} onChange={(e) => broadcastSync({...room, settings: {...room.settings, operativeTime: parseInt(e.target.value)}})} className="w-full accent-cyan-500 bg-black/50 h-1.5 rounded-full appearance-none outline-none" />
                           </div>
                        </div>
                     </div>

                     {/* Kick Chat */}
                     <div>
                        <div className="flex justify-between items-center mb-4">
                           <div className="flex items-center gap-3 text-white font-bold text-sm"><div className="p-1.5 bg-white/5 rounded-md border border-white/10"><MessageSquare size={16} className="text-fuchsia-400"/></div> Kick Chat</div>
                           <button disabled={!mePlayer?.isHost} onClick={() => {
                                const newState = !kickEnabled;
                                setKickEnabled(newState);
                                if (!newState && room.settings.introMode) broadcastSync({...room, settings: {...room.settings, introMode: false}});
                             }} className={`w-12 h-6 rounded-full relative transition-colors border ${kickEnabled ? 'bg-fuchsia-500 border-fuchsia-400 shadow-[0_0_10px_rgba(217,70,239,0.4)]' : 'bg-black/50 border-white/10'}`}>
                              <div className={`absolute top-[3px] w-4 h-4 bg-white rounded-full transition-all ${kickEnabled ? 'left-[26px]' : 'left-[3px]'}`}/>
                           </button>
                        </div>
                        <div className="flex gap-2 mb-3">
                           <input value={kickChannelName} onChange={(e) => setKickChannelName(e.target.value)} disabled={kickConfirmed || !mePlayer?.isHost} className="flex-1 bg-black/40 border border-white/10 p-3 rounded-xl text-sm text-white outline-none focus:border-fuchsia-400 transition-colors" placeholder="Kanal adı" />
                           {mePlayer?.isHost && kickEnabled && (
                              !kickConfirmed ? 
                                <button onClick={() => setKickConfirmed(true)} className="bg-white/10 hover:bg-fuchsia-500 p-3 rounded-xl text-white transition-colors"><CheckCircle2 size={18}/></button> :
                                <button onClick={() => setKickConfirmed(false)} className="bg-fuchsia-500/20 text-fuchsia-400 p-3 rounded-xl transition-colors border border-fuchsia-500/30"><X size={18}/></button>
                           )}
                        </div>
                        {kickConfirmed ? (
                           <div className="bg-cyan-500/10 border border-cyan-500/20 p-4 rounded-xl flex items-start gap-3">
                              <CheckCircle2 size={16} className="text-cyan-400 shrink-0 mt-0.5"/>
                              <div>
                                 <p className="text-cyan-300 text-xs font-bold">Chat entegrasyonu aktif</p>
                                 <p className="text-cyan-400/60 text-[10px] leading-relaxed mt-1">Tanışma aşamasında chatten '1' beğeni, '0' beğenmeme olarak sayılacak.</p>
                              </div>
                           </div>
                        ) : (
                           <div className="bg-black/20 border border-white/5 p-3 rounded-xl">
                              <p className="text-white/40 text-xs font-bold text-center">Chat entegrasyonu kapalı</p>
                           </div>
                        )}
                     </div>
                  </div>
               </div>
            </div>
        </div>
      </div>
    );
  }

  // --- OYUN TAHTASI (BOARD - RESİMDEKİ TASARIM) ---
  if (view === 'playing' && room) {
    const isMyTurn = room.currentTurn === mePlayer?.team;
    const isSpymasterTurn = room.turnPhase === 'spymaster';
    const isOperativeTurn = room.turnPhase === 'operative';
    
    const redLeft = room.cards.filter((c: any) => c.color === 'red' && !c.revealed).length;
    const blueLeft = room.cards.filter((c: any) => c.color === 'blue' && !c.revealed).length;
    const isGameOver = room.status.includes('_won');

    return (
      <div className="min-h-screen bg-[#0A070E] flex flex-col text-slate-100 relative overflow-hidden font-sans">
        {/* MekipHub Neon Background for Game Board */}
        <div className="neon-bg absolute inset-0 pointer-events-none z-0">
          <div className="neon-stars neon-stars-1"></div>
          <div className="neon-stars neon-stars-2"></div>
        </div>
        
        {/* OYUN BİTİŞ EKRANI (OVERLAY) */}
        <AnimatePresence>
            {isGameOver && (
                <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 z-[200] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-4"
                >
                    <motion.div 
                        initial={{ scale: 0.8, y: 50 }} animate={{ scale: 1, y: 0 }}
                        className={`max-w-2xl w-full rounded-3xl border-2 p-10 text-center shadow-2xl ${room.status === 'red_won' ? 'bg-[#1C0D11] border-fuchsia-500 shadow-[0_0_100px_rgba(217,70,239,0.2)]' : 'bg-[#0D161C] border-cyan-500 shadow-[0_0_100px_rgba(34,211,238,0.2)]'}`}
                    >
                        <Crown size={80} className={`mx-auto mb-6 ${room.status === 'red_won' ? 'text-fuchsia-400 drop-shadow-[0_0_15px_rgba(217,70,239,0.8)]' : 'text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]'}`} />
                        <h2 className="text-6xl font-black text-white tracking-tighter mb-4 uppercase">
                            {room.status === 'red_won' ? localRedName : localBlueName} KAZANDI!
                        </h2>
                        <p className="text-xl text-white/60 mb-10 font-medium">Tüm ajanlar açığa çıkarıldı ve operasyon başarıyla tamamlandı.</p>
                        
                        {mePlayer?.isHost ? (
                            <button onClick={returnToLobby} className={`px-10 py-5 rounded-2xl font-black text-lg text-black transition-all flex items-center justify-center gap-3 mx-auto w-full max-w-md ${room.status === 'red_won' ? 'bg-fuchsia-500 hover:bg-fuchsia-400 shadow-[0_0_20px_rgba(217,70,239,0.4)]' : 'bg-cyan-500 hover:bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.4)]'}`}>
                                <RotateCcw size={24} /> LOBİYE GERİ DÖN
                            </button>
                        ) : (
                            <div className="bg-white/5 border border-white/10 p-5 rounded-2xl text-white/50 font-bold uppercase tracking-widest text-sm">
                                Kurucu (Host) lobiyi tekrar başlatması bekleniyor...
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>

        {/* VİDEODAKİ EFSANEVİ 3D KUTU AÇILIŞ ANİMASYONU */}
        <AnimatePresence>
            {isDealingPhase && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
                    {/* Kutu Alt (Bottom) - Hızlıca yaklaşır, bekler, aşağı inerek kaybolur */}
                    <motion.div
                        initial={{ y: "100vh", x: "-50%" }}
                        animate={{ y: ["100vh", "50vh", "50vh", "150vh"] }}
                        transition={{ duration: 2.5, times: [0, 0.2, 0.7, 1], ease: "easeInOut" as const }}
                        className="fixed top-0 left-1/2 w-72 h-72 md:w-80 md:h-80 bg-[#1C1412] rounded-3xl shadow-[0_40px_80px_rgba(0,0,0,0.9)] flex items-center justify-center border-b-[12px] border-r-[12px] border-[#0A0706] z-40"
                        style={{ 
                            backgroundImage: "url('/box-bottom.png')", // KENDİ ALT KUTU RESMİNİ BURAYA KOY
                            backgroundSize: "contain", 
                            backgroundRepeat: "no-repeat", 
                            backgroundPosition: "center" 
                        }}
                    >
                        {!isEnvMissing && (
                            <span className="text-white/10 font-black tracking-widest uppercase text-xl">KUTU ALT .PNG</span>
                        )}
                    </motion.div>

                    {/* Kutu Üst (Lid) - Alt kutuyla birlikte gelir, hızlıca yukarı açılır */}
                    <motion.div
                        initial={{ y: "100vh", x: "-50%" }}
                        animate={{ y: ["100vh", "50vh", "-100vh", "-100vh"] }}
                        transition={{ duration: 2.5, times: [0, 0.2, 0.35, 1], ease: "easeInOut" as const }}
                        className="fixed top-0 left-1/2 w-[18.5rem] h-[18.5rem] md:w-[21rem] md:h-[21rem] bg-[#2A1D1A] rounded-3xl shadow-[0_50px_100px_rgba(0,0,0,0.95)] flex items-center justify-center border-t-[8px] border-l-[8px] border-white/5 z-50"
                        style={{ 
                            backgroundImage: "url('/box-lid.png')", // KENDİ KAPAK RESMİNİ BURAYA KOY
                            backgroundSize: "contain", 
                            backgroundRepeat: "no-repeat", 
                            backgroundPosition: "center" 
                        }}
                    >
                        {!isEnvMissing && (
                            <span className="text-white/10 font-black tracking-widest uppercase text-xl">KAPAK .PNG</span>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

        {/* ÇIKIŞ ONAY MODALI */}
        <AnimatePresence>
          {showLeaveConfirm && (
            <div className="fixed inset-0 bg-black/80 z-[150] flex items-center justify-center p-4 backdrop-blur-md">
               <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#110D17] border-2 border-white/10 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
                  <AlertTriangle size={48} className="text-fuchsia-500 mx-auto mb-4" />
                  <h3 className="text-2xl font-black text-white mb-2">Ayrılmak İstiyor Musunuz?</h3>
                  <p className="text-white/60 mb-8 font-medium">Oda bağlantınız kesilecek ve lobi listesine döneceksiniz.</p>
                  <div className="flex gap-4">
                     <button onClick={() => setShowLeaveConfirm(false)} className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition-colors">Hayır, Kal</button>
                     <button onClick={leaveRoom} className="flex-1 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold py-3 rounded-xl transition-colors">Evet, Ayrıl</button>
                  </div>
               </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* LOBİ UI HEADER (Küçük ve şık) */}
        <header className="h-14 bg-white/[0.04] backdrop-blur-xl border-b border-white/10 flex justify-between items-center px-6 shrink-0 z-20">
           <div className="flex items-center gap-3 bg-black/40 px-4 py-1.5 rounded-lg border border-white/5">
              <span className="text-white/50 font-bold text-xs">Oda Kodu:</span>
              <span className="text-white font-black tracking-[0.2em] text-xs">
                 {showRoomCode ? room.id : '••••••'}
              </span>
              <button onClick={() => setShowRoomCode(!showRoomCode)} className="text-white/40 hover:text-cyan-300 ml-2 transition-colors">{showRoomCode ? <EyeOff size={14}/> : <Eye size={14}/>}</button>
              <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${room.id}`)} className="text-white/40 hover:text-cyan-300 ml-1 transition-colors"><Copy size={14}/></button>
           </div>
           
           <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                 <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-400">
                    <Sparkles size={12} className="text-white" />
                 </div>
                 <span className="text-white font-black text-sm tracking-tight hidden sm:block">Mekip<span className="text-cyan-300">Hub</span></span>
              </div>
              <span className="bg-black/40 text-white/50 border border-white/5 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2"><Users size={14}/> {room.players.length}</span>
              <div className="bg-black/40 border border-white/5 px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2">
                 <span className="text-white/50">Sırası:</span>
                 <span className={room.currentTurn === 'red' ? 'text-fuchsia-400' : 'text-cyan-400'}>{room.currentTurn === 'red' ? (room.settings?.redName || 'KIRMIZI TAKIM') : (room.settings?.blueName || 'MAVİ TAKIM')}</span>
              </div>
           </div>
           
           <div className="flex gap-2">
              <span className="bg-black/40 text-white/80 border border-white/5 px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2"><Settings size={14} className="text-violet-400"/> {mePlayer?.name}</span>
              <button onClick={() => setShowLeaveConfirm(true)} className="bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30 hover:bg-fuchsia-500 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors"><LogOut size={14}/></button>
           </div>
        </header>

        <div className="flex-1 flex gap-4 p-4 overflow-hidden z-10">
           
            {/* SOL PANEL (KIRMIZI TAKIM VE ZAMANLAYICI) */}
            <aside className="w-64 flex flex-col gap-4 shrink-0 overflow-y-auto hidden md:flex">
                <div className="bg-gradient-to-b from-fuchsia-950/40 to-black/40 rounded-2xl p-4 flex flex-col items-center border border-fuchsia-500/20 shadow-lg relative overflow-hidden text-center min-h-[300px] backdrop-blur-md">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-fuchsia-500/10 to-transparent pointer-events-none opacity-50"></div>
                    <h2 className="text-lg font-black text-fuchsia-100 mb-2 relative z-10 uppercase tracking-wide drop-shadow-sm">{room.settings?.redName || 'KIRMIZI TAKIM'}</h2>
                    <div className="text-7xl font-black text-fuchsia-400 mb-1 relative z-10 leading-none drop-shadow-[0_0_15px_rgba(217,70,239,0.5)]">{redLeft}</div>
                    <div className="text-[10px] font-bold text-fuchsia-200/50 mb-6 relative z-10 uppercase tracking-[0.3em]">KALAN KART</div>
                    
                    <div className="space-y-2 w-full relative z-10">
                        {room.players.filter((p:any)=>p.team==='red'&&p.role==='spymaster').map((p:any)=> 
                           <div key={p.sessionId} className="bg-fuchsia-500/20 border border-fuchsia-500/30 text-fuchsia-100 font-bold text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-2"><ShieldAlert size={14} className="text-fuchsia-400"/> {p.name}</div>
                        )}
                        <div className="grid grid-cols-2 gap-2 mt-2">
                           {room.players.filter((p:any)=>p.team==='red'&&p.role==='operative').map((p:any)=> 
                              <div key={p.sessionId} className="bg-black/40 border border-white/5 text-white/70 font-medium text-xs py-2 px-2 rounded-xl truncate hover:border-white/10 transition-colors">{p.name}</div>
                           )}
                        </div>
                    </div>
                </div>

                {/* SÜRE KARTI */}
                <div className="bg-white/[0.04] backdrop-blur-md rounded-2xl p-5 border border-white/10 flex flex-col items-center justify-center shadow-lg relative">
                   {/* Süre dolduğunda yanıp sönen uyarı */}
                   {turnTimer === 0 && !isGameOver && (
                       <div className="absolute top-2 right-2 flex items-center gap-1 text-red-500 animate-pulse">
                           <AlertTriangle size={14}/>
                           <span className="text-[10px] font-black uppercase">Sıra Değişti</span>
                       </div>
                   )}
                   <div className="flex items-center gap-2 text-violet-400 text-[10px] font-bold uppercase tracking-widest mb-3">
                      <Clock size={14}/> {room.turnPhase === 'spymaster' ? 'İstihbarat Şefi Süresi' : 'Ajan Süresi'}
                   </div>
                   <div className={`text-4xl font-black mb-3 font-mono drop-shadow-md ${turnTimer <= 10 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                      0:{turnTimer.toString().padStart(2, '0')}
                   </div>
                   <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden border border-white/5">
                      <div className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all duration-1000 ease-linear" style={{ width: `${(turnTimer / (room.turnPhase === 'spymaster' ? room.settings.spymasterTime : room.settings.operativeTime)) * 100}%` }}></div>
                   </div>
                </div>
            </aside>

            {/* ORTA OYUN IZGARASI VE INPUT */}
            <main className="flex-1 flex flex-col items-center justify-center pb-8 overflow-y-auto">
              {/* GRID - KART BOYUTLARI SABİTLENDİ (177px x 107px) */}
              <div className="grid grid-cols-5 gap-3 w-max shrink-0 relative mt-[-4vh]">
                {room.cards.map((card: any, index: number) => {
                  const amISpymaster = mePlayer?.role === 'spymaster';
                  const isRevealed = card.revealed || room.status.includes('_won');
                  const showColor = isRevealed || amISpymaster;
                  
                  // MEKIP HUB TEMASINA UYGUN KART STİLLERİ
                  const getCardStyle = () => {
                    if (!showColor) return { outer: "bg-[#251f30] border border-white/10 shadow-[0_4px_0_rgba(255,255,255,0.05)]", pill: "bg-white/5 text-white/50 border border-white/5" };
                    if (card.color === 'red') return { outer: "bg-gradient-to-br from-fuchsia-600 to-fuchsia-800 border border-fuchsia-400/50 shadow-[0_4px_0_rgba(217,70,239,0.4)]", pill: "bg-white/20 text-white font-bold", text: "text-white drop-shadow-sm" };
                    if (card.color === 'blue') return { outer: "bg-gradient-to-br from-cyan-500 to-cyan-700 border border-cyan-300/50 shadow-[0_4px_0_rgba(34,211,238,0.4)]", pill: "bg-white/20 text-white font-bold", text: "text-white drop-shadow-sm" };
                    if (card.color === 'neutral') return { outer: "bg-[#3a3347] border border-white/10 shadow-[0_4px_0_rgba(255,255,255,0.1)]", pill: "bg-white/10 text-white/70", text: "text-white/70" };
                    return { outer: "bg-zinc-900 border border-zinc-700 shadow-[0_4px_0_rgba(0,0,0,0.8)]", pill: "bg-red-500/20 text-red-400 border border-red-500/30", text: "text-red-400" };
                  };
                  
                  const style = getCardStyle();

                  // OY VEREN İSİMLERİ (MEVCUT TAKIM)
                  const votingPlayers = card.votes
                      .map((vId: string) => room.players.find((p: any) => p.sessionId === vId))
                      .filter((p: any) => p && p.team === mePlayer?.team);

                  // KUSURSUZ DESTE (DECK) MATEMATİĞİ - Tamamen Üst Üste!
                  const col = index % 5;
                  const row = Math.floor(index / 5);
                  
                  // Yeni sabit boyutlara göre hesaplamalar
                  const cardWidth = 177; // Sabitlendi
                  const cardHeight = 107; // Sabitlendi
                  const gap = 12; // 0.75rem (gap-3) yaklaşık 12px
                  
                  // Merkez noktası hesaplama (px cinsinden, flex ile tutarlı)
                  const startX = (2 - col) * (cardWidth + gap);
                  const startY = (2 - row) * (cardHeight + gap) + 300; 
                  
                  const inBoxY = startY; 
                  const midY = startY - 350; 
                  const deckRotation = (index * 7) % 8 - 4;

                  const initialProps = isDealingPhase 
                      ? { opacity: 0, x: startX, y: "150vh", rotateZ: deckRotation }
                      : { opacity: 1, x: 0, y: 0, rotateZ: 0 };

                  const animateProps = isDealingPhase
                      ? { 
                          opacity: [0, 0, 1, 1, 1, 1, 1], 
                          x: [startX, startX, startX, startX, startX, startX, 0], 
                          y: ["150vh", inBoxY, inBoxY, inBoxY, midY, midY, 0], 
                          rotateZ: [deckRotation, deckRotation, deckRotation, deckRotation, deckRotation, deckRotation, 0]
                        }
                      : { opacity: 1, x: 0, y: 0, rotateZ: 0 };

                  const transitionProps = isDealingPhase
                      ? {
                          duration: 2.5, 
                          times: [0, 0.2, 0.21, 0.35, 0.6, 0.7, 1], 
                          ease: ["linear", "linear", "linear", "backOut", "linear", "easeOut"] as any,
                          delay: 0 
                        }
                      : { duration: 0 };

                  return (
                    <div key={card.id} className="relative z-10" style={{ width: '177px', height: '107px' }}>
                        <motion.div
                          onClick={() => {
                            if (amISpymaster || isRevealed || !isMyTurn || !isOperativeTurn || room.status.includes('_won')) return;
                            voteCard(card.id);
                          }}
                          initial={initialProps}
                          animate={animateProps}
                          transition={transitionProps}
                          whileHover={(!isRevealed && !amISpymaster && isMyTurn && isOperativeTurn) ? { y: -2, boxShadow: '0 8px 15px rgba(0,0,0,0.3)' } : {}}
                          whileTap={(!isRevealed && !amISpymaster && isMyTurn && isOperativeTurn) ? { y: 2, boxShadow: '0 0 0 transparent' } : {}}
                          className={`absolute inset-0 rounded-xl flex items-end justify-center cursor-pointer select-none transition-all duration-200 overflow-hidden group p-2 pb-2.5 ${style.outer} ${isRevealed ? 'opacity-90' : ''}`}
                        >
                          {/* SİLİK WATERMARK (MEKIP) - Şefler İçin De Görünür */}
                          {!isRevealed && (
                             <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.04] z-0">
                                <span className="font-black text-xl md:text-2xl lg:text-3xl tracking-[0.3em] text-white uppercase select-none">MEKIP</span>
                             </div>
                          )}
                          
                          {/* AÇILDIĞINDA GELECEK RESİM VE ANİMASYONU */}
                          {isRevealed && (
                             <motion.div 
                               initial={{ y: 0 }}
                               whileHover={{ y: -30 }} 
                               transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                               className="absolute inset-0 bg-cover bg-center z-10"
                               style={{ backgroundImage: `url(/cards/${card.color}/${(card.id % 3) + 1}.jpg)` }}
                             >
                                <div className="absolute inset-0 bg-black/20"></div> {/* Resmin üzerindeki kelimenin okunması için hafif karartma */}
                             </motion.div>
                          )}

                          {/* KELİME (PILL) KUTUSU */}
                          <div className={`w-[95%] flex justify-center py-1.5 shadow-sm z-20 rounded-lg backdrop-blur-md ${style.pill}`}>
                              <span className={`font-black text-sm tracking-widest uppercase ${style.text || ''}`}>{card.word}</span>
                          </div>

                          {/* SOL ÜST KÖŞE: OY VEREN KİŞİLERİN İSİMLERİ */}
                          {!isRevealed && votingPlayers.length > 0 && (
                            <div className="absolute top-1.5 left-1.5 flex flex-col gap-1 z-30 pointer-events-none">
                              {votingPlayers.map((p: any) => (
                                <div key={p.sessionId} className={`px-2 py-0.5 rounded-md shadow-lg text-[9px] font-black border tracking-wider backdrop-blur-sm ${p.team === 'red' ? 'bg-fuchsia-600/90 border-fuchsia-400/50 text-white' : 'bg-cyan-600/90 border-cyan-400/50 text-white'}`}>
                                  {p.name}
                                </div>
                              ))}
                            </div>
                          )}

                          {amISpymaster && !isRevealed && card.color === 'assassin' && (
                            <div className="absolute top-2 left-2 opacity-80 z-30 bg-black/50 p-1.5 rounded-lg border border-red-500/30 backdrop-blur-md"><Search size={16} className="text-red-400 drop-shadow-sm"/></div>
                          )}
                        </motion.div>

                        {/* SAĞ ÜST KÖŞE: DIŞARI TAŞAN DEVASA AÇMA (PARMAK) BUTONU */}
                        {!isRevealed && !amISpymaster && isMyTurn && isOperativeTurn && card.votes.includes(sessionId) && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); revealCard(card.id); }} 
                              className="absolute -top-3 -right-3 bg-gradient-to-br from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-white p-2.5 rounded-xl shadow-[0_4px_0_#1e40af,0_10px_15px_-3px_rgba(34,211,238,0.5)] hover:shadow-[0_6px_0_#1e40af,0_10px_20px_-3px_rgba(34,211,238,0.6)] hover:-translate-y-1 transition-all active:translate-y-1 active:shadow-[0_0_0_#1e40af] border border-cyan-200/50 flex items-center justify-center z-[100] cursor-pointer"
                              title="Kartı Aç"
                            >
                              <Hand size={20} className="drop-shadow-md" />
                            </button>
                        )}
                    </div>
                  );
                })}
              </div>

              {/* INPUT ALANI (TAM GRID GENİŞLİĞİNDE) */}
              <div className="w-full max-w-[900px] mt-8 flex gap-3 shrink-0 relative z-10">
                 {mePlayer?.role === 'spymaster' && isMyTurn && isSpymasterTurn && !room.status.includes('_won') ? (
                    <>
                       <div className="flex-1 bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-2xl p-1.5 flex shadow-lg transition-all focus-within:border-cyan-400/50 focus-within:bg-white/[0.06]">
                          <div className="pl-4 pr-2 flex items-center text-white/30"><Pencil size={18}/></div>
                          <input 
                            value={clueWord}
                            onChange={e => setClueWord(e.target.value.replace(/\s/g, ''))}
                            placeholder="Tek kelimelik ipucu yazın..."
                            className="flex-1 bg-transparent text-white px-2 py-2.5 outline-none uppercase font-black text-sm tracking-widest placeholder:text-white/20 placeholder:font-medium placeholder:tracking-normal"
                          />
                       </div>
                       <div className="flex items-center bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden shrink-0 shadow-lg p-1.5">
                          <button onClick={() => setClueCount(prev => typeof prev === 'number' ? Math.max(1, prev - 1) : 1)} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/10 text-white font-black transition-colors">-</button>
                          <input 
                            type="text" 
                            value={clueCount === 'unlimited' ? '∞' : clueCount}
                            onChange={e => { const val = parseInt(e.target.value); if (!isNaN(val)) setClueCount(Math.min(9, Math.max(1, val))); }}
                            className="w-12 bg-transparent text-center text-cyan-300 font-black outline-none text-lg"
                          />
                          <button onClick={() => setClueCount(prev => typeof prev === 'number' ? Math.min(9, prev + 1) : 1)} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/10 text-white font-black transition-colors">+</button>
                       </div>
                       <button onClick={submitClue} disabled={!clueWord} className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 disabled:from-white/5 disabled:to-white/5 disabled:text-white/20 text-white px-8 rounded-2xl font-black text-sm tracking-widest transition-all shadow-[0_0_20px_rgba(34,211,238,0.3)] disabled:shadow-none shrink-0 border border-white/10 disabled:border-transparent">GÖNDER</button>
                    </>
                 ) : (
                    <div className="flex-1 bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-2xl px-6 py-4 flex items-center justify-center text-white/50 text-sm font-bold shadow-lg">
                       {room.status.includes('_won') ? 'Operasyon tamamlandı.' : 'Karşı merkezin hamlesini bekleyin veya takım arkadaşlarınızla istihbaratı tartışın...'}
                    </div>
                 )}
              </div>
            </main>

            {/* SAĞ PANEL (MAVİ TAKIM VE LOG) */}
            <aside className="w-64 flex flex-col gap-4 shrink-0 overflow-y-auto hidden md:flex">
                <div className="bg-gradient-to-b from-cyan-950/40 to-black/40 rounded-2xl p-4 flex flex-col items-center border border-cyan-500/20 shadow-lg relative overflow-hidden text-center min-h-[300px] backdrop-blur-md">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-500/10 to-transparent pointer-events-none opacity-50"></div>
                    <h2 className="text-lg font-black text-cyan-100 mb-2 relative z-10 uppercase tracking-wide drop-shadow-sm">{room.settings?.blueName || 'MAVİ TAKIM'}</h2>
                    <div className="text-7xl font-black text-cyan-400 mb-1 relative z-10 leading-none drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">{blueLeft}</div>
                    <div className="text-[10px] font-bold text-cyan-200/50 mb-6 relative z-10 uppercase tracking-[0.3em]">KALAN KART</div>
                    
                    <div className="space-y-2 w-full relative z-10">
                        {room.players.filter((p:any)=>p.team==='blue'&&p.role==='spymaster').map((p:any)=> 
                           <div key={p.sessionId} className="bg-cyan-500/20 border border-cyan-500/30 text-cyan-100 font-bold text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-2"><ShieldAlert size={14} className="text-cyan-400"/> {p.name}</div>
                        )}
                        <div className="grid grid-cols-2 gap-2 mt-2">
                           {room.players.filter((p:any)=>p.team==='blue'&&p.role==='operative').map((p:any)=> 
                              <div key={p.sessionId} className="bg-black/40 border border-white/5 text-white/70 font-medium text-xs py-2 px-2 rounded-xl truncate hover:border-white/10 transition-colors">{p.name}</div>
                           )}
                        </div>
                    </div>
                </div>

                {/* GÜNLÜK (OYUN KAYDI) */}
                <div className="bg-white/[0.04] backdrop-blur-md rounded-2xl border border-white/10 flex-1 flex flex-col overflow-hidden min-h-[300px] shadow-lg">
                   <div className="p-4 border-b border-white/5 flex items-center gap-2 text-white/80 font-bold text-xs tracking-widest uppercase bg-black/20">
                      <ScrollText size={14} className="text-violet-400"/> İSTİHBARAT GÜNLÜĞÜ
                   </div>
                   <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {room.currentClue && (
                         <div className="mb-5 bg-gradient-to-r from-violet-500/20 to-cyan-500/20 border border-white/10 p-3 rounded-xl text-xs font-medium text-white/80 shadow-md">
                            <div className="flex items-center gap-2 mb-1.5 opacity-70"><Info size={12}/> Aktif İpucu:</div>
                            <strong className="text-cyan-300 uppercase tracking-wider text-sm block">{room.currentClue.word} <span className="opacity-50">x</span>{room.currentClue.count}</strong>
                         </div>
                      )}
                      <div className="space-y-4">
                        {room.gameLogs?.slice().reverse().map((log: any, idx: number) => (
                           <div key={log.id} className="text-[11px] leading-relaxed relative pl-3 before:absolute before:left-0 before:top-1.5 before:w-1 before:h-1 before:rounded-full before:bg-white/20">
                              <span className={log.team === 'red' ? 'text-fuchsia-400 font-bold' : 'text-cyan-400 font-bold'}>{log.team === 'red' ? 'KRMZ' : 'MAVİ'}</span>{' '}
                              <span className="text-white/40 truncate max-w-[60px] inline-block align-bottom">{log.playerName}</span>{' '}
                              {log.type === 'clue' ? (
                                 <span className="text-white/60">ipucu: <strong className="text-white uppercase tracking-wider">{log.word} <span className="opacity-50 text-[10px]">x</span>{log.count}</strong></span>
                              ) : log.type === 'timeout' ? (
                                 <span className="text-amber-400 font-bold ml-1">SÜRESİ BİTTİ</span>
                              ) : (
                                 <>
                                    <span className="text-white/50">açtı: {log.word}</span>{' '}
                                    <span className={`font-bold ml-1 px-1.5 py-0.5 rounded text-[9px] ${log.color === log.team ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                       {log.color === log.team ? 'DOĞRU' : 'YANLIŞ'}
                                    </span>
                                 </>
                              )}
                           </div>
                        ))}
                      </div>
                      {(!room.gameLogs || room.gameLogs.length === 0) && <div className="text-white/30 italic text-xs font-medium text-center mt-10">Henüz hamle yapılmadı.</div>}
                   </div>
                </div>
            </aside>
        </div>
      </div>
    );
  }

  return null;
}