const io = require('socket.io')(3001, { cors: { origin: "*" } });
let users = {};

io.on('connection', (socket) => {
  socket.on("join", ({ username }) => {
    users[socket.id] = username;
    // Notify the other player
    socket.broadcast.emit("opponent-join", { username });
  });
  socket.on("send-stroke", (stroke) => {
    socket.broadcast.emit("receive-stroke", stroke);
  });
  socket.on("clear", () => {
    socket.broadcast.emit("opponent-clear");
  });
  socket.on("disconnect", () => {
    socket.broadcast.emit("opponent-leave");
    delete users[socket.id];
  });
});

console.log("Server running!")