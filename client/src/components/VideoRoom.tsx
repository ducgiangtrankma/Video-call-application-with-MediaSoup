import React, { useEffect, useRef } from "react";
import { MediasoupService } from "../services/mediasoup.service";
import "./VideoRoom.css";

interface VideoRoomProps {
  roomId: string;
  onLeave: () => void;
}

export const VideoRoom: React.FC<VideoRoomProps> = ({ roomId, onLeave }) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideosRef = useRef<
    Map<string, HTMLVideoElement | HTMLAudioElement>
  >(new Map());
  const mediasoupServiceRef = useRef<MediasoupService | null>(null);
  const participantIdRef = useRef<string>(crypto.randomUUID());
  const username = useRef<string>(`User ${Math.floor(Math.random() * 1000)}`);

  useEffect(() => {
    const initializeMedia = async () => {
      try {
        console.log("Starting media initialization...");

        // Get user media first
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        // Display local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Create MediasoupService instance
        mediasoupServiceRef.current = new MediasoupService();
        const mediasoupService = mediasoupServiceRef.current;

        // Handle participant left
        mediasoupService.onParticipantLeft((participantId: string) => {
          console.log(`Removing video for participant: ${participantId}`);

          // Remove video container from UI
          const videoContainer = document.getElementById(
            `video-${participantId}`
          );
          if (videoContainer) {
            videoContainer.remove();
          }

          // Remove from our refs and cleanup
          const videoKey = `${participantId}-video`;
          const audioKey = `${participantId}-audio`;

          const videoElement = remoteVideosRef.current.get(videoKey);
          if (videoElement) {
            videoElement.srcObject = null;
            remoteVideosRef.current.delete(videoKey);
          }

          const audioElement = remoteVideosRef.current.get(audioKey);
          if (audioElement) {
            audioElement.srcObject = null;
            remoteVideosRef.current.delete(audioKey);
          }
        });

        // Set up consumer handler
        mediasoupService.onNewConsumer(
          (consumer, participantId, username, kind) => {
            console.log(
              `New consumer for participant: ${participantId}, kind: ${kind}`
            );

            // If we already have a video element for this participant and this kind
            const existingVideo = remoteVideosRef.current.get(
              `${participantId}-${kind}`
            );
            if (existingVideo) {
              console.log(
                `Already have a ${kind} element for participant ${participantId}`
              );
              return;
            }

            const stream = new MediaStream([consumer.track]);

            // Only create video element for video consumers
            if (kind === "video") {
              // Create new video element for remote participant
              const videoElement = document.createElement("video");
              videoElement.srcObject = stream;
              videoElement.autoplay = true;
              videoElement.playsInline = true;

              // Store reference with kind
              remoteVideosRef.current.set(
                `${participantId}-${kind}`,
                videoElement
              );

              // Add to DOM
              const remoteVideosContainer =
                document.querySelector(".remote-videos");
              if (remoteVideosContainer) {
                const videoContainer = document.createElement("div");
                videoContainer.className = "remote-video";
                videoContainer.id = `video-${participantId}`;
                videoContainer.appendChild(videoElement);

                const label = document.createElement("div");
                label.className = "participant-label";
                label.textContent =
                  username || `User ${participantId.slice(0, 8)}`;
                videoContainer.appendChild(label);

                remoteVideosContainer.appendChild(videoContainer);
              }
            } else {
              // For audio, just create an audio element
              const audioElement = document.createElement("audio");
              audioElement.srcObject = stream;
              audioElement.autoplay = true;
              document.body.appendChild(audioElement);
              remoteVideosRef.current.set(
                `${participantId}-${kind}`,
                audioElement
              );
            }
          }
        );

        // Join the room and load device
        console.log("Joining room...");
        await mediasoupService.setRoomId(
          roomId,
          participantIdRef.current,
          username.current
        );

        // Create send transport
        console.log("Creating send transport...");
        const sendTransport = await mediasoupService.createSendTransport();
        if (!sendTransport) {
          throw new Error("Failed to create send transport");
        }

        // Produce video track
        console.log("Producing video track...");
        const videoTrack = stream.getVideoTracks()[0];
        await mediasoupService.produce(
          videoTrack,
          participantIdRef.current,
          "video"
        );

        // Produce audio track
        console.log("Producing audio track...");
        const audioTrack = stream.getAudioTracks()[0];
        await mediasoupService.produce(
          audioTrack,
          participantIdRef.current,
          "audio"
        );

        console.log("Media initialization completed successfully");
      } catch (error) {
        console.error("Error initializing media:", error);
      }
    };

    initializeMedia();

    return () => {
      // Cleanup
      if (mediasoupServiceRef.current) {
        mediasoupServiceRef.current.leaveRoom();
      }

      // Remove all remote videos and audios
      remoteVideosRef.current.forEach((element) => {
        element.srcObject = null;
        element.remove();
      });
      remoteVideosRef.current.clear();
    };
  }, [roomId]);

  const handleLeaveRoom = () => {
    if (mediasoupServiceRef.current) {
      mediasoupServiceRef.current.leaveRoom();
    }
    onLeave();
  };

  return (
    <div className="video-room">
      <div className="video-grid">
        <div className="video-container local-video">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="video-element"
          />
          <div className="participant-label">You ({username.current})</div>
        </div>
        <div className="remote-videos" />
      </div>
      <button onClick={handleLeaveRoom} className="leave-button">
        Leave Room
      </button>
    </div>
  );
};
