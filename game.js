// game.js — Core logic: setup, reveal, discussion, voting, results
import { ROLES, assignRoles } from './roles.js';
import { $, h, renderApp, Header, Container, PlayerGrid, Controls, Button, Footer, AdminBox, playerTint } from './ui.js';
// Development diagnostics toggle (visibility gated by first player's name)
const DEV = true;
const devBox = (props) => {
  const firstName = (state?.names?.[0] || '').trim();
  return firstName === 'Admin' ? AdminBox(props) : null;
};

const PHASES = {
  SETUP: 'setup',
  REVEAL: 'reveal',
  DISCUSSION: 'discussion',
  SUMMARY: 'summary',
  VOTING: 'voting',
  RESULTS: 'results',
  INSTRUCTIONS: 'instructions',
};

// Lightweight confetti burst overlay for celebratory reveals
function confettiBurst({ count = 120, duration = 1200, colors = ['#6ee7ff', '#a78bfa', '#fbbf24', '#4ade80', '#ff6b6b'], gravity = 0.12, angle = -Math.PI / 2, spread = Math.PI, scalar = 1 } = {}) {
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '9999' });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
  resize();
  const particles = [];
  const cx = canvas.width / 2;
  const cy = canvas.height * 0.35;
  for (let i = 0; i < count; i++) {
    const speed = (3 + Math.random() * 5) * scalar;
    const dir = angle + (Math.random() - 0.5) * spread;
    particles.push({ x: cx, y: cy, vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed, size: 2 + Math.random() * 3, color: colors[(Math.random() * colors.length) | 0], ttl: duration + Math.random() * 400 });
  }
  const start = performance.now();
  function tick(now) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.vy += gravity;
      p.x += p.vx;
      p.y += p.vy;
      const alpha = Math.max(0, 1 - elapsed / p.ttl);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (elapsed < duration) requestAnimationFrame(tick);
    else { canvas.remove(); }
  }
  requestAnimationFrame(tick);
}

const state = {
  phase: PHASES.SETUP,
  playerCount: 0,
  roles: [], // array of role objects per player index
  revealIndex: 0, // whose turn to reveal
  revealed: {}, // index -> role object for those revealed (temp during reveal)
  votes: {}, // voterIndex -> targetIndex
  names: [], // array of player names
  nameEntry: false, // true if currently entering name
  infected: [], // boolean per player
  pendingInfections: new Set(), // indices chosen by virus this round; applied after resolve
  round: 1,
  endReason: null, // 'hosts' | 'virus' | null
  hostWinners: [], // indices of host winners when hosts win
  lastTally: [], // per-player vote counts for last round
  summaryInfectedCount: 0, // infected count shown on summary
  summaryOutcome: null, // 'hosts' | 'virus' | 'continue'
  discussionEndsAt: null, // timestamp when discussion should end
  _discussionInterval: null, // interval id for ticking countdown
  resultsReveal: { virus: false, infected: false, winners: false },
  turnStartedFor: null, // which player index has acknowledged their turn in Voting
};

function resetVotes() { state.votes = {}; }
function resetReveal() { state.revealed = {}; state.revealIndex = 0; }

function setPhase(phase) {
  const leavingDiscussion = state.phase === PHASES.DISCUSSION && phase !== PHASES.DISCUSSION;
  // Stop discussion ticker when leaving
  if (leavingDiscussion && state._discussionInterval) {
    clearInterval(state._discussionInterval);
    state._discussionInterval = null;
    state.discussionEndsAt = null;
  }

  state.phase = phase;

  // Start discussion ticker when entering
  if (phase === PHASES.DISCUSSION) {
    if (!state.discussionEndsAt) {
      state.discussionEndsAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    }
    if (!state._discussionInterval) {
      state._discussionInterval = setInterval(() => {
        // If time up, auto-advance to Voting
        const remaining = (state.discussionEndsAt || 0) - Date.now();
        if (remaining <= 0) {
          clearInterval(state._discussionInterval);
          state._discussionInterval = null;
          state.discussionEndsAt = null;
          setPhase(PHASES.VOTING);
          return;
        }
        // Otherwise tick UI
        render();
      }, 1000);
    }
  }
  render();
}

