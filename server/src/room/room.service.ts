import { Injectable } from '@nestjs/common';
import { MediasoupService } from '../mediasoup/mediasoup.service';

export interface Participant {
  id: string;
  name: string;
  joinedAt: Date;
}

export interface Room {
  id: string;
  participants: Participant[];
  createdAt: Date;
}

@Injectable()
export class RoomService {
  private rooms: Map<string, Room> = new Map();

  constructor(private readonly mediasoupService: MediasoupService) {}

  createRoom(roomId: string): Room {
    if (this.rooms.has(roomId)) {
      return this.rooms.get(roomId)!;
    }

    const room: Room = {
      id: roomId,
      participants: [],
      createdAt: new Date(),
    };

    this.rooms.set(roomId, room);
    return room;
  }

  joinRoom(roomId: string, participantId: string): Room {
    const room = this.getRoom(roomId) || this.createRoom(roomId);

    const participant: Participant = {
      id: participantId,
      name: `User ${participantId}`,
      joinedAt: new Date(),
    };

    room.participants.push(participant);
    return room;
  }

  leaveRoom(roomId: string, participantId: string): void {
    const room = this.getRoom(roomId);
    if (!room) return;

    room.participants = room.participants.filter((p) => p.id !== participantId);

    if (room.participants.length === 0) {
      this.rooms.delete(roomId);
    }
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  updateParticipant(
    roomId: string,
    participantId: string,
    updates: Partial<Participant>,
  ): Room | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    const participant = room.participants.find((p) => p.id === participantId);
    if (!participant) return undefined;

    Object.assign(participant, updates);
    return room;
  }
}
