const port = process.env.PORT || 3001;
const io = require('socket.io')(port, { cors: { origin: "*" } });

let users = {};
let gameState = {
  prompt: null,
  roundStartTime: null,
  timer: 60,
  players: [],
  winner: null
};

const PROMPTS = [
  "Draw a mountain", "Draw a cat", "Draw a castle", "Draw a robot", "Draw a fish"
];
function getRandomPrompt() {
  return PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
}

function broadcastGameState() {
  io.emit("game-state", {
    ...gameState,
    players: gameState.players.map(id => users[id] || "Opponent"),
  });
}

function startRound() {
  gameState.prompt = getRandomPrompt();
  gameState.roundStartTime = Date.now();
  gameState.timer = 60;
  gameState.winner = null;
  broadcastGameState();
  io.emit("round-start", {
    prompt: gameState.prompt,
    roundStartTime: gameState.roundStartTime,
    timer: gameState.timer,
    players: gameState.players.map(id => users[id] || "Opponent"),
  });
}

io.on('connection', (socket) => {
  socket.on("join", ({ username }) => {
    users[socket.id] = username;

    // If this is the only player, reset everything (stateless MVP)
    if (Object.keys(users).length === 1) {
      gameState.players = [socket.id];
    } else if (!gameState.players.includes(socket.id)) {
      gameState.players.push(socket.id);
    }

    // When 2 players, start the round
    if (gameState.players.length === 2) {
      startRound();
    } else {
      broadcastGameState();
    }
  });

  socket.on("send-stroke", (stroke) => {
    socket.broadcast.emit("receive-stroke", stroke);
  });

  socket.on("clear", () => {
    socket.broadcast.emit("opponent-clear");
  });

  socket.on("end-round", () => {
    if (gameState.players.length === 2) {
      const [p1, p2] = gameState.players;
      const winnerIndex = Math.floor(Math.random() * 2);
      gameState.winner = users[winnerIndex === 0 ? p1 : p2];
      io.emit("round-ended", { winner: gameState.winner });
    }
  });

  socket.on("play-again", () => {
    if (gameState.players.length === 2) {
      startRound();
    }
  });

  socket.on("disconnect", () => {
    gameState.players = gameState.players.filter(id => id !== socket.id);
    delete users[socket.id];
    broadcastGameState();
    io.emit("opponent-leave");
  });
});

console.log("Socket.io server running on port", port);