function startGame(playerCount) {
  state.playerCount = playerCount;
  state.roles = assignRoles(playerCount);
  state.names = Array(playerCount).fill("");
  state.infected = Array(playerCount).fill(false);
  state.pendingInfections = new Set();
  resetReveal();
  resetVotes();
  state.nameEntry = true;
  state.round = 1;
  state.endReason = null;
  state.hostWinners = [];
  state.lastTally = [];
  state.summaryInfectedCount = 0;
  state.summaryOutcome = null;
  state.resultsReveal = { virus: false, infected: false, winners: false };
  state.turnStartedFor = null;
  // Reset discussion timer state
  if (state._discussionInterval) { clearInterval(state._discussionInterval); state._discussionInterval = null; }
  state.discussionEndsAt = null;
  setPhase(PHASES.REVEAL);
}

function nextReveal() {
  // advance to next player or finish
  if (state.revealIndex < state.playerCount - 1) {
    state.revealed = {}; // hide previous
    state.revealIndex++;
    state.nameEntry = true;
  } else {
    state.revealed = {};
    setPhase(PHASES.DISCUSSION);
    return;
  }
  render();
}

function revealCurrent() {
  const idx = state.revealIndex;
  // Add _flip property to trigger animation
  state.revealed = { [idx]: { ...state.roles[idx], _flip: true } };
  state.nameEntry = false;
  render();
  // Remove _flip after animation duration (500ms)
  setTimeout(() => {
    if (state.revealed[idx]) {
      state.revealed = { [idx]: { ...state.roles[idx] } };
      render();
    }
  }, 500);
}

function startVoting() {
  resetVotes();
  setPhase(PHASES.VOTING);
}

function castVote(voter, target) {
  // Prevent self-votes? Mafia-style often allow; we'll allow for simplicity.
  state.votes[voter] = target;
  render();
}

function allVoted() {
  // Everyone who is not infected must perform an action: hosts/immune vote; virus infects
  // Every player must take an action each round: hosts/immune vote, virus infects, infected acknowledge
  return Object.keys(state.votes).length === state.playerCount;
}

function computeTally() {
  const tally = Array.from({ length: state.playerCount }, () => 0);
  const virusIdx = getVirusIndex();
  for (const voterStr in state.votes) {
    const voter = Number(voterStr);
    if (!Number.isInteger(voter)) continue;
    if (!isEligibleVoter(voter)) continue;
    if (voter === virusIdx) continue; // virus action is infection, not a counted vote
    const t = state.votes[voterStr];
    if (typeof t === 'number' && t >= 0 && t < state.playerCount) tally[t]++;
  }
  return tally;
}

function getVirusIndex() {
  return state.roles.findIndex(r => r.id === ROLES.virus.id);
}

function isEligibleVoter(i) {
  // Eligible = not infected; virus included (virus vote becomes infection and is not counted)
  return !state.infected[i];
}

function eligibleVoters() {
  return Array.from({ length: state.playerCount }, (_, i) => i).filter(isEligibleVoter);
}

function hasVirusMajority(tally) {
  const virusIdx = getVirusIndex();
  const votesForVirus = tally[virusIdx] || 0;
  const nonVirusEligibleCount = eligibleVoters().filter(i => i !== virusIdx).length;
  const needed = Math.floor(nonVirusEligibleCount / 2) + 1;
  return votesForVirus >= needed;
}

function infectionMajorityReached() {
  const infectedCount = state.infected.filter(Boolean).length;
  const needed = Math.floor(state.playerCount / 2) + 1;
  return infectedCount >= needed;
}

function endHostsWin() {
  state.endReason = 'hosts';
  const virusIdx = getVirusIndex();
  // Winners are eligible voters who voted correctly (for the virus) this round
  state.hostWinners = eligibleVoters().filter(v => state.votes[v] === virusIdx);
  state.resultsReveal = { virus: false, infected: false, winners: false };
  setPhase(PHASES.RESULTS);
}

function endVirusWin() {
  state.endReason = 'virus';
  state.resultsReveal = { virus: false, infected: false, winners: false };
  setPhase(PHASES.RESULTS);
}

function toResults() { setPhase(PHASES.RESULTS); }

function replaySameCount() {
  // Preserve previously entered names; just reshuffle roles and restart reveal flow
  state.roles = assignRoles(state.playerCount);
  resetReveal();
  resetVotes();
  state.infected = Array(state.playerCount).fill(false);
  state.pendingInfections = new Set();
  state.nameEntry = true; // show name entry for first player with prefilled name
  state.lastTally = [];
  state.summaryInfectedCount = 0;
  state.summaryOutcome = null;
  state.endReason = null;
  state.hostWinners = [];
  state.resultsReveal = { virus: false, infected: false, winners: false };
  state.turnStartedFor = null;
  if (state._discussionInterval) { clearInterval(state._discussionInterval); state._discussionInterval = null; }
  state.discussionEndsAt = null;
  setPhase(PHASES.REVEAL);
}

