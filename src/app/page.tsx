"use client";

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Hand, Search, Users, ShieldAlert, Crown, Copy, Settings, ArrowRight, AlertTriangle, ThumbsUp, ThumbsDown, X, Play, LogIn, Lock, Unlock, UserPlus, Info, ScrollText, LogOut, Clock, MessageSquare, Eye, EyeOff, Pencil } from 'lucide-react';
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

  const roomRef = useRef<any>(null);
  useEffect(() => { roomRef.current = room; }, [room]);

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

  // Oyun içi zamanlayıcı
  useEffect(() => {
     if (view === 'playing' && room && !room.status.includes('_won')) {
        const timeLimit = room.turnPhase === 'spymaster' ? room.settings.spymasterTime : room.settings.operativeTime;
        setTurnTimer(timeLimit);
     }
  }, [room?.currentTurn, room?.turnPhase, view]);

  useEffect(() => {
     if (view === 'playing' && turnTimer > 0 && !room?.status.includes('_won')) {
         const t = setTimeout(() => setTurnTimer(turnTimer - 1), 1000);
         return () => clearTimeout(t);
     }
  }, [turnTimer, view, room?.status]);

  // 2. KICK WEBSOCKET BAĞLANTISI
  useEffect(() => {
    const me = room?.players?.find((p: any) => p.sessionId === sessionId);
    if (!me?.isHost || !kickConfirmed || !introTarget || !kickChannelName) return;

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
  }, [introTarget, kickConfirmed, kickChannelName]);

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

        if (payload.room.status === 'playing' && view !== 'playing') {
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
  }, [room?.id, isEnvMissing, sessionId, playerName]);

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
    if (!room.players.find((p: any) => p.sessionId === sessionId)?.isHost) return;
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

    const me = room.players.find((p: any) => p.sessionId === sessionId);
    let updatedRoom = { ...room };
    
    const log = { id: Date.now(), type: 'reveal', team: updatedRoom.currentTurn, playerName: me?.name || 'Ajan', word: card.word, color: card.color };
    updatedRoom.gameLogs = [...(updatedRoom.gameLogs || []), log];

    const updatedCards = updatedRoom.cards.map((c: any) => {
      if (c.id === cardId) return { ...c, revealed: true, votes: [] };
      return { ...c, votes: [] }; 
    });
    updatedRoom.cards = updatedCards;
    updatedRoom.guessesLeft--;

    if (card.color === 'assassin') {
        updatedRoom.status = updatedRoom.currentTurn === 'red' ? 'blue_won' : 'red_won';
    } else if (card.color !== updatedRoom.currentTurn) {
        updatedRoom.turnPhase = 'spymaster';
        updatedRoom.currentTurn = updatedRoom.currentTurn === 'red' ? 'blue' : 'red';
        updatedRoom.currentClue = null;
    } else {
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
    
    const me = room.players.find((p: any) => p.sessionId === sessionId);
    const updatedRoom = {
      ...room,
      currentClue: { word: clueWord.toUpperCase(), count: clueCount },
      guessesLeft: clueCount === 'unlimited' ? 99 : (clueCount as number) + 1,
      turnPhase: 'operative' as const
    };

    const log = { id: Date.now(), type: 'clue', team: updatedRoom.currentTurn, playerName: me?.name || 'Şef', word: clueWord.toUpperCase(), count: clueCount };
    updatedRoom.gameLogs = [...(updatedRoom.gameLogs || []), log];

    broadcastSync(updatedRoom);
    setClueWord('');
    setClueCount(1);
  };

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
      <div className="min-h-screen bg-[#140E0D] flex items-center justify-center p-4">
        <motion.form initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onSubmit={handleLogin} className="w-full max-w-md bg-[#1C1412] border border-[#2A1D1A] p-8 rounded-3xl shadow-2xl relative overflow-hidden">
          {isEnvMissing && (
            <div className="absolute top-0 left-0 w-full bg-red-600 text-white text-xs font-bold text-center py-1">
              DİKKAT: .env.local yapılandırılmadı!
            </div>
          )}
          <div className="flex justify-center mb-6 mt-4"><ShieldAlert size={60} className="text-emerald-500 animate-pulse"/></div>
          <h1 className="text-4xl font-black text-white text-center mb-8 tracking-tighter">AGENT LOGIN</h1>
          <input autoFocus value={playerName} onChange={e => setPlayerName(e.target.value)} className="w-full bg-[#140E0D] border border-[#3A2A26] p-4 rounded-xl mb-4 text-white focus:border-emerald-500 outline-none transition-all" placeholder="Kod Adınız..." />
          <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black p-4 rounded-xl shadow-lg transition-transform active:scale-95">SİSTEME SIZ</button>
        </motion.form>
      </div>
    );
  }

  if (view === 'room_list') {
    return (
      <div className="min-h-screen bg-[#140E0D] p-6 md:p-12 flex gap-8 flex-col md:flex-row">
        <div className="w-full md:w-1/3">
          <div className="bg-[#1C1412] border border-[#2A1D1A] p-8 rounded-3xl shadow-xl">
            <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-2"><Crown className="text-amber-400"/> ODA KUR</h2>
            <input value={createName} onChange={e => setCreateName(e.target.value)} className="w-full bg-[#140E0D] border border-[#3A2A26] p-4 rounded-xl mb-4 text-white outline-none" placeholder="Oda Adı" />
            <input value={createPass} onChange={e => setCreatePass(e.target.value)} type="password" className="w-full bg-[#140E0D] border border-[#3A2A26] p-4 rounded-xl mb-6 text-white outline-none" placeholder="Şifre (Opsiyonel)" />
            <button onClick={handleCreateRoom} className="w-full bg-emerald-600 hover:bg-emerald-500 p-4 rounded-xl font-bold text-white transition-all">OLUŞTUR VE GİR</button>
          </div>
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-center mb-6">
             <h2 className="text-2xl font-black text-[#887A76]">AKTİF LOBİLER</h2>
             <button onClick={fetchRooms} className="text-sm bg-[#2A1D1A] text-[#887A76] px-4 py-2 rounded-lg hover:bg-[#3A2A26]">Yenile</button>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {rooms.map(r => (
              <div key={r.id} className="bg-[#1C1412] border border-[#2A1D1A] p-6 rounded-2xl flex justify-between items-center hover:border-[#4A3530] transition-all group">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">{r.name} {r.password && <Lock size={16} className="text-[#887A76]"/>}</h3>
                  <p className="text-[#887A76] text-sm">ID: {r.id}</p>
                </div>
                {r.status === 'playing' ? (
                  <button disabled className="bg-[#140E0D] p-3 px-6 rounded-xl font-bold text-[#554A46] transition-all flex items-center gap-2 cursor-not-allowed">OYUN DEVAM EDİYOR</button>
                ) : (
                  <button onClick={() => handleJoinRoom(r.id)} className="bg-[#2A1D1A] group-hover:bg-emerald-600 p-3 px-6 rounded-xl font-bold text-white transition-all flex items-center gap-2">KATIL <LogIn size={18}/></button>
                )}
              </div>
            ))}
            {rooms.length === 0 && <div className="text-[#554A46] italic">Şu an aktif operasyon bulunmuyor...</div>}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'lobby') {
    if (room?.isSyncing) {
        return <div className="min-h-screen bg-[#140E0D] flex flex-col items-center justify-center text-emerald-500 text-2xl font-black">
           <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }} className="mb-6"><ShieldAlert size={80} /></motion.div>
           <p className="animate-pulse">SUNUCUYA BAĞLANILIYOR... VERİ BEKLENİYOR</p>
        </div>
    }

    const redTeam = room.players.filter((p: any) => p.team === 'red');
    const blueTeam = room.players.filter((p: any) => p.team === 'blue');
    const spectators = room.players.filter((p: any) => p.team === 'spectator');
    const mePlayer = room.players.find((p: any) => p.sessionId === sessionId);

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
           slots.push(<div key={`empty-${i}`} className="bg-[#2a1c1a] border border-[#3a2c2a] rounded-[10px] p-4 flex justify-center items-center h-12"><span className="text-[#4a3c3a] font-bold text-sm text-center">username</span></div>);
        }
        return slots;
    };

    return (
      <div className="min-h-screen bg-[#140E0D] font-sans p-4 md:p-8 flex flex-col relative overflow-hidden">
        
        {/* ÇIKIŞ ONAY MODALI */}
        <AnimatePresence>
          {showLeaveConfirm && (
            <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
               <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#1C1412] border-2 border-[#2A1D1A] rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
                  <AlertTriangle size={48} className="text-red-500 mx-auto mb-4" />
                  <h3 className="text-2xl font-black text-white mb-2">Ayrılmak İstiyor Musunuz?</h3>
                  <p className="text-[#887A76] mb-8 font-medium">Oda bağlantınız kesilecek ve lobi listesine döneceksiniz.</p>
                  <div className="flex gap-4">
                     <button onClick={() => setShowLeaveConfirm(false)} className="flex-1 bg-[#2A1D1A] hover:bg-[#3A2A26] text-white font-bold py-3 rounded-xl transition-colors">Hayır, Kal</button>
                     <button onClick={leaveRoom} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-colors">Evet, Ayrıl</button>
                  </div>
               </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* TANIŞMA MODU EKRANI (POPUP) */}
        <AnimatePresence>
          {meetingView && (
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="fixed inset-0 bg-[#140E0D] z-40 p-12 overflow-y-auto">
              {mePlayer?.isHost && (
                 <button onClick={() => {
                     setMeetingView(false);
                     broadcastSync({ ...room, isMeetingActive: false });
                 }} className="absolute top-8 right-8 text-white/50 hover:text-white"><X size={40}/></button>
              )}
              <h2 className="text-5xl font-black text-emerald-500 text-center mb-16 tracking-tighter">EKİP TANIŞMA</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-7xl mx-auto">
                {/* KIRMIZI */}
                <div className="space-y-4">
                   <h3 className="text-3xl font-black text-red-500 border-b-2 border-red-900/50 pb-2">{localRedName}</h3>
                   {redTeam.map((p: any) => (
                     <div key={p.sessionId} onClick={() => startMeetingIntro(p)} className={`p-6 bg-[#1a0f0f] rounded-2xl border-2 transition-all ${mePlayer?.isHost ? 'cursor-pointer hover:border-red-500/50' : 'cursor-default'} ${introTarget?.sessionId === p.sessionId ? 'border-emerald-500 scale-105 shadow-2xl' : 'border-[#3d1a1a]'} ${meetingResults[p.sessionId] ? 'opacity-50' : ''}`}>
                        <div className="flex justify-between items-center">
                          <span className="text-2xl font-bold text-white">{p.name}</span>
                          {meetingResults[p.sessionId] && (
                            <div className="flex gap-4 text-sm font-black">
                              <span className="text-emerald-400">L: {meetingResults[p.sessionId].lobbyLikes}</span>
                              <span className="text-red-400">D: {meetingResults[p.sessionId].lobbyDislikes}</span>
                              <span className="text-blue-400">K: %{meetingResults[p.sessionId].kickPercent}</span>
                            </div>
                          )}
                        </div>
                     </div>
                   ))}
                </div>
                {/* MAVİ */}
                <div className="space-y-4">
                   <h3 className="text-3xl font-black text-blue-500 border-b-2 border-blue-900/50 pb-2">{localBlueName}</h3>
                   {blueTeam.map((p: any) => (
                     <div key={p.sessionId} onClick={() => startMeetingIntro(p)} className={`p-6 bg-[#0f121a] rounded-2xl border-2 transition-all ${mePlayer?.isHost ? 'cursor-pointer hover:border-blue-500/50' : 'cursor-default'} ${introTarget?.sessionId === p.sessionId ? 'border-emerald-500 scale-105 shadow-2xl' : 'border-[#1a223d]'} ${meetingResults[p.sessionId] ? 'opacity-50' : ''}`}>
                        <div className="flex justify-between items-center">
                          <span className="text-2xl font-bold text-white">{p.name}</span>
                          {meetingResults[p.sessionId] && (
                            <div className="flex gap-4 text-sm font-black">
                              <span className="text-emerald-400">L: {meetingResults[p.sessionId].lobbyLikes}</span>
                              <span className="text-red-400">D: {meetingResults[p.sessionId].lobbyDislikes}</span>
                              <span className="text-blue-400">K: %{meetingResults[p.sessionId].kickPercent}</span>
                            </div>
                          )}
                        </div>
                     </div>
                   ))}
                </div>
              </div>
              {mePlayer?.isHost && room.settings.introMode && !room.introCompleted && (
                 <div className="flex justify-center mt-12">
                    <button onClick={() => { broadcastSync({...room, introCompleted: true}); setMeetingView(false); startGame(); }} className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-12 py-6 rounded-full shadow-2xl flex items-center gap-4 text-xl transition-transform active:scale-95">
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
            <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
               <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="bg-[#1C1412] border-2 border-emerald-500 rounded-3xl w-full max-w-3xl overflow-hidden shadow-[0_0_100px_rgba(16,185,129,0.1)]">
                  <div className="p-10 text-center border-b border-[#2A1D1A]">
                    <h2 className="text-5xl font-black text-white mb-2">{introTarget.name}</h2>
                    <p className="text-emerald-500 font-bold uppercase tracking-widest">Hakkındaki Karar Nedir?</p>
                  </div>
                  <div className="p-10 space-y-10">
                    <div className="flex justify-center gap-12">
                      <div className="relative">
                        <button onClick={() => castLobbyVote('like')} className={`p-8 rounded-full border-4 transition-all ${lobbyVotes[sessionId] === 'like' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' : 'bg-[#2A1D1A] border-[#3A2A26] text-white/40 hover:text-white'}`}><ThumbsUp size={48}/></button>
                        <div className="absolute -top-3 -right-6 bg-[#140E0D] text-emerald-500 px-3 py-1 rounded-full text-xs font-bold border border-emerald-500/30">
                          {Object.entries(lobbyVotes).filter(([_, v]) => v === 'like').length} Oy
                        </div>
                      </div>
                      <div className="relative">
                        <button onClick={() => castLobbyVote('dislike')} className={`p-8 rounded-full border-4 transition-all ${lobbyVotes[sessionId] === 'dislike' ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-[#2A1D1A] border-[#3A2A26] text-white/40 hover:text-white'}`}><ThumbsDown size={48}/></button>
                        <div className="absolute -top-3 -right-6 bg-[#140E0D] text-red-500 px-3 py-1 rounded-full text-xs font-bold border border-red-500/30">
                          {Object.entries(lobbyVotes).filter(([_, v]) => v === 'dislike').length} Oy
                        </div>
                      </div>
                    </div>
                    <div className="bg-[#140E0D] p-6 rounded-2xl border border-[#2A1D1A]">
                       <div className="flex justify-between mb-3 font-bold text-sm">
                         <span className="text-emerald-500">👍 {kickVotes.likes} (Chate 1)</span>
                         <span className="text-red-500">👎 {kickVotes.dislikes} (Chate 0)</span>
                       </div>
                       <div className="h-6 bg-red-500/20 rounded-full overflow-hidden flex border border-[#2A1D1A]">
                         <motion.div animate={{ width: `${(kickVotes.likes + kickVotes.dislikes) === 0 ? 50 : (kickVotes.likes / (kickVotes.likes + kickVotes.dislikes)) * 100}%` }} className="h-full bg-emerald-500"/>
                       </div>
                    </div>
                    {mePlayer?.isHost && (
                      <div className="flex flex-col items-center gap-4">
                         <div className="text-2xl font-black text-white bg-[#2A1D1A] px-6 py-2 rounded-xl">00:{introTimer < 10 ? `0${introTimer}` : introTimer}</div>
                         <button onClick={endMeetingIntro} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black p-4 rounded-xl text-lg transition-all">TANIŞMAYI BİTİR VE KAYDET</button>
                      </div>
                    )}
                  </div>
               </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* LOBİ UI HEADER */}
        <header className="flex justify-between items-center mb-8">
           <div className="flex gap-3">
              <span className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"/> Lobide</span>
              <span className="bg-white/5 text-white/50 border border-white/5 px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2"><Users size={16}/> {room.players.length} Oyuncu</span>
           </div>
           <div className="flex items-center gap-3 bg-[#1C1412] px-6 py-2 rounded-full border border-[#2A1D1A]">
              <span className="text-[#887A76] font-bold text-sm">Oda:</span>
              <span className="text-white font-black tracking-[0.3em] flex items-center">
                 {showRoomCode ? room.id : (
                   <>
                     <span className="w-2 h-2 rounded-full bg-red-500 mx-0.5"></span>
                     <span className="w-2 h-2 rounded-full bg-red-500 mx-0.5"></span>
                     <span className="w-2 h-2 rounded-full bg-red-500 mx-0.5"></span>
                     <span className="w-2 h-2 rounded-full bg-red-500 mx-0.5"></span>
                     <span className="w-2 h-2 rounded-full bg-red-500 mx-0.5"></span>
                     <span className="w-2 h-2 rounded-full bg-red-500 mx-0.5"></span>
                   </>
                 )}
              </span>
              <button onClick={() => setShowRoomCode(!showRoomCode)} className="text-[#887A76] hover:text-white ml-2">{showRoomCode ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
              <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${room.id}`)} className="text-[#887A76] hover:text-white ml-1"><Copy size={16}/></button>
           </div>
           <div className="flex gap-3">
              <span className="bg-[#1C1412] text-white/80 border border-[#2A1D1A] px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2"><Settings size={16} className="text-emerald-500"/> {mePlayer?.name}</span>
              <button onClick={() => setShowLeaveConfirm(true)} className="bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors"><LogOut size={16}/> Ayrıl</button>
           </div>
        </header>

        {/* LOBİ İÇERİK IZGARASI */}
        <div className="flex-1 flex flex-col lg:flex-row gap-6">
           {/* SOL KISIM: TAKIM KARTLARI */}
           <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* KIRMIZI TAKIM KARTI */}
              <div className="bg-[#1C1412] border border-[#2A1D1A] rounded-[24px] p-6 h-fit">
                 <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3 w-full">
                       <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_red] shrink-0"></div>
                       {isEditingRed ? (
                           <input autoFocus value={localRedName} onChange={(e) => setLocalRedName(e.target.value)} onBlur={() => { setIsEditingRed(false); broadcastSync({...room, settings: {...room.settings, redName: localRedName}}); }} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="bg-transparent text-white font-black text-xl w-full border-b border-red-500/50 outline-none uppercase tracking-wide"/>
                       ) : (
                           <div className="flex items-center gap-2 group/edit flex-1">
                               <span className="text-white font-black text-xl uppercase tracking-wide truncate max-w-[12rem]">{localRedName}</span>
                               {mePlayer?.isHost && (
                                   <button onClick={() => setIsEditingRed(true)} className="text-[#554A46] hover:text-white transition-colors"><Pencil size={16}/></button>
                               )}
                           </div>
                       )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                       <span className="bg-red-950/40 text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold border border-red-900/40">{redTeam.length} oyuncu</span>
                       {mePlayer?.team !== 'red' && <button onClick={() => switchRole('red', 'operative')} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-lg">KATIL</button>}
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-3">
                    {hasRedSpymaster ? (
                       <div className="bg-red-950/30 border border-red-900/50 rounded-[10px] p-3 flex justify-center items-center relative h-12">
                          <span className="text-white font-bold text-sm text-center">{redTeam.find((p:any)=>p.role==='spymaster')?.name}</span>
                          <span className="absolute -top-2 left-3 bg-[#1C1412] px-1 text-[9px] text-red-500 font-bold tracking-widest">ŞEF</span>
                       </div>
                    ) : (
                       <button onClick={() => switchRole('red', 'spymaster')} className="border border-dashed border-red-900/50 hover:bg-red-950/20 rounded-[10px] p-2 flex flex-col justify-center items-center h-12 transition-colors">
                          <span className="text-red-500/60 font-black text-[9px] tracking-widest text-center leading-tight">İSTİHBARAT ŞEFİ<br/>OL</span>
                       </button>
                    )}
                    {redTeam.filter((p:any)=>p.role==='operative').map((p:any) => (
                       <div key={p.sessionId} className="bg-[#2a1c1a] border border-[#3a2c2a] rounded-[10px] p-3 flex justify-center items-center h-12">
                          <span className="text-stone-200 font-bold text-sm text-center">{p.name}</span>
                       </div>
                    ))}
                    {renderEmptySlots(redTeam.filter((p:any)=>p.role==='operative').length, mePlayer?.isHost)}
                 </div>
              </div>

              {/* MAVİ TAKIM KARTI */}
              <div className="bg-[#1C1412] border border-[#2A1D1A] rounded-[24px] p-6 h-fit">
                 <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3 w-full">
                       <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_8px_blue] shrink-0"></div>
                       {isEditingBlue ? (
                           <input autoFocus value={localBlueName} onChange={(e) => setLocalBlueName(e.target.value)} onBlur={() => { setIsEditingBlue(false); broadcastSync({...room, settings: {...room.settings, blueName: localBlueName}}); }} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="bg-transparent text-white font-black text-xl w-full border-b border-blue-500/50 outline-none uppercase tracking-wide"/>
                       ) : (
                           <div className="flex items-center gap-2 group/edit flex-1">
                               <span className="text-white font-black text-xl uppercase tracking-wide truncate max-w-[12rem]">{localBlueName}</span>
                               {mePlayer?.isHost && (
                                   <button onClick={() => setIsEditingBlue(true)} className="text-[#554A46] hover:text-white transition-colors"><Pencil size={16}/></button>
                               )}
                           </div>
                       )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                       <span className="bg-blue-950/40 text-blue-400 px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-900/40">{blueTeam.length} oyuncu</span>
                       {mePlayer?.team !== 'blue' && <button onClick={() => switchRole('blue', 'operative')} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-lg">KATIL</button>}
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-3">
                    {hasBlueSpymaster ? (
                       <div className="bg-blue-950/30 border border-blue-900/50 rounded-[10px] p-3 flex justify-center items-center relative h-12">
                          <span className="text-white font-bold text-sm text-center">{blueTeam.find((p:any)=>p.role==='spymaster')?.name}</span>
                          <span className="absolute -top-2 left-3 bg-[#1C1412] px-1 text-[9px] text-blue-500 font-bold tracking-widest">ŞEF</span>
                       </div>
                    ) : (
                       <button onClick={() => switchRole('blue', 'spymaster')} className="border border-dashed border-blue-900/50 hover:bg-blue-950/20 rounded-[10px] p-2 flex flex-col justify-center items-center h-12 transition-colors">
                          <span className="text-blue-500/60 font-black text-[9px] tracking-widest text-center leading-tight">İSTİHBARAT ŞEFİ<br/>OL</span>
                       </button>
                    )}
                    {blueTeam.filter((p:any)=>p.role==='operative').map((p:any) => (
                       <div key={p.sessionId} className="bg-[#1c222a] border border-[#2c323a] rounded-[10px] p-3 flex justify-center items-center h-12">
                          <span className="text-stone-200 font-bold text-sm text-center">{p.name}</span>
                       </div>
                    ))}
                    {renderEmptySlots(blueTeam.filter((p:any)=>p.role==='operative').length, mePlayer?.isHost)}
                 </div>
              </div>

           </div>

           {/* SAĞ KISIM: DURUM VE AYARLAR */}
           <div className="w-full lg:w-96 flex flex-col gap-6">
              
              {/* OYUN DURUMU KARTI */}
              <div className="bg-[#1C1412] border border-[#2A1D1A] rounded-[24px] p-6">
                 <div className="flex justify-between items-center mb-6 border-b border-[#2A1D1A] pb-4">
                    <h3 className="text-white font-black text-sm tracking-widest uppercase">OYUN DURUMU</h3>
                    {canStartGame ? (
                      <button onClick={handleStartOperation} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded-md text-xs font-bold shadow-lg transition-transform active:scale-95">BAŞLAT</button>
                    ) : (
                      <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3 py-1 rounded-md text-xs font-bold flex items-center gap-1"><div className="w-1.5 h-1.5 bg-amber-500 rounded-full"/> BEKLİYOR</span>
                    )}
                 </div>
                 
                 <div className="space-y-3 text-sm font-semibold">
                    <div className={`flex justify-between items-center ${hasBlueSpymaster ? 'text-emerald-500' : 'text-[#554A46]'}`}>
                       <div className="flex items-center gap-2">
                         {hasBlueSpymaster ? <CheckCircle2 size={16}/> : <div className="w-4 h-4 rounded-full border-2 border-[#3A2A26]"/>}
                         {localBlueName} İst. Şefi
                       </div>
                    </div>
                    <div className={`flex justify-between items-center ${hasRedSpymaster ? 'text-emerald-500' : 'text-[#554A46]'}`}>
                       <div className="flex items-center gap-2">
                         {hasRedSpymaster ? <CheckCircle2 size={16}/> : <div className="w-4 h-4 rounded-full border-2 border-[#3A2A26]"/>}
                         {localRedName} İst. Şefi
                       </div>
                    </div>
                    <div className={`flex justify-between items-center ${ruleMin2Blue ? 'text-emerald-500' : 'text-[#554A46]'}`}>
                       <div className="flex items-center gap-2">
                         {ruleMin2Blue ? <CheckCircle2 size={16}/> : <div className="w-4 h-4 rounded-full border-2 border-[#3A2A26]"/>}
                         {localBlueName} min 2 kişi
                       </div>
                       <span className="text-xs">{blueTeam.length}/2+</span>
                    </div>
                    <div className={`flex justify-between items-center ${ruleMin2Red ? 'text-emerald-500' : 'text-[#554A46]'}`}>
                       <div className="flex items-center gap-2">
                         {ruleMin2Red ? <CheckCircle2 size={16}/> : <div className="w-4 h-4 rounded-full border-2 border-[#3A2A26]"/>}
                         {localRedName} min 2 kişi
                       </div>
                       <span className="text-xs">{redTeam.length}/2+</span>
                    </div>
                    <div className={`flex justify-between items-center ${ruleAllAssigned ? 'text-emerald-500' : 'text-[#554A46]'}`}>
                       <div className="flex items-center gap-2">
                         {ruleAllAssigned ? <CheckCircle2 size={16}/> : <div className="w-4 h-4 rounded-full border-2 border-[#3A2A26]"/>}
                         Herkes takımlarda
                       </div>
                       {!ruleAllAssigned && <span className="text-xs text-amber-500">{spectators.length} boşta</span>}
                    </div>
                 </div>
              </div>

              {/* AYARLAR KARTI */}
              <div className="bg-[#1C1412] border border-[#2A1D1A] rounded-[24px] p-6 flex flex-col gap-6">
                 {/* Tanışma Sekansı */}
                 <div className="border-b border-[#2A1D1A] pb-6">
                    <div className="flex justify-between items-center mb-2">
                       <div className="flex items-center gap-2 text-white font-bold text-sm"><Users size={16} className="text-emerald-500"/> Tanışma Sekansı</div>
                       <button disabled={!mePlayer?.isHost} onClick={() => {
                            if (!room.settings.introMode && (!kickEnabled || !kickConfirmed || !kickChannelName.trim())) {
                               alert("Tanıtım modunu açmak için Kick entegrasyonu açık, kanal adı yazılı ve onaylanmış olmalıdır!");
                               return;
                            }
                            broadcastSync({...room, settings: {...room.settings, introMode: !room.settings.introMode}});
                         }} className={`w-10 h-5 rounded-full relative transition-colors ${room.settings?.introMode ? 'bg-blue-600' : 'bg-[#3A2A26]'}`}>
                          <div className={`absolute top-[2px] w-4 h-4 bg-white rounded-full transition-all ${room.settings?.introMode ? 'left-[22px]' : 'left-[2px]'}`}/>
                       </button>
                    </div>
                    <p className="text-[#887A76] text-xs">İlk oyun başında oyuncular sırayla kendini tanıtır.</p>
                 </div>

                 {/* Zamanlayıcı */}
                 <div className="border-b border-[#2A1D1A] pb-6">
                    <div className="flex items-center gap-2 text-white font-bold text-sm mb-4"><Clock size={16} className="text-emerald-500"/> Zamanlayıcı</div>
                    <div className="space-y-4">
                       <div>
                         <div className="flex justify-between text-[#887A76] text-xs font-bold mb-2"><span>Şef Süresi</span> <span className="text-white">{(room.settings?.spymasterTime || 60)}s</span></div>
                         <input type="range" min="30" max="180" step="10" value={room.settings?.spymasterTime || 60} disabled={!mePlayer?.isHost} onChange={(e) => broadcastSync({...room, settings: {...room.settings, spymasterTime: parseInt(e.target.value)}})} className="w-full accent-blue-500 bg-[#2A1D1A] h-1 rounded-full appearance-none outline-none" />
                       </div>
                       <div>
                         <div className="flex justify-between text-[#887A76] text-xs font-bold mb-2"><span>Ajan Süresi</span> <span className="text-white">{(room.settings?.operativeTime || 60)}s</span></div>
                         <input type="range" min="30" max="180" step="10" value={room.settings?.operativeTime || 60} disabled={!mePlayer?.isHost} onChange={(e) => broadcastSync({...room, settings: {...room.settings, operativeTime: parseInt(e.target.value)}})} className="w-full accent-blue-500 bg-[#2A1D1A] h-1 rounded-full appearance-none outline-none" />
                       </div>
                    </div>
                 </div>

                 {/* Kick Chat */}
                 <div>
                    <div className="flex justify-between items-center mb-4">
                       <div className="flex items-center gap-2 text-white font-bold text-sm"><MessageSquare size={16} className="text-emerald-500"/> Kick Chat</div>
                       <button disabled={!mePlayer?.isHost} onClick={() => {
                            const newState = !kickEnabled;
                            setKickEnabled(newState);
                            if (!newState && room.settings.introMode) broadcastSync({...room, settings: {...room.settings, introMode: false}});
                         }} className={`w-10 h-5 rounded-full relative transition-colors ${kickEnabled ? 'bg-blue-600' : 'bg-[#3A2A26]'}`}>
                          <div className={`absolute top-[2px] w-4 h-4 bg-white rounded-full transition-all ${kickEnabled ? 'left-[22px]' : 'left-[2px]'}`}/>
                       </button>
                    </div>
                    <div className="flex gap-2 mb-3">
                       <input value={kickChannelName} onChange={(e) => setKickChannelName(e.target.value)} disabled={kickConfirmed || !mePlayer?.isHost} className="flex-1 bg-[#140E0D] border border-[#2A1D1A] p-2.5 rounded-lg text-sm text-white outline-none" placeholder="Kanal adı" />
                       {mePlayer?.isHost && kickEnabled && (
                          !kickConfirmed ? 
                            <button onClick={() => setKickConfirmed(true)} className="bg-[#2A1D1A] hover:bg-emerald-600 p-2.5 rounded-lg text-white transition-colors"><CheckCircle2 size={18}/></button> :
                            <button onClick={() => setKickConfirmed(false)} className="bg-emerald-600/20 text-emerald-500 p-2.5 rounded-lg transition-colors"><X size={18}/></button>
                       )}
                    </div>
                    {kickConfirmed ? (
                       <div className="bg-emerald-500/5 border border-emerald-500/20 p-3 rounded-lg flex items-start gap-2">
                          <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5"/>
                          <div>
                             <p className="text-emerald-500 text-xs font-bold">Chat entegrasyonu aktif</p>
                             <p className="text-[#887A76] text-[10px] leading-tight mt-1">Tanışma aşamasında chatten '1' beğeni, '0' beğenmeme olarak sayılacak.</p>
                          </div>
                       </div>
                    ) : (
                       <div className="bg-[#140E0D] border border-[#2A1D1A] p-3 rounded-lg">
                          <p className="text-[#554A46] text-xs font-bold text-center">Chat entegrasyonu kapalı</p>
                       </div>
                    )}
                 </div>

              </div>
           </div>
        </div>
      </div>
    );
  }

  // --- OYUN TAHTASI (BOARD - RESİMDEKİ TASARIM) ---
  if (view === 'playing' && room) {
    const me = room.players.find((p: any) => p.sessionId === sessionId);
    const isMyTurn = room.currentTurn === me?.team;
    const isSpymasterTurn = room.turnPhase === 'spymaster';
    const isOperativeTurn = room.turnPhase === 'operative';
    
    const redLeft = room.cards.filter((c: any) => c.color === 'red' && !c.revealed).length;
    const blueLeft = room.cards.filter((c: any) => c.color === 'blue' && !c.revealed).length;

    return (
      <div className="min-h-screen bg-[#100b0a] flex flex-col text-slate-100 relative overflow-hidden font-sans">
        
        {/* ÇIKIŞ ONAY MODALI */}
        <AnimatePresence>
          {showLeaveConfirm && (
            <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
               <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#1C1412] border-2 border-[#2A1D1A] rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
                  <AlertTriangle size={48} className="text-red-500 mx-auto mb-4" />
                  <h3 className="text-2xl font-black text-white mb-2">Ayrılmak İstiyor Musunuz?</h3>
                  <p className="text-[#887A76] mb-8 font-medium">Oda bağlantınız kesilecek ve lobi listesine döneceksiniz.</p>
                  <div className="flex gap-4">
                     <button onClick={() => setShowLeaveConfirm(false)} className="flex-1 bg-[#2A1D1A] hover:bg-[#3A2A26] text-white font-bold py-3 rounded-xl transition-colors">Hayır, Kal</button>
                     <button onClick={leaveRoom} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-colors">Evet, Ayrıl</button>
                  </div>
               </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* LOBİ UI HEADER (Küçük ve şık) */}
        <header className="h-14 bg-[#1C1412] border-b border-[#2A1D1A] flex justify-between items-center px-6 shrink-0 z-20">
           <div className="flex items-center gap-3 bg-[#140E0D] px-4 py-1.5 rounded-lg border border-[#2A1D1A]">
              <span className="text-[#887A76] font-bold text-xs">Oda Kodu:</span>
              <span className="text-white font-black tracking-[0.2em] text-xs">
                 {showRoomCode ? room.id : '••••••'}
              </span>
              <button onClick={() => setShowRoomCode(!showRoomCode)} className="text-[#887A76] hover:text-white ml-2">{showRoomCode ? <EyeOff size={14}/> : <Eye size={14}/>}</button>
              <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${room.id}`)} className="text-[#887A76] hover:text-white ml-1"><Copy size={14}/></button>
           </div>
           
           <div className="flex items-center gap-4">
              <span className="bg-[#140E0D] text-white/50 border border-[#2A1D1A] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2"><Users size={14}/> {room.players.length}</span>
              <span className="bg-[#140E0D] text-white/50 border border-[#2A1D1A] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2"><Search size={14}/> Büyüt/Küçült</span>
              <div className="bg-[#140E0D] border border-[#2A1D1A] px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2">
                 <span className="text-[#887A76]">Sırası:</span>
                 <span className={room.currentTurn === 'red' ? 'text-red-500' : 'text-blue-500'}>{room.currentTurn === 'red' ? (room.settings?.redName || 'KIRMIZI TAKIM') : (room.settings?.blueName || 'MAVİ TAKIM')}</span>
              </div>
           </div>
           
           <div className="flex gap-2">
              <span className="bg-[#140E0D] text-white/80 border border-[#2A1D1A] px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2"><Users size={14} className="text-emerald-500"/> Takım</span>
              <button onClick={() => setShowLeaveConfirm(true)} className="bg-red-500 text-white border border-red-600 hover:bg-red-600 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors"><LogOut size={14}/></button>
           </div>
        </header>

        <div className="flex-1 flex gap-4 p-4 overflow-hidden z-10">
            
            {/* SOL PANEL (KIRMIZI TAKIM VE ZAMANLAYICI) */}
            <aside className="w-64 flex flex-col gap-4 shrink-0 overflow-y-auto hidden md:flex">
                <div className="bg-[#7f1d1d] rounded-xl p-4 flex flex-col items-center border border-[#991b1b] shadow-lg relative overflow-hidden text-center min-h-[300px]">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-600/50 to-transparent pointer-events-none opacity-50"></div>
                    <h2 className="text-lg font-black text-white mb-2 relative z-10 uppercase tracking-wide">{room.settings?.redName || 'KIRMIZI TAKIM'}</h2>
                    <div className="text-6xl font-black text-white mb-1 relative z-10 leading-none drop-shadow-md">{redLeft}</div>
                    <div className="text-xs font-bold text-red-200 mb-6 relative z-10 uppercase tracking-widest">KALAN KART</div>
                    
                    <div className="space-y-2 w-full relative z-10">
                        {room.players.filter((p:any)=>p.team==='red'&&p.role==='spymaster').map((p:any)=> 
                           <div key={p.sessionId} className="bg-black/30 border border-black/20 text-white font-bold text-xs py-1.5 px-3 rounded-md flex items-center justify-center gap-2"><ShieldAlert size={12} className="text-amber-400"/> {p.name}</div>
                        )}
                        <div className="grid grid-cols-2 gap-2 mt-2">
                           {room.players.filter((p:any)=>p.team==='red'&&p.role==='operative').map((p:any)=> 
                              <div key={p.sessionId} className="bg-black/20 text-red-100 font-medium text-xs py-1.5 px-2 rounded-md truncate">{p.name}</div>
                           )}
                        </div>
                    </div>
                </div>

                {/* SÜRE KARTI */}
                <div className="bg-[#1C1412] rounded-xl p-5 border border-[#2A1D1A] flex flex-col items-center justify-center">
                   <div className="flex items-center gap-2 text-amber-500 text-xs font-bold uppercase tracking-widest mb-3">
                      <Clock size={14}/> {room.turnPhase === 'spymaster' ? 'İstihbarat Şefi Süresi' : 'Ajan Süresi'}
                   </div>
                   <div className={`text-4xl font-black mb-3 font-mono ${turnTimer <= 10 ? 'text-red-500 animate-pulse' : 'text-amber-400'}`}>
                      0:{turnTimer.toString().padStart(2, '0')}
                   </div>
                   <div className="w-full h-2 bg-[#2A1D1A] rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 transition-all duration-1000 ease-linear" style={{ width: `${(turnTimer / (room.turnPhase === 'spymaster' ? room.settings.spymasterTime : room.settings.operativeTime)) * 100}%` }}></div>
                   </div>
                </div>
            </aside>

            {/* ORTA OYUN IZGARASI VE INPUT */}
            <main className="flex-1 flex flex-col items-center overflow-y-auto">
              {/* GRID */}
              <div className="grid grid-cols-5 gap-3 md:gap-4 w-full max-w-[1200px] shrink-0 pt-4">
                {room.cards.map((card: any) => {
                  const amISpymaster = me?.role === 'spymaster';
                  const isRevealed = card.revealed || room.status.includes('_won');
                  const showColor = isRevealed || amISpymaster;
                  
                  // DOYGUNLUĞU AZALTILMIŞ PASTEL KART STİLLERİ
                  const getCardStyle = () => {
                    if (!showColor) return { outer: "bg-[#cfcbc2] shadow-[0_4px_0_#aba79e]", pill: "bg-[#f0eee9]", text: "text-[#6b6963]" };
                    if (card.color === 'red') return { outer: "bg-[#b06363] shadow-[0_4px_0_#8c4a4a]", pill: "bg-[#fae8e8]", text: "text-[#9c4c4c]" };
                    if (card.color === 'blue') return { outer: "bg-[#637eb0] shadow-[0_4px_0_#4a618c]", pill: "bg-[#e8edf5]", text: "text-[#4c619c]" };
                    if (card.color === 'neutral') return { outer: "bg-[#cfcbc2] shadow-[0_4px_0_#aba79e]", pill: "bg-[#f0eee9]", text: "text-[#6b6963]" };
                    return { outer: "bg-[#333333] shadow-[0_4px_0_#1a1a1a]", pill: "bg-[#e8e8e8]", text: "text-[#b06363]" };
                  };
                  
                  const style = getCardStyle();

                  // OY VEREN İSİMLERİ (MEVCUT TAKIM)
                  const votingPlayers = card.votes
                      .map((vId: string) => room.players.find((p: any) => p.sessionId === vId))
                      .filter((p: any) => p && p.team === me?.team);

                  return (
                    <div key={card.id} className="relative">
                        <motion.div
                          onClick={() => {
                            if (amISpymaster || isRevealed || !isMyTurn || !isOperativeTurn || room.status.includes('_won')) return;
                            voteCard(card.id);
                          }}
                          whileHover={(!isRevealed && !amISpymaster && isMyTurn && isOperativeTurn) ? { y: -2 } : {}}
                          whileTap={(!isRevealed && !amISpymaster && isMyTurn && isOperativeTurn) ? { y: 2, boxShadow: '0 0 0 transparent' } : {}}
                          className={`relative aspect-[3/2] lg:aspect-[7/4] rounded-[8px] flex items-end justify-center cursor-pointer select-none transition-all duration-200 overflow-hidden group p-2 pb-3 ${style.outer} ${isRevealed ? 'opacity-90' : ''}`}
                        >
                          {/* SİLİK WATERMARK (MEKIP) - Şefler İçin De Görünür */}
                          {!isRevealed && (
                             <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.06] z-0">
                                <span className="font-black text-xl md:text-3xl lg:text-4xl tracking-[0.2em] text-black uppercase select-none">MEKIP</span>
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
                             />
                          )}

                          {/* KELİME (PILL) KUTUSU */}
                          <div className={`w-[90%] flex justify-center py-1.5 shadow-md z-20 rounded-md ${style.pill}`}>
                              <span className={`font-black text-sm md:text-base tracking-widest uppercase ${style.text}`}>{card.word}</span>
                          </div>

                          {/* SOL ÜST KÖŞE: OY VEREN KİŞİLERİN İSİMLERİ */}
                          {!isRevealed && votingPlayers.length > 0 && (
                            <div className="absolute top-1 left-1 flex flex-col gap-1 z-30 pointer-events-none">
                              {votingPlayers.map((p: any) => (
                                <div key={p.sessionId} className={`px-1.5 py-0.5 rounded shadow-sm text-[9px] md:text-[10px] font-black border tracking-wider ${p.team === 'red' ? 'bg-red-700/90 border-red-400/50 text-white' : 'bg-blue-700/90 border-blue-400/50 text-white'}`}>
                                  {p.name}
                                </div>
                              ))}
                            </div>
                          )}

                          {amISpymaster && !isRevealed && card.color === 'assassin' && (
                            <div className="absolute top-2 left-2 opacity-60 z-30"><Search size={18} className="text-black drop-shadow-sm"/></div>
                          )}
                        </motion.div>

                        {/* SAĞ ÜST KÖŞE: DIŞARI TAŞAN DEVASA AÇMA (PARMAK) BUTONU */}
                        {!isRevealed && !amISpymaster && isMyTurn && isOperativeTurn && card.votes.includes(sessionId) && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); revealCard(card.id); }} 
                              className="absolute -top-3 -right-3 bg-emerald-500 hover:bg-emerald-400 text-white p-2.5 rounded-xl shadow-[0_4px_0_#047857] hover:shadow-[0_6px_0_#047857] hover:-translate-y-1 transition-all active:translate-y-1 active:shadow-none border-2 border-emerald-300 flex items-center justify-center z-[100] cursor-pointer"
                              title="Kartı Aç"
                            >
                              <Hand size={22} className="drop-shadow-md" />
                            </button>
                        )}
                    </div>
                  );
                })}
              </div>

              {/* INPUT ALANI (TAM GRID GENİŞLİĞİNDE) */}
              <div className="w-full max-w-[1200px] mt-6 flex gap-2 shrink-0">
                 {me?.role === 'spymaster' && isMyTurn && isSpymasterTurn && !room.status.includes('_won') ? (
                    <>
                       <div className="flex-1 bg-[#1C1412] border border-[#2A1D1A] rounded-lg p-1 flex">
                          <input 
                            value={clueWord}
                            onChange={e => setClueWord(e.target.value.replace(/\s/g, ''))}
                            placeholder="Tek kelimelik ipucu..."
                            className="flex-1 bg-transparent text-white px-4 py-2 outline-none uppercase font-bold text-sm"
                          />
                       </div>
                       <div className="flex items-center bg-[#1C1412] border border-[#2A1D1A] rounded-lg overflow-hidden shrink-0">
                          <button onClick={() => setClueCount(prev => typeof prev === 'number' ? Math.max(1, prev - 1) : 1)} className="px-4 py-2 hover:bg-[#2A1D1A] text-white font-black">-</button>
                          <input 
                            type="text" 
                            value={clueCount === 'unlimited' ? '∞' : clueCount}
                            onChange={e => { const val = parseInt(e.target.value); if (!isNaN(val)) setClueCount(Math.min(9, Math.max(1, val))); }}
                            className="w-8 bg-transparent text-center text-white font-bold outline-none text-sm"
                          />
                          <button onClick={() => setClueCount(prev => typeof prev === 'number' ? Math.min(9, prev + 1) : 1)} className="px-4 py-2 hover:bg-[#2A1D1A] text-white font-black">+</button>
                       </div>
                       <button onClick={submitClue} disabled={!clueWord} className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-[#2A1D1A] disabled:text-[#554A46] text-white px-6 rounded-lg font-bold text-sm transition-colors shrink-0">GÖNDER</button>
                    </>
                 ) : (
                    <div className="flex-1 bg-[#1C1412] border border-[#2A1D1A] rounded-lg px-4 py-3 flex items-center text-[#554A46] text-sm font-bold">
                       {room.status.includes('_won') ? 'Oyun bitti.' : 'Sıranızı bekleyin veya takım arkadaşlarınızla tartışın...'}
                    </div>
                 )}
              </div>
            </main>

            {/* SAĞ PANEL (MAVİ TAKIM VE LOG) */}
            <aside className="w-64 flex flex-col gap-4 shrink-0 overflow-y-auto hidden md:flex">
                <div className="bg-[#1e3a8a] rounded-xl p-4 flex flex-col items-center border border-[#1e40af] shadow-lg relative overflow-hidden text-center min-h-[300px]">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-500/30 to-transparent pointer-events-none opacity-50"></div>
                    <h2 className="text-lg font-black text-white mb-2 relative z-10 uppercase tracking-wide">{room.settings?.blueName || 'MAVİ TAKIM'}</h2>
                    <div className="text-6xl font-black text-white mb-1 relative z-10 leading-none drop-shadow-md">{blueLeft}</div>
                    <div className="text-xs font-bold text-blue-200 mb-6 relative z-10 uppercase tracking-widest">KALAN KART</div>
                    
                    <div className="space-y-2 w-full relative z-10">
                        {room.players.filter((p:any)=>p.team==='blue'&&p.role==='spymaster').map((p:any)=> 
                           <div key={p.sessionId} className="bg-black/30 border border-black/20 text-white font-bold text-xs py-1.5 px-3 rounded-md flex items-center justify-center gap-2"><ShieldAlert size={12} className="text-amber-400"/> {p.name}</div>
                        )}
                        <div className="grid grid-cols-2 gap-2 mt-2">
                           {room.players.filter((p:any)=>p.team==='blue'&&p.role==='operative').map((p:any)=> 
                              <div key={p.sessionId} className="bg-black/20 text-blue-100 font-medium text-xs py-1.5 px-2 rounded-md truncate">{p.name}</div>
                           )}
                        </div>
                    </div>
                </div>

                {/* GÜNLÜK (OYUN KAYDI) */}
                <div className="bg-[#1C1412] rounded-xl border border-[#2A1D1A] flex-1 flex flex-col overflow-hidden min-h-[300px]">
                   <div className="p-4 border-b border-[#2A1D1A] flex items-center gap-2 text-white font-bold text-xs tracking-widest uppercase">
                      <ScrollText size={14} className="text-emerald-500"/> GÜNLÜK
                   </div>
                   <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {room.currentClue && (
                         <div className="mb-4 bg-blue-900/20 border border-blue-500/30 p-2 rounded text-xs font-medium text-blue-200">
                            💡 Gelen İpucu: <strong className="text-white uppercase">{room.currentClue.word} ({room.currentClue.count})</strong>
                         </div>
                      )}
                      {room.gameLogs?.slice().reverse().map((log: any, idx: number) => (
                         <div key={log.id} className="text-[11px] leading-tight">
                            <span className={log.team === 'red' ? 'text-red-400 font-bold' : 'text-blue-400 font-bold'}>•</span>{' '}
                            <span className="text-[#887A76] truncate max-w-[60px] inline-block align-bottom">{log.playerName}</span>{' '}
                            {log.type === 'clue' ? (
                               <span className="text-slate-300">ipucu: <strong className="text-white uppercase">{log.word} ({log.count})</strong></span>
                            ) : (
                               <>
                                  <span className="text-slate-400">→ {log.word}</span>{' '}
                                  <span className={`font-bold ${log.color === log.team ? 'text-emerald-500' : 'text-red-500'}`}>
                                     {log.color === log.team ? '✓ Doğru' : '✗ Yanlış'}
                                  </span>
                               </>
                            )}
                         </div>
                      ))}
                      {(!room.gameLogs || room.gameLogs.length === 0) && <div className="text-[#554A46] italic text-xs font-medium">Henüz hamle yapılmadı.</div>}
                   </div>
                </div>
            </aside>
        </div>
      </div>
    );
  }

  return null;
}