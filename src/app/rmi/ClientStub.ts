import {
  IGameRemote,
  RMIRPCRequest,
  RMIRPCResponse,
  RMILogEntry,
} from './IGameRemote';

type LogListener = (log: RMILogEntry) => void;
type ConnectionListener = (connected: boolean) => void;

/**
 * GERENCIADOR E APÊNDICE DO CLIENTE (Client Stub).
 * Implementa a transparência de acesso e localização de Sistemas Distribuídos:
 * o cliente invoca métodos como se fossem procedimentos locais, enquanto o Stub
 * empacota os parâmetros (Marshalling) e realiza a requisição remota ao Server Stub.
 */
export class RMIClientManager {
  private endpointUrl: string;
  private onLog?: LogListener;
  private onConnectionChange?: ConnectionListener;

  /**
   * @param baseUrl URL base do Servidor RMI (ex: http://localhost:4000).
   * @param onLog Callback para alimentar o Inspetor RMI na tela.
   * @param onConnectionChange Callback para atualizar o status de conexão com o Registry.
   */
  constructor(
    baseUrl: string,
    onLog?: LogListener,
    onConnectionChange?: ConnectionListener
  ) {
    // Normaliza a URL caso tenha sido configurada com ws:// anteriormente
    const cleanUrl = baseUrl
      .replace(/^ws:\/\//, 'http://')
      .replace(/^wss:\/\//, 'https://')
      .replace(/\/$/, '');

    this.endpointUrl = `${cleanUrl}/rmi`;
    this.onLog = onLog;
    this.onConnectionChange = onConnectionChange;
  }

  /**
   * Registra um evento no Inspetor de Invocação de Métodos Remotos.
   */
  private addLog(
    direction: RMILogEntry['direction'],
    title: string,
    payload: string
  ): void {
    this.onLog?.({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      direction,
      title,
      payload,
    });
  }

  /**
   * Gera dinamicamente o Apêndice do Cliente (Client Stub) utilizando Metaprogramação (`Proxy`).
   * Equivalente ao papel do stub gerado pelo compilador IDL/RMI descrito por Tanenbaum e Steen.
   * @returns Objeto que implementa `IGameRemote` localmente e encaminha chamadas pela rede.
   */
  public getRemoteStub(): IGameRemote {
    return new Proxy({} as IGameRemote, {
      get: (_target, propKey) => {
        const method = String(propKey) as keyof IGameRemote;

        return async (...args: any[]): Promise<any> => {
          const requestId = Math.random().toString(36).substring(2, 10);

          // Passo 2 do slide de RPC: Apêndice do cliente monta a mensagem com o procedimento e valores
          const requestPayload: RMIRPCRequest = {
            requestId,
            method,
            args,
          };

          const serialized = JSON.stringify(requestPayload);
          const isSilentPolling = method === 'getGameState';

          if (!isSilentPolling) {
            this.addLog('OUT', `Client Stub -> ${method}()`, serialized);
          }

          const startTime = performance.now();

          try {
            // Passo 3 do slide de RPC: Mensagem é enviada pela rede (Protocolo HTTP Request/Reply)
            const httpResponse = await fetch(this.endpointUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: serialized,
            });

            if (!httpResponse.ok) {
              throw new Error(`Falha de comunicação HTTP: Status ${httpResponse.status}`);
            }

            const data: RMIRPCResponse = await httpResponse.json();
            const latency = Math.round(performance.now() - startTime);

            this.onConnectionChange?.(true);

            // Verifica se o Apêndice do Servidor reportou uma exceção de negócio
            if (data.error) {
              if (!isSilentPolling) {
                this.addLog('ERROR', `Exceção Remota (${latency}ms)`, data.error);
              }
              throw new Error(data.error);
            }

            if (!isSilentPolling) {
              this.addLog(
                'IN',
                `Retorno de ${method} (${latency}ms)`,
                JSON.stringify(data.result).slice(0, 140) + '...'
              );
            }

            return data.result;
          } catch (err: any) {
            if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
              this.onConnectionChange?.(false);
            }
            throw err;
          }
        };
      },
    });
  }
}