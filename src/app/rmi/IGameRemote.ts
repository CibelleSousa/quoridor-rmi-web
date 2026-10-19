/**
 * Direções cardeais que identificam cada um dos 4 jogadores no tabuleiro 9x9 do Quoridor.
 * - N (Norte): Inicia na linha 0 e vence ao chegar na linha 8.
 * - S (Sul): Inicia na linha 8 e vence ao chegar na linha 0.
 * - W (Oeste): Inicia na coluna 0 e vence ao chegar na coluna 8.
 * - E (Leste): Inicia na coluna 8 e vence ao chegar na coluna 0.
 */
export type PlayerColor = 'N' | 'S' | 'W' | 'E';

/**
 * Orientação das barreiras (paredes) posicionadas no tabuleiro.
 * - H: Horizontal (bloqueia passagem vertical entre duas linhas em 2 colunas adjacentes).
 * - V: Vertical (bloqueia passagem horizontal entre duas colunas em 2 linhas adjacentes).
 */
export type WallOrientation = 'H' | 'V';

/**
 * Representa uma parede posicionada no tabuleiro 9x9.
 */
export interface Wall {
  row: number;
  col: number;
  orientation: WallOrientation;
  ownerId: string;
}

/**
 * Representa um dos 4 jogadores remotos na partida de Quoridor.
 */
export interface Player {
  id: string;
  name: string;
  color: PlayerColor;
  row: number;
  col: number;
  targetRow?: number;
  targetCol?: number;
  wallsRemaining: number;
}

/**
 * Estado global sincronizado da partida distribuída de Quoridor.
 */
export interface GameState {
  boardSize: number;
  players: Player[];
  walls: Wall[];
  currentTurnIndex: number;
  status: 'WAITING_PLAYERS' | 'IN_PROGRESS' | 'FINISHED';
  winner: Player | null;
  lastActionDescription: string;
}

/**
 * INTERFACE REMOTA (Equivalente a `java.rmi.Remote` nos slides da disciplina).
 * Define os métodos remotos que o Apêndice do Cliente (Client Stub) pode invocar no servidor.
 */
export interface IGameRemote {
  joinGame(playerName: string): Promise<{ player: Player; state: GameState }>;
  movePawn(playerId: string, targetRow: number, targetCol: number): Promise<GameState>;
  placeWall(
    playerId: string,
    row: number,
    col: number,
    orientation: WallOrientation
  ): Promise<GameState>;
  getGameState(): Promise<GameState>;
  resetGame(): Promise<GameState>;
}

/**
 * Estrutura do pacote de requisição montado pelo Apêndice do Cliente (Marshalling).
 */
export interface RMIRPCRequest {
  requestId: string;
  method: keyof IGameRemote;
  args: any[];
}

/**
 * Estrutura do pacote de resposta retornado pelo Apêndice do Servidor (Unmarshalling).
 */
export interface RMIRPCResponse {
  requestId: string;
  result?: any;
  error?: string;
}

/**
 * Estrutura de registro visual para o Inspetor de Invocação Remota na interface React.
 */
export interface RMILogEntry {
  id: string;
  timestamp: string;
  direction: 'OUT' | 'IN' | 'ERROR';
  title: string;
  payload: string;
}