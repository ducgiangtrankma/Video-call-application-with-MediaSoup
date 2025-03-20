import { MediasoupService } from "./mediasoup.service";

interface Participant {
  id: string;
  name: string;
  joinedAt: Date;
}

interface Room {
  id: string;
  participants: Participant[];
  createdAt: Date;
}

export class RoomService {
  private rooms: Map<string, Room> = new Map();
  private mediasoupService: MediasoupService;

  constructor() {
    this.mediasoupService = new MediasoupService();
  }

  async getRooms(): Promise<Room[]> {
    const response = await fetch("/room");
    return response.json();
  }

  async getRoom(roomId: string): Promise<Room | undefined> {
    const response = await fetch(`/room/${roomId}`);
    return response.json();
  }

  async joinRoom(roomId: string, participantId: string): Promise<Room> {
    const response = await fetch("/room/join", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        roomId,
        participantId,
      }),
    });

    const room = await response.json();
    this.rooms.set(roomId, room);
    return room;
  }

  async leaveRoom(roomId: string, participantId: string) {
    await fetch("/room/leave", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        roomId,
        participantId,
      }),
    });

    this.rooms.delete(roomId);
  }

  getRoomById(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getMediasoupService(): MediasoupService {
    return this.mediasoupService;
  }
}
