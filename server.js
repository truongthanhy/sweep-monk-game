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

// Trạng thái Server Game Realtime
const gameState = {
  players: {},
  leaves: [],
  abbotId: null,
  blessingActive: false,
  blessingTimer: null
};

// Khởi tạo lá đa ban đầu
function spawnInitialLeaves() {
  if (gameState.leaves.length < 30) {
    for (let i = gameState.leaves.length; i < 30; i++) {
      gameState.leaves.push({
        id: Math.random().toString(36).substr(2, 9),
        x: 150 + Math.random() * (1200 - 300),
        y: 200 + Math.random() * (700 - 350),
        rotation: Math.random() * Math.PI * 2,
        scale: 0.8 + Math.random() * 0.4
      });
    }
  }
}
spawnInitialLeaves();

// Tự động rơi lá theo thời gian
setInterval(() => {
  const maxLeaves = gameState.blessingActive ? 60 : 35;
  if (gameState.leaves.length < maxLeaves) {
    const newLeaf = {
      id: Math.random().toString(36).substr(2, 9),
      x: 150 + Math.random() * (1200 - 300),
      y: 200 + Math.random() * (700 - 350),
      rotation: Math.random() * Math.PI * 2,
      scale: 0.8 + Math.random() * 0.4
    };
    gameState.leaves.push(newLeaf);
    io.emit('leafSpawned', newLeaf);
  }
}, 2000);

io.on('connection', (socket) => {
  console.log(`[+] Người chơi kết nối: ${socket.id}`);

  // Khi có người chơi tham gia
  socket.on('joinGame', (data) => {
    let role = data.role || 'monk';
    
    // Nếu chưa có Trụ trì và user chọn làm Trụ trì
    if (role === 'abbot' && !gameState.abbotId) {
      gameState.abbotId = socket.id;
    } else if (role === 'abbot' && gameState.abbotId) {
      role = 'monk'; // Đã có Trụ trì -> ép về Chú tiểu
    }

    gameState.players[socket.id] = {
      id: socket.id,
      name: data.name || 'Chú Tiểu Thiền',
      role: role,
      x: role === 'abbot' ? 600 : 200 + Math.random() * 800,
      y: role === 'abbot' ? 220 : 350 + Math.random() * 300,
      merit: 0,
      sweeps: 0,
      animFrame: 0,
      facing: 'right'
    };

    // Gửi toàn bộ trạng thái hiện tại cho người chơi mới
    socket.emit('initGameState', {
      playerId: socket.id,
      players: gameState.players,
      leaves: gameState.leaves,
      blessingActive: gameState.blessingActive
    });

    // Thông báo cho người chơi khác
    socket.broadcast.emit('playerJoined', gameState.players[socket.id]);
  });

  // Di chuyển người chơi
  socket.on('playerMove', (pos) => {
    if (gameState.players[socket.id]) {
      const p = gameState.players[socket.id];
      if (pos.x < p.x) p.facing = 'left';
      else if (pos.x > p.x) p.facing = 'right';
      
      p.x = pos.x;
      p.y = pos.y;
      p.animFrame = (p.animFrame + 0.2) % 4;

      socket.broadcast.emit('playerMoved', {
        id: socket.id,
        x: p.x,
        y: p.y,
        facing: p.facing,
        animFrame: p.animFrame
      });
    }
  });

  // Sự kiện quét lá
  socket.on('sweepLeaf', (leafId) => {
    const leafIndex = gameState.leaves.findIndex(l => l.id === leafId);
    if (leafIndex !== -1 && gameState.players[socket.id]) {
      gameState.leaves.splice(leafIndex, 1);
      
      const p = gameState.players[socket.id];
      const points = gameState.blessingActive ? 20 : 10;
      p.merit += points;
      p.sweeps += 1;

      io.emit('leafSwept', {
        leafId: leafId,
        playerId: socket.id,
        points: points,
        totalMerit: p.merit
      });
    }
  });

  // Trụ Trì Ban Phước
  socket.on('castBlessing', () => {
    if (socket.id === gameState.abbotId && !gameState.blessingActive) {
      gameState.blessingActive = true;
      
      // Thêm ngay 15 lá
      for (let i = 0; i < 15; i++) {
        const newLeaf = {
          id: Math.random().toString(36).substr(2, 9),
          x: 150 + Math.random() * (1200 - 300),
          y: 200 + Math.random() * (700 - 350),
          rotation: Math.random() * Math.PI * 2,
          scale: 0.8 + Math.random() * 0.4
        };
        gameState.leaves.push(newLeaf);
      }

      io.emit('blessingStarted', { leaves: gameState.leaves });

      // Hết hiệu lực sau 15 giây
      setTimeout(() => {
        gameState.blessingActive = false;
        io.emit('blessingEnded');
      }, 15000);
    }
  });

  // Ngắt kết nối
  socket.on('disconnect', () => {
    console.log(`[-] Người chơi rời đi: ${socket.id}`);
    if (socket.id === gameState.abbotId) {
      gameState.abbotId = null;
    }
    delete gameState.players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
});