const FIREBASE_URL = 'https://doshuti-ad053-default-rtdb.europe-west1.firebasedatabase.app';

const JOKES = [
  "Заходит программист в бар","Почему кот перешёл дорогу","Встречаются два соседа в лифте",
  "Врач говорит пациенту","Начальник вызывает сотрудника","Студент приходит на экзамен",
  "Жена говорит мужу утром","Официант приносит счёт","Учитель спрашивает класс",
  "Встречаются дизайнер и разработчик","Мама звонит сыну в 11 вечера","Человек гуглит симптомы",
  "Кот смотрит на пустую миску","Коллеги обсуждают план на пятницу","Дедушка смотрит в телефон внука",
  "Приходит человек в банк","Два программиста спорят","Менеджер говорит команде",
  "Ребёнок спрашивает у родителей","Встречаются два друга после отпуска",
];

let state = {
  role: null, roomCode: null, playerName: null,
  myVote: null, myAnswerSubmitted: false,
};
let pollInterval = null;
let timerInterval = null;

// ---- Firebase helpers ----
async function fbGet(path) {
  const res = await fetch(FIREBASE_URL + path + '.json');
  return res.ok ? res.json() : null;
}
async function fbSet(path, data) {
  await fetch(FIREBASE_URL + path + '.json', {
    method: 'PUT', body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' }
  });
}
async function fbUpdate(path, data) {
  await fetch(FIREBASE_URL + path + '.json', {
    method: 'PATCH', body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' }
  });
}
async function fbDelete(path) {
  await fetch(FIREBASE_URL + path + '.json', { method: 'DELETE' });
}