// Rendering per phase
function renderSetup() {
  const onStart = () => {
    const input = $('#playerCount');
    const count = parseInt(input.value, 10);
    if (Number.isNaN(count) || count < 3 || count > 8) {
      alert('Enter a valid player count between 3 and 8.');
      return;
    }
    startGame(count);
  };

  return Container(
    Header(),
    h('div', { class: 'grid', style: 'gap:16px' },
      h('div', {},
        h('div', { class: 'phase' }, 'Setup'),
        h('p', { class: 'kicker' }, 'Enter number of players (3–8) and start the game.')
      ),
      h('label', { for: 'playerCount' }, 'Number of players'),
      h('input', { id: 'playerCount', type: 'number', min: '3', max: '8', inputmode: 'numeric', value: String(state.playerCount || 5) }),
    ),
    Controls(
      Button('Start Game', { kind: 'accent', onClick: onStart }),
      Button('Instructions', { kind: 'secondary', onClick: () => setPhase(PHASES.INSTRUCTIONS) })
    ),
    Footer(),
    devBox({
      round: state.round,
      phase: 'Setup',
      players: Array.from({ length: state.playerCount || 0 }, (_, i) => ({ i, name: state.names[i], role: state.roles[i] || {} })),
      virusIdx: getVirusIndex(),
      infected: state.infected,
      votes: state.votes
    })
  );
}

// Instructions screen for new players
function renderInstructions() {
  const backToSetup = () => setPhase(PHASES.SETUP);
  return Container(
    Header(),
    h('div', { class: 'grid', style: 'gap:12px' },
      h('div', {},
        h('div', { class: 'phase' }, 'Instructions'),
        h('div', { class: 'centerpiece' }, '📘'),
        h('p', { class: 'kicker' }, 'Pass-and-play social deduction for 3–8 players on one device.')
      ),
      h('div', {},
        h('div', { class: 'section-title' }, 'Objective'),
        h('p', {}, 'Find the Virus before it infects a majority of players.')
      ),
      h('div', {},
        h('div', { class: 'section-title' }, 'Roles'),
        h('ul', {},
          h('li', {}, '🦠 Virus: During Voting, tap a player to secretly infect them.'),
          h('li', {}, '👥 Hosts: Vote to identify the Virus.'),
          h('li', {}, '☣️ Infected: You cannot vote; tap Continue on your turn.')
        )
      ),
      h('div', {},
        h('div', { class: 'section-title' }, 'Round Flow'),
        h('ol', {},
          h('li', {}, 'Reveal: Each player enters a name and privately sees their role.'),
          h('li', {}, 'Discussion: 5-minute timer (or tap Skip).'),
          h('li', {}, 'Voting: On your turn, tap a player. The Virus infects; Infected cannot vote and must Continue; no self-votes.'),
          h('li', {}, 'Resolve: If a majority voted the Virus, Hosts win immediately. Otherwise, infections apply; if infected players are the majority, the Virus wins.'),
          h('li', {}, 'Summary: Shows infected count and vote counts (no identities). Continue to next round.')
        )
      ),
      h('div', {},
        h('div', { class: 'section-title' }, 'Results'),
        h('p', {}, 'At game end, tap to reveal Infected, the Virus, and the Winners. Confetti celebrates the winners.')
      ),
      h('div', {},
        h('div', { class: 'section-title' }, 'Tips'),
        h('ul', {},
          h('li', {}, 'Only one person looks during their identity reveal. Keep the phone tilted away.'),
          h('li', {}, 'Hosts: Watch behavior and voting patterns.'),
          h('li', {}, 'Virus: Blend in during discussion; infect strategically.')
        )
      )
    ),
    Controls(
      Button('Back to Setup', { kind: 'secondary', onClick: backToSetup })
    ),
    Footer('You can open these instructions anytime from Setup.')
  );
}

