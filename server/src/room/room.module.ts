import { Module } from '@nestjs/common';
import { RoomController } from './room.controller';
import { MediasoupModule } from '../mediasoup/mediasoup.module';

@Module({
  imports: [MediasoupModule],
  providers: [],
  controllers: [RoomController],
  exports: [],
})
export class RoomModule {}
