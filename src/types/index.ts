export type Team = 'red' | 'blue' | 'spectator';
export type Role = 'operative' | 'spymaster'; // operative: Ajan, spymaster: İstihbarat Şefi
export type CardColor = 'red' | 'blue' | 'neutral' | 'assassin' | 'hidden';

export interface Player {
  id: string;
  sessionId: string;
  name: string;
  team: Team;
  role: Role;
  isHost: boolean;
  connected: boolean;
}

export interface Card {
  id: number;
  word: string;
  color: CardColor;
  revealed: boolean;
  votes: string[]; // Oy Verenlerin socket ID'leri
}

export interface RoomSettings {
  spymasterTimeLimit: number;
  operativeTimeLimit: number;
}

export interface Clue {
  word: string;
  count: number | 'unlimited';
}

export interface Room {
  id: string;
  name: string;
  hasPassword: boolean;
  status: 'waiting' | 'playing' | 'red_won' | 'blue_won';
  players: Player[];
  settings: RoomSettings;
  
  cards: Card[];
  currentTurn: 'red' | 'blue';
  turnPhase: 'spymaster' | 'operative';
  currentClue: Clue | null;
  guessesLeft: number;
  
  timeRemaining: number;
}