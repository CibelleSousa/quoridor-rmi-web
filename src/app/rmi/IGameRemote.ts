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
 * - H: Horizontal (bloqueia passagem vertical entre duas linhas).
 * - V: Vertical (bloqueia passagem horizontal entre duas colunas).
 */
export type WallOrientation = 'H' | 'V';

/**
 * Representa uma parede posicionada no tabuleiro 9x9.
 * A coordenada (row, col) indica a âncora superior-esquerda da parede de tamanho 2.
 */
export interface Wall {
  row: number;
  col: number;
  orientation: WallOrientation;
  ownerId: string;
}

/**
 * Representa o estado de um nó cliente (jogador) na partida de Quoridor.
 * Inclui metadados de tolerância a falhas (Heartbeat/Liveness).
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
  connectionStatus: 'ONLINE' | 'OFFLINE' | 'ABANDONED';
  lastSeen: number;
  offlineSince?: number;
}

/**
 * DTO (Data Transfer Object) para listagem pública de salas no Lobby (RMI Registry).
 */
export interface RoomInfo {
  roomId: string;
  name: string;
  playersCount: number;
  status: 'WAITING_PLAYERS' | 'IN_PROGRESS' | 'PAUSED_DISCONNECT' | 'FINISHED';
}

/**
 * Representa o estado global e sincronizado de uma instância específica de partida distribuída.
 */
export interface GameState {
  roomId: string;
  roomName: string;
  boardSize: number;
  players: Player[];
  walls: Wall[];
  currentTurnIndex: number;
  status: 'WAITING_PLAYERS' | 'IN_PROGRESS' | 'PAUSED_DISCONNECT' | 'FINISHED';
  winner: Player | null;
  lastActionDescription: string;
}

/**
 * INTERFACE REMOTA (IDL - Interface Definition Language).
 * Define o contrato estrito de métodos remotos expostos pelo servidor.
 * Atua duplamente como um serviço de Diretório (Lobby) e Despachante de Ações (Game).
 */
export interface IGameRemote {
  /**
   * Instancia dinamicamente um novo objeto remoto de partida no servidor.
   * @param roomName Nome de exibição da sala.
   * @returns O identificador único (UUID) da sala recém-criada, usado para roteamento.
   */
  createRoom(roomName: string): Promise<string>;

  /**
   * Consulta o serviço de diretório para obter as salas disponíveis.
   * @returns Lista contendo metadados das partidas instanciadas.
   */
  listRooms(): Promise<RoomInfo[]>;

  /**
   * Registra um processo cliente em uma instância de partida isolada.
   * @param roomId Chave de roteamento da sala.
   * @param playerName Nome de exibição do jogador.
   * @returns Os dados do jogador instanciado e o estado atualizado da sala.
   */
  joinGame(roomId: string, playerName: string): Promise<{ player: Player; state: GameState }>;

  /**
   * Reassocia um processo cliente já registrado à sua sessão após recarga de página
   * ou restabelecimento da conexão, restaurando o status para ONLINE.
   * @param roomId Chave de roteamento da sala.
   * @param playerId Identificador único do cliente previamente registrado.
   * @returns O estado sincronizado da partida.
   */
  rejoinGame(roomId: string, playerId: string): Promise<GameState>;

  /**
   * Injeta um evento de movimentação no estado da instância isolada.
   * @param roomId Chave de roteamento da sala.
   * @param playerId Identificador único do cliente que detém o turno.
   * @param targetRow Linha de destino no tabuleiro 9x9.
   * @param targetCol Coluna de destino no tabuleiro 9x9.
   * @returns O estado sincronizado após validação das regras de negócio.
   */
  movePawn(roomId: string, playerId: string, targetRow: number, targetCol: number): Promise<GameState>;

  /**
   * Solicita o posicionamento de uma barreira na instância isolada (sujeito à validação BFS).
   * @param roomId Chave de roteamento da sala.
   * @param playerId Identificador único do cliente que detém o turno.
   * @param row Coordenada de linha da âncora da parede.
   * @param col Coordenada de coluna da âncora da parede.
   * @param orientation Orientação geométrica da parede ('H' ou 'V').
   * @returns O estado sincronizado após validação de rotas residuais.
   */
  placeWall(
    roomId: string,
    playerId: string,
    row: number,
    col: number,
    orientation: WallOrientation
  ): Promise<GameState>;

  /**
   * Realiza polling do estado da instância isolada para sincronização de views do cliente.
   * @param roomId Chave de roteamento da sala.
   * @returns A fotografia atual (snapshot) do estado da partida.
   */
  getGameState(roomId: string, playerId?: string): Promise<GameState>;

  /**
   * Emite comando para reinicializar a máquina de estados da partida correspondente.
   * @param roomId Chave de roteamento da sala.
   * @returns O novo estado inicializado.
   */
  resetGame(roomId: string): Promise<GameState>;
}

/**
 * Estrutura serializável da mensagem de requisição de invocação (Marshalling).
 */
export interface RMIRPCRequest {
  requestId: string;
  method: keyof IGameRemote;
  args: any[];
}

/**
 * Estrutura serializável da mensagem de resposta da invocação remota.
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