// ---- UI helpers ----
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}
function getCurrentScreen() {
  const a = document.querySelector('.screen.active'); return a ? a.id : null;
}
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) { return String(s).replace(/'/g,"\\'"); }

function switchTab(tab) {
  document.getElementById('tab-host').classList.toggle('active', tab === 'host');
  document.getElementById('tab-join').classList.toggle('active', tab === 'join');
  document.getElementById('panel-host').style.display = tab === 'host' ? 'block' : 'none';
  document.getElementById('panel-join').style.display = tab === 'join' ? 'block' : 'none';
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function pickJoke(used) {
  const av = JOKES.filter(j => !(used || []).includes(j));
  return av.length ? av[Math.floor(Math.random() * av.length)] : JOKES[Math.floor(Math.random() * JOKES.length)];
}

function generateQR() {
  const url = window.location.href.split('?')[0];
  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=120x120&data='
    + encodeURIComponent(url) + '&bgcolor=1a0a2e&color=f0e6ff&margin=2';
  const container = document.getElementById('qr-container');
  if (container) {
    container.innerHTML = '<p style="font-size:0.75rem; color:#6b4f8a; margin-bottom:6px;">QR-код для игроков</p>'
      + '<img src="' + qrUrl + '" width="120" height="120" alt="QR">';
  }
}

window.addEventListener('load', () => {
  const url = window.location.href.split('?')[0];
  const hint = document.getElementById('page-url-hint');
  if (hint) hint.textContent = 'Игроки открывают: ' + url;
});

// ---- BACK ----
async function goBack(from) {
  clearInterval(pollInterval); clearInterval(timerInterval);
  if (from === 'screen-host-lobby' && state.roomCode) {
    await fbDelete('/rooms/' + state.roomCode);
  }
  if (from === 'screen-player-lobby' && state.roomCode && state.playerName) {
    const room = await fbGet('/rooms/' + state.roomCode);
    if (room && room.players) {
      const players = room.players.filter(p => p !== state.playerName);
      await fbUpdate('/rooms/' + state.roomCode, { players });
    }
  }
  resetState();
  showScreen('screen-home');
}

function resetState() {
  state = { role:null, roomCode:null, playerName:null, myVote:null, myAnswerSubmitted:false };
  document.getElementById('room-code-input').value = '';
  document.getElementById('player-name-input').value = '';
  document.getElementById('join-error').textContent = '';
}

// ---- HOST ----
async function hostGame() {
  const code = genCode();
  state.role = 'host'; state.roomCode = code;
  await fbSet('/rooms/' + code, {
    phase: 'lobby', players: [], answers: {}, votes: {}, scores: {},
    currentRound: 0, totalRounds: 5, roundTime: 60, joke: '', jokesUsed: []
  });
  document.getElementById('display-room-code').textContent = code;
  document.getElementById('player-count-badge').textContent = '0 / 15';
  document.getElementById('host-players-list').innerHTML =
    '<span style="font-size:0.85rem; color:#6b4f8a; font-style:italic;">Пока никого...</span>';
  showScreen('screen-host-lobby');
  generateQR();
  startHostLobbyPoll();
}

function startHostLobbyPoll() {
  clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    const room = await fbGet('/rooms/' + state.roomCode); if (!room) return;
    renderHostPlayers(room.players || []);
    document.getElementById('player-count-badge').textContent = (room.players||[]).length + ' / 15';
  }, 1500);
}

function renderHostPlayers(players) {
  const el = document.getElementById('host-players-list');
  if (!players.length) {
    el.innerHTML = '<span style="font-size:0.85rem; color:#6b4f8a; font-style:italic;">Пока никого...</span>';
    return;
  }
  el.innerHTML = players.map(p =>
    '<div class="player-chip"><span class="dot ready"></span>' + escHtml(p) + '</div>'
  ).join('');
}

async function updateRoomSettings() {
  if (!state.roomCode) return;
  await fbUpdate('/rooms/' + state.roomCode, {
    totalRounds: parseInt(document.getElementById('rounds-slider').value),
    roundTime: parseInt(document.getElementById('time-slider').value),
  });
}

async function startGame() {
  const room = await fbGet('/rooms/' + state.roomCode);
  if (!room || (room.players||[]).length < 3) {
    document.getElementById('start-error').textContent = 'Нужно минимум 3 игрока!'; return;
  }
  const scores = {};
  (room.players||[]).forEach(p => scores[p] = 0);
  await fbUpdate('/rooms/' + state.roomCode, {
    currentRound: 0, scores,
    totalRounds: parseInt(document.getElementById('rounds-slider').value),
    roundTime: parseInt(document.getElementById('time-slider').value),
  });
  clearInterval(pollInterval);
  beginRound();
}

async function beginRound() {
  const room = await fbGet('/rooms/' + state.roomCode);
  const round = (room.currentRound || 0) + 1;
  const joke = pickJoke(room.jokesUsed);
  await fbSet('/rooms/' + state.roomCode + '/answers', {});
  await fbSet('/rooms/' + state.roomCode + '/votes', {});
  await fbUpdate('/rooms/' + state.roomCode, {
    currentRound: round, joke,
    jokesUsed: [...(room.jokesUsed||[]), joke],
    phase: 'answering',
  });
  document.getElementById('round-badge').textContent = 'Раунд ' + round + ' / ' + room.totalRounds;
  document.getElementById('host-joke-setup').textContent = joke;
  showScreen('screen-host-round');
  renderAnswersStatus([], room.players||[]);
  startHostTimer(room.roundTime, () => hostEndAnswering());
  startHostAnswerPoll(room.players||[], room.totalRounds, room.roundTime);
}

function startHostTimer(secs, onEnd) {
  clearInterval(timerInterval);
  let t = secs;
  const progEl = document.getElementById('host-progress');
  const timerEl = document.getElementById('host-timer');
  if (timerEl) timerEl.textContent = t;
  if (progEl) progEl.style.width = '0%';
  timerInterval = setInterval(() => {
    t--;
    if (timerEl) timerEl.textContent = t;
    if (progEl) progEl.style.width = ((secs - t) / secs * 100) + '%';
    if (t <= 0) { clearInterval(timerInterval); onEnd(); }
  }, 1000);
}

function startHostAnswerPoll(players, totalRounds, roundTime) {
  clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    const room = await fbGet('/rooms/' + state.roomCode); if (!room) return;
    const answers = room.answers || {};
    renderAnswersStatus(Object.keys(answers), players);
    if (Object.keys(answers).length >= players.length) {
      clearInterval(pollInterval); clearInterval(timerInterval); hostEndAnswering();
    }
  }, 1500);
}

function renderAnswersStatus(answered, players) {
  const el = document.getElementById('answers-status'); if (!el) return;
  el.innerHTML = players.map(p =>
    '<div class="player-chip"><span class="dot' + (answered.includes(p) ? ' ready' : '') + '"></span>' + escHtml(p) + '</div>'
  ).join('');
}

