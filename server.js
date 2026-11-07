const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

// File Database giả lập đơn giản lưu trữ điểm người chơi
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
const gameState = { players: {}, abbotId: null, blessingActive: false };

// Hàm tính cấp bậc dựa trên tổng Phước Đức
function getTitleAndRole(merit, requestedRole) {
  if (requestedRole === 'abbot') return { title: '🧙‍♂️ Trụ Trì', role: 'abbot' };
  if (merit >= 500) return { title: '🧘‍♂️ Sư Thầy Thâm Viễn', role: 'monk' };
  if (merit >= 200) return { title: '🌿 Chú Tiểu Giác Ngộ', role: 'monk' };
  return { title: '👶 Chú Tiểu Tập Sự', role: 'monk' };
}

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
  console.log(`[+] Kết nối: ${socket.id}`);

  socket.on('joinGame', (data) => {
    let name = data.name || 'Chú Tiểu';
    
    // Nạp hoặc khởi tạo dữ liệu user từ database
    if (!userDB[name]) {
      userDB[name] = { merit: 0, sweeps: 0 };
    }

    let roleData = getTitleAndRole(userDB[name].merit, data.role);
    if (roleData.role === 'abbot' && gameState.abbotId && gameState.abbotId !== socket.id) {
      roleData.role = 'monk'; // Nếu có trụ trì rồi thì ép về chú tiểu
    }
    if (roleData.role === 'abbot') gameState.abbotId = socket.id;

    const initialLeaves = [];
    for (let i = 0; i < 20; i++) initialLeaves.push(createRandomLeaf());

    gameState.players[socket.id] = {
      id: socket.id,
      name: name,
      title: roleData.title,
      role: roleData.role,
      x: 300 + Math.random() * 600,
      y: 400 + Math.random() * 200,
      merit: userDB[name].merit,
      sweeps: userDB[name].sweeps,
      facing: 'right',
      leaves: initialLeaves
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
      p.facing = pos.x < p.x ? 'left' : (pos.x > p.x ? 'right' : p.facing);
      p.x = pos.x;
      p.y = pos.y;
      socket.broadcast.emit('playerMoved', { id: socket.id, x: p.x, y: p.y, facing: p.facing });
    }
  });

  socket.on('sweepLeaf', (leafId) => {
    const p = gameState.players[socket.id];
    if (p && p.role === 'monk') {
      const leafIndex = p.leaves.findIndex(l => l.id === leafId);
      if (leafIndex !== -1) {
        p.leaves.splice(leafIndex, 1);
        
        const points = gameState.blessingActive ? 20 : 10;
        p.merit += points;
        p.sweeps += 1;
        p.leaves.push(createRandomLeaf());

        // Cập nhật cấp bậc tự động khi đạt mốc phước đức
        if (p.merit >= 500) p.title = '🧘‍♂️ Sư Thầy Thâm Viễn';
        else if (p.merit >= 200) p.title = '🌿 Chú Tiểu Giác Ngộ';
        else p.title = '👶 Chú Tiểu Tập Sự';

        // Lưu vào Database vĩnh viễn
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
    if (socket.id === gameState.abbotId) gameState.abbotId = null;
    delete gameState.players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server chạy cổng ${PORT}`));