function renderReveal() {
  const idx = state.revealIndex;
  const players = Array.from({ length: state.playerCount }, (_, i) => ({ i, name: state.names[i] }));
  const onTileClick = (i) => { if (i === idx && !state.nameEntry) revealCurrent(); };

  // Name entry step
  if (state.nameEntry) {
    return Container(
      Header(),
      h('div', { class: 'grid' },
        h('div', {},
          h('div', { class: 'phase' }, 'Enter Name'),
          h('p', { class: 'kicker' }, `Player #${idx + 1}, enter your name (or nickname):`),
          h('input', {
            id: 'playerName',
            type: 'text',
            maxlength: '16',
            autocomplete: 'off',
            value: state.names[idx] || '',
            style: 'width:100%;font-size:18px;padding:12px;margin-top:8px;',
            oninput: (e) => {
              state.names[idx] = e.target.value;
            }
          })
        )
      ),
      Controls(
        Button('Continue', {
          kind: 'accent',
          onClick: () => {
            const name = $('#playerName').value.trim();
            state.names[idx] = name || `Player #${idx + 1}`;
            state.nameEntry = false;
            // Immediately reveal identity after name entry
            state.revealed = { [idx]: { ...state.roles[idx], _flip: true } };
            render();
            setTimeout(() => {
              if (state.revealed[idx]) {
                state.revealed = { [idx]: { ...state.roles[idx] } };
                render();
              }
            }, 500);
          }
        })
      ),
      Footer('Your name will be shown on your tile and in results.')
    );
  }

  // If revealed, show only current player's name, role, hint, and Hide & Pass button
  if (state.revealed[idx]) {
    const role = state.revealed[idx];
    return Container(
      Header(),
      h('div', { class: 'grid', style: 'justify-items:center;align-items:center;' },
        h('div', {},
          h('div', { class: 'phase' }, 'Identity Reveal'),
          h('div', { class: 'centerpiece', style: 'font-size:2.5rem;' }, role.emoji),
          (() => { const c = playerTint(idx, state.playerCount); return h('div', { class: 'name', style: `font-size:1.3rem;font-weight:800;margin:8px 0;color:${c.tint};` }, state.names[idx] || `Player #${idx + 1}`); })(),
          h('div', { class: 'role', style: 'font-size:1.2rem;margin:6px 0;' }, role.name),
          h('div', { class: 'hint', style: 'margin:8px 0;color:var(--muted);' }, role.hint)
        )
      ),
      Controls(
        Button('Hide & Pass', { kind: 'secondary', onClick: nextReveal })
      ),
      Footer('Keep your role secret!')
    );
  }
  // Otherwise, prompt to tap tile to reveal
  return Container(
    Header(),
    h('div', { class: 'grid' },
      h('div', {},
        h('div', { class: 'phase' }, 'Identity Reveal'),
  (() => { const nm = state.names[idx] || `Player #${idx + 1}`; const c = playerTint(idx, state.playerCount); return h('p', { class: 'kicker' }, h('span', { style: `color:${c.tint};font-weight:800;` }, nm), ', tap your tile to reveal your role.'); })()
      ),
      PlayerGrid(players, { onTileClick, revealMap: state.revealed })
    ),
    Footer('Keep your role secret!'),
    devBox({
      round: state.round,
      phase: 'Reveal',
      players: Array.from({ length: state.playerCount }, (_, i) => ({ i, name: state.names[i], role: state.roles[i] })),
      virusIdx: getVirusIndex(),
      infected: state.infected,
      votes: state.votes
    })
  );
}

function renderDiscussion() {
  // Compute remaining based on existing end time; do not reinitialize here
  const targetEndsAt = state.discussionEndsAt ?? (Date.now() + 5 * 60 * 1000);
  const remainingMs = Math.max(0, targetEndsAt - Date.now());
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  const skipNow = () => {
    if (state._discussionInterval) {
      clearInterval(state._discussionInterval);
      state._discussionInterval = null;
    }
    state.discussionEndsAt = null;
    setPhase(PHASES.VOTING);
  };

  return Container(
    Header(),
    h('div', { class: 'grid' },
      h('div', {},
        h('div', { class: 'phase' }, 'Discussion'),
        h('div', { class: 'centerpiece' }, '🧫'),
        h('p', { class: 'kicker' }, 'Discuss who you think the Virus is.'),
        h('div', { class: 'timer' }, `${mm}:${ss} until voting`)
      ),
    ),
    Controls(
      Button('Skip', { kind: 'accent', onClick: skipNow })
    ),
    Footer('Timer will auto-start voting when it ends.'),
    devBox({
      round: state.round,
      phase: 'Discussion',
      players: Array.from({ length: state.playerCount }, (_, i) => ({ i, name: state.names[i], role: state.roles[i] })),
      virusIdx: getVirusIndex(),
      infected: state.infected,
      votes: state.votes
    })
  );
}

