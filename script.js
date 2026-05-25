const boardEl = document.querySelector("#board");
const fxLayer = document.querySelector("#fxLayer");
const turnLabel = document.querySelector("#turnLabel");
const gameStatus = document.querySelector("#gameStatus");
const moveList = document.querySelector("#moveList");
const capturedWhite = document.querySelector("#capturedWhite");
const capturedBlack = document.querySelector("#capturedBlack");
const newGameBtn = document.querySelector("#newGameBtn");
const flipBtn = document.querySelector("#flipBtn");
const soundBtn = document.querySelector("#soundBtn");
const moveBanner = document.querySelector("#moveBanner");
const computerModeBtn = document.querySelector("#computerModeBtn");
const opponentModeBtn = document.querySelector("#opponentModeBtn");
const difficultySection = document.querySelector(".difficulty-section");
const difficultyButtons = document.querySelectorAll(".difficulty-button");

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const unicodePieces = {
  wK: "♔",
  wQ: "♕",
  wR: "♖",
  wB: "♗",
  wN: "♘",
  wP: "♙",
  bK: "♚",
  bQ: "♛",
  bR: "♜",
  bB: "♝",
  bN: "♞",
  bP: "♟",
};
const pieceNames = { K: "King", Q: "Queen", R: "Rook", B: "Bishop", N: "Knight", P: "Pawn" };
const pieceRoles = { K: "King", Q: "Queen", R: "Fort", B: "Elephant", N: "Horse", P: "Soldier" };
const pieceFaces = {
  K: "king",
  Q: "queen",
  R: "fort",
  B: "elephant",
  N: "horse",
  P: "soldier",
};

let state;
let selected = null;
let legalTargets = [];
let flipped = false;
let pieceNodes = new Map();
let playMode = "computer";
let computerDifficulty = "balanced";
let computerThinking = false;
let computerTimer = null;
let soundEnabled = true;
let audioContext = null;

const difficultyProfiles = {
  training: {
    label: "Training",
    thinkTime: 420,
    randomness: 8,
    replyDepth: 0,
  },
  balanced: {
    label: "Balanced",
    thinkTime: 620,
    randomness: 2.4,
    replyDepth: 1,
  },
  expert: {
    label: "Expert",
    thinkTime: 820,
    randomness: 0.45,
    replyDepth: 2,
  },
};

function newState() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  for (let c = 0; c < 8; c += 1) {
    board[0][c] = piece("b", back[c]);
    board[1][c] = piece("b", "P");
    board[6][c] = piece("w", "P");
    board[7][c] = piece("w", back[c]);
  }
  return {
    board,
    turn: "w",
    selected: null,
    lastMove: null,
    history: [],
    captured: { w: [], b: [] },
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    gameOver: false,
  };
}

function piece(color, type) {
  return { color, type, id: `${color}${type}-${crypto.randomUUID()}` };
}

function setupBoard() {
  boardEl.innerHTML = "";
  renderCoordinates();

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const square = document.createElement("button");
      square.className = `square ${(row + col) % 2 === 0 ? "light" : "dark"}`;
      square.type = "button";
      square.dataset.row = row;
      square.dataset.col = col;
      square.setAttribute("role", "gridcell");
      square.setAttribute("aria-label", squareName(row, col));
      square.addEventListener("click", () => handleSquareClick(row, col));
      boardEl.append(square);
    }
  }
}

function render() {
  renderCoordinates();
  renderSquares();
  renderPieces();
  renderCaptured();
  renderMode();
  renderDifficulty();
  renderStatus();
  renderHistory();
}

function renderSquares() {
  const legalSet = new Set(legalTargets.map((move) => key(move.to.row, move.to.col)));
  const captureSet = new Set(
    legalTargets.filter((move) => move.capture || move.enPassant).map((move) => key(move.to.row, move.to.col)),
  );
  const checkedKing = findKing(state.board, state.turn);
  const isChecked = checkedKing && isSquareAttacked(state.board, checkedKing.row, checkedKing.col, opposite(state.turn));

  boardEl.querySelectorAll(".square").forEach((square) => {
    const row = Number(square.dataset.row);
    const col = Number(square.dataset.col);
    square.style.gridRow = `${(flipped ? 7 - row : row) + 1}`;
    square.style.gridColumn = `${(flipped ? 7 - col : col) + 1}`;
    square.className = `square ${(row + col) % 2 === 0 ? "light" : "dark"}`;
    if (selected && selected.row === row && selected.col === col) square.classList.add("selected");
    if (legalSet.has(key(row, col))) square.classList.add("legal");
    if (captureSet.has(key(row, col))) square.classList.add("capture");
    if (
      state.lastMove &&
      ((state.lastMove.from.row === row && state.lastMove.from.col === col) ||
        (state.lastMove.to.row === row && state.lastMove.to.col === col))
    ) {
      square.classList.add("last-move");
    }
    if (isChecked && checkedKing.row === row && checkedKing.col === col) square.classList.add("check");
  });
}

