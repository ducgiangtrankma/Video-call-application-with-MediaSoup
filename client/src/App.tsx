import React, { useState } from "react";
import { RoomList } from "./components/RoomList";
import { VideoRoom } from "./components/VideoRoom";
import "./App.css";

function App() {
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);

  const handleJoinRoom = (roomId: string) => {
    setCurrentRoom(roomId);
  };

  const handleLeaveRoom = () => {
    setCurrentRoom(null);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {currentRoom ? (
        <VideoRoom roomId={currentRoom} onLeave={handleLeaveRoom} />
      ) : (
        <RoomList onJoinRoom={handleJoinRoom} />
      )}
    </div>
  );
}

export default App;