// Infect phase removed; infection now happens during voting by the Virus' vote

function renderVoting() {
  const players = Array.from({ length: state.playerCount }, (_, i) => ({ i, name: state.names[i] }));
  const onTileClick = (target) => {
    // Determine current actor = next player (all players act) who hasn't acted yet
    const order = Array.from({ length: state.playerCount }, (_, i) => i);
    const voted = new Set(Object.keys(state.votes).map(Number));
    let voterIdx = 0;
    while (voterIdx < order.length && voted.has(order[voterIdx])) voterIdx++;
    if (voterIdx >= order.length) return; // all voted
    const voter = order[voterIdx];
    if (state.turnStartedFor !== voter) return; // gate clicks until the player begins their turn
    if (state.infected[voter]) return; // infected players cannot vote
    if (target === voter) return; // no self-vote
    const virusIdx = getVirusIndex();
    if (voter === virusIdx) {
      // Virus secretly infects the chosen target instead of casting a vote
      if (target === virusIdx) return; // cannot infect self
      if (state.roles[target]?.id === ROLES.immune.id) return; // immune cannot be infected
      state.votes[voter] = target; // record for progression
      // Only add as pending if not already infected from previous rounds
      if (!state.infected[target]) {
        state.pendingInfections.add(target); // defer infection application until resolve
      }
      state.turnStartedFor = null; // hide next player's role-specific prompt until they begin
      render();
      return;
    }
    castVote(voter, target);
    state.turnStartedFor = null; // hide next player's role-specific prompt until they begin
  };

  const votedCount = Object.keys(state.votes).length;
  const allDone = allVoted();
  const order = Array.from({ length: state.playerCount }, (_, i) => i);
  const currentVoter = !allDone ? order[votedCount] : null;
  const isVirusTurn = currentVoter != null && currentVoter === getVirusIndex();
  const isInfectedTurn = currentVoter != null && state.infected[currentVoter] === true;
  const started = currentVoter != null && state.turnStartedFor === currentVoter;
  const currentName = currentVoter != null ? (state.names[currentVoter] || 'Player') : 'Player';
  const currentColor = currentVoter != null ? playerTint(currentVoter, state.playerCount || 1) : null;

  // Hide current voter's own tile instead of showing a no self-vote warning.
  const hidden = new Set();
  if (currentVoter != null) hidden.add(currentVoter);

  const preTurnVisual = (!started && !allDone && currentVoter != null)
    ? h('div', { class: 'centerpiece', title: 'Hand the device over' }, '📱')
    : PlayerGrid(players, { onTileClick, enableClicks: !allDone && started && !isInfectedTurn, currentIndex: currentVoter, hiddenIndices: Array.from(hidden) });

  const preTurnKicker = (!started && !allDone && currentVoter != null)
    ? (() => { const span = h('span', { style: `color:${currentColor?.tint};font-weight:800;` }, currentName); return ['Hand the device to: ', span]; })()
    : (allDone
        ? 'All actions in.'
        : started
          ? (isInfectedTurn
              ? (() => { const span = h('span', { style: `color:${currentColor?.tint};font-weight:800;` }, currentName); return [span, ', You are infected! You cannot vote.']; })()
              : (isVirusTurn ? 'Tap a player to infect.' : 'Tap who you suspect.'))
          : (() => { const span = h('span', { style: `color:${currentColor?.tint};font-weight:800;` }, currentName); return [span, "'s turn."]; })());

  const root = Container(
    Header(),
    h('div', { class: 'grid' },
      h('div', {},
        h('div', { class: 'phase' }, (started && currentVoter != null)
          ? [h('span', { style: `color:${currentColor?.tint};font-weight:800;` }, currentName), ' is VOTING']
          : 'Voting'),
        h('p', { class: 'kicker' }, preTurnKicker)
      ),
      preTurnVisual
    ),
    Controls(
      !started && !allDone
        ? (() => { const label = h('span', {}, h('span', { style: `color:${currentColor?.tint};font-weight:800;` }, currentName), ', tap to Begin Your Turn'); return Button(label, { kind: 'accent', onClick: () => { if (currentVoter != null) { state.turnStartedFor = currentVoter; render(); } } }); })()
        : Button(isInfectedTurn
          ? 'Continue'
          : allDone ? 'Resolve Round' : `Actions: ${votedCount}/${state.playerCount}`, { kind: isInfectedTurn ? 'accent' : (allDone ? 'success' : 'secondary'), class: isInfectedTurn ? 'btn-pulse' : '', onClick: () => {
              if (!started && !allDone) return; // ignore until turn started
              if (isInfectedTurn) {
                if (currentVoter == null) return;
                state.votes[currentVoter] = null; // mark as acted without a vote
                state.turnStartedFor = null; // hide next player's prompt
                render();
              } else {
                if (!allDone) return;
                const tally = computeTally();
                const infectedBefore = state.infected.filter(Boolean).length;
                const pending = state.pendingInfections.size;
                const willHostsWin = hasVirusMajority(tally);
                if (willHostsWin) {
                  state.lastTally = tally;
                  // Hosts win immediately after voting -> go directly to results
                  endHostsWin();
                  return;
                }
                // Apply deferred infections after voting completes
                for (const idx of state.pendingInfections) { state.infected[idx] = true; }
                state.pendingInfections.clear();
                const infectedAfter = state.infected.filter(Boolean).length;
                state.lastTally = tally;
                if (infectionMajorityReached()) {
                  // Virus wins after infections applied -> go directly to results
                  endVirusWin();
                  return;
                }
                state.summaryInfectedCount = infectedAfter;
                state.summaryOutcome = 'continue';
                setPhase(PHASES.SUMMARY);
              }
            } })
    ),
  Footer((!started && !allDone) ? '' : (isInfectedTurn ? 'You are infected and cannot vote this round.' : 'Tap a player tile to vote.')),
    devBox({
      round: state.round,
      phase: 'Voting',
      players: Array.from({ length: state.playerCount }, (_, i) => ({ i, name: state.names[i], role: state.roles[i] })),
      virusIdx: getVirusIndex(),
      infected: state.infected,
      votes: state.votes
    })
  );

  // Background cue by actor type
  const turnClass = started ? (isInfectedTurn ? 'turn-infected' : (isVirusTurn ? 'turn-virus' : 'turn-host')) : null;
  if (turnClass) root.classList.add(turnClass);
  return root;
}

