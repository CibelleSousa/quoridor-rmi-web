'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RMIClientManager } from './rmi/ClientStub';
import type { IGameRemote, RoomInfo } from './rmi/IGameRemote';

const SERVER_URL = process.env.NEXT_PUBLIC_RMI_SERVER_URL || 'http://localhost:4000';

const STATUS_LABELS: Record<string, string> = {
    WAITING_PLAYERS: 'AGUARDANDO',
    IN_PROGRESS: 'EM JOGO',
    FINISHED: 'FINALIZADA',
    PAUSED_DISCONNECT: 'PAUSADA',
};

export default function Lobby() {
    const router = useRouter();
    const stubRef = useRef<IGameRemote | null>(null);
    const creatingRef = useRef(false);

    const [rooms, setRooms] = useState<RoomInfo[]>([]);
    const [roomName, setRoomName] = useState('');
    const [connected, setConnected] = useState(false);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        let timer: NodeJS.Timeout | undefined;

        const manager = new RMIClientManager(
            SERVER_URL,
            () => {},
            (online) => {
                if (active) setConnected(online);
            }
        );

        const stub = manager.getRemoteStub();
        stubRef.current = stub;

        async function pollRooms() {
            try {
                const result = await stub.listRooms();
                if (active) {
                    setRooms(result);
                    setError(null);
                }
            } catch (cause: unknown) {
                if (active) {
                    setError(cause instanceof Error ? cause.message : 'Não foi possível consultar as salas.');
                }
            } finally {
                if (active) {
                    setLoading(false);
                    timer = setTimeout(pollRooms, 1500);
                }
            }
        }

        void pollRooms();

        return () => {
            active = false;
            if (timer !== undefined) clearTimeout(timer);
            if (stubRef.current === stub) stubRef.current = null;
        };
    }, []);

    async function handleCreateRoom(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const stub = stubRef.current;
        const name = roomName.trim();

        if (!stub || !name || creatingRef.current) return;

        creatingRef.current = true;
        setCreating(true);
        setError(null);

        try {
            // Invoca createRoom no servidor RMI
            const newRoomId = await stub.createRoom(name);
            // Redireciona para a página da sala usando o Next.js Router
            router.push(`/partida/${newRoomId}`);
        } catch (cause: unknown) {
            setError(cause instanceof Error ? cause.message : 'Não foi possível criar a sala.');
        } finally {
            creatingRef.current = false;
            setCreating(false);
        }
    }

    return (
        <main className="arcade-lobby">
            <header className="lobby-header">
                <p className="lobby-eyebrow">1UP · MULTIPLAYER</p>
                <h1 className="lobby-title">QUORIDOR</h1>
                <p className="lobby-caption">SISTEMAS DISTRIBUÍDOS · RMI</p>

                <div className="status-badge">
                    <span className={`status-dot ${connected ? 'dot-online' : 'dot-offline'}`} />
                    {connected ? 'RMI REGISTRY ONLINE' : 'DESCONECTADO'}
                </div>
            </header>

            <section className="lobby-rooms">
                <div className="lobby-section-heading">
                    <h2>SELECIONE UMA SALA</h2>
                    <span>{rooms.length} SALAS</span>
                </div>

                {error && <p className="lobby-error">{error}</p>}

                <div className="lobby-table-scroll" aria-busy={loading}>
                    <table className="lobby-table">
                        <thead>
                            <tr>
                                <th scope="col">RANK</th>
                                <th scope="col">SALA</th>
                                <th scope="col">LOTAÇÃO</th>
                                <th scope="col">STATUS</th>
                                <th scope="col">AÇÃO</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rooms.map((room, index) => (
                                <tr key={room.roomId}>
                                    <td className="lobby-rank">{String(index + 1).padStart(2, '0')}</td>
                                    <th scope="row" className="lobby-room-name">
                                        <Link className="lobby-room-link" href={`/partida/${room.roomId}`}>
                                            {room.name}
                                        </Link>
                                    </th>
                                    <td>{room.playersCount}/4</td>
                                    <td>
                                        <span className={`lobby-status lobby-status-${room.status}`}>
                                            {STATUS_LABELS[room.status] ?? room.status}
                                        </span>
                                    </td>
                                    <td>
                                        <Link className="lobby-enter" href={`/partida/${room.roomId}`}>
                                            ▶
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                            {rooms.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="lobby-empty">
                                        {loading ? 'CARREGANDO SALAS...' : 'NENHUMA SALA DISPONÍVEL'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="lobby-create">
                <h2>NOVA PARTIDA</h2>
                <form onSubmit={handleCreateRoom} className="lobby-create-form">
                    <label htmlFor="room-name">NOME DA SALA</label>
                    <div className="lobby-create-controls">
                        <input
                            id="room-name"
                            className="join-input"
                            value={roomName}
                            onChange={(event) => setRoomName(event.target.value)}
                            placeholder="Digite o nome da sala"
                            autoComplete="off"
                            required
                            disabled={creating}
                        />
                        <button className="btn-primary" type="submit" disabled={loading || creating || !roomName.trim()}>
                            {creating ? 'CRIANDO...' : 'CRIAR SALA'}
                        </button>
                    </div>
                </form>
            </section>
        </main>
    );
}