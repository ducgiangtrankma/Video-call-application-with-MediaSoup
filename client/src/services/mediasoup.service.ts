import { Device, types } from "mediasoup-client";
import type { Transport, Producer, Consumer } from "mediasoup-client/lib/types";
import { io, Socket } from "socket.io-client";

export class MediasoupService {
  private device: Device;
  private socket: Socket;
  private sendTransport: Transport | null = null;
  private recvTransport: Transport | null = null;
  private producers = new Map<string, Producer>();
  private consumers = new Map<string, Consumer>();
  private participantConsumers = new Map<string, Set<string>>();
  private roomId: string | null = null;
  private participantId: string | null = null;
  private username: string | null = null;
  private isDeviceLoaded = false;
  private consumerHandler?: (
    consumer: Consumer,
    participantId: string,
    username: string,
    kind: "audio" | "video"
  ) => void;
  private participantLeftHandler?: (participantId: string) => void;
  private mediaStateChangeHandler?: (
    participantId: string,
    kind: string,
    enabled: boolean
  ) => void;
  private disconnectHandler?: () => void;
  private pendingProducers: {
    producerId: string;
    participantId: string;
    username: string;
    kind: "audio" | "video";
  }[] = [];

  constructor() {
    this.device = new Device();
    this.socket = io("http://localhost:3000");

    // Handle disconnection
    this.socket.on("disconnect", () => {
      console.log("Disconnected from server");
      if (this.disconnectHandler) {
        this.disconnectHandler();
      }
      this.cleanupAllResources();
    });

    this.socket.on("connect_error", (error) => {
      console.log("Connection error:", error);
      if (this.disconnectHandler) {
        this.disconnectHandler();
      }
      this.cleanupAllResources();
    });

    this.socket.on(
      "participant-joined",
      (data: { participantId: string; username: string }) => {
        console.log(
          `Participant joined: ${data.participantId} (${data.username})`
        );
      }
    );

    this.socket.on("participant-left", (data: { participantId: string }) => {
      console.log(`Participant left: ${data.participantId}`);
      // Remove consumers if they exist
      const consumerKeys = Array.from(this.consumers.keys()).filter((key) =>
        key.startsWith(`${data.participantId}-`)
      );
      consumerKeys.forEach((key) => {
        const consumer = this.consumers.get(key);
        if (consumer) {
          consumer.close();
          this.consumers.delete(key);
        }
      });

      // Notify handler if exists
      if (this.participantLeftHandler) {
        this.participantLeftHandler(data.participantId);
      }
    });

    this.socket.on(
      "new-producer",
      async (data: {
        producerId: string;
        participantId: string;
        username: string;
        kind: "audio" | "video";
      }) => {
        console.log(
          `New producer: ${data.producerId} from participant: ${data.participantId} (${data.username}), kind: ${data.kind}`
        );

        // If device is not loaded yet, store the producer info for later
        if (!this.isDeviceLoaded) {
          this.pendingProducers.push(data);
          return;
        }

        await this.handleNewProducer(
          data.producerId,
          data.participantId,
          data.username,
          data.kind
        );
      }
    );

    this.socket.on(
      "media-state-change",
      async (data: {
        participantId: string;
        kind: string;
        enabled: boolean;
      }) => {
        console.log(
          `Media state changed for ${data.participantId}: ${data.kind} ${
            data.enabled ? "enabled" : "disabled"
          }`
        );
        if (this.mediaStateChangeHandler) {
          this.mediaStateChangeHandler(
            data.participantId,
            data.kind,
            data.enabled
          );
        }

        // Get the consumer and update its state
        const consumerKey = `${data.participantId}-${data.kind}`;
        console.log(`Looking for consumer with key: ${consumerKey}`);
        console.log("Current consumers:", Array.from(this.consumers.keys()));

        const consumer = this.consumers.get(consumerKey);
        if (consumer) {
          try {
            if (data.enabled) {
              console.log(
                `Resuming consumer ${consumer.id} for ${data.participantId}`
              );
              await consumer.resume();
            } else {
              console.log(
                `Pausing consumer ${consumer.id} for ${data.participantId}`
              );
              await consumer.pause();
            }
          } catch (error) {
            console.error(`Error updating consumer state:`, error);
          }
        } else {
          // If consumer not found, try to create it
          console.log(
            `Consumer not found for ${consumerKey}, checking if we need to create it`
          );

          // If this is our own media state change, we should have the producer
          if (data.participantId === this.participantId) {
            const producer = this.producers.get(
              `${this.participantId}-${data.kind}`
            );
            if (producer) {
              console.log(
                `Found our own producer ${producer.id} for ${data.kind}`
              );
              try {
                if (data.enabled) {
                  await producer.resume();
                } else {
                  await producer.pause();
                }
                console.log(`Updated producer state for ${data.kind}`);
              } catch (error) {
                console.error(`Error updating producer state:`, error);
              }
            } else {
              console.log(
                `No producer found for ${this.participantId}-${data.kind}`
              );
            }
          } else {
            // For other participants, we need to create a consumer
            const producer = this.producers.get(
              `${data.participantId}-${data.kind}`
            );
            if (producer) {
              console.log(`Found producer ${producer.id} for ${data.kind}`);
              try {
                const consumer = await this.consumeStream(
                  producer.id,
                  data.participantId,
                  data.kind as "audio" | "video"
                );
                if (consumer) {
                  console.log(
                    `Successfully created consumer for ${data.participantId}-${data.kind}`
                  );
                  if (data.enabled) {
                    await consumer.resume();
                  } else {
                    await consumer.pause();
                  }
                }
              } catch (error) {
                console.error(`Error creating consumer:`, error);
              }
            } else {
              console.log(
                `No producer found for ${data.participantId}-${data.kind}`
              );
            }
          }
        }
      }
    );
  }

