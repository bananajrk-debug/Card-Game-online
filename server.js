const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

// ゲームの設定・マス定義
const TOTAL_TILES = 15;
const TILE_TYPES = [
  { type: 'start', name: 'スタート' },
  { type: 'ramen', name: '特製ラーメン (+3kg)', weight: 3 },
  { type: 'run', name: 'ランニング (-2kg)', weight: -2 },
  { type: 'cake', name: 'ケーキ1ホール (+2.5kg)', weight: 2.5 },
  { type: 'minigame', name: '【ミニゲーム】大食い連打！' },
  { type: 'fasting', name: '断食道場 (-4kg)', weight: -4 },
  { type: 'snack', name: '夜食ポテチ (+2kg)', weight: 2 },
  { type: 'buffet', name: '食べ放題バイキング (+4kg)', weight: 4 },
  { type: 'minigame', name: '【ミニゲーム】大食い連打！' },
  { type: 'sleep', name: '食っちゃ寝 (+3.5kg)', weight: 3.5 },
  { type: 'gym', name: 'ジムで汗を流す (-3kg)', weight: -3 },
  { type: 'beer', name: 'ビールと唐揚げ (+3kg)', weight: 3 },
  { type: 'minigame', name: '【ミニゲーム】大食い連打！' },
  { type: 'yakiniku', name: '高級焼肉フルコース (+5kg)', weight: 5 },
  { type: 'goal', name: 'ゴール！' }
];

let gameState = {
  started: false,
  players: [], // { id, name, position, weight, isGoal }
  turnIndex: 0,
  inMinigame: false,
  minigameScores: {} // { socketId: count }
};

io.on('connection', (socket) => {
  console.log('プレイヤー接続:', socket.id);

  // プレイヤー参加登録
  socket.on('joinGame', (playerName) => {
    if (gameState.started) {
      socket.emit('errorMessage', 'ゲームはすでに開始されています');
      return;
    }
    const name = playerName.trim() || `プレイヤー${gameState.players.length + 1}`;
    gameState.players.push({
      id: socket.id,
      name: name,
      position: 0,
      weight: 60.0, // 初期体重 60kg
      isGoal: false
    });

    io.emit('updateGameState', gameState);
  });

  // ホストがゲームを開始
  socket.on('startGame', () => {
    if (gameState.players.length > 0 && !gameState.started) {
      gameState.started = true;
      gameState.turnIndex = 0;
      io.emit('updateGameState', gameState);
      io.emit('logMessage', '🍚 ドカ食い大決戦がスタートしました！ 🍚');
    }
  });

  // サイコロを振る
  socket.on('rollDice', () => {
    const currentPlayer = gameState.players[gameState.turnIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id || gameState.inMinigame) return;

    const dice = Math.floor(Math.random() * 6) + 1;
    let newPos = currentPlayer.position + dice;
    if (newPos >= TOTAL_TILES - 1) {
      newPos = TOTAL_TILES - 1;
      currentPlayer.isGoal = true;
    }
    currentPlayer.position = newPos;

    const currentTile = TILE_TYPES[newPos];
    let logMsg = `${currentPlayer.name} はサイコロで【${dice}】を出して「${currentTile.name}」に止まった！`;

    // サイコロ演出を全員に送信
    io.emit('diceRolled', {
      playerName: currentPlayer.name,
      dice: dice,
      tileName: currentTile.name
    });

    // マスの効果処理
    if (currentTile.type === 'minigame') {
      gameState.inMinigame = true;
      gameState.minigameScores = {};
      
      // サイコロ演出(約1秒)の後にミニゲームスタート通知
      setTimeout(() => {
        io.emit('startMinigame', { message: '🍖 ミニゲーム発生！5秒間ボタンを連打してドカ食いしろ！ 🍖' });
      }, 1200);

      // 5秒後にミニゲーム結果集計
      setTimeout(() => {
        let maxClicks = -1;
        let winners = [];
        for (let p of gameState.players) {
          const score = gameState.minigameScores[p.id] || 0;
          if (score > maxClicks) {
            maxClicks = score;
            winners = [p];
          } else if (score === maxClicks) {
            winners.push(p);
          }
        }
        
        let minigameLog = `【ミニゲーム結果】勝者: ${winners.map(w => w.name).join(', ')} (${maxClicks}回) -> 体重 +3kg!`;
        winners.forEach(w => w.weight += 3);

        gameState.inMinigame = false;
        nextTurn();
        io.emit('updateGameState', gameState);
        io.emit('logMessage', minigameLog);
      }, 6200);

    } else {
      if (currentTile.weight) {
        currentPlayer.weight += currentTile.weight;
        logMsg += ` (体重 ${currentTile.weight > 0 ? '+' : ''}${currentTile.weight}kg)`;
      }
      nextTurn();
      io.emit('updateGameState', gameState);
      io.emit('logMessage', logMsg);
    }
  });

  // ミニゲーム連打カウント
  socket.on('minigameClick', () => {
    if (gameState.inMinigame) {
      gameState.minigameScores[socket.id] = (gameState.minigameScores[socket.id] || 0) + 1;
    }
  });

  // 切断時の処理
  socket.on('disconnect', () => {
    gameState.players = gameState.players.filter(p => p.id !== socket.id);
    if (gameState.players.length === 0) {
      gameState.started = false;
      gameState.turnIndex = 0;
    }
    io.emit('updateGameState', gameState);
  });
});

function nextTurn() {
  // 全員ゴールしたか判定
  const allGoal = gameState.players.every(p => p.isGoal);
  if (allGoal) {
    io.emit('gameOver', gameState.players);
    return;
  }

  // ゴールしていない次のプレイヤーへ
  do {
    gameState.turnIndex = (gameState.turnIndex + 1) % gameState.players.length;
  } while (gameState.players[gameState.turnIndex].isGoal);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
