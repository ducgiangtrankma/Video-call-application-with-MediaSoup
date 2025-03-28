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
  private participantMediaStates = new Map<
    string,
    { audio: boolean; video: boolean }
  >();

  constructor(private readonly mediasoupService: MediasoupService) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    const participantId = this.socketToParticipant.get(client.id);
    if (participantId) {
      // Find which room this participant was in
      let roomId: string | undefined;
      for (const [rid, participants] of this.rooms.entries()) {
        if (participants.has(participantId)) {
          roomId = rid;
          break;
        }
      }

      if (roomId) {
        // Notify others in the room about the participant leaving
        client.broadcast.to(roomId).emit('participant-left', {
          participantId,
        });
        console.log(
          `Notified others about participant ${participantId} disconnecting`,
        );

        // Close all producers for this participant
        this.mediasoupService.closeAllProducersForParticipant(participantId);
        console.log(
          `Closed all producers for disconnected participant ${participantId}`,
        );

        // Remove participant from room
        const room = this.rooms.get(roomId);
        if (room) {
          room.delete(participantId);
          console.log(
            `Removed participant ${participantId} from room ${roomId}`,
          );

          // If room is empty, delete it and close all associated resources
          if (room.size === 0) {
            this.rooms.delete(roomId);
            this.mediasoupService.closeRoom(roomId);
            console.log(
              `Room ${roomId} is empty, deleted room and closed resources`,
            );
          }
        }

        // Clean up all participant data
        this.participantProducers.delete(participantId);
        this.participantNames.delete(participantId);
        this.participantMediaStates.delete(participantId);
      }
    }
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

      // Initialize media states for new participant
      this.participantMediaStates.set(data.participantId, {
        audio: true,
        video: true,
      });

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

      // For each existing participant, notify about their producers and media states
      for (const participantId of existingParticipants) {
        const producerMap = this.participantProducers.get(participantId);
        const username = this.participantNames.get(participantId);
        const mediaState = this.participantMediaStates.get(participantId);
        console.log(`Producers for participant ${participantId}:`, producerMap);

        if (producerMap) {
          if (producerMap.audio) {
            client.emit('new-producer', {
              producerId: producerMap.audio,
              participantId,
              username,
              kind: 'audio',
            });
            // Send current audio state
            if (mediaState) {
              client.emit('media-state-change', {
                participantId,
                kind: 'audio',
                enabled: mediaState.audio,
              });
            }
          }
          if (producerMap.video) {
            client.emit('new-producer', {
              producerId: producerMap.video,
              participantId,
              username,
              kind: 'video',
            });
            // Send current video state
            if (mediaState) {
              client.emit('media-state-change', {
                participantId,
                kind: 'video',
                enabled: mediaState.video,
              });
            }
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
  async handleMediaStateUpdate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { kind: string; enabled: boolean },
  ) {
    const participantId = this.socketToParticipant.get(socket.id);
    if (!participantId) {
      console.error('No participant ID found for socket:', socket.id);
      return;
    }

    console.log(
      `Media state update for participant ${participantId}: ${data.kind} ${data.enabled ? 'enabled' : 'disabled'}`,
    );

    // Update media state
    const mediaState = this.participantMediaStates.get(participantId);
    if (mediaState) {
      if (data.kind === 'audio') {
        mediaState.audio = data.enabled;
      } else if (data.kind === 'video') {
        mediaState.video = data.enabled;
      }
      console.log(`Updated media state for ${participantId}:`, mediaState);
    }

    const roomId = Array.from(this.rooms.entries()).find(
      ([rid, participants]) => participants.has(participantId) && rid,
    )?.[0];

    if (!roomId) {
      console.error('No room found for participant:', participantId);
      return;
    }

    // Get the producer ID
    const producerMap = this.participantProducers.get(participantId);
    const producerId = producerMap?.[data.kind as 'audio' | 'video'];

    console.log(`Producer map for ${participantId}:`, producerMap);
    console.log(`Found producer ID for ${data.kind}:`, producerId);

    if (producerId) {
      try {
        // Pause/Resume the producer
        if (data.enabled) {
          console.log(`Resuming producer ${producerId} for ${participantId}`);
          await this.mediasoupService.resumeProducer(producerId);
        } else {
          console.log(`Pausing producer ${producerId} for ${participantId}`);
          await this.mediasoupService.pauseProducer(producerId);
        }
      } catch (error) {
        console.error('Error updating producer state:', error);
      }
    } else {
      console.error(
        `No producer found for ${participantId} with kind ${data.kind}`,
      );
    }

    // Broadcast the media state change to all other participants in the room
    console.log(
      `Broadcasting media state change for ${participantId} to room ${roomId}`,
    );
    socket.to(roomId).emit('media-state-change', {
      participantId,
      kind: data.kind,
      enabled: data.enabled,
    });
  }
}