function renderPieces() {
  const liveIds = new Set();
  const captureTargetIds = new Set();
  legalTargets
    .filter((move) => move.capture || move.enPassant)
    .forEach((move) => {
      const target = move.enPassant
        ? state.board[move.from.row][move.to.col]
        : state.board[move.to.row][move.to.col];
      if (target) captureTargetIds.add(target.id);
    });

  forEachPiece(state.board, (p, row, col) => {
    liveIds.add(p.id);
    let node = pieceNodes.get(p.id);
    if (!node) {
      node = document.createElement("div");
      node.dataset.id = p.id;
      pieceNodes.set(p.id, node);
      boardEl.append(node);
    }
    if (node.dataset.type !== p.type || node.dataset.color !== p.color) {
      node.className = `piece ${p.color === "w" ? "white" : "black"} type-${p.type}`;
      node.innerHTML = pieceMarkup(p);
      node.dataset.type = p.type;
      node.dataset.color = p.color;
    }
    node.setAttribute("aria-label", `${p.color === "w" ? "White" : "Black"} ${pieceNames[p.type]}`);
    node.style.transform = pieceTransform(row, col);
    node.style.zIndex = String(20 + (flipped ? 7 - row : row));
    node.classList.toggle("targeted", captureTargetIds.has(p.id));
  });

  pieceNodes.forEach((node, id) => {
    if (!liveIds.has(id)) {
      node.classList.add("captured-pop");
      setTimeout(() => node.remove(), 230);
      pieceNodes.delete(id);
    }
  });
}

function pieceMarkup(p) {
  const role = pieceRoles[p.type];
  const asset = pieceAsset(p);
  const renderClass = asset.includes("user-pieces") ? "piece-render user-character" : "piece-render blender-character";
  return `
    <div class="piece-shadow"></div>
    <img class="${renderClass}" src="${asset}" alt="${p.color === "w" ? "White" : "Black"} ${role}" draggable="false" />
  `;
}

function pieceAsset(p) {
  const fantasyPieces = {
    K: "king",
    P: "soldier",
    N: "horse",
    B: "elephant",
    R: "fort",
    Q: "queen",
  };
  if (fantasyPieces[p.type]) return `assets/user-pieces/${fantasyPieces[p.type]}.png`;
  return `assets/blender-pieces/${p.color}${p.type}.png`;
}

function renderCoordinates() {
  const displayedFiles = flipped ? [...files].reverse() : files;
  const displayedRanks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  document.querySelectorAll(".files").forEach((el) => {
    el.innerHTML = displayedFiles.map((file) => `<span>${file}</span>`).join("");
  });
  document.querySelectorAll(".ranks").forEach((el) => {
    el.innerHTML = displayedRanks.map((rank) => `<span>${rank}</span>`).join("");
  });
}

function renderCaptured() {
  capturedWhite.textContent = state.captured.w.map((p) => unicodePieces[p.color + p.type]).join(" ");
  capturedBlack.textContent = state.captured.b.map((p) => unicodePieces[p.color + p.type]).join(" ");
}

function renderStatus() {
  const colorName = state.turn === "w" ? "White" : "Black";
  turnLabel.textContent = state.gameOver
    ? "Game complete"
    : computerThinking
      ? "Computer thinking"
      : `${colorName} to move`;
  const king = findKing(state.board, state.turn);
  const inCheck = king && isSquareAttacked(state.board, king.row, king.col, opposite(state.turn));
  const moves = legalMovesForColor(state.turn);

  if (moves.length === 0 && inCheck) {
    state.gameOver = true;
    gameStatus.textContent = `Checkmate, ${opposite(state.turn) === "w" ? "White" : "Black"} wins`;
  } else if (moves.length === 0) {
    state.gameOver = true;
    gameStatus.textContent = "Stalemate";
  } else {
    gameStatus.textContent = computerThinking ? "Thinking..." : inCheck ? "Check" : "Ready";
  }
}