function renderSummary() {
  const players = Array.from({ length: state.playerCount }, (_, i) => ({ i, name: state.names[i] }));
  const votesMap = Object.fromEntries((state.lastTally || []).map((c, i) => [i, c]));
  const onContinue = () => {
    if (state.summaryOutcome === 'hosts') { endHostsWin(); return; }
    if (state.summaryOutcome === 'virus') { endVirusWin(); return; }
    state.round += 1;
    resetVotes();
    setPhase(PHASES.DISCUSSION);
  };
  return Container(
    Header(),
    h('div', { class: 'grid' },
      h('div', {},
        h('div', { class: 'phase' }, 'Voting Summary'),
        h('div', { class: 'centerpiece' }, '🗳️'),
        h('div', { class: 'infected-highlight' },
          h('span', { class: 'parasite-icon', title: 'infected' }, '🦠'),
          h('span', { class: 'infected-label' }, 'Infected players:'),
          h('span', { class: 'infected-count' }, String(state.summaryInfectedCount))
        )
      ),
      h('div', { class: 'votes' },
        h('div', { class: 'vote-row' },
          h('div', {}, 'Vote counts'),
          h('div', { class: 'count' }, ' ')
        ),
        ...players.map(p => {
          const color = playerTint(p.i, players.length);
          const label = h('div', {},
            h('span', { class: 'name-dot', style: `background:${color.tint}; box-shadow: 0 0 6px ${color.tint};` }),
            ' ',
            (() => { const nm = p.name || `Player #${p.i + 1}`; return h('span', { style: `color:${color.tint};font-weight:800;` }, nm); })()
          );
          return h('div', { class: 'vote-row' },
            label,
            h('div', { class: 'count' }, String(votesMap[p.i] || 0))
          );
        })
      )
    ),
    Controls(
      Button(state.summaryOutcome === 'continue' ? 'Next Round' : 'Show Results', { kind: 'accent', onClick: onContinue })
    ),
    Footer('Round summary: no identities revealed.'),
    devBox({
      round: state.round,
      phase: 'Summary',
      players: Array.from({ length: state.playerCount }, (_, i) => ({ i, name: state.names[i], role: state.roles[i] })),
      virusIdx: getVirusIndex(),
      infected: state.infected,
      votes: state.votes
    })
  );
}

