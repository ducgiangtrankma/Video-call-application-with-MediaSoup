import React, { useState } from "react";

export const RoomList: React.FC<{
  onJoinRoom: (roomId: string) => void;
}> = ({ onJoinRoom }) => {
  const [newRoomId, setNewRoomId] = useState("");
  const [username, setUsername] = useState("");

  const handleCreateRoom = async () => {
    if (!newRoomId || !username) {
      alert("Please enter both room ID and username");
      return;
    }

    onJoinRoom(newRoomId);
    setNewRoomId("");
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-3xl font-bold mb-8 text-center">Video Chat Rooms</h2>

      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h3 className="text-xl font-semibold mb-4">Join Video Room</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your Name
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your name"
              className="w-full border rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Room ID
            </label>
            <input
              type="text"
              value={newRoomId}
              onChange={(e) => setNewRoomId(e.target.value)}
              placeholder="Enter room ID"
              className="w-full border rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleCreateRoom}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Join Room
          </button>
        </div>
      </div>
    </div>
  );
};