async function hostEndAnswering() {
  clearInterval(timerInterval); clearInterval(pollInterval);
  await fbUpdate('/rooms/' + state.roomCode, { phase: 'voting' });
  const room = await fbGet('/rooms/' + state.roomCode);
  showHostVoteScreen(room);
}

function showHostVoteScreen(room) {
  document.getElementById('vote-host-setup').textContent = room.joke;
  const listEl = document.getElementById('host-answers-list');
  const answers = room.answers || {}, keys = Object.keys(answers);
  if (!keys.length) {
    listEl.innerHTML = '<p style="color:#9b7cbf; text-align:center; font-style:italic;">Никто не ответил...</p>';
  } else {
    listEl.innerHTML = keys.map((player, i) =>
      '<div class="answer-card">' +
        '<div class="answer-setup">Ответ ' + (i+1) + '</div>' +
        '<div class="answer-text">' + escHtml(answers[player]) + '</div>' +
        '<div class="vote-bar"><div class="vote-fill" id="vfill-' + i + '" style="width:0%"></div></div>' +
        '<div class="vote-count" id="vcount-' + i + '">0 голосов</div>' +
      '</div>'
    ).join('');
  }
  showScreen('screen-host-vote');
  startHostVotePoll(keys, (room.players||[]).length);
}

function startHostVotePoll(answerKeys, playerCount) {
  clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    const votes = await fbGet('/rooms/' + state.roomCode + '/votes') || {};
    answerKeys.forEach((player, i) => {
      const count = Object.values(votes).filter(v => v === player).length;
      const pct = playerCount > 0 ? Math.round(count / playerCount * 100) : 0;
      const f = document.getElementById('vfill-' + i), c = document.getElementById('vcount-' + i);
      if (f) f.style.width = pct + '%';
      if (c) c.textContent = count + ' голос' + (count===1?'':count<5?'а':'ов');
    });
  }, 1500);
}

async function hostShowResults() {
  clearInterval(pollInterval);
  const room = await fbGet('/rooms/' + state.roomCode);
  const votes = room.votes || {}, answers = room.answers || {}, voteCounts = {};
  Object.values(votes).forEach(p => voteCounts[p] = (voteCounts[p]||0)+1);
  const winner = Object.keys(voteCounts).sort((a,b) => voteCounts[b]-voteCounts[a])[0];
  const scores = room.scores || {};
  if (winner) scores[winner] = (scores[winner]||0) + (voteCounts[winner]||0);
  const isLast = room.currentRound >= room.totalRounds;
  await fbUpdate('/rooms/' + state.roomCode, { scores, phase: isLast ? 'final' : 'results' });
  const updated = await fbGet('/rooms/' + state.roomCode);
  if (isLast) showFinalScreen(updated);
  else showResultsScreen(updated, votes, answers, winner, voteCounts, 'host');
}

// ---- PLAYER ----
async function joinGame() {
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  const name = document.getElementById('player-name-input').value.trim();
  document.getElementById('join-error').textContent = '';
  if (code.length !== 4) { document.getElementById('join-error').textContent = 'Введи 4-буквенный код'; return; }
  if (!name) { document.getElementById('join-error').textContent = 'Введи своё имя'; return; }
  const room = await fbGet('/rooms/' + code);
  if (!room) { document.getElementById('join-error').textContent = 'Комната не найдена. Проверь код.'; return; }
  if (room.phase !== 'lobby') { document.getElementById('join-error').textContent = 'Игра уже началась.'; return; }
  const players = room.players || [];
  if (players.length >= 15) { document.getElementById('join-error').textContent = 'Комната заполнена (макс. 15)'; return; }
  if (players.includes(name)) { document.getElementById('join-error').textContent = 'Имя занято. Выбери другое.'; return; }
  players.push(name);
  const scores = room.scores || {};
  scores[name] = 0;
  await fbUpdate('/rooms/' + code, { players, scores });
  state.role = 'player'; state.roomCode = code; state.playerName = name;
  state.myAnswerSubmitted = false; state.myVote = null;
  document.getElementById('lobby-greeting').textContent = 'Привет, ' + name + '!';
  document.getElementById('lobby-room-code').textContent = code;
  renderPlayerLobbyList(players, name);
  showScreen('screen-player-lobby');
  startPlayerPoll();
}

function renderPlayerLobbyList(players, me) {
  document.getElementById('player-lobby-list').innerHTML = (players||[]).map(p =>
    '<div class="player-chip"><span class="dot ready"></span>' + escHtml(p) + (p===me?' (ты)':'') + '</div>'
  ).join('');
}

