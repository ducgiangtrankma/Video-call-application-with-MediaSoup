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

interface RemoteStream {
  id: string;
  stream: MediaStream;
  username: string;
  kind: "audio" | "video";
  isEnabled: boolean;
}

interface VideoRoomProps {
  roomId: string;
  role?: "broadcaster" | "viewer";
  onLeave: () => void;
}

// Tách thành component riêng để tối ưu render
const RemoteVideo = React.memo(
  ({
    stream,
    isEnabled,
    username,
    audioEnabled,
  }: {
    stream: MediaStream;
    isEnabled: boolean;
    username: string;
    audioEnabled?: boolean;
  }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    }, [stream]);

    return (
      <div
        className={`video-container remote-video ${
          !isEnabled ? "video-disabled" : ""
        }`}
      >
        <video ref={videoRef} autoPlay playsInline className="video-element" />
        <div className="participant-label">
          {username}
          {typeof audioEnabled !== "undefined"
            ? audioEnabled
              ? " 🎤"
              : " 🔇"
            : ""}
        </div>
      </div>
    );
  }
);

// Tách audio element thành component riêng
const RemoteAudio = React.memo(({ stream }: { stream: MediaStream }) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.srcObject = stream;
    }
  }, [stream]);

  return <audio ref={audioRef} autoPlay />;
});

export const VideoRoom: React.FC<VideoRoomProps> = ({
  roomId,
  role = "broadcaster",
  onLeave,
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const mediasoupServiceRef = useRef<MediasoupService | null>(null);
  const participantIdRef = useRef<string>(crypto.randomUUID());
  const username = useRef<string>(`User ${Math.floor(Math.random() * 1000)}`);
  const streamRef = useRef<MediaStream | null>(null);

  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);

  const toggleAudio = () => {
    if (streamRef.current && role === "broadcaster") {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled;
        setIsAudioEnabled(!isAudioEnabled);
        mediasoupServiceRef.current?.updateMediaState("audio", !isAudioEnabled);
      }
    }
  };

  const toggleVideo = () => {
    if (streamRef.current && role === "broadcaster") {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled;
        setIsVideoEnabled(!isVideoEnabled);
        mediasoupServiceRef.current?.updateMediaState("video", !isVideoEnabled);
      }
    }
  };

  useEffect(() => {
    const initializeMedia = async () => {
      try {
        console.log("Starting media initialization...");

        // Create MediasoupService instance
        mediasoupServiceRef.current = new MediasoupService();
        const mediasoupService = mediasoupServiceRef.current;

        // Only get user media for broadcasters
        if (role === "broadcaster") {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });

          streamRef.current = stream;

          // Display local video
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        }

        // Handle disconnection
        mediasoupService.onDisconnect(() => {
          console.log("Handling disconnect");
          // Clear all remote streams
          setRemoteStreams([]);
        });

        // Handle media state changes from other participants
        mediasoupService.onMediaStateChange((participantId, kind, enabled) => {
          console.log(
            `Media state changed for ${participantId}: ${kind} ${
              enabled ? "enabled" : "disabled"
            }`
          );

          setRemoteStreams((prev) =>
            prev.map((stream) => {
              if (stream.id === participantId && stream.kind === kind) {
                return { ...stream, isEnabled: enabled };
              }
              return stream;
            })
          );

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
          // Remove streams for this participant
          setRemoteStreams((prev) =>
            prev.filter((stream) => stream.id !== participantId)
          );
        });

        // Set up consumer handler
        mediasoupService.onNewConsumer(
          (consumer, participantId, username, kind) => {
            console.log(
              `New consumer for participant: ${participantId}, kind: ${kind}`
            );

            const stream = new MediaStream([consumer.track]);

            setRemoteStreams((prev) => {
              // Check if we already have this stream
              const exists = prev.some(
                (s) => s.id === participantId && s.kind === kind
              );
              if (exists) return prev;

              // Add new stream
              return [
                ...prev,
                {
                  id: participantId,
                  stream,
                  username,
                  kind: kind as "audio" | "video",
                  isEnabled: true,
                },
              ];
            });
          }
        );

        // Join the room and load device
        console.log("Joining room...");
        await mediasoupService.setRoomId(
          roomId,
          participantIdRef.current,
          username.current
        );

        // Only create send transport and produce media for broadcasters
        if (role === "broadcaster") {
          // Create send transport
          console.log("Creating send transport...");
          const sendTransport = await mediasoupService.createSendTransport();
          if (!sendTransport) {
            throw new Error("Failed to create send transport");
          }

          if (streamRef.current) {
            // Produce video track
            console.log("Producing video track...");
            const videoTrack = streamRef.current.getVideoTracks()[0];
            await mediasoupService.produce(
              videoTrack,
              participantIdRef.current,
              "video"
            );

            // Produce audio track
            console.log("Producing audio track...");
            const audioTrack = streamRef.current.getAudioTracks()[0];
            await mediasoupService.produce(
              audioTrack,
              participantIdRef.current,
              "audio"
            );
          }
        }

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

      // Stop all remote streams
      remoteStreams.forEach((remoteStream) => {
        remoteStream.stream.getTracks().forEach((track) => track.stop());
      });

      // Stop local stream for broadcasters
      if (streamRef.current && role === "broadcaster") {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [roomId, role]);

  const handleLeaveRoom = async () => {
    try {
      // Stop local stream for broadcasters
      if (streamRef.current && role === "broadcaster") {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      // Stop all remote streams
      remoteStreams.forEach((remoteStream) => {
        remoteStream.stream.getTracks().forEach((track) => track.stop());
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
      <div>{remoteStreams.length}</div>
      <div className="video-grid">
        {role === "broadcaster" && (
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
              <span className="role-badge broadcaster">Broadcaster</span>
            </div>
          </div>
        )}
        <div className="remote-videos">
          {role === "viewer" && remoteStreams.length === 0 && (
            <div className="viewer-info">
              Waiting for broadcaster...
              <span className="role-badge viewer">Viewer</span>
            </div>
          )}
          {remoteStreams
            .filter((stream) => stream.kind === "video")
            .map((remoteStream) => {
              const audioStream = remoteStreams.find(
                (stream) =>
                  stream.id === remoteStream.id && stream.kind === "audio"
              );

              return (
                <RemoteVideo
                  key={remoteStream.id}
                  stream={remoteStream.stream}
                  isEnabled={remoteStream.isEnabled}
                  username={remoteStream.username}
                  audioEnabled={audioStream?.isEnabled}
                />
              );
            })}
        </div>
      </div>
      <div className="controls">
        {role === "broadcaster" && (
          <>
            <Button
              type={!isAudioEnabled ? "default" : "primary"}
              shape="circle"
              icon={
                !isAudioEnabled ? <AudioMutedOutlined /> : <AudioOutlined />
              }
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
          </>
        )}

        <Button
          danger
          shape="circle"
          icon={<CloseOutlined />}
          onClick={handleLeaveRoom}
          size="large"
        />
      </div>
      {/* Hidden audio elements for remote audio streams */}
      {remoteStreams
        .filter((stream) => stream.kind === "audio")
        .map((audioStream) => (
          <RemoteAudio key={audioStream.id} stream={audioStream.stream} />
        ))}
    </div>
  );
};
