import { Module } from '@nestjs/common';
import { MediasoupService } from './mediasoup.service';
import { MediasoupController } from './mediasoup.controller';
import { MediasoupGateway } from './mediasoup.gateway';

@Module({
  providers: [MediasoupService, MediasoupGateway],
  controllers: [MediasoupController],
  exports: [MediasoupService],
})
export class MediasoupModule {}
