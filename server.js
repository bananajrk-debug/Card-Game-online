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

    // ★ ここに diceRolled の送信を追加します！
    io.emit('diceRolled', {
      playerName: currentPlayer.name,
      dice: dice,
      tileName: currentTile.name
    });

    // ...以下そのまま
