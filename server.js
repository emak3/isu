const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 静的ファイルの提供
app.use(express.static(path.join(__dirname, 'public')));

// 教室データの保存用オブジェクト
const classrooms = {};

// Socket.io接続処理
io.on('connection', (socket) => {
  console.log('新しいユーザーが接続しました:', socket.id);
  let currentRoom = null;

  // 部屋に参加
  socket.on('joinRoom', (roomId) => {
    // 前の部屋から離れる
    if (currentRoom) {
      socket.leave(currentRoom);
    }

    currentRoom = roomId;
    socket.join(currentRoom);
    console.log(`ユーザー ${socket.id} が部屋 ${roomId} に参加しました`);

    // この部屋が初めてなら初期化
    if (!classrooms[roomId]) {
      classrooms[roomId] = {
        students: [],
        gridConfig: {
          rows: 5,
          cols: 5,
          disabledSeats: []
        },
        assignedSeats: Array(25).fill(null),
        timestamp: Date.now()
      };
    }

    // 現在の部屋のデータを送信
    socket.emit('roomData', classrooms[roomId]);
  });

  // 生徒データの更新
  socket.on('updateStudents', (data) => {
    if (!currentRoom) return;

    classrooms[currentRoom].students = data;
    classrooms[currentRoom].timestamp = Date.now();
    
    // 同じ部屋の他のクライアントに更新を通知（送信者以外）
    socket.to(currentRoom).emit('studentsUpdated', data);
  });

  // 座席割り当ての更新
  socket.on('updateAssignedSeats', (data) => {
    if (!currentRoom) return;

    classrooms[currentRoom].assignedSeats = data;
    classrooms[currentRoom].timestamp = Date.now();
    
    // 同じ部屋の他のクライアントに更新を通知（送信者以外）
    socket.to(currentRoom).emit('assignedSeatsUpdated', data);
  });

  // グリッド設定の更新
  socket.on('updateGridConfig', (data) => {
    if (!currentRoom) return;

    classrooms[currentRoom].gridConfig = data;
    
    // 座席数が変わった場合は配列サイズを調整
    const totalSeats = data.rows * data.cols;
    if (classrooms[currentRoom].assignedSeats.length !== totalSeats) {
      // 新しい座席数に合わせて配列を再作成
      const newAssignedSeats = Array(totalSeats).fill(null);
      
      // 既存のデータをコピー（範囲内のみ）
      for (let i = 0; i < Math.min(classrooms[currentRoom].assignedSeats.length, totalSeats); i++) {
        newAssignedSeats[i] = classrooms[currentRoom].assignedSeats[i];
      }
      
      classrooms[currentRoom].assignedSeats = newAssignedSeats;
    }
    
    classrooms[currentRoom].timestamp = Date.now();
    
    // 同じ部屋の他のクライアントに更新を通知
    socket.to(currentRoom).emit('gridConfigUpdated', data);
    socket.to(currentRoom).emit('assignedSeatsUpdated', classrooms[currentRoom].assignedSeats);
  });

  // 全データの要求
  socket.on('requestData', () => {
    if (!currentRoom || !classrooms[currentRoom]) return;
    socket.emit('roomData', classrooms[currentRoom]);
  });

  // クライアントが全データをクリア
  socket.on('clearAllData', () => {
    if (!currentRoom) return;
    
    // グリッド設定は保持
    const gridConfig = classrooms[currentRoom].gridConfig || {
      rows: 5,
      cols: 5,
      disabledSeats: []
    };
    
    const totalSeats = gridConfig.rows * gridConfig.cols;
    
    classrooms[currentRoom] = {
      students: [],
      gridConfig: gridConfig,
      assignedSeats: Array(totalSeats).fill(null),
      timestamp: Date.now()
    };
    
    // 同じ部屋の全クライアントに通知（送信者含む）
    io.to(currentRoom).emit('roomData', classrooms[currentRoom]);
  });

  // 切断時の処理
  socket.on('disconnect', () => {
    console.log('ユーザーが切断しました:', socket.id);
    if (currentRoom) {
      socket.leave(currentRoom);
    }
  });
});

// サーバー起動
const PORT = process.env.PORT || 5500;
server.listen(PORT, () => {
  console.log(`サーバーが起動しました: http://localhost:${PORT}`);
});