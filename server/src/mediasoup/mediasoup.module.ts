import { Module } from '@nestjs/common';
import { MediasoupController } from './mediasoup.controller';
import { MediasoupService } from './mediasoup.service';
import { MediasoupGateway } from './mediasoup.gateway';

@Module({
  controllers: [MediasoupController],
  providers: [MediasoupService, MediasoupGateway],
  exports: [MediasoupService],
})
export class MediasoupModule {}
