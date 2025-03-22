import { io, Socket } from "socket.io-client";

export interface SocketEventHandlers {
  onDisconnect?: () => void;
  onConnectError?: (error: Error) => void;
  onParticipantJoined?: (data: {
    participantId: string;
    username: string;
  }) => void;
  onParticipantLeft?: (data: { participantId: string }) => void;
  onNewProducer?: (data: {
    producerId: string;
    participantId: string;
    username: string;
    kind: "audio" | "video";
  }) => void;
  onMediaStateChange?: (data: {
    participantId: string;
    kind: string;
    enabled: boolean;
  }) => void;
}

export class SocketService {
  private socket: Socket;
  private handlers: SocketEventHandlers = {};

  constructor() {
    this.socket = io("http://localhost:3000");
    this.setupSocketEvents();
  }

  private setupSocketEvents() {
    this.socket.on("disconnect", () => {
      console.log("Disconnected from server");
      this.handlers.onDisconnect?.();
    });

    this.socket.on("connect_error", (error) => {
      console.log("Connection error:", error);
      this.handlers.onConnectError?.(error);
    });

    this.socket.on("participant-joined", (data) => {
      console.log(
        `Participant joined: ${data.participantId} (${data.username})`
      );
      this.handlers.onParticipantJoined?.(data);
    });

    this.socket.on("participant-left", (data) => {
      console.log(`Participant left: ${data.participantId}`);
      this.handlers.onParticipantLeft?.(data);
    });

    this.socket.on("new-producer", (data) => {
      console.log(
        `New producer: ${data.producerId} from participant: ${data.participantId}`
      );
      this.handlers.onNewProducer?.(data);
    });

    this.socket.on("media-state-change", (data) => {
      console.log(`Media state changed for ${data.participantId}`);
      this.handlers.onMediaStateChange?.(data);
    });
  }

  public setEventHandlers(handlers: SocketEventHandlers) {
    this.handlers = handlers;
  }

  public async request<T>(
    event: string,
    data: Record<string, unknown>
  ): Promise<T> {
    return new Promise<T>((resolve) => {
      this.socket.emit(event, data, (response: T) => {
        resolve(response);
      });
    });
  }

  public async emitWithAck<T>(
    event: string,
    data: Record<string, unknown>
  ): Promise<T> {
    return new Promise<T>((resolve) => {
      this.socket.emit(event, data, (response: T) => {
        resolve(response);
      });
    });
  }

  public emit(event: string, data: unknown) {
    this.socket.emit(event, data);
  }

  public disconnect() {
    this.socket.disconnect();
  }
}
