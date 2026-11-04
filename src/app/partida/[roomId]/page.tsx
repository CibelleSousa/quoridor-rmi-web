'use client';

import React, { useEffect, useState, useRef, use, type FormEvent } from 'react';
import Link from 'next/link';
import { RMIClientManager } from '../../rmi/ClientStub';
import type {
    GameState,
    IGameRemote,
    Player,
    RMILogEntry,
    WallOrientation,
} from '../../rmi/IGameRemote';

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

export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
    const resolvedParams = use(params);
    const roomId = resolvedParams.roomId;

    return <QuoridorRoom key={roomId} roomId={roomId} />;
}

function QuoridorRoom({ roomId }: { roomId: string }) {
    const [connected, setConnected] = useState(false);
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [myPlayer, setMyPlayer] = useState<Player | null>(null);
    const [playerNameInput, setPlayerNameInput] = useState('');
    const [actionMode, setActionMode] = useState<'MOVE' | 'WALL_H' | 'WALL_V'>('MOVE');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [logs, setLogs] = useState<RMILogEntry[]>([]);
    const [pending, setPending] = useState(false);
    const [copied, setCopied] = useState(false);

    const gameStubRef = useRef<IGameRemote | null>(null);
    const mountedRef = useRef(false);
    const actionPendingRef = useRef(false);
    const revisionRef = useRef(0);

    // Restaura o jogador da aba atual (caso dê F5) para permitir reconexão automática
    useEffect(() => {
        try {
            const saved = sessionStorage.getItem(`quoridor_player_${roomId}`);
            if (saved) {
                setMyPlayer(JSON.parse(saved) as Player);
            }
        } catch {
            // Ignora erros de leitura do sessionStorage
        }
    }, [roomId]);

    useEffect(() => {
        mountedRef.current = true;
        let active = true;
        let timer: NodeJS.Timeout | undefined;

        const manager = new RMIClientManager(
            SERVER_URL,
            (newLog) => {
                if (active) setLogs((prev) => [newLog, ...prev.slice(0, 49)]);
            },
            (isOnline) => {
                if (active) setConnected(isOnline);
            }
        );

        const stub = manager.getRemoteStub();
        gameStubRef.current = stub;

        // Se o jogador recarregou a página e estava OFFLINE, invoca rejoinGame explicitamente
        if (myPlayer?.id) {
            void stub.rejoinGame(roomId, myPlayer.id).catch(() => {});
        }

        async function pollState() {
            const revision = revisionRef.current;

            try {
                if (!actionPendingRef.current) {
                    // O envio de myPlayer?.id atua como Heartbeat para o Servidor RMI
                    const state = await stub.getGameState(roomId, myPlayer?.id);

                    if (active && !actionPendingRef.current && revision === revisionRef.current) {
                        setGameState(state);

                        // Sincroniza ou limpa a sessão caso a sala tenha sido recriada
                        if (myPlayer) {
                            const stillInRoom = state.players.find((p) => p.id === myPlayer.id);
                            if (!stillInRoom) {
                                setMyPlayer(null);
                                sessionStorage.removeItem(`quoridor_player_${roomId}`);
                            }
                        }
                    }
                }
            } catch {
                // Silencia falhas de rede temporárias durante o polling
            } finally {
                if (active) timer = setTimeout(pollState, 600);
            }
        }

        void pollState();

        return () => {
            active = false;
            mountedRef.current = false;
            if (timer !== undefined) clearTimeout(timer);
            if (gameStubRef.current === stub) gameStubRef.current = null;
        };
    }, [roomId, myPlayer?.id]);

    async function runAction(operation: (stub: IGameRemote) => Promise<void>) {
        const stub = gameStubRef.current;
        if (!stub || actionPendingRef.current) return;

        actionPendingRef.current = true;
        revisionRef.current += 1;
        setPending(true);
        setErrorMsg(null);

        try {
            await operation(stub);
        } catch (cause: unknown) {
            if (mountedRef.current) {
                setErrorMsg(cause instanceof Error ? cause.message : 'Falha na invocação remota.');
            }
        } finally {
            revisionRef.current += 1;
            actionPendingRef.current = false;
            if (mountedRef.current) setPending(false);
        }
    }

    /**
     * Invoca o método remoto `joinGame(roomId, playerName)` através do Client Stub.
     */
    function handleJoinGame(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const name = playerNameInput.trim();
        if (!name) return;

        void runAction(async (stub) => {
            const { player, state } = await stub.joinGame(roomId, name);
            if (!mountedRef.current) return;
            setMyPlayer(player);
            setGameState(state);
            try {
                sessionStorage.setItem(`quoridor_player_${roomId}`, JSON.stringify(player));
            } catch {
                // Ignora caso sessionStorage esteja indisponível
            }
        });
    }

    /**
     * Invoca o método remoto `rejoinGame(roomId, playerId)` para retomar o controle de um
     * jogador que caiu.
     *
     * A identidade do jogador vive no `sessionStorage`, que é isolado por aba: fechar a aba
     * (ou trocar de navegador/máquina) apaga o `playerId` e tornaria a reconexão impossível.
     * Como o servidor já publica quem está OFFLINE no estado da partida, o cliente oferece
     * esses assentos de volta — permitindo que o jogador retome a sessão de qualquer lugar,
     * que é o comportamento esperado em um sistema distribuído.
     */
    function handleReconnect(playerId: string) {
        void runAction(async (stub) => {
            const state = await stub.rejoinGame(roomId, playerId);
            if (!mountedRef.current) return;

            const restored = state.players.find((p) => p.id === playerId);
            if (!restored) {
                throw new Error('Este jogador não pertence mais a esta sala.');
            }

            setMyPlayer(restored);
            setGameState(state);
            try {
                sessionStorage.setItem(`quoridor_player_${roomId}`, JSON.stringify(restored));
            } catch {
                // Ignora caso sessionStorage esteja indisponível
            }
        });
    }

    /**
     * Invoca o método remoto `movePawn(roomId, playerId, row, col)` através do Client Stub.
     */
    function handleCellClick(row: number, col: number) {
        if (!myPlayer) {
            setErrorMsg('Entre na partida primeiro para movimentar seu peão!');
            return;
        }

        void runAction(async (stub) => {
            const updatedState = await stub.movePawn(roomId, myPlayer.id, row, col);
            if (mountedRef.current) setGameState(updatedState);
        });
    }

    /**
     * Invoca o método remoto `placeWall(roomId, playerId, row, col, orientation)` através do Client Stub.
     */
    function handlePlaceWall(row: number, col: number, orientation: WallOrientation) {
        if (!myPlayer) {
            setErrorMsg('Entre na partida primeiro para posicionar barreiras!');
            return;
        }

        void runAction(async (stub) => {
            const updatedState = await stub.placeWall(roomId, myPlayer.id, row, col, orientation);
            if (mountedRef.current) {
                setGameState(updatedState);
                setActionMode('MOVE');
            }
        });
    }

    /**
     * Invoca o método remoto `resetGame(roomId)` através do Client Stub.
     */
    function handleResetGame() {
        void runAction(async (stub) => {
            const resetState = await stub.resetGame(roomId);
            if (!mountedRef.current) return;

            setGameState(resetState);
            setMyPlayer((prev) => resetState.players.find((p) => p.id === prev?.id) ?? null);
            setActionMode('MOVE');
        });
    }

    function handleCopyInviteLink() {
        if (typeof window === 'undefined') return;
        void navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    const currentTurnPlayer = gameState?.players[gameState.currentTurnIndex];
    const isMyTurn =
        gameState?.status === 'IN_PROGRESS' &&
        myPlayer !== null &&
        currentTurnPlayer?.id === myPlayer.id;

    const syncedMyPlayer = gameState?.players.find((p) => p.id === myPlayer?.id);

    // Assentos que perderam conexão e ainda estão dentro da janela de reconexão.
    // Jogadores já declarados ABANDONED viraram peões fantasmas e não retornam.
    const disconnectedSeats =
        gameState?.players.filter((p) => p.connectionStatus === 'OFFLINE') ?? [];

    return (
        <main className="main-container">
            {/* COLUNA ESQUERDA: TABULEIRO 9x9 DO QUORIDOR */}
            <div className="left-column">
                <div className="room-nav-bar">
                    <Link href="/" className="lobby-back">
                        ← VOLTAR AO LOBBY
                    </Link>
                    <button
                        type="button"
                        onClick={handleCopyInviteLink}
                        className="btn-secondary btn-copy-link"
                    >
                        {copied ? '✅ Link Copiado!' : '🔗 Copiar Link da Sala'}
                    </button>
                </div>

                <div className="card">
                    <div className="header-top">
                        <div>
                            <h1 className="title-gradient">
                                {gameState?.roomName
                                    ? `Quoridor • ${gameState.roomName}`
                                    : 'Quoridor 4 Jogadores Distribuído (RMI)'}
                            </h1>
                            <p className="subtitle">
                                Sala #{roomId.substring(0, 8)} • Tabuleiro 9x9 • Vence quem cruzar o tabuleiro até a borda oposta primeiro
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
                                gameState?.status === 'IN_PROGRESS' &&
                                gameState.currentTurnIndex === idx;
                            const isMe = myPlayer && p?.id === myPlayer.id;
                            const isDisconnected = p && p.connectionStatus !== 'ONLINE';

                            return (
                                <div
                                    key={idx}
                                    className={`player-card ${isTurn ? 'active-turn' : ''} ${
                                        isDisconnected ? 'player-disconnected' : ''
                                    }`}
                                >
                                    <div className="player-card-header">
                                        <span>
                                            P{idx + 1} {isMe && <strong className="you-tag">(Você)</strong>}
                                        </span>
                                        {p && (
                                            <span
                                                className={`pawn-badge pawn-${p.color}`}
                                                title={`Peão ${p.color}`}
                                            />
                                        )}
                                    </div>
                                    <p className="player-name">{p ? p.name : 'Aguardando...'}</p>
                                    {p && (
                                        <div className="player-meta">
                                            <span>🧱 {p.wallsRemaining} paredes</span>
                                            <span>
                                                {p.connectionStatus === 'OFFLINE'
                                                    ? '⚠️ OFFLINE (Reconectando...)'
                                                    : p.connectionStatus === 'ABANDONED'
                                                    ? '👻 ABANDONOU (Fantasma)'
                                                    : GOAL_LABELS[p.color]}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Formulário para invocar joinGame() */}
                    {!myPlayer &&
                        gameState?.status === 'WAITING_PLAYERS' &&
                        gameState.players.length < 4 && (
                            <form onSubmit={handleJoinGame} className="join-form">
                                <input
                                    type="text"
                                    placeholder="Seu nome para invocar joinGame()..."
                                    value={playerNameInput}
                                    onChange={(e) => setPlayerNameInput(e.target.value)}
                                    className="join-input"
                                    disabled={pending}
                                    required
                                />
                                <button
                                    type="submit"
                                    className="btn-primary"
                                    disabled={pending || !playerNameInput.trim()}
                                >
                                    {pending ? 'Entrando...' : `Entrar (${gameState.players.length}/4)`}
                                </button>
                            </form>
                        )}

                    {/* Retomada de sessão: invoca rejoinGame() para um assento caído */}
                    {!myPlayer && disconnectedSeats.length > 0 && (
                        <div className="rejoin-panel">
                            <p className="rejoin-title">
                                🔌 Retomar sessão
                            </p>
                            <p className="rejoin-hint">
                                Estes jogadores perderam a conexão. Se um deles é você,
                                retome sua partida de onde parou:
                            </p>
                            <div className="rejoin-list">
                                {disconnectedSeats.map((p) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        className="btn-secondary rejoin-btn"
                                        disabled={pending}
                                        onClick={() => handleReconnect(p.id)}
                                    >
                                        Reconectar como <strong>{p.name}</strong> (Peão {p.color})
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Alerta de Exceções Remotas */}
                {errorMsg && (
                    <div className="error-banner">
                        <span>
                            ⚠️ <strong>Exceção RMI:</strong> {errorMsg}
                        </span>
                        <button onClick={() => setErrorMsg(null)} className="error-close">
                            Fechar
                        </button>
                    </div>
                )}

                {/* Área do Tabuleiro 9x9 */}
                <div className="card board-card">
                    <div className="board-status">
                        {!gameState && <p className="status-waiting">⏳ Carregando estado da sala...</p>}

                        {gameState?.status === 'WAITING_PLAYERS' && (
                            <p className="status-waiting">
                                ⏳ Aguardando os 4 processos clientes entrarem ({gameState.players.length}/4)...
                            </p>
                        )}

                        {gameState?.status === 'PAUSED_DISCONNECT' && (
                            <p className="status-paused">
                                ⚠️ Jogo pausado: aguardando reconexão de jogador desconectado...
                            </p>
                        )}

                        {gameState?.status === 'IN_PROGRESS' && (
                            <p>
                                {isMyTurn ? (
                                    <span className="status-myturn">
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
                            <div className="status-finished">
                                <p className="status-winner">
                                    🏆 Vitória de {gameState.winner?.name ?? 'W.O.'}{' '}
                                    {gameState.winner?.color ? `(Peão ${gameState.winner.color})` : ''}!
                                </p>
                                <button
                                    onClick={handleResetGame}
                                    className="btn-secondary"
                                    disabled={pending}
                                >
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
                                disabled={pending}
                                className={`btn-secondary ${actionMode === 'MOVE' ? 'active-mode' : ''}`}
                            >
                                🏃 Mover Peão (movePawn)
                            </button>
                            <button
                                onClick={() => setActionMode('WALL_H')}
                                disabled={pending || (syncedMyPlayer?.wallsRemaining ?? 0) <= 0}
                                className={`btn-secondary ${actionMode === 'WALL_H' ? 'active-mode' : ''}`}
                            >
                                ➖ Parede Horizontal ({syncedMyPlayer?.wallsRemaining})
                            </button>
                            <button
                                onClick={() => setActionMode('WALL_V')}
                                disabled={pending || (syncedMyPlayer?.wallsRemaining ?? 0) <= 0}
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
                                                disabled={!isMyTurn || pending || actionMode !== 'MOVE'}
                                                onClick={() => handleCellClick(rIdx, cIdx)}
                                                title={`Casa (${rIdx + 1}, ${cIdx + 1})`}
                                            >
                                                {occupant && (
                                                    <div
                                                        className={`pawn-piece pawn-${occupant.color}`}
                                                        aria-label={`Peão ${occupant.color} de ${occupant.name}`}
                                                    >
                                                        {occupant.color !== 'N' && (
                                                            <>
                                                                <span className="ghost-eye left" />
                                                                <span className="ghost-eye right" />
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </button>

                                            {/* Paredes já posicionadas no tabuleiro */}
                                            {hasHWall && <div className="wall-placed-h" />}
                                            {hasVWall && <div className="wall-placed-v" />}

                                            {/* Slots interativos para posicionar novas paredes (0 <= r, c <= 7) */}
                                            {isMyTurn &&
                                                actionMode === 'WALL_H' &&
                                                rIdx < 8 &&
                                                cIdx < 8 &&
                                                !hasHWall && (
                                                    <button
                                                        type="button"
                                                        className="wall-slot-h"
                                                        disabled={pending}
                                                        onClick={() => handlePlaceWall(rIdx, cIdx, 'H')}
                                                        title={`Posicionar parede Horizontal em (${rIdx + 1}, ${cIdx + 1})`}
                                                    />
                                                )}
                                            {isMyTurn &&
                                                actionMode === 'WALL_V' &&
                                                rIdx < 8 &&
                                                cIdx < 8 &&
                                                !hasVWall && (
                                                    <button
                                                        type="button"
                                                        className="wall-slot-v"
                                                        disabled={pending}
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