  private async handleNewProducer(
    producerId: string,
    participantId: string,
    username: string,
    kind: "audio" | "video"
  ) {
    try {
      // Don't consume our own stream
      if (participantId === this.participantId) {
        return;
      }

      // Check if we already have a consumer for this participant and kind
      if (this.consumers.has(`${participantId}-${kind}`)) {
        console.log(
          `Already consuming ${kind} stream from participant ${participantId}`
        );
        return;
      }

      const consumer = await this.consumeStream(
        producerId,
        participantId,
        kind
      );
      if (consumer && this.consumerHandler) {
        this.consumerHandler(consumer, participantId, username, kind);
      }
    } catch (error) {
      console.error("Error handling new producer:", error);
    }
  }

  onNewConsumer(
    handler: (
      consumer: Consumer,
      participantId: string,
      username: string,
      kind: "audio" | "video"
    ) => void
  ) {
    this.consumerHandler = handler;
  }

  onParticipantLeft(handler: (participantId: string) => void) {
    this.participantLeftHandler = handler;
  }

  onMediaStateChange(
    handler: (participantId: string, kind: string, enabled: boolean) => void
  ) {
    this.mediaStateChangeHandler = handler;
  }

  private async request<T>(
    event: string,
    data: Record<string, unknown>
  ): Promise<T> {
    return new Promise<T>((resolve) => {
      this.socket.emit(event, data, (response: T) => {
        resolve(response);
      });
    });
  }

  async setRoomId(roomId: string, participantId: string, username: string) {
    this.roomId = roomId;
    this.participantId = participantId;
    this.username = username;

    try {
      const { routerRtpCapabilities } = await this.request<{
        routerRtpCapabilities: types.RtpCapabilities;
      }>("join-room", { roomId, participantId, username });

      // Load device with router capabilities
      if (!this.device.loaded) {
        await this.device.load({ routerRtpCapabilities });
        this.isDeviceLoaded = true;
        console.log("Device loaded successfully");

        // Handle any pending producers
        for (const producer of this.pendingProducers) {
          await this.handleNewProducer(
            producer.producerId,
            producer.participantId,
            producer.username,
            producer.kind
          );
        }
        this.pendingProducers = [];
      }
    } catch (error) {
      console.error("Error setting room ID:", error);
      throw error;
    }
  }