function renderMode() {
  computerModeBtn.classList.toggle("active", playMode === "computer");
  opponentModeBtn.classList.toggle("active", playMode === "opponent");
  soundBtn.textContent = soundEnabled ? "Sound On" : "Sound Off";
  boardEl.classList.toggle("thinking", computerThinking);
}

function renderDifficulty() {
  difficultySection.classList.toggle("inactive", playMode !== "computer");
  difficultyButtons.forEach((button) => {
    const active = button.dataset.difficulty === computerDifficulty;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderHistory() {
  moveList.innerHTML = state.history.map((move) => `<li>${move}</li>`).join("");
  moveList.scrollTop = moveList.scrollHeight;
}

function handleSquareClick(row, col) {
  if (state.gameOver) return;
  if (computerThinking || isComputerTurn()) return;
  unlockAudio();
  const clicked = state.board[row][col];

  if (selected) {
    const move = legalTargets.find((target) => target.to.row === row && target.to.col === col);
    if (move) {
      finishMove(move);
      return;
    }
  }

  if (clicked && clicked.color === state.turn) {
    selected = { row, col };
    legalTargets = legalMovesFrom(row, col);
  } else {
    selected = null;
    legalTargets = [];
  }
  render();
}

function finishMove(move) {
  makeMove(move);
  selected = null;
  legalTargets = [];
  render();
  animateMovedPiece(move);
  queueComputerMove();
}

function queueComputerMove() {
  if (!isComputerTurn() || state.gameOver) return;
  const profile = difficultyProfiles[computerDifficulty];
  computerThinking = true;
  render();
  window.clearTimeout(computerTimer);
  computerTimer = window.setTimeout(() => {
    const move = chooseComputerMove();
    computerThinking = false;
    if (move) {
      makeMove(move);
      selected = null;
      legalTargets = [];
      render();
      animateMovedPiece(move);
    } else {
      render();
    }
  }, profile.thinkTime);
}

function chooseComputerMove() {
  const moves = legalMovesForColor("b");
  if (moves.length === 0) return null;
  const profile = difficultyProfiles[computerDifficulty];
  const scored = moves
    .map((move) => ({
      move,
      score: scoreComputerMove(move, profile),
    }))
    .sort((a, b) => b.score - a.score);

  if (computerDifficulty === "training") {
    const safePool = scored.slice(0, Math.max(2, Math.ceil(scored.length * 0.55)));
    const forgivingPick = Math.floor(Math.random() * safePool.length);
    return safePool[forgivingPick].move;
  }

  return scored[0].move;
}

function scoreComputerMove(move, profile) {
  const testBoard = cloneBoard(state.board);
  const tacticalScore = scoreImmediateMove(state.board, move, "b");
  applyMoveToBoard(testBoard, move);

  let score = tacticalScore + evaluateBoard(testBoard);
  if (profile.replyDepth >= 1) {
    score -= bestReplyScore(testBoard, "w") * (profile.replyDepth === 2 ? 0.82 : 0.55);
  }
  if (profile.replyDepth >= 2) {
    score += bestReplyScore(testBoard, "b") * 0.26;
  }

  return score + (Math.random() - 0.5) * profile.randomness;
}

function scoreImmediateMove(board, move, color) {
  const moving = board[move.from.row][move.from.col];
  const captured = move.enPassant ? board[move.from.row][move.to.col] : board[move.to.row][move.to.col];
  let score = 0;
  if (captured) score += pieceValue(captured.type) * 12 - pieceValue(moving.type) * 0.45;
  if (move.promotion) score += 90;
  if (move.castle) score += 8;

  const testBoard = cloneBoard(board);
  applyMoveToBoard(testBoard, move);
  const enemyKing = findKing(testBoard, opposite(color));
  if (enemyKing && isSquareAttacked(testBoard, enemyKing.row, enemyKing.col, color)) score += 18;
  if (isSquareAttacked(testBoard, move.to.row, move.to.col, opposite(color))) {
    score -= pieceValue(moving.type) * 2.6;
  }
  if (moving.type === "Q" && move.to.row < 3) score -= 2;
  return color === "b" ? score : -score;
}

function bestReplyScore(board, color) {
  const replies = legalMovesForBoard(board, color);
  if (replies.length === 0) {
    const king = findKing(board, color);
    return king && isSquareAttacked(board, king.row, king.col, opposite(color)) ? 120 : 0;
  }
  return Math.max(...replies.map((reply) => Math.abs(scoreImmediateMove(board, reply, color))));
}

function evaluateBoard(board) {
  let score = 0;
  forEachPiece(board, (p, row, col) => {
    const side = p.color === "b" ? 1 : -1;
    score += side * pieceValue(p.type) * 10;
    score += side * developmentBonus(p, row, col);
  });
  score += legalMovesForBoard(board, "b").length * 0.18;
  score -= legalMovesForBoard(board, "w").length * 0.14;
  return score;
}

function developmentBonus(p, row, col) {
  const centerDistance = Math.abs(3.5 - row) + Math.abs(3.5 - col);
  let bonus = (7 - centerDistance) * 0.22;
  if ((p.type === "N" || p.type === "B") && ((p.color === "b" && row > 0) || (p.color === "w" && row < 7))) {
    bonus += 1.2;
  }
  if (p.type === "P") {
    bonus += p.color === "b" ? row * 0.18 : (7 - row) * 0.18;
  }
  if (p.type === "K" && ((p.color === "b" && row === 0 && col > 4) || (p.color === "w" && row === 7 && col > 4))) {
    bonus += 0.8;
  }
  return bonus;
}

function legalMovesForBoard(board, color) {
  return withTemporaryState({ ...state, board, turn: color, enPassant: null }, () => legalMovesForColor(color));
}

function withTemporaryState(nextState, callback) {
  const previousState = state;
  state = nextState;
  const result = callback();
  state = previousState;
  return result;
}

function animateMovedPiece(move) {
  const movedPiece = state.board[move.to.row][move.to.col];
  const node = movedPiece && pieceNodes.get(movedPiece.id);
  if (node) {
    node.classList.remove("moved");
    void node.offsetWidth;
    node.classList.add("moved");
  }
  createMoveBurst(move.to.row, move.to.col);
}

function createMoveBurst(row, col) {
  if (!fxLayer) return;
  const displayRow = flipped ? 7 - row : row;
  const displayCol = flipped ? 7 - col : col;
  const x = `${(displayCol + 0.5) * 12.5}%`;
  const y = `${(displayRow + 0.5) * 12.5}%`;
  const ring = document.createElement("span");
  ring.className = "ring";
  ring.style.left = x;
  ring.style.top = y;
  fxLayer.append(ring);
  setTimeout(() => ring.remove(), 820);

  for (let i = 0; i < 14; i += 1) {
    const spark = document.createElement("span");
    spark.className = "spark";
    spark.style.left = x;
    spark.style.top = y;
    spark.style.setProperty("--angle", `${(360 / 14) * i}deg`);
    spark.style.setProperty("--distance", `${2.1 + Math.random() * 2.4}rem`);
    spark.style.setProperty("--spark-color", i % 3 === 0 ? "#ff4f81" : i % 3 === 1 ? "#48e2c2" : "#ffd987");
    fxLayer.append(spark);
    setTimeout(() => spark.remove(), 820);
  }
}

function isComputerTurn() {
  return playMode === "computer" && state.turn === "b";
}

function resetGame() {
  window.clearTimeout(computerTimer);
  computerThinking = false;
  state = newState();
  selected = null;
  legalTargets = [];
  pieceNodes.forEach((node) => node.remove());
  pieceNodes = new Map();
  render();
}

function makeMove(move) {
  const moving = state.board[move.from.row][move.from.col];
  const captured = move.enPassant
    ? state.board[move.from.row][move.to.col]
    : state.board[move.to.row][move.to.col];
  const moveSoundType = moving.type;
  const notation = moveNotation(moving, move, captured);

  if (captured) state.captured[captured.color].push(captured);
  state.board[move.from.row][move.from.col] = null;
  if (move.enPassant) state.board[move.from.row][move.to.col] = null;

  state.board[move.to.row][move.to.col] = moving;
  if (move.promotion) moving.type = move.promotion;

  if (move.castle) {
    const rookFromCol = move.castle === "king" ? 7 : 0;
    const rookToCol = move.castle === "king" ? 5 : 3;
    state.board[move.to.row][rookToCol] = state.board[move.to.row][rookFromCol];
    state.board[move.to.row][rookFromCol] = null;
  }

  updateCastleRights(moving, move, captured);
  state.enPassant =
    moving.type === "P" && Math.abs(move.to.row - move.from.row) === 2
      ? { row: (move.to.row + move.from.row) / 2, col: move.from.col }
      : null;
  state.lastMove = { from: move.from, to: move.to };
  state.history.push(notation);
  playPieceSound(moveSoundType, Boolean(captured), moving.color);
  showMoveBanner(moveSoundType, moving.color, Boolean(captured));
  window.dispatchEvent(
    new CustomEvent("chess:move", {
      detail: {
        type: moveSoundType,
        color: moving.color,
        captured: Boolean(captured),
        notation,
        from: move.from,
        to: move.to,
        flipped,
      },
    }),
  );
  state.turn = opposite(state.turn);
}

function unlockAudio() {
  if (!soundEnabled || audioContext) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  audioContext = new AudioContextClass();
}

function playPieceSound(type, captured, color) {
  if (!soundEnabled) return;
  unlockAudio();
  if (!audioContext) return;
  const now = audioContext.currentTime;
  if (type === "N") playHorseSound(now);
  else if (type === "P") playSoldierSound(now);
  else if (type === "B" || type === "R") playElephantSound(now);
  else if (type === "Q") playQueenSound(now);
  else playKingSound(now);
  if (captured) playCaptureSound(now + 0.18);
  if (color === "b") playLowThump(now + 0.06);
}

function showMoveBanner(type, color, captured) {
  const side = color === "w" ? "White" : "Black";
  const action = captured ? "captures" : "moves";
  moveBanner.textContent = `${side} ${pieceRoles[type]} ${action}`;
  moveBanner.classList.remove("show");
  void moveBanner.offsetWidth;
  moveBanner.classList.add("show");
}

function tone(frequency, start, duration, options = {}) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = options.type || "sine";
  oscillator.frequency.setValueAtTime(frequency, start);
  if (options.to) oscillator.frequency.exponentialRampToValueAtTime(options.to, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(options.volume || 0.12, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.04);
}

function playHorseSound(now) {
  tone(560, now, 0.18, { to: 880, type: "triangle", volume: 0.1 });
  tone(760, now + 0.12, 0.22, { to: 420, type: "sawtooth", volume: 0.055 });
  tone(180, now + 0.03, 0.1, { type: "square", volume: 0.04 });
}

function playSoldierSound(now) {
  tone(120, now, 0.07, { type: "square", volume: 0.11 });
  tone(155, now + 0.12, 0.07, { type: "square", volume: 0.09 });
  tone(260, now + 0.2, 0.08, { type: "triangle", volume: 0.045 });
}

function playElephantSound(now) {
  tone(130, now, 0.36, { to: 80, type: "sawtooth", volume: 0.1 });
  tone(240, now + 0.08, 0.28, { to: 380, type: "triangle", volume: 0.075 });
  tone(72, now + 0.02, 0.3, { type: "sine", volume: 0.11 });
}

function playQueenSound(now) {
  tone(392, now, 0.16, { type: "sine", volume: 0.08 });
  tone(494, now + 0.09, 0.18, { type: "sine", volume: 0.08 });
  tone(659, now + 0.18, 0.28, { type: "triangle", volume: 0.075 });
}

function playKingSound(now) {
  tone(196, now, 0.18, { type: "triangle", volume: 0.09 });
  tone(262, now + 0.11, 0.24, { type: "triangle", volume: 0.075 });
  tone(330, now + 0.23, 0.34, { type: "sine", volume: 0.065 });
}

function playCaptureSound(now) {
  tone(90, now, 0.12, { to: 44, type: "sawtooth", volume: 0.14 });
  tone(38, now + 0.04, 0.18, { type: "square", volume: 0.08 });
}

function playLowThump(now) {
  tone(64, now, 0.08, { type: "sine", volume: 0.055 });
}

function legalMovesForColor(color) {
  const moves = [];
  forEachPiece(state.board, (p, row, col) => {
    if (p.color === color) moves.push(...legalMovesFrom(row, col));
  });
  return moves;
}

function legalMovesFrom(row, col) {
  const p = state.board[row][col];
  if (!p) return [];
  return pseudoMoves(row, col, state.board, p)
    .map((move) => ({ from: { row, col }, ...move }))
    .filter((move) => {
      const testBoard = cloneBoard(state.board);
      applyMoveToBoard(testBoard, move);
      const king = findKing(testBoard, p.color);
      return king && !isSquareAttacked(testBoard, king.row, king.col, opposite(p.color));
    });
}

function pseudoMoves(row, col, board, p) {
  if (p.type === "P") return pawnMoves(row, col, board, p);
  if (p.type === "N") return stepMoves(row, col, board, p, knightSteps);
  if (p.type === "K") return kingMoves(row, col, board, p);
  if (p.type === "B") return slideMoves(row, col, board, p, diagonalSteps);
  if (p.type === "R") return slideMoves(row, col, board, p, straightSteps);
  return slideMoves(row, col, board, p, [...diagonalSteps, ...straightSteps]);
}

function pawnMoves(row, col, board, p) {
  const moves = [];
  const direction = p.color === "w" ? -1 : 1;
  const startRow = p.color === "w" ? 6 : 1;
  const promotionRow = p.color === "w" ? 0 : 7;
  const one = row + direction;

  if (inside(one, col) && !board[one][col]) {
    moves.push({ to: { row: one, col }, promotion: one === promotionRow ? "Q" : null });
    const two = row + direction * 2;
    if (row === startRow && !board[two][col]) moves.push({ to: { row: two, col } });
  }

  [-1, 1].forEach((dc) => {
    const nextCol = col + dc;
    if (!inside(one, nextCol)) return;
    const target = board[one][nextCol];
    if (target && target.color !== p.color) {
      moves.push({
        to: { row: one, col: nextCol },
        capture: true,
        promotion: one === promotionRow ? "Q" : null,
      });
    }
    if (state.enPassant && state.enPassant.row === one && state.enPassant.col === nextCol) {
      moves.push({ to: { row: one, col: nextCol }, enPassant: true, capture: true });
    }
  });
  return moves;
}

function kingMoves(row, col, board, p) {
  const moves = stepMoves(row, col, board, p, [...diagonalSteps, ...straightSteps]);
  const homeRow = p.color === "w" ? 7 : 0;
  if (row !== homeRow || col !== 4) return moves;
  if (isSquareAttacked(board, row, col, opposite(p.color))) return moves;

  const kingSide = `${p.color}K`;
  if (
    state.castling[kingSide] &&
    !board[homeRow][5] &&
    !board[homeRow][6] &&
    !isSquareAttacked(board, homeRow, 5, opposite(p.color)) &&
    !isSquareAttacked(board, homeRow, 6, opposite(p.color))
  ) {
    moves.push({ to: { row: homeRow, col: 6 }, castle: "king" });
  }

  const queenSide = `${p.color}Q`;
  if (
    state.castling[queenSide] &&
    !board[homeRow][1] &&
    !board[homeRow][2] &&
    !board[homeRow][3] &&
    !isSquareAttacked(board, homeRow, 2, opposite(p.color)) &&
    !isSquareAttacked(board, homeRow, 3, opposite(p.color))
  ) {
    moves.push({ to: { row: homeRow, col: 2 }, castle: "queen" });
  }
  return moves;
}

function stepMoves(row, col, board, p, steps) {
  return steps.flatMap(([dr, dc]) => {
    const nextRow = row + dr;
    const nextCol = col + dc;
    if (!inside(nextRow, nextCol)) return [];
    const target = board[nextRow][nextCol];
    if (!target) return [{ to: { row: nextRow, col: nextCol } }];
    return target.color !== p.color ? [{ to: { row: nextRow, col: nextCol }, capture: true }] : [];
  });
}

function slideMoves(row, col, board, p, steps) {
  const moves = [];
  steps.forEach(([dr, dc]) => {
    let nextRow = row + dr;
    let nextCol = col + dc;
    while (inside(nextRow, nextCol)) {
      const target = board[nextRow][nextCol];
      if (!target) {
        moves.push({ to: { row: nextRow, col: nextCol } });
      } else {
        if (target.color !== p.color) moves.push({ to: { row: nextRow, col: nextCol }, capture: true });
        break;
      }
      nextRow += dr;
      nextCol += dc;
    }
  });
  return moves;
}

function isSquareAttacked(board, row, col, byColor) {
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const p = board[r][c];
      if (!p || p.color !== byColor) continue;
      if (attacksSquare(board, r, c, row, col, p)) return true;
    }
  }
  return false;
}

function attacksSquare(board, row, col, targetRow, targetCol, p) {
  const dr = targetRow - row;
  const dc = targetCol - col;
  if (p.type === "P") return dr === (p.color === "w" ? -1 : 1) && Math.abs(dc) === 1;
  if (p.type === "N") return knightSteps.some(([r, c]) => r === dr && c === dc);
  if (p.type === "K") return Math.max(Math.abs(dr), Math.abs(dc)) === 1;
  const steps = p.type === "B" ? diagonalSteps : p.type === "R" ? straightSteps : [...diagonalSteps, ...straightSteps];
  return steps.some(([stepR, stepC]) => {
    let r = row + stepR;
    let c = col + stepC;
    while (inside(r, c)) {
      if (r === targetRow && c === targetCol) return true;
      if (board[r][c]) return false;
      r += stepR;
      c += stepC;
    }
    return false;
  });
}

function applyMoveToBoard(board, move) {
  const moving = board[move.from.row][move.from.col];
  board[move.from.row][move.from.col] = null;
  if (move.enPassant) board[move.from.row][move.to.col] = null;
  board[move.to.row][move.to.col] = moving;
  if (move.promotion) moving.type = move.promotion;
  if (move.castle) {
    const rookFromCol = move.castle === "king" ? 7 : 0;
    const rookToCol = move.castle === "king" ? 5 : 3;
    board[move.to.row][rookToCol] = board[move.to.row][rookFromCol];
    board[move.to.row][rookFromCol] = null;
  }
}

function updateCastleRights(moving, move, captured) {
  if (moving.type === "K") {
    state.castling[`${moving.color}K`] = false;
    state.castling[`${moving.color}Q`] = false;
  }
  if (moving.type === "R") {
    if (move.from.row === 7 && move.from.col === 0) state.castling.wQ = false;
    if (move.from.row === 7 && move.from.col === 7) state.castling.wK = false;
    if (move.from.row === 0 && move.from.col === 0) state.castling.bQ = false;
    if (move.from.row === 0 && move.from.col === 7) state.castling.bK = false;
  }
  if (captured && captured.type === "R") {
    if (move.to.row === 7 && move.to.col === 0) state.castling.wQ = false;
    if (move.to.row === 7 && move.to.col === 7) state.castling.wK = false;
    if (move.to.row === 0 && move.to.col === 0) state.castling.bQ = false;
    if (move.to.row === 0 && move.to.col === 7) state.castling.bK = false;
  }
}

function moveNotation(pieceMoved, move, captured) {
  const captureMark = captured || move.enPassant ? "x" : "-";
  const castle = move.castle === "king" ? "O-O" : move.castle === "queen" ? "O-O-O" : null;
  if (castle) return `${state.turn === "w" ? "White" : "Black"} ${castle}`;
  const promo = move.promotion ? `=${move.promotion}` : "";
  return `${state.turn === "w" ? "White" : "Black"} ${pieceMoved.type}${squareName(move.from.row, move.from.col)}${captureMark}${squareName(move.to.row, move.to.col)}${promo}`;
}

function pieceValue(type) {
  return { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 99 }[type];
}

function findKing(board, color) {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const p = board[row][col];
      if (p && p.color === color && p.type === "K") return { row, col };
    }
  }
  return null;
}

