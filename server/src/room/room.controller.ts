import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { RoomService, Room } from './room.service';

@Controller('room')
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Get()
  getRooms(): Room[] {
    return this.roomService.getRooms();
  }

  @Get(':roomId')
  getRoom(@Param('roomId') roomId: string): Room | undefined {
    return this.roomService.getRoom(roomId);
  }

  @Post('join')
  joinRoom(@Body() body: { roomId: string; participantId: string }): Room {
    return this.roomService.joinRoom(body.roomId, body.participantId);
  }

  @Post('leave')
  leaveRoom(@Body() body: { roomId: string; participantId: string }): void {
    return this.roomService.leaveRoom(body.roomId, body.participantId);
  }
}