  private async ensureDeviceIsLoaded() {
    if (!this.isDeviceLoaded) {
      throw new Error("Device not loaded. Call setRoomId first.");
    }
  }

  async createSendTransport() {
    if (!this.roomId) {
      throw new Error("Room ID not set");
    }

    await this.ensureDeviceIsLoaded();

    try {
      const params = await this.request<types.TransportOptions>(
        "create-transport",
        {
          roomId: this.roomId,
          producing: true,
        }
      );

      this.sendTransport = this.device.createSendTransport(params);

      this.sendTransport.on(
        "connect",
        async ({ dtlsParameters }, callback, errback) => {
          try {
            await this.request("connect-transport", {
              transportId: this.sendTransport?.id,
              dtlsParameters,
            });
            callback();
          } catch (error) {
            errback(error as Error);
          }
        }
      );

      this.sendTransport.on(
        "produce",
        async ({ kind, rtpParameters }, callback, errback) => {
          try {
            const { id } = await this.request<{ id: string }>(
              "create-producer",
              {
                transportId: this.sendTransport?.id,
                kind,
                rtpParameters,
                participantId: this.participantId,
              }
            );

            callback({ id });
          } catch (error) {
            errback(error as Error);
          }
        }
      );

      return this.sendTransport;
    } catch (error) {
      console.error("Error creating send transport:", error);
      throw error;
    }
  }

  private async createRecvTransport() {
    if (!this.roomId) {
      throw new Error("Room ID not set");
    }

    await this.ensureDeviceIsLoaded();

    try {
      const params = await this.request<types.TransportOptions>(
        "create-transport",
        {
          roomId: this.roomId,
          producing: false,
        }
      );

      this.recvTransport = this.device.createRecvTransport(params);

      this.recvTransport.on(
        "connect",
        async ({ dtlsParameters }, callback, errback) => {
          try {
            await this.request("connect-transport", {
              transportId: this.recvTransport?.id,
              dtlsParameters,
            });
            callback();
          } catch (error) {
            errback(error as Error);
          }
        }
      );

      return this.recvTransport;
    } catch (error) {
      console.error("Error creating receive transport:", error);
      throw error;
    }
  }

  async produce(
    track: MediaStreamTrack,
    participantId: string,
    kind: "audio" | "video"
  ) {
    if (!this.sendTransport) {
      throw new Error("Send transport not created");
    }

    try {
      const producer = await this.sendTransport.produce({
        track,
        appData: { participantId, kind },
      });

      this.producers.set(`${participantId}-${kind}`, producer);
      return producer;
    } catch (error) {
      console.error("Error producing track:", error);
      throw error;
    }
  }

  private async consumeStream(
    producerId: string,
    participantId: string,
    kind: "audio" | "video"
  ) {
    try {
      await this.ensureDeviceIsLoaded();

      if (!this.recvTransport) {
        await this.createRecvTransport();
      }

      if (!this.recvTransport) {
        throw new Error("Failed to create receive transport");
      }

      if (!this.roomId) {
        throw new Error("Room ID not set");
      }

      const { rtpCapabilities } = this.device;
      const {
        id,
        producerId: remoteProducerId,
        kind: remoteKind,
        rtpParameters,
      } = await this.request<{
        id: string;
        producerId: string;
        kind: "audio" | "video";
        rtpParameters: types.RtpParameters;
      }>("consume", {
        roomId: this.roomId,
        transportId: this.recvTransport.id,
        producerId,
        rtpCapabilities,
      });

      const consumer = await this.recvTransport.consume({
        id,
        producerId: remoteProducerId,
        kind: remoteKind,
        rtpParameters,
      });

      // Store with kind
      this.consumers.set(`${participantId}-${kind}`, consumer);

      return consumer;
    } catch (error) {
      console.error("Error consuming stream:", error);
      throw error;
    }
  }

