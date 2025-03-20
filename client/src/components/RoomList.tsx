import React, { useEffect, useState } from "react";
import { RoomService } from "../services/room.service";

interface Participant {
  id: string;
  name: string;
  joinedAt: Date;
}

interface Room {
  id: string;
  participants: Participant[];
  createdAt: Date;
}

export const RoomList: React.FC<{
  onJoinRoom: (roomId: string) => void;
}> = ({ onJoinRoom }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [newRoomId, setNewRoomId] = useState("");
  const [username, setUsername] = useState("");
  const roomService = new RoomService();

  useEffect(() => {
    loadRooms();
  }, []);

  const loadRooms = async () => {
    const rooms = await roomService.getRooms();
    setRooms(rooms);
  };

  const handleCreateRoom = async () => {
    if (!newRoomId || !username) {
      alert("Please enter both room ID and username");
      return;
    }

    await roomService.joinRoom(newRoomId, username);
    onJoinRoom(newRoomId);
    setNewRoomId("");
  };

  const handleJoinRoom = async (roomId: string) => {
    if (!username) {
      alert("Please enter your username");
      return;
    }

    await roomService.joinRoom(roomId, username);
    onJoinRoom(roomId);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-3xl font-bold mb-8 text-center">Video Chat Rooms</h2>

      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h3 className="text-xl font-semibold mb-4">Create New Room</h3>
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
            Create Room
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-xl font-semibold mb-4">Available Rooms</h3>
        <div className="space-y-4">
          {rooms.map((room) => (
            <div
              key={room.id}
              className="border rounded-md p-4 flex justify-between items-center hover:bg-gray-50"
            >
              <div>
                <h4 className="font-semibold">Room {room.id}</h4>
                <p className="text-sm text-gray-600">
                  {room.participants.length} participants
                </p>
                <p className="text-xs text-gray-500">
                  Created {new Date(room.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => handleJoinRoom(room.id)}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
              >
                Join Room
              </button>
            </div>
          ))}
          {rooms.length === 0 && (
            <p className="text-center text-gray-500">No rooms available</p>
          )}
        </div>
      </div>
    </div>
  );
};
