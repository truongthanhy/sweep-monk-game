const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

const gameState = {
  players: {},
  abbotId: null,
  blessingActive: false
};

// Tạo lá ngẫu nhiên
function createRandomLeaf() {
  return {
    id: Math.random().toString(36).substr(2, 9),
    x: 180 + Math.random() * 840,
    y: 280 + Math.random() * 340,
    rotation: Math.random() * Math.PI * 2,
    scale: 0.8 + Math.random() * 0.4
  };
}

io.on('connection', (socket) => {
  console.log(`[+] Người chơi kết nối: ${socket.id}`);

  socket.on('joinGame', (data) => {
    let role = data.role || 'monk';
    if (role === 'abbot' && !gameState.abbotId) {
      gameState.abbotId = socket.id;
    } else if (role === 'abbot' && gameState.abbotId) {
      role = 'monk';
    }

    // Khởi tạo mỗi Chú Tiểu có sẵn một bộ lá đa độc lập để quét (giải quyết triệt để lỗi tranh chấp)
    const initialLeaves = [];
    for (let i = 0; i < 20; i++) {
      initialLeaves.push(createRandomLeaf());
    }

    gameState.players[socket.id] = {
      id: socket.id,
      name: data.name || 'Chú Tiểu Thiền',
      role: role,
      x: role === 'abbot' ? 600 : 300 + Math.random() * 600,
      y: role === 'abbot' ? 240 : 400 + Math.random() * 200,
      merit: 0,
      sweeps: 0,
      facing: 'right',
      leaves: initialLeaves // Lá đa riêng của chú tiểu này
    };

    socket.emit('initGameState', {
      playerId: socket.id,
      players: gameState.players,
      blessingActive: gameState.blessingActive
    });

    socket.broadcast.emit('playerJoined', gameState.players[socket.id]);
  });

  socket.on('playerMove', (pos) => {
    if (gameState.players[socket.id]) {
      const p = gameState.players[socket.id];
      if (pos.x < p.x) p.facing = 'left';
      else if (pos.x > p.x) p.facing = 'right';
      
      p.x = pos.x;
      p.y = pos.y;

      socket.broadcast.emit('playerMoved', {
        id: socket.id,
        x: p.x,
        y: p.y,
        facing: p.facing
      });
    }
  });

  // Khi chú tiểu quét sạch lá của mình -> tự động sinh lá mới cho riêng họ
  socket.on('sweepLeaf', (leafId) => {
    const p = gameState.players[socket.id];
    if (p && p.role === 'monk') {
      const leafIndex = p.leaves.findIndex(l => l.id === leafId);
      if (leafIndex !== -1) {
        p.leaves.splice(leafIndex, 1);
        
        const points = gameState.blessingActive ? 20 : 10;
        p.merit += points;
        p.sweeps += 1;

        // Sinh bù lá mới cho chú tiểu này
        p.leaves.push(createRandomLeaf());

        io.emit('updatePlayerScore', {
          playerId: socket.id,
          merit: p.merit,
          sweeps: p.sweeps,
          leaves: p.leaves
        });
      }
    }
  });

  socket.on('castBlessing', () => {
    if (socket.id === gameState.abbotId && !gameState.blessingActive) {
      gameState.blessingActive = true;
      io.emit('blessingStarted');

      setTimeout(() => {
        gameState.blessingActive = false;
        io.emit('blessingEnded');
      }, 15000);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[-] Người chơi rời đi: ${socket.id}`);
    if (socket.id === gameState.abbotId) {
      gameState.abbotId = null;
    }
    delete gameState.players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại cổng ${PORT}`);
});