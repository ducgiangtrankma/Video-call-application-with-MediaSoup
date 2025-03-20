import React, { useEffect, useRef, useState } from "react";
import { Button } from "antd";
import {
  AudioOutlined,
  AudioMutedOutlined,
  VideoCameraOutlined,
  VideoCameraAddOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import { MediasoupService } from "../services/mediasoup.service";
import "antd/dist/reset.css";
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
  const streamRef = useRef<MediaStream | null>(null);

  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);

  const toggleAudio = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled;
        setIsAudioEnabled(!isAudioEnabled);
        // Notify other users
        mediasoupServiceRef.current?.updateMediaState("audio", !isAudioEnabled);
      }
    }
  };

  const toggleVideo = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled;
        setIsVideoEnabled(!isVideoEnabled);
        // Notify other users
        mediasoupServiceRef.current?.updateMediaState("video", !isVideoEnabled);
      }
    }
  };

  const cleanupParticipantResources = (participantId: string) => {
    console.log(`Cleaning up resources for participant: ${participantId}`);

    // Remove video container from UI
    const videoContainer = document.getElementById(`video-${participantId}`);
    if (videoContainer) {
      videoContainer.remove();
      console.log(`Removed video container for participant ${participantId}`);
    }

    // Clean up video element
    const videoElement = remoteVideosRef.current.get(`${participantId}-video`);
    if (videoElement) {
      if (videoElement instanceof HTMLVideoElement) {
        const stream = videoElement.srcObject as MediaStream;
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }
      }
      videoElement.srcObject = null;
      remoteVideosRef.current.delete(`${participantId}-video`);
      console.log(`Cleaned up video element for participant ${participantId}`);
    }

    // Clean up audio element
    const audioElement = remoteVideosRef.current.get(`${participantId}-audio`);
    if (audioElement) {
      if (audioElement instanceof HTMLAudioElement) {
        const stream = audioElement.srcObject as MediaStream;
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }
      }
      audioElement.srcObject = null;
      remoteVideosRef.current.delete(`${participantId}-audio`);
      audioElement.remove();
      console.log(`Cleaned up audio element for participant ${participantId}`);
    }

    // Clean up consumers in mediasoup service
    if (mediasoupServiceRef.current) {
      mediasoupServiceRef.current.removeConsumersForParticipant(participantId);
      console.log(`Removed consumers for participant ${participantId}`);
    }

    console.log(`Completed cleanup for participant ${participantId}`);
  };

  useEffect(() => {
    const initializeMedia = async () => {
      try {
        console.log("Starting media initialization...");

        // Get user media first
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        streamRef.current = stream;

        // Display local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Create MediasoupService instance
        mediasoupServiceRef.current = new MediasoupService();
        const mediasoupService = mediasoupServiceRef.current;

        // Handle disconnection
        mediasoupService.onDisconnect(() => {
          console.log("Handling disconnect");

          // Clean up all remote videos and audios
          const remoteVideosContainer =
            document.querySelector(".remote-videos");
          if (remoteVideosContainer) {
            const videoContainers =
              remoteVideosContainer.querySelectorAll(".remote-video");
            videoContainers.forEach((container) => {
              const participantId = container.id.replace("video-", "");
              cleanupParticipantResources(participantId);
            });
            remoteVideosContainer.innerHTML = ""; // Clear container
          }

          // Clean up all audio elements
          const audioElements = document.querySelectorAll("audio");
          audioElements.forEach((audio) => {
            if (audio.srcObject) {
              const stream = audio.srcObject as MediaStream;
              stream.getTracks().forEach((track) => track.stop());
              audio.srcObject = null;
            }
            audio.remove();
          });

          // Optionally, you might want to notify the user about the disconnection
          console.log("Disconnected from the room");
        });

        // Handle media state changes from other participants
        mediasoupService.onMediaStateChange((participantId, kind, enabled) => {
          console.log(
            `Media state changed for ${participantId}: ${kind} ${
              enabled ? "enabled" : "disabled"
            }`
          );

          const container = document.getElementById(`video-${participantId}`);
          if (container) {
            if (kind === "video") {
              if (!enabled) {
                container.classList.add("video-disabled");
              } else {
                container.classList.remove("video-disabled");
              }
            } else if (kind === "audio") {
              const label = document.getElementById(`label-${participantId}`);
              if (label) {
                const username = label.textContent?.split(" ")[0] || "";
                label.textContent = `${username} ${enabled ? "🎤" : "🔇"}`;
              }
            }
          }

          // Get the consumer for this participant and kind
          const consumer = mediasoupService.getConsumer(participantId, kind);
          if (consumer) {
            if (enabled) {
              consumer.resume();
            } else {
              consumer.pause();
            }
          }
        });

        // Handle participant left
        mediasoupService.onParticipantLeft((participantId: string) => {
          console.log(`Participant left: ${participantId}`);
          cleanupParticipantResources(participantId);
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
                label.id = `label-${participantId}`;
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
      // Cleanup when component unmounts
      if (mediasoupServiceRef.current) {
        mediasoupServiceRef.current.leaveRoom();
      }

      // Clean up all remote participants
      remoteVideosRef.current.forEach((_, participantId) => {
        const actualParticipantId = participantId.split("-")[0];
        cleanupParticipantResources(actualParticipantId);
      });

      // Stop local stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [roomId]);

  const handleLeaveRoom = async () => {
    try {
      // Stop local stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      // Clean up all remote participants
      remoteVideosRef.current.forEach((_, participantId) => {
        const actualParticipantId = participantId.split("-")[0];
        cleanupParticipantResources(actualParticipantId);
      });

      // Leave the room
      if (mediasoupServiceRef.current) {
        await mediasoupServiceRef.current.leaveRoom();
      }

      onLeave();
    } catch (error) {
      console.error("Error leaving room:", error);
    }
  };

  return (
    <div className="video-room">
      <div className="video-grid">
        <div
          className={`video-container local-video ${
            !isVideoEnabled ? "video-disabled" : ""
          }`}
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="video-element"
          />
          <div className="participant-label">
            You ({username.current}) {isAudioEnabled ? "🎤" : "🔇"}
          </div>
        </div>
        <div className="remote-videos" />
      </div>
      <div
        style={{
          padding: "20px",
          backgroundColor: "rgba(0,0,0,0.8)",
          display: "flex",
          justifyContent: "center",
          gap: "20px",
          position: "fixed",
          bottom: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          borderRadius: "10px",
          zIndex: 1000,
        }}
      >
        <Button
          type={!isAudioEnabled ? "default" : "primary"}
          shape="circle"
          icon={!isAudioEnabled ? <AudioMutedOutlined /> : <AudioOutlined />}
          onClick={toggleAudio}
          size="large"
        />

        <Button
          type={isVideoEnabled ? "primary" : "default"}
          shape="circle"
          icon={
            isVideoEnabled ? (
              <VideoCameraOutlined />
            ) : (
              <VideoCameraAddOutlined />
            )
          }
          onClick={toggleVideo}
          size="large"
        />

        <Button
          danger
          shape="circle"
          icon={<CloseOutlined />}
          onClick={handleLeaveRoom}
          size="large"
        />
      </div>
    </div>
  );
};
