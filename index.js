let users = {};
let queue = [];
let matches = {};
let rematchBlock = {}; // To prevent instant rematch if one player didn't queue yet

// ... PROMPTS, getRandomPrompt, startMatch, endMatch same as before ...

io.on('connection', (socket) => {
  socket.on("join", ({ username }) => {
    users[socket.id] = username;
    // Don't queue yet! Only after "play-again"
    socket.emit("joined");
  });

  function tryMatch() {
    // Only match players who are NOT in a recent rematch block with each other
    for (let i = 0; i < queue.length; ++i) {
      for (let j = i + 1; j < queue.length; ++j) {
        const p1 = queue[i], p2 = queue[j];
        if (!rematchBlock[p1] || rematchBlock[p1] !== p2) {
          // Remove both from queue and match them
          queue = queue.filter(id => id !== p1 && id !== p2);
          startMatch(p1, p2);
          return;
        }
      }
    }
  }

  socket.on("play-again", () => {
    // Add to queue, but don't let them match immediately with last opponent
    if (!queue.includes(socket.id)) queue.push(socket.id);

    // Remove rematchBlock for this player (they are now ready)
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
      // Mark both players so they don't rematch each other until both re-queued
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
