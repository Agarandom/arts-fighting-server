const port = process.env.PORT || 3001;
const io = require('socket.io')(port, { cors: { origin: "*" } });

let users = {};
let queue = []; // players waiting for a match
let matches = {}; // socket.id: match object

const PROMPTS = [
  "Draw a mountain", "Draw a cat", "Draw a castle", "Draw a robot", "Draw a fish"
];

function getRandomPrompt() {
  return PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
}

function startMatch(p1, p2) {
  const match = {
    players: [p1, p2],
    prompt: getRandomPrompt(),
    roundStartTime: Date.now(),
    timer: 60,
    winner: null,
    strokes: { [p1]: [], [p2]: [] }
  };
  matches[p1] = match;
  matches[p2] = match;

  io.to(p1).emit("round-start", {
    prompt: match.prompt,
    roundStartTime: match.roundStartTime,
    timer: match.timer,
    players: [users[p1], users[p2]],
    youAre: 0
  });
  io.to(p2).emit("round-start", {
    prompt: match.prompt,
    roundStartTime: match.roundStartTime,
    timer: match.timer,
    players: [users[p1], users[p2]],
    youAre: 1
  });
}

function endMatch(p1, p2, winnerName) {
  io.to(p1).emit("round-ended", { winner: winnerName });
  io.to(p2).emit("round-ended", { winner: winnerName });
  delete matches[p1];
  delete matches[p2];
}

io.on('connection', (socket) => {
  socket.on("join", ({ username }) => {
    users[socket.id] = username;
    queue.push(socket.id);
    tryMatch();
  });

  function tryMatch() {
    while (queue.length >= 2) {
      const [p1, p2] = [queue.shift(), queue.shift()];
      if (users[p1] && users[p2]) startMatch(p1, p2);
    }
  }

  socket.on("send-stroke", (stroke) => {
    const match = matches[socket.id];
    if (!match) return;
    const opponent = match.players.find(id => id !== socket.id);
    socket.broadcast.to(opponent).emit("receive-stroke", stroke);
    // Track strokes for undo
    match.strokes[socket.id] = match.strokes[socket.id] || [];
    match.strokes[socket.id].push(stroke);
  });

  socket.on("undo", () => {
    const match = matches[socket.id];
    if (!match) return;
    match.strokes[socket.id] = match.strokes[socket.id] || [];
    match.strokes[socket.id].pop();
    const opponent = match.players.find(id => id !== socket.id);
    io.to(opponent).emit("opponent-undo");
    io.to(socket.id).emit("undo-confirm"); // For local user to update as well
  });

  socket.on("clear", () => {
    const match = matches[socket.id];
    if (!match) return;
    match.strokes[socket.id] = [];
    const opponent = match.players.find(id => id !== socket.id);
    io.to(opponent).emit("opponent-clear");
  });

  socket.on("end-round", () => {
    const match = matches[socket.id];
    if (!match) return;
    const [p1, p2] = match.players;
    if (!match.ended) {
      match.ended = true;
      // MVP: random winner, synced
      const winnerName = [users[p1], users[p2]][Math.floor(Math.random() * 2)];
      endMatch(p1, p2, winnerName);
    }
  });

  socket.on("play-again", () => {
    // Return player to queue for next match
    if (!queue.includes(socket.id)) queue.push(socket.id);
    tryMatch();
  });

  socket.on("disconnect", () => {
    // Remove from queue
    queue = queue.filter(id => id !== socket.id);

    // If in match, notify opponent and remove both
    const match = matches[socket.id];
    if (match) {
      match.players.forEach(pid => {
        if (pid !== socket.id) {
          io.to(pid).emit("opponent-leave");
          delete matches[pid];
        }
      });
      delete matches[socket.id];
    }
    delete users[socket.id];
  });
});

console.log("Socket.io server running on port", port);
