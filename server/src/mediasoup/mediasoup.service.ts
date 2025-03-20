import { Injectable, OnModuleInit } from '@nestjs/common';
import * as mediasoup from 'mediasoup';
import { types } from 'mediasoup';
import { mediasoupConfig } from './mediasoup.config';

interface TransportInfo {
  transport: types.WebRtcTransport;
  routerId: string;
}

interface ProducerInfo {
  producer: types.Producer;
  routerId: string;
}

interface ConsumerInfo {
  consumer: types.Consumer;
  routerId: string;
}

@Injectable()
export class MediasoupService implements OnModuleInit {
  private worker: types.Worker;
  private routers: Map<string, types.Router> = new Map();
  private transports: Map<string, TransportInfo> = new Map();
  private producers: Map<string, ProducerInfo> = new Map();
  private consumers: Map<string, ConsumerInfo> = new Map();
  private participantProducers: Map<string, string> = new Map();
  private router: types.Router | null = null;

  async onModuleInit() {
    this.worker = await mediasoup.createWorker(mediasoupConfig.worker);
  }

  async createRoom(roomId: string): Promise<types.Router> {
    if (this.routers.has(roomId)) {
      return this.routers.get(roomId)!;
    }

    const router = await this.worker.createRouter({
      mediaCodecs: mediasoupConfig.router.mediaCodecs,
    });

    this.routers.set(roomId, router);
    this.router = router;
    return router;
  }

  async createWebRtcTransport(roomId: string) {
    const router = this.routers.get(roomId);
    if (!router) {
      throw new Error(`Router not found for room ${roomId}`);
    }

    const transport = await router.createWebRtcTransport({
      ...mediasoupConfig.webRtcTransport,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });

    this.transports.set(transport.id, { transport, routerId: roomId });

    return {
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      },
    };
  }

  async connectTransport(
    transportId: string,
    dtlsParameters: types.DtlsParameters,
  ): Promise<void> {
    const transportInfo = this.transports.get(transportId);
    if (!transportInfo) {
      throw new Error(`Transport not found: ${transportId}`);
    }

    await transportInfo.transport.connect({ dtlsParameters });
  }

  getProducerByParticipantId(participantId: string): types.Producer {
    const producerId = this.participantProducers.get(participantId);
    if (!producerId) {
      throw new Error(`No producer found for participant ${participantId}`);
    }

    const producerInfo = this.producers.get(producerId);
    if (!producerInfo) {
      throw new Error(`Producer not found: ${producerId}`);
    }

    return producerInfo.producer;
  }

  async createProducer(
    transportId: string,
    rtpParameters: types.RtpParameters,
    kind: 'audio' | 'video',
    participantId: string,
  ): Promise<types.Producer> {
    const transportInfo = this.transports.get(transportId);
    if (!transportInfo) {
      throw new Error(`Transport not found: ${transportId}`);
    }

    const producer = await transportInfo.transport.produce({
      kind,
      rtpParameters,
    });

    this.producers.set(producer.id, {
      producer,
      routerId: transportInfo.routerId,
    });

    // Store the mapping between participant and producer
    this.participantProducers.set(participantId, producer.id);

    return producer;
  }

  async createConsumer(
    roomId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: types.RtpCapabilities,
  ): Promise<types.Consumer> {
    const router = this.routers.get(roomId);
    if (!router) {
      throw new Error(`Router not found for room ${roomId}`);
    }

    const producerInfo = this.producers.get(producerId);
    if (!producerInfo) {
      throw new Error(`Producer not found: ${producerId}`);
    }

    if (!router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('Cannot consume');
    }

    const transportInfo = this.transports.get(transportId);
    if (!transportInfo) {
      throw new Error(`Transport not found: ${transportId}`);
    }

    const consumer = await transportInfo.transport.consume({
      producerId,
      rtpCapabilities,
    });

    this.consumers.set(consumer.id, {
      consumer,
      routerId: roomId,
    });

    return consumer;
  }

  closeRoom(roomId: string): void {
    const router = this.routers.get(roomId);
    if (!router) return;

    // Close all transports associated with this room
    for (const [transportId, transportInfo] of this.transports.entries()) {
      if (transportInfo.routerId === roomId) {
        transportInfo.transport.close();
        this.transports.delete(transportId);
      }
    }

    // Close all producers associated with this room
    for (const [producerId, producerInfo] of this.producers.entries()) {
      if (producerInfo.routerId === roomId) {
        producerInfo.producer.close();
        this.producers.delete(producerId);
      }
    }

    // Close all consumers associated with this room
    for (const [consumerId, consumerInfo] of this.consumers.entries()) {
      if (consumerInfo.routerId === roomId) {
        consumerInfo.consumer.close();
        this.consumers.delete(consumerId);
      }
    }

    router.close();
    this.routers.delete(roomId);
  }

  storeProducerMapping(participantId: string, producerId: string): void {
    this.participantProducers.set(participantId, producerId);
  }

  async pauseProducer(producerId: string): Promise<void> {
    const producerInfo = this.producers.get(producerId);
    if (!producerInfo) {
      throw new Error(`Producer not found: ${producerId}`);
    }

    await producerInfo.producer.pause();
  }

  async resumeProducer(producerId: string): Promise<void> {
    const producerInfo = this.producers.get(producerId);
    if (!producerInfo) {
      throw new Error(`Producer not found: ${producerId}`);
    }

    await producerInfo.producer.resume();
  }

  getRouterRtpCapabilities() {
    if (!this.router) {
      throw new Error('Router not initialized');
    }
    return this.router.rtpCapabilities;
  }

  closeAllProducersForParticipant(participantId: string): void {
    // Find all producers associated with this participant
    for (const [producerId, producerInfo] of this.producers.entries()) {
      const participantProducerId =
        this.participantProducers.get(participantId);
      if (participantProducerId === producerId) {
        producerInfo.producer.close();
        this.producers.delete(producerId);
      }
    }
    // Clear the participant's producer mapping
    this.participantProducers.delete(participantId);
  }
}