function renderResults() {
  const players = Array.from({ length: state.playerCount }, (_, i) => ({ i, name: state.names[i] }));
  const virusIdx = getVirusIndex();
  const virusName = state.names[virusIdx] || `Player #${virusIdx + 1}`;
  const hostWin = state.endReason === 'hosts';
  const winnerText = hostWin ? 'Hosts win!' : 'Virus wins!';
  const infectedIndices = players.map((_, i) => i).filter(i => state.infected[i]);
  const winners = hostWin ? state.hostWinners : [virusIdx];

  const colorName = (i) => {
    const { tint } = playerTint(i, players.length);
    const nm = state.names[i] || `Player #${i + 1}`;
    return h('span', { class: 'name-pill', style: `--pill:${tint};` },
      h('span', { class: 'name-dot', style: `background:${tint}; box-shadow: 0 0 6px ${tint};` }), ' ', nm
    );
  };

  return Container(
    Header(),
    h('div', { class: 'grid' },
      h('div', {},
        h('div', { class: 'phase' }, 'Results'),
        h('div', { class: 'centerpiece' }, hostWin ? '🧬' : '🦠'),
        h('h2', { class: 'winner-banner' }, winnerText),
        infectedIndices.length ? h('div', { class: 'section' },
          h('div', { class: 'section-title' }, 'Infected players'),
          state.resultsReveal.infected
            ? h('div', { class: 'chips sweep' }, ...infectedIndices.map((i, idx) => {
                const el = colorName(i);
                el.classList.add('reveal');
                el.style.setProperty('--d', `${idx * 90}ms`);
                return el;
              }))
            : Button('Tap to reveal the Infected Players', { kind: 'secondary', onClick: () => { state.resultsReveal.infected = true; render(); }})
        ) : null,
        h('div', { class: 'section' },
          h('div', { class: 'section-title' }, 'Virus'),
          state.resultsReveal.virus
            ? (() => { const el = colorName(virusIdx); el.classList.add('reveal','reveal-glow','shake-once'); return el; })()
            : Button('Tap to reveal the Virus', { kind: 'secondary', onClick: () => { state.resultsReveal.virus = true; render(); }})
        ),
        h('div', { class: 'section' },
          h('div', { class: 'section-title' }, 'Winners'),
          state.resultsReveal.winners
            ? h('div', { class: 'chips winners' }, ...winners.map((i, idx) => { const el = colorName(i); el.classList.add('reveal'); el.style.setProperty('--d', `${idx * 110}ms`); return el; }))
            : Button('Tap to reveal the Winners', { kind: 'accent', onClick: () => { state.resultsReveal.winners = true; confettiBurst({ count: 160, colors: ['#6ee7ff', '#4ade80', '#fbbf24', '#a78bfa'] }); render(); }})
        )
      ),
      // Removed player tiles and vote counts per request
    ),
    Controls(
      Button('Replay (Same Players)', { kind: 'accent', onClick: replaySameCount }),
      Button('New Game (Change Count)', { kind: 'secondary', onClick: () => setPhase(PHASES.SETUP) })
    ),
    Footer('Play again or change the player count'),
    devBox({
      round: state.round,
      phase: 'Results',
      players: Array.from({ length: state.playerCount }, (_, i) => ({ i, name: state.names[i], role: state.roles[i] })),
      virusIdx: getVirusIndex(),
      infected: state.infected,
      votes: state.votes
    })
  );
}

function render() {
  const app = $('#app');
  if (!app) return;
  switch (state.phase) {
    case PHASES.SETUP: return renderApp(app, renderSetup());
    case PHASES.REVEAL: return renderApp(app, renderReveal());
    case PHASES.DISCUSSION: return renderApp(app, renderDiscussion());
    case PHASES.SUMMARY: return renderApp(app, renderSummary());
    case PHASES.VOTING: return renderApp(app, renderVoting());
    case PHASES.RESULTS: return renderApp(app, renderResults());
    case PHASES.INSTRUCTIONS: return renderApp(app, renderInstructions());
  }
}

// Initial render
window.addEventListener('DOMContentLoaded', () => {
  render();
});
