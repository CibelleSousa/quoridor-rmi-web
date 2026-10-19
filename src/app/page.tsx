'use client';

import React, { useEffect, useState, useRef } from 'react';
import { RMIClientManager } from './rmi/ClientStub';
import {
  GameState,
  IGameRemote,
  Player,
  RMILogEntry,
  WallOrientation,
} from './rmi/IGameRemote';

const SERVER_URL = process.env.NEXT_PUBLIC_RMI_SERVER_URL || 'http://localhost:4000';

/**
 * Rótulos explicativos dos objetivos de cada ponto cardeal no Quoridor.
 */
const GOAL_LABELS: Record<string, string> = {
  N: 'Meta: Linha 9 (Base ↓)',
  S: 'Meta: Linha 1 (Topo ↑)',
  W: 'Meta: Coluna 9 (Dir →)',
  E: 'Meta: Coluna 1 (Esq ←)',
};

/**
 * Componente Principal do Cliente Distribuído de Quoridor (4 Jogadores).
 * Consome os métodos do servidor exclusivamente através do Apêndice do Cliente (`IGameRemote`).
 */
export default function QuoridorRMIPage() {
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myPlayer, setMyPlayer] = useState<Player | null>(null);
  const [playerNameInput, setPlayerNameInput] = useState('');
  const [actionMode, setActionMode] = useState<'MOVE' | 'WALL_H' | 'WALL_V'>('MOVE');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [logs, setLogs] = useState<RMILogEntry[]>([]);

  const gameStubRef = useRef<IGameRemote | null>(null);

  useEffect(() => {
    const manager = new RMIClientManager(
      SERVER_URL,
      (newLog) => setLogs((prev) => [newLog, ...prev.slice(0, 49)]),
      (isOnline) => setConnected(isOnline)
    );

    const stub = manager.getRemoteStub();
    gameStubRef.current = stub;

    // Sincronização periódica de estado via invocação remota de getGameState() (Sem uso de Sockets)
    const fetchState = async () => {
      try {
        const state = await stub.getGameState();
        setGameState(state);
      } catch {
        // Silencia falhas de rede temporárias durante o polling
      }
    };

    fetchState();
    const interval = setInterval(fetchState, 600);
    return () => clearInterval(interval);
  }, []);

  /**
   * Invoca o método remoto `joinGame(playerName)` através do Client Stub.
   */
  const handleJoinGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gameStubRef.current) return;
    setErrorMsg(null);
    try {
      const { player, state } = await gameStubRef.current.joinGame(playerNameInput);
      setMyPlayer(player);
      setGameState(state);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  /**
   * Invoca o método remoto `movePawn(playerId, row, col)` através do Client Stub.
   */
  const handleCellClick = async (row: number, col: number) => {
    if (!gameStubRef.current || !myPlayer) {
      setErrorMsg('Entre na partida primeiro para movimentar seu peão!');
      return;
    }
    setErrorMsg(null);
    try {
      const updatedState = await gameStubRef.current.movePawn(myPlayer.id, row, col);
      setGameState(updatedState);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  /**
   * Invoca o método remoto `placeWall(playerId, row, col, orientation)` através do Client Stub.
   */
  const handlePlaceWall = async (
    row: number,
    col: number,
    orientation: WallOrientation
  ) => {
    if (!gameStubRef.current || !myPlayer) {
      setErrorMsg('Entre na partida primeiro para posicionar barreiras!');
      return;
    }
    setErrorMsg(null);
    try {
      const updatedState = await gameStubRef.current.placeWall(
        myPlayer.id,
        row,
        col,
        orientation
      );
      setGameState(updatedState);
      setActionMode('MOVE'); // Volta automaticamente para o modo de mover após colocar parede
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  /**
   * Invoca o método remoto `resetGame()` através do Client Stub.
   */
  const handleResetGame = async () => {
    if (!gameStubRef.current) return;
    setErrorMsg(null);
    try {
      const resetState = await gameStubRef.current.resetGame();
      setGameState(resetState);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const currentTurnPlayer = gameState?.players[gameState.currentTurnIndex];
  const isMyTurn =
    gameState?.status === 'IN_PROGRESS' &&
    myPlayer &&
    currentTurnPlayer?.id === myPlayer.id;

  const syncedMyPlayer = gameState?.players.find((p) => p.id === myPlayer?.id);

  return (
    <main className="main-container">
      {/* COLUNA ESQUERDA: TABULEIRO 9x9 DO QUORIDOR */}
      <div className="left-column">
        <div className="card">
          <div className="header-top">
            <div>
              <h1 className="title-gradient">Quoridor 4 Jogadores Distribuído (RMI)</h1>
              <p className="subtitle">
                Tabuleiro 9x9 • Vence quem cruzar o tabuleiro até a borda oposta primeiro
              </p>
            </div>
            <div className="status-badge">
              <span className={`status-dot ${connected ? 'dot-online' : 'dot-offline'}`} />
              {connected ? 'RMI Server Online' : 'Desconectado'}
            </div>
          </div>

          {/* Cartões dos 4 Jogadores Remotos */}
          <div className="players-grid">
            {[0, 1, 2, 3].map((idx) => {
              const p = gameState?.players[idx];
              const isTurn =
                gameState?.status === 'IN_PROGRESS' && gameState.currentTurnIndex === idx;
              const isMe = myPlayer && p?.id === myPlayer.id;

              return (
                <div key={idx} className={`player-card ${isTurn ? 'active-turn' : ''}`}>
                  <div className="player-card-header">
                    <span>
                      P{idx + 1} {isMe && <strong className="you-tag">(Você)</strong>}
                    </span>
                    {p && <span className={`pawn-badge pawn-${p.color}`}>{p.color}</span>}
                  </div>
                  <p className="player-name">{p ? p.name : 'Aguardando...'}</p>
                  {p && (
                    <div className="player-meta">
                      <span>🧱 {p.wallsRemaining} paredes</span>
                      <span>{GOAL_LABELS[p.color]}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Formulário para invocar joinGame() */}
          {!myPlayer && gameState && gameState.players.length < 4 && (
            <form onSubmit={handleJoinGame} className="join-form">
              <input
                type="text"
                placeholder="Seu nome para invocar joinGame()..."
                value={playerNameInput}
                onChange={(e) => setPlayerNameInput(e.target.value)}
                className="join-input"
                required
              />
              <button type="submit" className="btn-primary">
                Entrar ({gameState.players.length}/4)
              </button>
            </form>
          )}
        </div>

        {/* Alerta de Exceções Remotas */}
        {errorMsg && (
          <div className="error-banner">
            <span>
              ⚠️ <strong>Exceção RMI:</strong> {errorMsg}
            </span>
            <button
              onClick={() => setErrorMsg(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#fecaca',
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
            >
              Fechar
            </button>
          </div>
        )}

        {/* Área do Tabuleiro 9x9 */}
        <div className="card board-card">
          <div className="board-status">
            {gameState?.status === 'WAITING_PLAYERS' && (
              <p style={{ color: 'var(--amber)', fontWeight: 600 }}>
                ⏳ Aguardando os 4 processos clientes entrarem ({gameState.players.length}/4)...
              </p>
            )}
            {gameState?.status === 'IN_PROGRESS' && (
              <p>
                {isMyTurn ? (
                  <span style={{ color: 'var(--emerald)', fontWeight: 700 }}>
                    🎯 É a sua vez! Escolha mover seu peão ou posicionar uma barreira:
                  </span>
                ) : (
                  <span>
                    Turno atual: <strong>{currentTurnPlayer?.name}</strong> (Peão{' '}
                    {currentTurnPlayer?.color})
                  </span>
                )}
              </p>
            )}
            {gameState?.status === 'FINISHED' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                <p style={{ color: 'var(--emerald)', fontWeight: 800, fontSize: '1.1rem' }}>
                  🏆 Vitória de {gameState.winner?.name} (Peão {gameState.winner?.color})!
                </p>
                <button onClick={handleResetGame} className="btn-secondary">
                  🔄 Invocar resetGame()
                </button>
              </div>
            )}
            <p className="last-action-text">{gameState?.lastActionDescription}</p>
          </div>

          {/* Seletor de Modo de Ação (Exibido no turno do jogador) */}
          {isMyTurn && (
            <div className="action-toolbar">
              <button
                onClick={() => setActionMode('MOVE')}
                className={`btn-secondary ${actionMode === 'MOVE' ? 'active-mode' : ''}`}
              >
                🏃 Mover Peão (movePawn)
              </button>
              <button
                onClick={() => setActionMode('WALL_H')}
                disabled={(syncedMyPlayer?.wallsRemaining ?? 0) <= 0}
                className={`btn-secondary ${actionMode === 'WALL_H' ? 'active-mode' : ''}`}
              >
                ➖ Parede Horizontal ({syncedMyPlayer?.wallsRemaining})
              </button>
              <button
                onClick={() => setActionMode('WALL_V')}
                disabled={(syncedMyPlayer?.wallsRemaining ?? 0) <= 0}
                className={`btn-secondary ${actionMode === 'WALL_V' ? 'active-mode' : ''}`}
              >
                ➕ Parede Vertical ({syncedMyPlayer?.wallsRemaining})
              </button>
            </div>
          )}

          {/* Grid 9x9 do Quoridor com frestas para Paredes */}
          <div className="quoridor-board-wrapper">
            <div className="quoridor-grid">
              {Array.from({ length: 9 }).map((_, rIdx) =>
                Array.from({ length: 9 }).map((__, cIdx) => {
                  const occupant = gameState?.players.find(
                    (p) => p.row === rIdx && p.col === cIdx
                  );
                  const hasHWall = gameState?.walls.some(
                    (w) => w.orientation === 'H' && w.row === rIdx && w.col === cIdx
                  );
                  const hasVWall = gameState?.walls.some(
                    (w) => w.orientation === 'V' && w.row === rIdx && w.col === cIdx
                  );

                  return (
                    <div key={`${rIdx}-${cIdx}`} className="q-cell-wrapper">
                      <button
                        className="q-cell"
                        disabled={!isMyTurn || actionMode !== 'MOVE'}
                        onClick={() => handleCellClick(rIdx, cIdx)}
                        title={`Casa (${rIdx + 1}, ${cIdx + 1})`}
                      >
                        {occupant && (
                          <div className={`pawn-piece pawn-${occupant.color}`}>
                            {occupant.color}
                          </div>
                        )}
                      </button>

                      {/* Paredes já posicionadas no tabuleiro */}
                      {hasHWall && <div className="wall-placed-h" />}
                      {hasVWall && <div className="wall-placed-v" />}

                      {/* Slots interativos para posicionar novas paredes (0 <= r, c <= 7) */}
                      {isMyTurn && actionMode === 'WALL_H' && rIdx < 8 && cIdx < 8 && !hasHWall && (
                        <div
                          className="wall-slot-h"
                          onClick={() => handlePlaceWall(rIdx, cIdx, 'H')}
                          title={`Posicionar parede Horizontal em (${rIdx + 1}, ${cIdx + 1})`}
                        />
                      )}
                      {isMyTurn && actionMode === 'WALL_V' && rIdx < 8 && cIdx < 8 && !hasVWall && (
                        <div
                          className="wall-slot-v"
                          onClick={() => handlePlaceWall(rIdx, cIdx, 'V')}
                          title={`Posicionar parede Vertical em (${rIdx + 1}, ${cIdx + 1})`}
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* COLUNA DIREITA: INSPETOR DE PROTOCOLO RMI */}
      <div className="card inspector-card">
        <div className="inspector-header">
          <div>
            <h2 className="inspector-title">
              <span>📡</span> Inspetor de Invocação Remota (RMI)
            </h2>
            <p className="inspector-subtitle">
              Transporte HTTP Request/Reply • Client Stub (Proxy) ↔ Server Stub
            </p>
          </div>
          <button onClick={() => setLogs([])} className="btn-secondary">
            Limpar
          </button>
        </div>

        <div className="logs-list">
          {logs.length === 0 ? (
            <p className="empty-logs">
              Nenhuma invocação remota registrada ainda. Entre na partida para observar o tráfego RMI!
            </p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className={`log-item log-${log.direction}`}>
                <div className="log-meta">
                  <span>
                    {log.direction === 'OUT' && '📤 [CLIENT STUB - REQUEST]'}
                    {log.direction === 'IN' && '📥 [SERVER STUB - RETURN]'}
                    {log.direction === 'ERROR' && '❌ [REMOTE EXCEPTION]'}
                  </span>
                  <span>{log.timestamp}</span>
                </div>
                <div className="log-title">{log.title}</div>
                <div className="log-payload">{log.payload}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}