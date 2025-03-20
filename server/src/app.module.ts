import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MediasoupModule } from './mediasoup/mediasoup.module';
import { RoomModule } from './room/room.module';

@Module({
  imports: [MediasoupModule, RoomModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
