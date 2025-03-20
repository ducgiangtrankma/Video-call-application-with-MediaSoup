import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MediasoupService } from './mediasoup.service';
import { types } from 'mediasoup';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class MediasoupGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private rooms = new Map<string, Set<string>>(); // roomId -> Set of participantIds
  private participantProducers = new Map<
    string,
    { audio?: string; video?: string }
  >(); // participantId -> {audio, video} producerIds
  private participantNames = new Map<string, string>(); // participantId -> username
  private socketToParticipant = new Map<string, string>(); // socket.id -> participantId

  constructor(private readonly mediasoupService: MediasoupService) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    this.socketToParticipant.delete(client.id);
  }

  @SubscribeMessage('join-room')
  async handleJoinRoom(
    client: Socket,
    data: { roomId: string; participantId: string; username: string },
  ) {
    try {
      // Store username and socket mapping
      this.participantNames.set(data.participantId, data.username);
      this.socketToParticipant.set(client.id, data.participantId);

      // Create room if it doesn't exist
      await this.mediasoupService.createRoom(data.roomId);

      // Add participant to room
      if (!this.rooms.has(data.roomId)) {
        this.rooms.set(data.roomId, new Set());
      }
      this.rooms.get(data.roomId)?.add(data.participantId);

      // Join the socket.io room
      client.join(data.roomId);

      // Get router capabilities
      const routerRtpCapabilities =
        this.mediasoupService.getRouterRtpCapabilities();

      // Notify others in the room
      client.broadcast.to(data.roomId).emit('participant-joined', {
        participantId: data.participantId,
        username: data.username,
      });

      // Get all existing producers in the room
      const existingParticipants = Array.from(
        this.rooms.get(data.roomId) || [],
      ).filter((id) => id !== data.participantId); // Exclude the joining participant

      console.log(
        `Existing participants for ${data.participantId}:`,
        existingParticipants,
      );

      // For each existing participant, notify about their producers
      for (const participantId of existingParticipants) {
        const producerMap = this.participantProducers.get(participantId);
        const username = this.participantNames.get(participantId);
        console.log(`Producers for participant ${participantId}:`, producerMap);

        if (producerMap) {
          if (producerMap.audio) {
            client.emit('new-producer', {
              producerId: producerMap.audio,
              participantId,
              username,
              kind: 'audio',
            });
          }
          if (producerMap.video) {
            client.emit('new-producer', {
              producerId: producerMap.video,
              participantId,
              username,
              kind: 'video',
            });
          }
        }
      }

      return { routerRtpCapabilities };
    } catch (error) {
      console.error('Error joining room:', error);
      throw error;
    }
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(
    client: Socket,
    data: { roomId: string; participantId: string },
  ) {
    try {
      // Remove participant from room
      this.rooms.get(data.roomId)?.delete(data.participantId);
      if (this.rooms.get(data.roomId)?.size === 0) {
        this.rooms.delete(data.roomId);
      }

      // Clear participant's producers
      this.participantProducers.delete(data.participantId);

      // Leave the socket.io room
      client.leave(data.roomId);

      // Notify others
      client.broadcast.to(data.roomId).emit('participant-left', {
        participantId: data.participantId,
      });

      return { success: true };
    } catch (error) {
      console.error('Error leaving room:', error);
      throw error;
    }
  }

  @SubscribeMessage('create-transport')
  async handleCreateTransport(
    client: Socket,
    data: { roomId: string; producing: boolean },
  ) {
    try {
      const { params } = await this.mediasoupService.createWebRtcTransport(
        data.roomId,
      );
      return params;
    } catch (error) {
      console.error('Error creating transport:', error);
      throw error;
    }
  }

  @SubscribeMessage('connect-transport')
  async handleConnectTransport(
    client: Socket,
    data: { transportId: string; dtlsParameters: types.DtlsParameters },
  ) {
    try {
      await this.mediasoupService.connectTransport(
        data.transportId,
        data.dtlsParameters,
      );
      return { success: true };
    } catch (error) {
      console.error('Error connecting transport:', error);
      throw error;
    }
  }

  @SubscribeMessage('create-producer')
  async handleCreateProducer(
    client: Socket,
    data: {
      transportId: string;
      kind: 'audio' | 'video';
      rtpParameters: types.RtpParameters;
      participantId: string;
    },
  ) {
    try {
      const producer = await this.mediasoupService.createProducer(
        data.transportId,
        data.rtpParameters,
        data.kind,
        data.participantId,
      );

      // Store producer mapping
      if (!this.participantProducers.has(data.participantId)) {
        this.participantProducers.set(data.participantId, {});
      }
      const producerMap = this.participantProducers.get(data.participantId);
      if (producerMap) {
        producerMap[data.kind] = producer.id;
      }

      // Find the room this participant is in
      const roomId = Array.from(this.rooms.entries()).find(
        ([rid, participants]) => participants.has(data.participantId) && rid,
      )?.[0];

      if (roomId) {
        // Notify all other participants in the room about the new producer
        client.broadcast.to(roomId).emit('new-producer', {
          producerId: producer.id,
          participantId: data.participantId,
          username: this.participantNames.get(data.participantId),
          kind: data.kind,
        });
      }

      return { id: producer.id };
    } catch (error) {
      console.error('Error creating producer:', error);
      throw error;
    }
  }

  @SubscribeMessage('consume')
  async handleConsume(
    client: Socket,
    data: {
      roomId: string;
      transportId: string;
      producerId: string;
      rtpCapabilities: types.RtpCapabilities;
    },
  ) {
    try {
      const consumer = await this.mediasoupService.createConsumer(
        data.roomId,
        data.transportId,
        data.producerId,
        data.rtpCapabilities,
      );

      return {
        id: consumer.id,
        producerId: consumer.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      };
    } catch (error) {
      console.error('Error consuming:', error);
      throw error;
    }
  }

  @SubscribeMessage('media-state-update')
  handleMediaStateUpdate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { kind: string; enabled: boolean },
  ) {
    const participantId = this.socketToParticipant.get(socket.id);
    if (!participantId) {
      console.error('No participant ID found for socket:', socket.id);
      return;
    }

    const roomId = Array.from(this.rooms.entries()).find(
      ([rid, participants]) => participants.has(participantId) && rid,
    )?.[0];

    if (!roomId) {
      console.error('No room found for participant:', participantId);
      return;
    }

    // Broadcast the media state change to all other participants in the room
    socket.to(roomId).emit('media-state-change', {
      participantId,
      kind: data.kind,
      enabled: data.enabled,
    });
  }
}
