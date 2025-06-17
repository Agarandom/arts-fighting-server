const port = process.env.PORT || 3001;
const io = require('socket.io')(port, { cors: { origin: "*" } });

let users = {};        // socket.id: username
let queue = [];        // Players waiting for a match
let matches = {};      // socket.id: match object
let rematchBlock = {}; // Prevents instant rematch

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
    // Don't queue yet! Only after "play-again"
    socket.emit("joined");
  });

  function tryMatch() {
    for (let i = 0; i < queue.length; ++i) {
      for (let j = i + 1; j < queue.length; ++j) {
        const p1 = queue[i], p2 = queue[j];
        if (!rematchBlock[p1] || rematchBlock[p1] !== p2) {
          queue = queue.filter(id => id !== p1 && id !== p2);
          startMatch(p1, p2);
          return;
        }
      }
    }
  }

  socket.on("play-again", () => {
    if (!queue.includes(socket.id)) queue.push(socket.id);
    delete rematchBlock[socket.id];
    tryMatch();
  });

  socket.on("send-stroke", (stroke) => {
    const match = matches[socket.id];
    if (!match) return;
    const opponent = match.players.find(id => id !== socket.id);
    io.to(opponent).emit("receive-stroke", stroke);
    match.strokes[socket.id] = match.strokes[socket.id] || [];
    match.strokes[socket.id].push(stroke);
  });

  socket.on("undo", () => {
    const match = matches[socket.id];
    if (!match) return;
    match.strokes[socket.id] = match.strokes[socket.id] || [];
    match.strokes[socket.id].pop();
    const opponent = match.players.find(id => id !== socket.id);
    io.to(socket.id).emit("undo-confirm");
    io.to(opponent).emit("opponent-undo");
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
      // Prevent instant rematch
      rematchBlock[p1] = p2;
      rematchBlock[p2] = p1;
      const winnerName = [users[p1], users[p2]][Math.floor(Math.random() * 2)];
      endMatch(p1, p2, winnerName);
    }
  });

  socket.on("disconnect", () => {
    queue = queue.filter(id => id !== socket.id);
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
    delete rematchBlock[socket.id];
  });
});

console.log("Socket.io server running on port", port);
