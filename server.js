const { Server } = require("socket.io");
const io = new Server(3001, {
  cors: {
    origin: "*"
  }
});

let waiting = null;

io.on("connection", (socket) => {
  // Player joins
  socket.on("join", (username) => {
    if (waiting && waiting.id !== socket.id) {
      // Pair the two players
      const room = `room-${waiting.id}-${socket.id}`;
      socket.join(room);
      waiting.join(room);
      // Send prompt to both
      const promptList = ["cat", "mountain", "apple", "car", "tree", "castle", "bird", "fish"];
      const prompt = promptList[Math.floor(Math.random() * promptList.length)];
      io.to(room).emit("start", { room, prompt });
      // Save opponent socket
      socket.room = room;
      waiting.room = room;
      waiting = null;
    } else {
      // Wait for next player
      waiting = socket;
    }
  });

  // Forward drawing events
  socket.on("stroke", (data) => {
    if (socket.room) {
      socket.to(socket.room).emit("stroke", data);
    }
  });

  // Handle "submit"
  socket.on("submit", () => {
    if (socket.room) {
      socket.to(socket.room).emit("opponent-submitted");
    }
  });

  socket.on("disconnect", () => {
    if (waiting && waiting.id === socket.id) waiting = null;
  });
});

console.log("Socket.io server running on :3001");
