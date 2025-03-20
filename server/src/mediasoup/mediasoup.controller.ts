import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { MediasoupService } from './mediasoup.service';
import { types } from 'mediasoup';

@Controller('mediasoup')
export class MediasoupController {
  constructor(private readonly mediasoupService: MediasoupService) {}

  @Get('get-producer/:participantId')
  getProducer(@Param('participantId') participantId: string) {
    const producer =
      this.mediasoupService.getProducerByParticipantId(participantId);
    return { producerId: producer.id };
  }

  @Get('router-capabilities')
  getRouterCapabilities() {
    const routerRtpCapabilities =
      this.mediasoupService.getRouterRtpCapabilities();
    return { routerRtpCapabilities };
  }

  @Post('create-room')
  async createRoom(@Body() body: { roomId: string }) {
    const router = await this.mediasoupService.createRoom(body.roomId);
    return { id: router.id };
  }

  @Post('create-transport')
  async createTransport(@Body() body: { roomId: string }) {
    return this.mediasoupService.createWebRtcTransport(body.roomId);
  }

  @Post('connect-transport')
  async connectTransport(
    @Body()
    body: {
      transportId: string;
      dtlsParameters: types.DtlsParameters;
    },
  ) {
    await this.mediasoupService.connectTransport(
      body.transportId,
      body.dtlsParameters,
    );
    return { success: true };
  }

  @Post('create-producer')
  createProducer(
    @Body()
    body: {
      transportId: string;
      producerId: string;
      participantId: string;
    },
  ) {
    this.mediasoupService.storeProducerMapping(
      body.participantId,
      body.producerId,
    );
    return { success: true };
  }

  @Post('create-consumer')
  async createConsumer(
    @Body()
    body: {
      roomId: string;
      transportId: string;
      producerId: string;
      rtpCapabilities: types.RtpCapabilities;
    },
  ) {
    const consumer = await this.mediasoupService.createConsumer(
      body.roomId,
      body.transportId,
      body.producerId,
      body.rtpCapabilities,
    );
    return {
      id: consumer.id,
      producerId: consumer.producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    };
  }

  @Post('close-room')
  closeRoom(@Body() body: { roomId: string }) {
    this.mediasoupService.closeRoom(body.roomId);
    return { success: true };
  }
}