function forEachPiece(board, callback) {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if (board[row][col]) callback(board[row][col], row, col);
    }
  }
}

function cloneBoard(board) {
  return board.map((rank) => rank.map((p) => (p ? { ...p } : null)));
}

function pieceTransform(row, col) {
  const displayRow = flipped ? 7 - row : row;
  const displayCol = flipped ? 7 - col : col;
  return `translate(${displayCol * 100}%, ${displayRow * 100}%)`;
}

function key(row, col) {
  return `${row},${col}`;
}

function squareName(row, col) {
  return `${files[col]}${8 - row}`;
}

function inside(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function opposite(color) {
  return color === "w" ? "b" : "w";
}

const knightSteps = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];
const diagonalSteps = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
const straightSteps = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

newGameBtn.addEventListener("click", () => {
  resetGame();
});

flipBtn.addEventListener("click", () => {
  flipped = !flipped;
  render();
});

soundBtn.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  if (soundEnabled) {
    unlockAudio();
    playQueenSound(audioContext.currentTime);
  }
  render();
});

computerModeBtn.addEventListener("click", () => {
  playMode = "computer";
  resetGame();
});

opponentModeBtn.addEventListener("click", () => {
  playMode = "opponent";
  resetGame();
});

difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    computerDifficulty = button.dataset.difficulty;
    playMode = "computer";
    resetGame();
  });
});

setupBoard();
state = newState();
render();