  async leaveRoom() {
    if (this.roomId && this.participantId) {
      await this.request("leave-room", {
        roomId: this.roomId,
        participantId: this.participantId,
      });
    }

    // Cleanup existing transports and streams
    for (const producer of this.producers.values()) {
      producer.close();
    }
    this.producers.clear();

    for (const consumer of this.consumers.values()) {
      consumer.close();
    }
    this.consumers.clear();

    if (this.sendTransport) {
      this.sendTransport.close();
      this.sendTransport = null;
    }

    if (this.recvTransport) {
      this.recvTransport.close();
      this.recvTransport = null;
    }

    this.roomId = null;
    this.participantId = null;
    this.isDeviceLoaded = false;
  }

  async updateMediaState(kind: string, enabled: boolean) {
    console.log(
      `Updating media state: ${kind} ${enabled ? "enabled" : "disabled"}`
    );
    const producer = this.producers.get(`${this.participantId}-${kind}`);
    if (producer) {
      console.log(`Found producer for ${kind}:`, producer.id);
      try {
        if (enabled) {
          console.log(`Resuming producer ${producer.id}`);
          await producer.resume();
        } else {
          console.log(`Pausing producer ${producer.id}`);
          await producer.pause();
        }
        console.log(
          `Emitting media-state-update event: ${kind} ${
            enabled ? "enabled" : "disabled"
          }`
        );
        this.socket.emit("media-state-update", { kind, enabled });
      } catch (error) {
        console.error(`Error updating producer state:`, error);
      }
    } else {
      console.error(`No producer found for ${kind}`);
    }
  }

  getProducer(kind: string) {
    return this.producers.get(`${this.participantId}-${kind}`);
  }

  public getConsumer(participantId: string, kind: string) {
    const consumerId = `${participantId}-${kind}`;
    return this.consumers.get(consumerId);
  }

  public removeConsumersForParticipant(participantId: string) {
    // Get all consumer IDs for this participant
    const consumerIds = this.participantConsumers.get(participantId);
    if (!consumerIds) return;

    // Close and remove each consumer
    consumerIds.forEach((consumerId) => {
      const consumer = this.consumers.get(consumerId);
      if (consumer) {
        consumer.close();
        this.consumers.delete(consumerId);
      }
    });

    // Remove the participant's consumer set
    this.participantConsumers.delete(participantId);
    console.log(`Removed all consumers for participant ${participantId}`);
  }

  public async createConsumer(
    roomId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: types.RtpCapabilities,
    participantId: string
  ) {
    try {
      const { consumer } = await this.socket.emitWithAck("consume", {
        roomId,
        transportId,
        producerId,
        rtpCapabilities,
      });

      const consumerObj = await this.recvTransport?.consume({
        id: consumer.id,
        producerId: consumer.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });

      if (consumerObj) {
        // Store consumer with participant and kind
        const consumerId = `${participantId}-${consumerObj.kind}`;
        this.consumers.set(consumerId, consumerObj);

        // Track this consumer for the participant
        if (!this.participantConsumers.has(participantId)) {
          this.participantConsumers.set(participantId, new Set());
        }
        this.participantConsumers.get(participantId)?.add(consumerId);

        console.log(
          `Created consumer ${consumerId} for participant ${participantId}`
        );
        return consumerObj;
      }
    } catch (error) {
      console.error("Error creating consumer:", error);
      throw error;
    }
  }

  private cleanupAllResources() {
    // Close all producers
    this.producers.forEach((producer) => producer.close());
    this.producers.clear();

    // Close all consumers
    this.consumers.forEach((consumer) => consumer.close());
    this.consumers.clear();

    // Clear participant consumers map
    this.participantConsumers.clear();

    // Close transports
    if (this.sendTransport) {
      this.sendTransport.close();
      this.sendTransport = null;
    }

    if (this.recvTransport) {
      this.recvTransport.close();
      this.recvTransport = null;
    }

    // Reset state
    this.isDeviceLoaded = false;
    console.log("Cleaned up all resources after disconnect");
  }

  public onDisconnect(handler: () => void) {
    this.disconnectHandler = handler;
  }
}