function startPlayerPoll() {
  clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    const room = await fbGet('/rooms/' + state.roomCode); if (!room) return;
    const cur = getCurrentScreen();
    if (room.phase === 'lobby') { renderPlayerLobbyList(room.players, state.playerName); }
    else if (room.phase === 'answering' && cur !== 'screen-player-answer') {
      state.myAnswerSubmitted = !!(room.answers && room.answers[state.playerName]);
      showPlayerAnswerScreen(room);
    } else if (room.phase === 'voting' && cur !== 'screen-player-vote') { showPlayerVoteScreen(room); }
    else if (room.phase === 'results' && cur !== 'screen-round-results') { showPlayerResultsScreen(room); }
    else if (room.phase === 'final' && cur !== 'screen-final') { showFinalScreen(room); }

    if (room.phase === 'answering' && cur === 'screen-player-answer') {
      if (room.answers && room.answers[state.playerName] && !state.myAnswerSubmitted) {
        state.myAnswerSubmitted = true;
        document.getElementById('player-answer-input').disabled = true;
        document.getElementById('submit-answer-btn').disabled = true;
        document.getElementById('answer-status').textContent = '✓ Ответ принят! Ждём остальных...';
      }
    }
    if (room.phase === 'voting' && cur === 'screen-player-vote') { renderPlayerVoteList(room); }
  }, 1500);
}

function showPlayerAnswerScreen(room) {
  document.getElementById('player-joke-setup').textContent = room.joke;
  document.getElementById('player-answer-input').value = '';
  document.getElementById('player-answer-input').disabled = state.myAnswerSubmitted;
  document.getElementById('submit-answer-btn').disabled = state.myAnswerSubmitted;
  document.getElementById('answer-status').textContent = state.myAnswerSubmitted ? '✓ Ответ принят! Ждём остальных...' : '';
  document.getElementById('char-count').textContent = '0 / 200';
  document.getElementById('player-timer').textContent = room.roundTime;
  showScreen('screen-player-answer');
  let t = room.roundTime;
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    t--; document.getElementById('player-timer').textContent = t;
    if (t <= 0) clearInterval(timerInterval);
  }, 1000);
}

async function submitAnswer() {
  const answer = document.getElementById('player-answer-input').value.trim();
  if (!answer) { document.getElementById('answer-status').textContent = 'Напиши концовку!'; return; }
  await fbUpdate('/rooms/' + state.roomCode + '/answers', { [state.playerName]: answer });
  document.getElementById('player-answer-input').disabled = true;
  document.getElementById('submit-answer-btn').disabled = true;
  document.getElementById('answer-status').textContent = '✓ Ответ принят! Ждём остальных...';
  state.myAnswerSubmitted = true;
}

function showPlayerVoteScreen(room) {
  state.myVote = null;
  document.getElementById('vote-player-setup').textContent = room.joke;
  renderPlayerVoteList(room);
  document.getElementById('vote-status').textContent = '';
  showScreen('screen-player-vote');
}

function renderPlayerVoteList(room) {
  const el = document.getElementById('player-vote-list');
  const answers = room.answers || {};
  const others = Object.keys(answers).filter(p => p !== state.playerName);
  if (!others.length) {
    el.innerHTML = '<p style="color:#9b7cbf; text-align:center; margin-top:16px; font-style:italic;">Нет других ответов</p>';
    return;
  }
  el.innerHTML = others.map((player, i) =>
    '<div class="answer-card' + (state.myVote===player?' voted':'') + '" onclick="castVote(\'' + escAttr(player) + '\')">' +
      '<div class="answer-setup">Концовка ' + (i+1) + '</div>' +
      '<div class="answer-text">' + escHtml(answers[player]) + '</div>' +
    '</div>'
  ).join('');
}

async function castVote(player) {
  if (state.myVote) return;
  state.myVote = player;
  await fbUpdate('/rooms/' + state.roomCode + '/votes', { [state.playerName]: player });
  document.getElementById('vote-status').textContent = '✓ Голос отдан!';
  const room = await fbGet('/rooms/' + state.roomCode);
  renderPlayerVoteList(room);
}

