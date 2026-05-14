"use client";

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Hand, Search, Users, ShieldAlert, Crown, Copy, Settings, ArrowRight, AlertTriangle, ThumbsUp, ThumbsDown, X, Play, LogIn, Lock, Unlock, UserPlus, Info } from 'lucide-react';
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

  // KICK ENTEGRASYONU
  const [kickEnabled, setKickEnabled] = useState(false);
  const [kickChannelName, setKickChannelName] = useState('');
  const [kickConfirmed, setKickConfirmed] = useState(false);
  const [lobbyVotes, setLobbyVotes] = useState<Record<string, string>>({});
  const [kickVotes, setKickVotes] = useState({ likes: 0, dislikes: 0, voters: new Set<string>() });

  // OYUN İÇİ (PLAYING)
  const [clueWord, setClueWord] = useState('');
  const [clueCount, setClueCount] = useState<number | 'unlimited'>(1);

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

  // TAKIM İSİMLERİ GÜNCELLEME SİNKRONİZASYONU
  useEffect(() => {
    if (room?.settings?.redName) setLocalRedName(room.settings.redName);
    if (room?.settings?.blueName) setLocalBlueName(room.settings.blueName);
  }, [room?.settings?.redName, room?.settings?.blueName]);

  // 2. KICK WEBSOCKET BAĞLANTISI (corsproxy.io ile Cloudflare Bypass)
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
        if (payload.room.status === 'playing' && view !== 'playing') setView('playing');
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
      // PRESENCE: KURUCU KOPTU MU TAKİBİ
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

  // 4. OTOMATİK SİLİNME ZAMANLAYICILARI (Host Yoksa 1 Dk / Statü Değişmezse 5 Dk)
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (!hostPresent && room?.id && !room?.isSyncing) {
        timeout = setTimeout(async () => {
            if (isEnvMissing) return;
            await supabase.from('active_codenames_rooms').delete().eq('id', room.id);
            setView('room_list');
            setRoom(null);
            alert("Kurucu odadan ayrıldığı için oda kapatıldı.");
        }, 60000); 
    }
    return () => clearTimeout(timeout);
  }, [hostPresent, room?.id, room?.isSyncing]);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (room?.id && !room?.isSyncing) {
        timeout = setTimeout(async () => {
            if (isEnvMissing) return;
            await supabase.from('active_codenames_rooms').delete().eq('id', room.id);
            setView('room_list');
            setRoom(null);
            alert("Oda 5 dakika boyunca hareketsiz kaldığı için sistem tarafından silindi.");
        }, 5 * 60 * 1000);
    }
    return () => clearTimeout(timeout);
  }, [room?.status, room?.id]);

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
      settings: { spymasterTime: 60, operativeTime: 60, redName: 'KIRMIZI TAKIM', blueName: 'MAVİ TAKIM', introMode: false }, 
      cards: [], currentTurn: 'red', turnPhase: 'spymaster', meetingScores: {}, currentClue: null, guessesLeft: 0, timeRemaining: 0, introCompleted: false
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
        guessesLeft: 0
    };
    
    broadcastSync(updatedRoom);
    setView('playing');
  };

  // OYUN İÇİ FONKSİYONLARI
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
    const updatedRoom = {
      ...room,
      currentClue: { word: clueWord.toUpperCase(), count: clueCount },
      guessesLeft: clueCount === 'unlimited' ? 99 : (clueCount as number) + 1,
      turnPhase: 'operative' as const
    };
    broadcastSync(updatedRoom);
    setClueWord('');
    setClueCount(1);
  };


  // --- RENDER ---

  if (view === 'login') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <motion.form initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onSubmit={handleLogin} className="w-full max-w-md bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
          {isEnvMissing && (
            <div className="absolute top-0 left-0 w-full bg-red-600 text-white text-xs font-bold text-center py-1">
              DİKKAT: .env.local yapılandırılmadı!
            </div>
          )}
          <div className="flex justify-center mb-6 mt-4"><ShieldAlert size={60} className="text-emerald-500 animate-pulse"/></div>
          <h1 className="text-4xl font-black text-white text-center mb-8 tracking-tighter">AGENT LOGIN</h1>
          <input autoFocus value={playerName} onChange={e => setPlayerName(e.target.value)} className="w-full bg-slate-950 border-2 border-slate-800 p-4 rounded-2xl mb-4 text-white focus:border-emerald-500 outline-none transition-all" placeholder="Kod Adınız..." />
          <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black p-5 rounded-2xl shadow-lg transition-transform active:scale-95">SİSTEME SIZ</button>
        </motion.form>
      </div>
    );
  }

  if (view === 'room_list') {
    return (
      <div className="min-h-screen bg-slate-950 p-6 md:p-12 flex gap-8">
        <div className="w-1/3">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-xl">
            <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-2"><Crown className="text-amber-400"/> ODA KUR</h2>
            <input value={createName} onChange={e => setCreateName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl mb-4 text-white outline-none" placeholder="Oda Adı" />
            <input value={createPass} onChange={e => setCreatePass(e.target.value)} type="password" className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl mb-6 text-white outline-none" placeholder="Şifre (Opsiyonel)" />
            <button onClick={handleCreateRoom} className="w-full bg-emerald-600 hover:bg-emerald-500 p-4 rounded-xl font-bold text-white transition-all">OLUŞTUR VE GİR</button>
          </div>
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-center mb-6">
             <h2 className="text-2xl font-black text-slate-400">AKTİF LOBİLER</h2>
             <button onClick={fetchRooms} className="text-sm bg-slate-800 text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-700">Yenile</button>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {rooms.map(r => (
              <div key={r.id} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex justify-between items-center hover:border-slate-600 transition-all group">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">{r.name} {r.password && <Lock size={16} className="text-slate-500"/>}</h3>
                  <p className="text-slate-500 text-sm">ID: {r.id}</p>
                </div>
                {r.status === 'playing' ? (
                  <button disabled className="bg-slate-800 p-3 px-6 rounded-xl font-bold text-slate-500 transition-all flex items-center gap-2 cursor-not-allowed">OYUN DEVAM EDİYOR</button>
                ) : (
                  <button onClick={() => handleJoinRoom(r.id)} className="bg-slate-800 group-hover:bg-emerald-600 p-3 px-6 rounded-xl font-bold text-white transition-all flex items-center gap-2">KATIL <LogIn size={18}/></button>
                )}
              </div>
            ))}
            {rooms.length === 0 && <div className="text-slate-600 italic">Şu an aktif operasyon bulunmuyor...</div>}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'lobby') {
    if (room?.isSyncing) {
        return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-emerald-500 text-2xl font-black">
           <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }} className="mb-6"><ShieldAlert size={80} /></motion.div>
           <p className="animate-pulse">SUNUCUYA BAĞLANILIYOR... VERİ BEKLENİYOR</p>
        </div>
    }

    const redTeam = room.players.filter((p: any) => p.team === 'red');
    const blueTeam = room.players.filter((p: any) => p.team === 'blue');
    const spectators = room.players.filter((p: any) => p.team === 'spectator');
    const mePlayer = room.players.find((p: any) => p.sessionId === sessionId);

    // Her iki takımda da şef varsa oyunu başlatabilir
    const hasRedSpymaster = redTeam.some((p: any) => p.role === 'spymaster');
    const hasBlueSpymaster = blueTeam.some((p: any) => p.role === 'spymaster');
    const canStartGame = hasRedSpymaster && hasBlueSpymaster;

    return (
      <div className="min-h-screen bg-slate-950 p-6 md:p-10 relative overflow-hidden">
        
        {/* TANIŞMA MODU EKRANI */}
        <AnimatePresence>
          {meetingView && (
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="fixed inset-0 bg-slate-950 z-40 p-12 overflow-y-auto">
              <button onClick={() => setMeetingView(false)} className="absolute top-8 right-8 text-slate-500 hover:text-white"><X size={40}/></button>
              <h2 className="text-5xl font-black text-white text-center mb-16 tracking-tighter text-emerald-500">EKİP TANIŞMA</h2>
              
              <div className="grid grid-cols-2 gap-20 max-w-7xl mx-auto">
                <div className="space-y-6">
                   <h3 className="text-3xl font-black text-red-500 border-b-4 border-red-900 pb-2">{localRedName}</h3>
                   {redTeam.map((p: any) => (
                     <div key={p.sessionId} onClick={() => startMeetingIntro(p)} className={`p-8 bg-slate-900 rounded-3xl border-2 transition-all ${mePlayer?.isHost ? 'cursor-pointer hover:border-slate-600' : 'cursor-default'} ${introTarget?.sessionId === p.sessionId ? 'border-emerald-500 scale-105 shadow-2xl' : 'border-slate-800'} ${meetingResults[p.sessionId] ? 'opacity-50' : ''}`}>
                        <div className="flex justify-between items-center">
                          <span className="text-3xl font-bold text-white">{p.name}</span>
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
                <div className="space-y-6">
                   <h3 className="text-3xl font-black text-blue-500 border-b-4 border-blue-900 pb-2">{localBlueName}</h3>
                   {blueTeam.map((p: any) => (
                     <div key={p.sessionId} onClick={() => startMeetingIntro(p)} className={`p-8 bg-slate-900 rounded-3xl border-2 transition-all ${mePlayer?.isHost ? 'cursor-pointer hover:border-slate-600' : 'cursor-default'} ${introTarget?.sessionId === p.sessionId ? 'border-emerald-500 scale-105 shadow-2xl' : 'border-slate-800'} ${meetingResults[p.sessionId] ? 'opacity-50' : ''}`}>
                        <div className="flex justify-between items-center">
                          <span className="text-3xl font-bold text-white">{p.name}</span>
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

              {/* Kurucu Tüm Tanışmaları Bitirip Oyuna Geç Butonu */}
              {mePlayer?.isHost && room.settings.introMode && !room.introCompleted && (
                 <div className="flex justify-center mt-12">
                    <button onClick={() => { broadcastSync({...room, introCompleted: true}); setMeetingView(false); startGame(); }} className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-12 py-6 rounded-3xl shadow-2xl flex items-center gap-4 text-2xl transition-transform active:scale-95">
                       TÜM TANIŞMALARI BİTİR VE OYUNA GEÇ <Play size={32}/>
                    </button>
                 </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* OYLAMA POPUP */}
        <AnimatePresence>
          {introTarget && (
            <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
               <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="bg-slate-900 border-4 border-emerald-500 rounded-[40px] w-full max-w-3xl overflow-hidden shadow-[0_0_100px_rgba(16,185,129,0.2)]">
                  <div className="p-12 text-center border-b border-slate-800 bg-slate-800/50">
                    <h2 className="text-6xl font-black text-white mb-4 tracking-tight">{introTarget.name}</h2>
                    <p className="text-2xl text-emerald-400 font-bold uppercase tracking-widest">Hakkındaki Karar Nedir?</p>
                  </div>

                  <div className="p-12 space-y-12">
                    <div className="flex justify-center gap-16">
                      <div className="relative">
                        <button onClick={() => castLobbyVote('like')} className={`p-10 rounded-full border-4 transition-all ${lobbyVotes[sessionId] === 'like' ? 'bg-emerald-500 border-emerald-400 scale-110' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-white'}`}><ThumbsUp size={60}/></button>
                        <div className="absolute -top-4 -right-10 bg-slate-950 text-emerald-400 p-2 rounded-lg text-xs font-bold whitespace-nowrap border border-emerald-500/50">
                          {Object.entries(lobbyVotes).filter(([_, v]) => v === 'like').length} Oy
                        </div>
                      </div>
                      <div className="relative">
                        <button onClick={() => castLobbyVote('dislike')} className={`p-10 rounded-full border-4 transition-all ${lobbyVotes[sessionId] === 'dislike' ? 'bg-red-500 border-red-400 scale-110' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-white'}`}><ThumbsDown size={60}/></button>
                        <div className="absolute -top-4 -right-10 bg-slate-950 text-red-400 p-2 rounded-lg text-xs font-bold whitespace-nowrap border border-red-500/50">
                          {Object.entries(lobbyVotes).filter(([_, v]) => v === 'dislike').length} Oy
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-950 p-8 rounded-3xl border border-slate-800 relative">
                       <div className="flex justify-between mb-4 font-black">
                         <span className="text-emerald-400 text-xl">CHATE 1 (LIKE): {kickVotes.likes}</span>
                         <span className="text-red-400 text-xl">CHATE 0 (DISLIKE): {kickVotes.dislikes}</span>
                       </div>
                       <div className="h-10 bg-red-500/20 rounded-full overflow-hidden flex border-2 border-slate-800">
                         <motion.div animate={{ width: `${(kickVotes.likes + kickVotes.dislikes) === 0 ? 50 : (kickVotes.likes / (kickVotes.likes + kickVotes.dislikes)) * 100}%` }} className="h-full bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]"/>
                       </div>
                    </div>

                    {mePlayer?.isHost && (
                      <div className="flex flex-col items-center gap-4">
                         <div className="text-3xl font-black text-white bg-slate-800 px-6 py-2 rounded-xl border border-slate-700">00:{introTimer < 10 ? `0${introTimer}` : introTimer}</div>
                         <button onClick={endMeetingIntro} className="w-full bg-white hover:bg-slate-200 text-slate-950 font-black p-6 rounded-3xl text-2xl transition-all">TANIŞMAYI BİTİR VE KAYDET</button>
                      </div>
                    )}
                  </div>
               </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* LOBİ ANA ARAYÜZ */}
        <div className="max-w-7xl mx-auto flex gap-8">
           {/* SOL: AYARLAR VE KONTROLLER */}
           <div className="w-1/4 space-y-6">
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl">
                 <h2 className="text-white font-black mb-4 flex items-center gap-2"><Settings size={18}/> ODA YÖNETİMİ</h2>
                 {mePlayer?.isHost && (
                   <button onClick={() => setMeetingView(true)} className="w-full bg-blue-600 hover:bg-blue-500 p-4 rounded-xl font-bold text-white mb-4 flex justify-center items-center gap-2 tracking-tighter"><Users size={20}/> TANIŞMA MODU</button>
                 )}
                 <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${room.id}`)} className="w-full bg-slate-800 hover:bg-slate-700 p-4 rounded-xl font-bold text-white mb-4 flex justify-center items-center gap-2"><Copy size={18}/> DAVET LİNKİ</button>
                 
                 {/* KICK TOGGLE (Sadece Host İçin) */}
                 {mePlayer?.isHost && (
                   <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                      <div className="flex justify-between items-center mb-4">
                         <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Kick Entegrasyonu</span>
                         <button onClick={() => {
                            const newState = !kickEnabled;
                            setKickEnabled(newState);
                            if (!newState && room.settings.introMode) broadcastSync({...room, settings: {...room.settings, introMode: false}});
                         }} className={`w-12 h-6 rounded-full relative transition-colors ${kickEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${kickEnabled ? 'left-7' : 'left-1'}`}/>
                         </button>
                      </div>
                      {kickEnabled && (
                        <div className="flex gap-2 mb-4">
                          <input value={kickChannelName} onChange={(e) => setKickChannelName(e.target.value)} disabled={kickConfirmed} className="flex-1 bg-slate-900 border border-slate-800 p-2 rounded-lg text-sm text-white outline-none" placeholder="Kanal Adı..." />
                          {!kickConfirmed ? 
                            <button onClick={() => setKickConfirmed(true)} className="bg-emerald-600 p-2 rounded-lg text-white"><CheckCircle2 size={20}/></button> :
                            <button onClick={() => setKickConfirmed(false)} className="bg-red-600 p-2 rounded-lg text-white"><X size={20}/></button>
                          }
                        </div>
                      )}
                      
                      {/* TANIŞMA MODU KİLİDİ */}
                      <div className="flex justify-between items-center border-t border-slate-800 pt-4 mt-2">
                         <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Tanıtım Modu</span>
                         <button onClick={() => {
                            if (!room.settings.introMode && (!kickEnabled || !kickConfirmed || !kickChannelName.trim())) {
                               alert("Tanıtım modunu açmak için Kick entegrasyonu açık, kanal adı yazılı ve onaylanmış olmalıdır!");
                               return;
                            }
                            broadcastSync({...room, settings: {...room.settings, introMode: !room.settings.introMode}});
                         }} className={`w-12 h-6 rounded-full relative transition-colors ${room.settings.introMode ? 'bg-blue-500' : 'bg-slate-700'}`}>
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${room.settings.introMode ? 'left-7' : 'left-1'}`}/>
                         </button>
                      </div>
                   </div>
                 )}
              </div>

              {/* SÜRE AYARLARI */}
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
                 <h3 className="text-slate-500 text-xs font-black uppercase mb-6 tracking-widest">SÜRE AYARLARI</h3>
                 <div className="space-y-8">
                    <div>
                      <div className="flex justify-between text-white text-sm font-bold mb-2"><span>ŞEF SÜRESİ</span> <span>{room.settings?.spymasterTime || 60}s</span></div>
                      <input type="range" min="30" max="180" step="10" value={room.settings?.spymasterTime || 60} disabled={!mePlayer?.isHost} onChange={(e) => broadcastSync({...room, settings: {...room.settings, spymasterTime: parseInt(e.target.value)}})} className="w-full accent-emerald-500" />
                    </div>
                    <div>
                      <div className="flex justify-between text-white text-sm font-bold mb-2"><span>AJAN SÜRESİ</span> <span>{room.settings?.operativeTime || 60}s</span></div>
                      <input type="range" min="30" max="180" step="10" value={room.settings?.operativeTime || 60} disabled={!mePlayer?.isHost} onChange={(e) => broadcastSync({...room, settings: {...room.settings, operativeTime: parseInt(e.target.value)}})} className="w-full accent-blue-500" />
                    </div>
                 </div>
              </div>
              
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
                 <h3 className="text-slate-500 text-xs font-black uppercase mb-4 tracking-widest">TAKIM SEÇMEMİŞ OYUNCULAR</h3>
                 <div className="space-y-2">
                    {spectators.map((p: any) => (
                        <div key={p.sessionId} className="bg-slate-950 p-3 rounded-xl text-sm text-slate-300 border border-slate-800">{p.name} {p.isHost && <span className="text-amber-400 text-xs ml-1">[KURUCU]</span>}</div>
                    ))}
                    {spectators.length === 0 && <div className="text-slate-600 italic text-sm">Boşta oyuncu yok.</div>}
                 </div>
              </div>
           </div>

           {/* SAĞ: TAKIMLAR */}
           <div className="flex-1 grid grid-cols-2 gap-8">
              {/* KIRMIZI */}
              <div className="bg-red-950/20 border border-red-900/40 p-8 rounded-[40px] flex flex-col">
                 <input value={localRedName} disabled={!mePlayer?.isHost} onChange={(e) => setLocalRedName(e.target.value)} onBlur={() => broadcastSync({...room, settings: {...room.settings, redName: localRedName}})} className="bg-transparent text-3xl font-black text-red-500 mb-8 tracking-tighter italic border-b border-transparent focus:border-red-500 outline-none w-full"/>
                 <div className="flex-1 space-y-3">
                    {redTeam.map((p: any) => (
                      <div key={p.sessionId} className="bg-slate-900/50 p-4 rounded-2xl flex justify-between items-center border border-slate-800 group relative">
                         <span className="text-white font-bold">{p.name} {p.role === 'spymaster' && <span className="text-xs text-red-400 ml-2">[ŞEF]</span>} {p.isHost && <span className="text-amber-400 text-xs ml-1">[KURUCU]</span>}</span>
                         {meetingResults[p.sessionId] && <Info size={16} className="text-emerald-500 animate-pulse"/>}
                      </div>
                    ))}
                 </div>
                 <div className="grid grid-cols-2 gap-3 mt-8">
                    {!hasRedSpymaster && <button onClick={() => switchRole('red', 'spymaster')} className="bg-red-900 hover:bg-red-800 p-3 rounded-xl text-xs font-black text-white">ŞEF OL</button>}
                    <button onClick={() => switchRole('red', 'operative')} className={`bg-slate-800 hover:bg-slate-700 p-3 rounded-xl text-xs font-black text-white ${!hasRedSpymaster ? 'col-span-1' : 'col-span-2'}`}>AJAN OL</button>
                 </div>
              </div>
              {/* MAVİ */}
              <div className="bg-blue-950/20 border border-blue-900/40 p-8 rounded-[40px] flex flex-col">
                 <input value={localBlueName} disabled={!mePlayer?.isHost} onChange={(e) => setLocalBlueName(e.target.value)} onBlur={() => broadcastSync({...room, settings: {...room.settings, blueName: localBlueName}})} className="bg-transparent text-3xl font-black text-blue-500 mb-8 tracking-tighter italic border-b border-transparent focus:border-blue-500 outline-none w-full"/>
                 <div className="flex-1 space-y-3">
                    {blueTeam.map((p: any) => (
                      <div key={p.sessionId} className="bg-slate-900/50 p-4 rounded-2xl flex justify-between items-center border border-slate-800 group relative">
                         <span className="text-white font-bold">{p.name} {p.role === 'spymaster' && <span className="text-xs text-blue-400 ml-2">[ŞEF]</span>} {p.isHost && <span className="text-amber-400 text-xs ml-1">[KURUCU]</span>}</span>
                         {meetingResults[p.sessionId] && <Info size={16} className="text-emerald-500 animate-pulse"/>}
                      </div>
                    ))}
                 </div>
                 <div className="grid grid-cols-2 gap-3 mt-8">
                    {!hasBlueSpymaster && <button onClick={() => switchRole('blue', 'spymaster')} className="bg-blue-900 hover:bg-blue-800 p-3 rounded-xl text-xs font-black text-white">ŞEF OL</button>}
                    <button onClick={() => switchRole('blue', 'operative')} className={`bg-slate-800 hover:bg-slate-700 p-3 rounded-xl text-xs font-black text-white ${!hasBlueSpymaster ? 'col-span-1' : 'col-span-2'}`}>AJAN OL</button>
                 </div>
              </div>
           </div>
        </div>

        {/* BAŞLAT BUTONU (Sadece Kurucu İçin) */}
        {mePlayer?.isHost && (
          <div className="fixed bottom-10 right-10">
             <button 
                disabled={!canStartGame}
                onClick={handleStartOperation} 
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 p-8 px-16 rounded-[30px] text-3xl font-black text-white shadow-2xl flex items-center gap-4 transition-all active:scale-95"
             >
                {canStartGame ? 'OPERASYONU BAŞLAT' : 'ŞEFLER BEKLENİYOR'} <ArrowRight size={40}/>
             </button>
          </div>
        )}
      </div>
    );
  }

  // --- OYUN TAHTASI (BOARD) ---
  if (view === 'playing' && room) {
    const me = room.players.find((p: any) => p.sessionId === sessionId);
    const isMyTurn = room.currentTurn === me?.team;
    const isSpymasterTurn = room.turnPhase === 'spymaster';
    const isOperativeTurn = room.turnPhase === 'operative';
    
    const redLeft = room.cards.filter((c: any) => c.color === 'red' && !c.revealed).length;
    const blueLeft = room.cards.filter((c: any) => c.color === 'blue' && !c.revealed).length;

    return (
      <div className="min-h-screen bg-slate-900 flex flex-col text-slate-100">
        <header className="bg-slate-950 border-b border-slate-800 p-4 flex justify-between items-center shadow-md z-20">
          <div className="flex items-center gap-4">
            <div className="bg-red-950/50 border border-red-900 px-4 py-2 rounded-lg flex flex-col items-center min-w-[80px]">
               <span className="text-red-500 text-xs font-bold uppercase tracking-wider">Kırmızı</span>
               <span className="text-2xl font-black text-white">{redLeft}</span>
            </div>
            <div className="bg-blue-950/50 border border-blue-900 px-4 py-2 rounded-lg flex flex-col items-center min-w-[80px]">
               <span className="text-blue-500 text-xs font-bold uppercase tracking-wider">Mavi</span>
               <span className="text-2xl font-black text-white">{blueLeft}</span>
            </div>
          </div>

          <div className="flex flex-col items-center">
            {room.status.includes('_won') ? (
              <span className={`text-2xl font-black uppercase ${room.status === 'red_won' ? 'text-red-500' : 'text-blue-500'}`}>
                {room.status === 'red_won' ? 'Kırmızı Takım Kazandı!' : 'Mavi Takım Kazandı!'}
              </span>
            ) : (
              <>
                <span className="text-slate-400 text-xs font-semibold tracking-widest uppercase mb-1">Şu Anki Tur</span>
                <span className={`px-6 py-1 rounded-full text-sm font-bold border ${room.currentTurn === 'red' ? 'bg-red-950/50 text-red-400 border-red-900' : 'bg-blue-950/50 text-blue-400 border-blue-900'}`}>
                  {room.currentTurn === 'red' ? (room.settings?.redName || 'KIRMIZI TAKIM') : (room.settings?.blueName || 'MAVİ TAKIM')} 
                  {room.turnPhase === 'spymaster' ? ' (Şef Düşünüyor...)' : ' (Ajanlar Tahmin Ediyor)'}
                </span>
              </>
            )}
          </div>

          <div>
             <span className="bg-slate-800 px-3 py-1 rounded-md text-xs border border-slate-700 flex items-center gap-2">
               {me?.role === 'spymaster' ? <ShieldAlert size={14}/> : <Users size={14}/>} 
               {me?.name} ({me?.team === 'red' ? 'Kırmızı' : me?.team === 'blue' ? 'Mavi' : 'Seyirci'})
             </span>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 flex items-center justify-center overflow-hidden">
          <div className="grid grid-cols-5 gap-2 md:gap-4 w-full max-w-5xl aspect-[5/4]">
            {room.cards.map((card: any) => {
              const amISpymaster = me?.role === 'spymaster';
              const isRevealed = card.revealed || room.status.includes('_won');
              const showColor = isRevealed || amISpymaster;
              
              let bgColorClass = "bg-slate-800 border-slate-700 text-slate-200";
              if (showColor) {
                if (card.color === 'red') bgColorClass = "bg-red-600 border-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)]";
                if (card.color === 'blue') bgColorClass = "bg-blue-600 border-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]";
                if (card.color === 'neutral') bgColorClass = "bg-amber-100 border-amber-300 text-slate-800";
                if (card.color === 'assassin') bgColorClass = "bg-slate-950 border-slate-800 text-red-500 shadow-[0_0_20px_rgba(0,0,0,1)]";
              }

              const handleCardClick = () => {
                if (amISpymaster || isRevealed || !isMyTurn || !isOperativeTurn || room.status.includes('_won')) return;
                voteCard(card.id);
              };

              const handleReveal = (e: React.MouseEvent) => {
                e.stopPropagation();
                if (amISpymaster || isRevealed || !isMyTurn || !isOperativeTurn || room.status.includes('_won')) return;
                revealCard(card.id);
              };

              const myTeamVotes = card.votes.filter((vId: string) => room.players.find((p: any) => p.sessionId === vId)?.team === me?.team);
              const hasVotes = myTeamVotes.length > 0;

              return (
                <motion.div
                  key={card.id}
                  onClick={handleCardClick}
                  whileHover={(!isRevealed && !amISpymaster && isMyTurn && isOperativeTurn) ? { scale: 1.02 } : {}}
                  whileTap={(!isRevealed && !amISpymaster && isMyTurn && isOperativeTurn) ? { scale: 0.98 } : {}}
                  className={`relative rounded-xl border-2 flex items-center justify-center cursor-pointer select-none transition-colors duration-300 overflow-hidden group ${bgColorClass} ${isRevealed ? 'opacity-80' : ''}`}
                >
                  {isRevealed && (
                    <motion.div 
                      initial={{ y: 0 }}
                      whileHover={{ y: -30 }} 
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      className="absolute inset-0 bg-cover bg-center z-10"
                      style={{ backgroundImage: `url(/cards/${card.color}/${(card.id % 3) + 1}.jpg)` }}
                    />
                  )}

                  <span className={`font-black text-sm md:text-lg lg:text-xl uppercase tracking-widest text-center z-0 px-2 ${isRevealed ? 'opacity-50' : 'opacity-100'}`}>
                    {card.word}
                  </span>

                  {!isRevealed && hasVotes && (
                    <div className="absolute top-2 left-2 flex flex-wrap gap-1 z-20">
                      {myTeamVotes.map((_: any, i: number) => (
                        <div key={i} className={`w-3 h-3 rounded-full ${me?.team === 'red' ? 'bg-red-400' : 'bg-blue-400'} shadow-sm`}/>
                      ))}
                    </div>
                  )}

                  {!isRevealed && !amISpymaster && isMyTurn && isOperativeTurn && card.votes.includes(sessionId) && (
                    <button 
                      onClick={handleReveal}
                      className="absolute top-2 right-2 bg-emerald-500 hover:bg-emerald-400 text-white p-1.5 rounded-md shadow-lg z-30 transition-transform active:scale-90"
                    >
                      <Hand size={18} />
                    </button>
                  )}

                  {amISpymaster && !isRevealed && card.color === 'assassin' && (
                    <div className="absolute top-2 right-2 opacity-50"><Search size={16}/></div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </main>

        <footer className="bg-slate-950 border-t border-slate-800 p-4 md:p-6 z-20 min-h-[120px] flex items-center justify-center">
          {me?.role === 'spymaster' && isMyTurn && isSpymasterTurn && !room.status.includes('_won') && (
            <div className="flex gap-4 w-full max-w-2xl bg-slate-900 p-4 rounded-2xl border border-slate-700">
              <input 
                value={clueWord}
                onChange={e => setClueWord(e.target.value.replace(/\s/g, ''))}
                placeholder="Tek kelimelik ipucu..."
                className="flex-1 bg-slate-950 border border-slate-700 text-white p-3 rounded-xl focus:border-emerald-500 focus:outline-none uppercase font-bold tracking-wider"
              />
              <div className="flex items-center bg-slate-950 border border-slate-700 rounded-xl overflow-hidden">
                <button onClick={() => setClueCount(prev => typeof prev === 'number' ? Math.max(1, prev - 1) : 1)} className="px-4 py-3 hover:bg-slate-800 text-white font-bold">-</button>
                <input 
                  type="text" 
                  value={clueCount === 'unlimited' ? '∞' : clueCount}
                  onChange={e => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) setClueCount(Math.min(9, Math.max(1, val)));
                  }}
                  className="w-12 bg-transparent text-center text-white font-bold focus:outline-none"
                />
                <button onClick={() => setClueCount(prev => typeof prev === 'number' ? Math.min(9, prev + 1) : 1)} className="px-4 py-3 hover:bg-slate-800 text-white font-bold">+</button>
                <button onClick={() => setClueCount('unlimited')} className="px-3 py-3 text-xs font-bold text-slate-400 hover:text-white border-l border-slate-700">Sınırsız</button>
              </div>
              <button 
                onClick={submitClue}
                disabled={!clueWord}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-8 font-bold rounded-xl transition-colors flex items-center gap-2"
              >
                GÖNDER <CheckCircle2 size={18}/>
              </button>
            </div>
          )}

          {(isOperativeTurn || (me?.role === 'operative' && !isMyTurn) || (me?.role === 'spymaster' && !isMyTurn && !isSpymasterTurn)) && room.currentClue && (
             <div className="flex flex-col items-center bg-slate-900 px-12 py-4 rounded-2xl border border-slate-700 shadow-inner">
               <span className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">GELEN İSTİHBARAT</span>
               <div className="flex items-end gap-3">
                 <span className="text-3xl md:text-5xl font-black text-white tracking-widest uppercase">{room.currentClue.word}</span>
                 <span className="text-xl md:text-3xl font-black text-emerald-400 mb-1">{room.currentClue.count === 'unlimited' ? '∞' : room.currentClue.count}</span>
               </div>
               {isMyTurn && isOperativeTurn && (
                 <span className="text-sm text-slate-400 mt-2 font-medium">Kalan Tahmin Hakkı: <strong className="text-emerald-400">{room.guessesLeft}</strong></span>
               )}
             </div>
          )}

          {!room.status.includes('_won') && !isMyTurn && room.turnPhase === 'spymaster' && (
             <div className="text-slate-500 font-medium animate-pulse">Rakip Şef Düşünüyor...</div>
          )}
          {isMyTurn && room.turnPhase === 'spymaster' && me?.role === 'operative' && (
             <div className="text-emerald-500/70 font-medium animate-pulse">Şefinizden ipucu bekleniyor...</div>
          )}
        </footer>
      </div>
    );
  }

  return null;
}