const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

// File Database lưu trữ điểm và số lá đã quét vĩnh viễn
const DB_FILE = path.join(__dirname, 'database.json');

function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (e) { console.error(e); }
  return {};
}

function saveDatabase(db) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) { console.error(e); }
}

let userDB = loadDatabase();
const gameState = { players: {}, blessingActive: false, chatMessages: [] };

// Hàm phân cấp bậc & trang phục dựa trên tổng Phước Đức
function getTitleData(merit) {
  if (merit >= 500) return { title: '🧘‍♂️ Sư Thầy Thâm Viễn', outfit: 'saffron', points: 20 };
  return { title: '👶 Chú Tiểu Tập Sự', outfit: 'brown', points: 10 };
}

// Tạo lá rơi CHỈ ở phần sân phía dưới (nửa dưới màn hình)
function createRandomLeaf() {
  return {
    id: Math.random().toString(36).substr(2, 9),
    x: 180 + Math.random() * 840,
    y: 340 + Math.random() * 300, 
    rotation: Math.random() * Math.PI * 2,
    scale: 0.8 + Math.random() * 0.4
  };
}

io.on('connection', (socket) => {
  console.log(`[+] Kết nối: ${socket.id}`);

  socket.on('joinGame', (data) => {
    try {
      let name = (data && data.name) ? data.name.trim() : 'Chú Tiểu';
      if (!name) name = 'Chú Tiểu';
      
      if (!userDB[name]) {
        userDB[name] = { merit: 0, sweeps: 0 };
      }

      let rankData = getTitleData(userDB[name].merit);

      const initialLeaves = [];
      for (let i = 0; i < 20; i++) initialLeaves.push(createRandomLeaf());

      gameState.players[socket.id] = {
        id: socket.id,
        name: name,
        title: rankData.title,
        outfit: rankData.outfit,
        x: 300 + Math.random() * 600,
        y: 450 + Math.random() * 150,
        merit: userDB[name].merit,
        sweeps: userDB[name].sweeps,
        facing: 'right',
        leaves: initialLeaves
      };

      socket.emit('initGameState', {
        playerId: socket.id,
        players: gameState.players,
        blessingActive: gameState.blessingActive,
        chatMessages: gameState.chatMessages || []
      });

      socket.broadcast.emit('playerJoined', gameState.players[socket.id]);
    } catch (err) {
      console.error("Lỗi khi joinGame:", err);
    }
  });

  socket.on('playerMove', (pos) => {
    if (gameState.players[socket.id]) {
      const p = gameState.players[socket.id];
      p.facing = pos.x < p.x ? 'left' : (pos.x > p.x ? 'right' : p.facing);
      p.x = pos.x;
      p.y = pos.y;
      socket.broadcast.emit('playerMoved', { id: socket.id, x: p.x, y: p.y, facing: p.facing });
    }
  });

  socket.on('sweepLeaf', (leafId) => {
    const p = gameState.players[socket.id];
    if (p) {
      const leafIndex = p.leaves.findIndex(l => l.id === leafId);
      if (leafIndex !== -1) {
        p.leaves.splice(leafIndex, 1);
        
        let rankData = getTitleData(p.merit);
        const points = gameState.blessingActive ? rankData.points * 2 : rankData.points;
        
        p.merit += points;
        p.sweeps += 1;
        p.leaves.push(createRandomLeaf());

        // Kiểm tra thăng cấp tự động
        rankData = getTitleData(p.merit);
        p.title = rankData.title;
        p.outfit = rankData.outfit;

        // Lưu vào Database
        if (userDB[p.name]) {
          userDB[p.name].merit = p.merit;
          userDB[p.name].sweeps = p.sweeps;
          saveDatabase(userDB);
        }

        io.emit('updatePlayerScore', {
          playerId: socket.id,
          merit: p.merit,
          sweeps: p.sweeps,
          title: p.title,
          outfit: p.outfit,
          leaves: p.leaves
        });
      }
    }
  });

  // Xử lý Chat toàn tự
  socket.on('sendChatMessage', (msg) => {
    const p = gameState.players[socket.id];
    if (p && msg && msg.trim()) {
      const chatMsg = { name: p.name, msg: msg.trim().substring(0, 100), time: Date.now() };
      gameState.chatMessages.push(chatMsg);
      if (gameState.chatMessages.length > 50) gameState.chatMessages.shift();
      io.emit('newChatMessage', chatMsg);
    }
  });

  socket.on('disconnect', () => {
    delete gameState.players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server chạy cổng ${PORT}`));