// ---- RESULTS ----
function showResultsScreen(room, votes, answers, winner, voteCounts, role) {
  const keys = Object.keys(answers).sort((a,b) => (voteCounts[b]||0)-(voteCounts[a]||0));
  document.getElementById('results-list').innerHTML = keys.map((player, i) => {
    const vc = voteCounts[player]||0, isWinner = player===winner;
    return '<div class="answer-card' + (isWinner?' winner':'') + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
        '<span style="font-size:0.8rem;color:' + (isWinner?'#69e0a0':'#9b7cbf') + ';">' + (isWinner?'🏆 Победитель':'#'+(i+1)) + '</span>' +
        '<span style="font-size:0.85rem;color:#d4b3ff;">' + vc + ' голос' + (vc===1?'':vc<5?'а':'ов') + '</span>' +
      '</div>' +
      '<div style="font-size:0.85rem;color:#9b7cbf;margin-bottom:4px;font-style:italic;">' + escHtml(room.joke) + '...</div>' +
      '<div class="answer-text">' + escHtml(answers[player]) + '</div>' +
      '<div style="font-size:0.8rem;color:#6b4f8a;margin-top:6px;">— ' + escHtml(player) + '</div>' +
    '</div>';
  }).join('') || '<p style="color:#9b7cbf;text-align:center;font-style:italic;">Нет ответов</p>';

  const scoreSorted = Object.keys(room.scores||{}).sort((a,b)=>(room.scores[b]||0)-(room.scores[a]||0));
  document.getElementById('score-list').innerHTML = scoreSorted.map((p,i) =>
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:0.5px solid rgba(255,255,255,0.06);">' +
      '<span style="color:#d4b3ff;">' + (i===0?'<span class="crown">👑</span> ':'') + escHtml(p) + '</span>' +
      '<span style="color:#f9d6ff;font-weight:500;">' + (room.scores[p]||0) + '</span>' +
    '</div>'
  ).join('');

  document.getElementById('results-heading').textContent = winner ? ('Победитель: '+winner+'!') : 'Никто не проголосовал';
  document.getElementById('results-phase-badge').textContent = 'Раунд ' + room.currentRound + ' / ' + room.totalRounds;
  document.getElementById('next-round-btn').style.display = role==='host' ? 'block' : 'none';
  document.getElementById('player-wait-btn').style.display = role==='player' ? 'block' : 'none';
  showScreen('screen-round-results');
  if (role === 'player') startPlayerResultPoll();
}

function showPlayerResultsScreen(room) {
  const votes = room.votes||{}, answers = room.answers||{}, voteCounts = {};
  Object.values(votes).forEach(p => voteCounts[p]=(voteCounts[p]||0)+1);
  const winner = Object.keys(voteCounts).sort((a,b)=>voteCounts[b]-voteCounts[a])[0];
  showResultsScreen(room, votes, answers, winner, voteCounts, 'player');
}

function startPlayerResultPoll() {
  clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    const room = await fbGet('/rooms/' + state.roomCode); if (!room) return;
    if (room.phase === 'answering') {
      clearInterval(pollInterval);
      state.myAnswerSubmitted = false; state.myVote = null;
      showPlayerAnswerScreen(room);
    } else if (room.phase === 'final') { clearInterval(pollInterval); showFinalScreen(room); }
  }, 1500);
}

async function nextRound() {
  clearInterval(pollInterval);
  await fbUpdate('/rooms/' + state.roomCode, { phase: 'answering' });
  beginRound();
}

function showFinalScreen(room) {
  const sorted = Object.keys(room.scores||{}).sort((a,b)=>(room.scores[b]||0)-(room.scores[a]||0));
  document.getElementById('final-scores').innerHTML = sorted.map((p,i) =>
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:0.5px solid rgba(255,255,255,0.06);">' +
      '<span style="color:#d4b3ff;font-size:' + (i===0?'1.1rem':'1rem') + ';">' + (i===0?'👑 ':(i+1)+'. ') + escHtml(p) + '</span>' +
      '<span style="color:#f9d6ff;font-size:' + (i===0?'1.3rem':'1rem') + ';font-weight:' + (i===0?'500':'400') + ';">' + (room.scores[p]||0) + '</span>' +
    '</div>'
  ).join('');
  showScreen('screen-final');
}

async function resetGame() {
  clearInterval(pollInterval); clearInterval(timerInterval);
  if (state.roomCode && state.role === 'host') await fbDelete('/rooms/' + state.roomCode);
  resetState();
  showScreen('screen-home');
}
