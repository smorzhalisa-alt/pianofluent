import { noteName, isBlackKey } from './midi.js';
import { formatDuration, formatDurationHuman, computeStreak, personalRecords, weeklyTotals, dayKey } from './session.js';
import { LEVELS, speedLabel, rhythmLabel, touchLabel, coachNotes, computeScore } from './competitions.js';

/* ---------- helpers ---------- */

export function el(html){
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
}

export function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

function relativeTime(iso){
  const t = Date.parse(iso);
  const diff = (Date.now() - t) / 1000;
  if(diff < 60) return 'just now';
  if(diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if(diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  if(diff < 7*86400) return `${Math.floor(diff/86400)}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month:'short', day:'numeric' });
}

/* ---------- Commitment grid ---------- */

function commitmentGrid(sessions) {
  const weeks = 20;
  const totalDays = weeks * 7;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayCounts = {};
  for (const s of sessions) {
    const dk = dayKey(new Date(s.startedAt));
    dayCounts[dk] = (dayCounts[dk] || 0) + 1;
  }

  const maxCount = Math.max(1, ...Object.values(dayCounts));
  const cells = [];

  const dayOfWeek = today.getDay();
  const gridStart = new Date(today);
  gridStart.setDate(gridStart.getDate() - (totalDays - 1) - dayOfWeek);

  for (let col = 0; col < weeks; col++) {
    for (let row = 0; row < 7; row++) {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + col * 7 + row);
      const dk = dayKey(d);
      const count = dayCounts[dk] || 0;
      const future = d > today;

      let level = 0;
      if (count > 0) {
        const ratio = count / maxCount;
        if (ratio <= 0.25) level = 1;
        else if (ratio <= 0.5) level = 2;
        else if (ratio <= 0.75) level = 3;
        else level = 4;
      }

      const title = future ? '' : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${count} session${count === 1 ? '' : 's'}`;
      cells.push(`<div class="commit-cell ${future ? 'future' : ''} level-${level}" data-day="${dk}" title="${title}" ${count > 0 ? `data-action="open-day" data-id="${dk}"` : ''}></div>`);
    }
  }

  return `<div class="commit-grid" style="display:grid; grid-template-rows:repeat(7,1fr); grid-auto-flow:column; gap:3px;">${cells.join('')}</div>`;
}

/* ---------- Last session stats widget ---------- */

function lastSessionWidget(sessions) {
  sessions = sessions.filter(s => !s.testSkip);
  if (!sessions.length) {
    return `
      <div class="last-session-empty">
        <h4>No sessions yet</h4>
        <p>Record your first practice to see stats here.</p>
        <div style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap">
          <button class="btn pink" data-action="start-session">Connect piano</button>
          <button class="btn" data-action="open-upload">Commit with audio</button>
        </div>
      </div>`;
  }

  const s = sessions[0];
  const sl = s.npm ? speedLabel(s.npm || s.notesPerMinute || 0) : '—';
  const npm = s.npm || s.notesPerMinute || 0;
  const rl = s.cv != null ? rhythmLabel(s.cv) : '—';
  const tl = s.dbStd != null ? touchLabel(s.dbStd) : '—';
  const acc = s.ascending?.inKeyPct || s.inKeyPct || 0;

  let rhythmSub = 'No data';
  if (s.cv != null) {
    if (s.cv >= 0.60) rhythmSub = 'Speeds up and slows down';
    else if (s.cv >= 0.40) rhythmSub = 'A few rushed spots';
    else rhythmSub = 'Nice and steady';
  }

  let touchSub = 'No data';
  if (s.dbStd != null) {
    if (s.dbStd >= 8) touchSub = 'Bass notes quieter';
    else if (s.dbStd >= 5) touchSub = 'Some loud/soft spots';
    else touchSub = 'Even touch throughout';
  }

  const dateStr = relativeTime(s.startedAt || s.endedAt || new Date().toISOString());

  return `
    <div class="last-session-header">
      <span style="font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em; font-weight:800">Last session · ${dateStr}</span>
    </div>
    <div class="last-session-stats">
      <div class="ls-stat">
        <div class="ls-label">Speed</div>
        <div class="ls-value">${sl}</div>
        <div class="ls-sub">~${npm}/min</div>
      </div>
      <div class="ls-stat">
        <div class="ls-label">Rhythm</div>
        <div class="ls-value">${rl}</div>
        <div class="ls-sub">${rhythmSub}</div>
      </div>
      <div class="ls-stat">
        <div class="ls-label">Touch</div>
        <div class="ls-value">${tl}</div>
        <div class="ls-sub">${touchSub}</div>
      </div>
      <div class="ls-stat">
        <div class="ls-label">Accuracy</div>
        <div class="ls-value">${acc}%</div>
        <div class="ls-sub">in key</div>
      </div>
    </div>`;
}

/* ---------- views ---------- */

export function viewWelcome({ browser }){
  const warn = browser.ok ? '' : `<div class="alert warn">
      <h4>Browser not supported</h4>
      <p>You're on <b>${escapeHtml(browser.name)}</b>. Web MIDI needs Chrome or Edge. Open PianoFluent in one of those browsers to continue.</p>
    </div>`;

  return `
    ${warn}
    <section class="glass hero">
      <span class="pill">Piano practice tracker</span>
      <h2 style="margin-top:16px">Every practice session, measured.</h2>
      <p class="lede">Connect your piano over MIDI or upload a recording — PianoFluent turns your playing into stats, streaks, and competition scores. Like Strava, but for the keys.</p>
      <div class="cta-row">
        <button class="btn big pink" data-action="start-connect" ${browser.ok ? '' : ''}>Connect my piano</button>
        <button class="btn big" data-action="open-upload">Upload audio</button>
        <button class="btn-secondary" data-action="skip-to-home">Skip for now</button>
      </div>
    </section>

    <div class="features">
      <div class="feature">
        <div class="icon">1</div>
        <h4>Record</h4>
        <p>MIDI keyboard live or upload an audio file — both work. No app install needed.</p>
      </div>
      <div class="feature">
        <div class="icon">2</div>
        <h4>Get your report</h4>
        <p>Speed, accuracy, touch, rhythm — all analyzed automatically with coaching tips.</p>
      </div>
      <div class="feature">
        <div class="icon">3</div>
        <h4>Compete & grow</h4>
        <p>Enter competitions on standard passages. Track your improvement over time.</p>
      </div>
    </div>
  `;
}

export function viewConnect({ browser, inputs, currentDeviceName, savedDevices, guess, testNote }){
  const stepPair = currentDeviceName ? 'done' : 'active';
  const stepTest = currentDeviceName ? (testNote ? 'done' : 'active') : '';
  const stepReady = testNote ? 'done' : '';

  const browserWarn = browser.ok ? '' : `<div class="alert">
    <h4>Wrong browser</h4>
    <p>${escapeHtml(browser.tip)}</p>
  </div>`;

  const inputList = inputs.length
    ? `<div class="device-list">${inputs.map(i => {
        const isConnected = i.id === currentDeviceIdShim();
        return `
        <div class="device-item ${isConnected ? 'connected' : ''}" data-action="connect-device" data-id="${escapeHtml(i.id)}">
          <div>
            <div class="name"><span class="conn-dot ${isConnected ? 'green' : ''}"></span>${escapeHtml(i.name)}</div>
            <div class="meta">${escapeHtml(i.manufacturer || 'MIDI input')} · ${escapeHtml(i.connection)}</div>
          </div>
          <button class="btn-ghost ${isConnected ? 'connected' : ''}">${isConnected ? 'Connected' : 'Connect'}</button>
        </div>`;
      }).join('')}</div>`
    : `<div class="device-empty">No MIDI inputs detected yet. Turn on your piano, enable Bluetooth or plug in USB, then click <b>Scan for pianos</b>.</div>`;

  const helpSteps = guess
    ? `<h4>Setup for ${escapeHtml(guess.label)}</h4><ol>${guess.instructions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`
    : `<h4>Generic setup</h4><ol>${genericSteps().map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`;

  const saved = savedDevices.length ? `
    <div class="section-title" style="margin-top:26px"><h3>Saved pianos</h3></div>
    <div class="device-list">${savedDevices.map(d => `
      <div class="device-item">
        <div>
          <div class="name">${escapeHtml(d.name)}</div>
          <div class="meta">Last used ${escapeHtml(relativeTime(d.lastConnectedAt))}</div>
        </div>
        <button class="btn-ghost" data-action="forget-device" data-id="${escapeHtml(d.id)}">Forget</button>
      </div>`).join('')}</div>` : '';

  const testBlock = currentDeviceName ? `
    <div class="section-title" style="margin-top:26px"><h3>Play a note to confirm</h3></div>
    <div class="note-detect ${testNote ? 'success' : 'waiting'}">
      <div style="flex:1">
        ${testNote
          ? `<div class="big-note" style="color:#1a8a4a">&#10003; Note detected: ${escapeHtml(noteName(testNote.note))}</div>
             <div class="muted" style="margin-top:2px">Velocity ${testNote.velocity} · You're all set.</div>`
          : `<div class="big-note muted">Waiting for a note…</div>
             <div class="muted" style="margin-top:2px">Press any key on <b>${escapeHtml(currentDeviceName)}</b> to test the connection.</div>`}
      </div>
      ${testNote ? `<button class="btn pink" data-action="go-home">Go to dashboard</button>` : ''}
    </div>` : '';

  return `
    <section class="glass panel">
      <div class="stepper">
        <div class="step ${stepPair}">1 · Pair</div>
        <div class="step ${stepTest}">2 · Test note</div>
        <div class="step ${stepReady}">3 · Ready</div>
      </div>
      <h2>Connect your piano</h2>
      <p class="lede">Bluetooth MIDI or USB — both work. Once paired, the connection is remembered for next time.</p>
      ${browserWarn}
      <div style="display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap">
        <button class="btn" data-action="scan" ${browser.ok ? '' : 'disabled'}>Scan for pianos</button>
        <select id="modelSelect" class="btn-ghost" style="padding-left:10px">
          <option value="">Choose your model (optional)</option>
          ${modelOptions(guess?.key)}
        </select>
      </div>
      ${inputList}
      <div class="help-block">${helpSteps}</div>
      ${testBlock}
      ${saved}
    </section>
  `;
}

let _currentDeviceId = null;
export function _setCurrentDeviceIdShim(id){ _currentDeviceId = id; }
function currentDeviceIdShim(){ return _currentDeviceId; }

function genericSteps(){
  return [
    'Turn on your piano and enable Bluetooth MIDI (usually in the Function menu).',
    'Or plug the piano into this computer with a USB MIDI cable.',
    'Click "Scan for pianos" — the browser will ask for MIDI access.',
    'Pick your piano from the list.',
  ];
}

function modelOptions(activeKey){
  const models = [
    ['roland-fp30x', 'Roland FP-30X'],
    ['doutreligne-mhp2000', 'Doutreligne MHP-2000 / 2000S'],
    ['roland-generic', 'Other Roland'],
    ['yamaha-generic', 'Yamaha (P / CLP / YDP)'],
    ['kawai-generic', 'Kawai (ES / CN / CA)'],
    ['usb-generic', 'USB MIDI (any brand)'],
  ];
  return models.map(([k, label]) =>
    `<option value="${k}" ${k===activeKey?'selected':''}>${escapeHtml(label)}</option>`
  ).join('');
}

/* ---------- Home dashboard (wireframe layout) ---------- */

function currentLevel(sessions) {
  const real = sessions.filter(s => !s.testSkip);
  const completed = new Set(real.filter(s => s.competitionPassageId && s.competitionScore >= 20).map(s => s.competitionPassageId));
  for (let i = 0; i < LEVELS.length; i++) {
    const allDone = LEVELS[i].passages.every(p => completed.has(p.id));
    if (!allDone) return { index: i, level: LEVELS[i], completedCount: i };
  }
  return { index: LEVELS.length - 1, level: LEVELS[LEVELS.length - 1], completedCount: LEVELS.length };
}

export function viewHome({ sessions, currentDeviceName, connected }){
  const streak = computeStreak(sessions);
  const { level, completedCount } = currentLevel(sessions);
  const realSessions = sessions.filter(s => !s.testSkip);

  return `
    <section class="glass panel home-top">
      <div class="home-top-left">
        <h2 style="margin-bottom:0">Start practice</h2>
        <div class="level-indicator">
          <span class="level-badge">Your level: ${escapeHtml(level.name)}</span>
          ${completedCount > 0 ? `<span class="level-count">${completedCount}</span>` : ''}
        </div>
      </div>
      <div class="home-top-right">
        <button class="btn pink big" data-action="open-level" data-id="${level.id}">Uncover ${escapeHtml(level.name)}</button>
      </div>
    </section>

    <section class="home-main">
      <div class="glass panel home-commits">
        <div class="section-title"><h3>Commitments</h3><span class="muted">${streak.current > 0 ? `${streak.current}-day streak` : 'No streak yet'}</span></div>
        <p class="muted" style="font-size:12px; margin:0 0 12px">Click a day to see reports</p>
        ${commitmentGrid(sessions)}
        <div style="margin-top:10px; font-size:11px; color:var(--muted); display:flex; gap:6px; align-items:center">
          <span>Less</span>
          <div class="commit-cell level-0" style="width:12px;height:12px;display:inline-block"></div>
          <div class="commit-cell level-1" style="width:12px;height:12px;display:inline-block"></div>
          <div class="commit-cell level-2" style="width:12px;height:12px;display:inline-block"></div>
          <div class="commit-cell level-3" style="width:12px;height:12px;display:inline-block"></div>
          <div class="commit-cell level-4" style="width:12px;height:12px;display:inline-block"></div>
          <span>More</span>
        </div>
      </div>
      <div class="glass panel home-last-session">
        ${lastSessionWidget(sessions)}
      </div>
    </section>

    <section class="home-bottom">
      <div class="glass panel home-friends">
        <h3 style="font-size:15px; color:var(--deep-red); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:12px">Your friends</h3>
        <div class="friends-empty">
          <p class="muted" style="font-size:13px; margin:0">No friends in the app yet.</p>
          <p class="muted" style="font-size:12px; margin:6px 0 0">Share your link to add friends and compare scores.</p>
        </div>
      </div>
      <div class="glass panel home-competitions">
        <h3 style="font-size:15px; color:var(--deep-red); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:4px">Competitions</h3>
        <span class="comp-in-progress-badge">In progress</span>
        <p class="muted" style="font-size:12px; margin:8px 0 12px">Competitions require a server. Coming soon — you'll be able to compare scores with friends.</p>
        ${LEVELS.map(level => `
          <div class="comp-level blocked">
            <div class="comp-level-name">${escapeHtml(level.name)}</div>
            <span class="muted" style="font-size:12px">${escapeHtml(level.subtitle || '')}</span>
          </div>
        `).join('')}
      </div>
      <div class="glass panel home-badges">
        <h3 style="font-size:15px; color:var(--deep-red); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:12px">Monthly badges</h3>
        ${monthlyBadges(sessions, streak)}
      </div>
    </section>

    ${realSessions.length ? `
    <section class="glass panel" style="margin-top:20px">
      <div class="section-title"><h3>Session history</h3><span class="muted">${realSessions.length} total</span></div>
      <div class="history">
        ${realSessions.slice(0, 20).map(s => historyRow(s)).join('')}
      </div>
    </section>` : ''}
  `;
}

function monthlyBadges(sessions, streak) {
  const badges = [];
  if (sessions.length >= 1) badges.push({ icon: '🎹', name: 'First note', desc: 'Completed first session' });
  if (streak.current >= 3) badges.push({ icon: '🔥', name: '3-day streak', desc: 'Practiced 3 days in a row' });
  if (streak.current >= 7) badges.push({ icon: '⭐', name: 'Week warrior', desc: '7-day practice streak' });
  if (sessions.length >= 10) badges.push({ icon: '💎', name: 'Dedicated', desc: '10 sessions completed' });

  if (!badges.length) {
    return `<p class="muted" style="font-size:13px; margin:0">Complete sessions to earn badges!</p>`;
  }

  return `<div class="badge-grid">${badges.map(b =>
    `<div class="badge-item" title="${escapeHtml(b.desc)}">
      <div class="badge-icon">${b.icon}</div>
      <div class="badge-name">${escapeHtml(b.name)}</div>
    </div>`
  ).join('')}</div>`;
}

function historyRow(s){
  const started = new Date(s.startedAt);
  const dateStr = started.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' });
  const timeStr = started.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' });
  const sourceIcon = s.source === 'audio' ? '🎵' : '🎹';
  return `
    <div class="history-item" data-action="open-session" data-id="${escapeHtml(s.id)}">
      <div>
        <div class="when">${sourceIcon} ${escapeHtml(dateStr)}</div>
        <div class="when-sub">${escapeHtml(timeStr)}</div>
      </div>
      <div class="history-stat"><b>${formatDurationHuman(s.durationSeconds)}</b>duration</div>
      <div class="history-stat"><b>${s.totalNotes.toLocaleString()}</b>notes</div>
      <div class="history-stat hide-sm"><b>${s.notesPerMinute || s.npm || 0}</b>notes/min</div>
    </div>
  `;
}

/* ---------- Upload view ---------- */

export function viewUpload({ processing, error, passageId }) {
  const passage = passageId ? LEVELS.flatMap(l => l.passages).find(p => p.id === passageId) : null;

  return `
    <section class="glass panel">
      <h2>Upload audio</h2>
      <p class="lede">Record a passage on your phone or computer, then upload the file here. We'll analyze your speed, accuracy, touch, and rhythm.</p>

      <div class="field">
        <label>What did you play? (optional — for competition scoring)</label>
        <select id="passageSelect">
          <option value="">Free practice (no competition)</option>
          ${LEVELS.filter(l => !l.locked).flatMap(l => {
            const items = [...l.passages];
            if (l.legendary) items.push(l.legendary);
            return items;
          }).map(p =>
            `<option value="${p.id}" ${p.id === passageId ? 'selected' : ''}>${escapeHtml(p.name)} — ${escapeHtml(p.detail)}</option>`
          ).join('')}
        </select>
      </div>

      ${passage ? `<div class="alert info" style="margin-top:0"><h4>Competition: ${escapeHtml(passage.name)}</h4><p>${escapeHtml(passage.description)}</p></div>` : ''}

      <div class="upload-zone ${processing ? 'processing' : ''}" id="uploadZone">
        ${processing
          ? `<div class="upload-processing">
               <div class="spinner"></div>
               <p>Analyzing your recording...</p>
             </div>`
          : `<div class="upload-prompt">
               <div style="font-size:32px; margin-bottom:12px">📁</div>
               <p style="font-weight:700; margin:0 0 6px">Drop audio file here</p>
               <p class="muted" style="font-size:12px; margin:0">or click to browse · m4a, mp3, wav</p>
               <input type="file" id="audioFile" accept=".m4a,.mp3,.wav,.ogg,.aac,audio/*" style="display:none">
             </div>`}
      </div>

      ${error ? `<div class="alert" style="margin-top:14px"><h4>Analysis error</h4><p>${escapeHtml(error)}</p></div>` : ''}

      <div style="margin-top:16px">
        <button class="btn-secondary" data-action="go-home">← Back to dashboard</button>
      </div>
    </section>
  `;
}

/* ---------- Competition level view ---------- */

export function viewLevel({ levelId, sessions }) {
  const level = LEVELS.find(l => l.id === levelId);
  if (!level) return `<section class="glass panel"><h2>Level not found</h2><button class="btn" data-action="go-home">Home</button></section>`;

  const allPassages = [...level.passages];
  if (level.legendary) allPassages.push(level.legendary);

  return `
    <section class="glass panel">
      <h2>${escapeHtml(level.name)}: ${escapeHtml(level.subtitle || '')}</h2>
      <p class="lede">Upload attempts to improve your score. ${level.legendary ? 'Complete the main passage to unlock Legendary.' : ''}</p>

      <div class="passage-list">
        ${level.passages.map(p => passageCard(p, sessions, false)).join('')}
        ${level.legendary ? passageCard(level.legendary, sessions, true) : ''}
      </div>

      <div style="margin-top:20px">
        <button class="btn-secondary" data-action="go-home">← Back to dashboard</button>
      </div>
    </section>

    <section class="glass panel" style="margin-top:20px">
      <div class="section-title"><h3>Scoring rules</h3></div>
      <div class="rules-grid">
        <div class="rule-card">
          <h4>Speed (0–70 pts)</h4>
          <p>Based on notes per minute. Slow = 10–25, Medium = 25–45, Fluent = 45–60, Fast = 60–70.</p>
        </div>
        <div class="rule-card">
          <h4>Accuracy (×0.5–1.0)</h4>
          <p>Multiplied by your speed points. Below 80% cuts your score in half. 99%+ = full credit.</p>
        </div>
        <div class="rule-card">
          <h4>Evenness (+0–15 bonus)</h4>
          <p>Bonus for steady rhythm. Not a blocker — an uneven but fast/accurate run still scores well.</p>
        </div>
      </div>
      <div class="formula-box">
        <code>Score = Speed × Accuracy + Evenness bonus</code>
        <p class="muted" style="font-size:12px; margin-top:6px">A fast player at 75% accuracy scores <b>worse</b> than a medium player at 99% accuracy.</p>
      </div>
    </section>
  `;
}

function passageCard(p, sessions, isLegendary) {
  const best = bestScoreForPassage(p.id, sessions);
  return `
    <div class="passage-card ${isLegendary ? 'legendary' : ''}">
      <div class="passage-info">
        <div class="passage-name">${isLegendary ? '⭐ ' : ''}${escapeHtml(p.name)}</div>
        <div class="passage-detail">${escapeHtml(p.detail)}</div>
        <div class="passage-desc">${escapeHtml(p.description)}</div>
      </div>
      <div class="passage-score">
        ${best != null
          ? `<div class="score-value">${best}</div><div class="score-label">Best score</div>`
          : `<div class="score-label">No attempts</div>`}
      </div>
      <button class="btn pink" data-action="compete-upload" data-id="${p.id}">Upload attempt</button>
    </div>`;
}

function bestScoreForPassage(passageId, sessions) {
  const attempts = sessions.filter(s => s.competitionPassageId === passageId && s.competitionScore != null);
  if (!attempts.length) return null;
  return Math.max(...attempts.map(s => s.competitionScore));
}

/* ---------- Audio report view ---------- */

export function viewAudioReport({ session, passage, score, isFresh }) {
  const dateStr = new Date(session.startedAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const sl = speedLabel(session.npm || session.notesPerMinute || 0);
  const rl = session.cv != null ? rhythmLabel(session.cv) : '—';
  const tl = session.dbStd != null ? touchLabel(session.dbStd) : '—';
  const inKeyPct = session.inKeyPct || 0;
  const notes = coachNotes({
    npm: session.npm || session.notesPerMinute || 0,
    cv: session.cv || 0,
    inKeyPct: inKeyPct,
  });

  return `
    <section class="glass panel">
      <div class="summary-header">
        ${isFresh ? `<span class="pill">Session saved</span>` : ''}
        <h2>${passage ? escapeHtml(passage.name) : 'Practice session'}</h2>
        <p class="lede">${escapeHtml(dateStr)} · ${session.durationSeconds || session.duration || 0}s · ${session.totalNotes} notes · ${session.source === 'audio' ? escapeHtml(session.fileName || 'Audio upload') : 'MIDI'}</p>
      </div>

      ${score ? `
        <div class="competition-score-banner">
          <div class="comp-score-value">${score.total}</div>
          <div class="comp-score-label">Competition score</div>
          <div class="comp-score-breakdown">
            Speed ${score.speedPoints} × Accuracy ${score.accuracyMultiplier} + Evenness ${score.evennessBonus}
          </div>
        </div>
      ` : ''}

      <div class="insight-grid" style="margin-top:20px">
        <div class="insight-card warm">
          <div class="label">Speed</div>
          <div class="value">${sl}</div>
          <div class="sub">~${session.npm || session.notesPerMinute || 0}/min</div>
        </div>
        <div class="insight-card pink">
          <div class="label">Rhythm</div>
          <div class="value">${rl}</div>
          <div class="sub">${session.cv != null ? `CV ${session.cv}` : '—'}</div>
        </div>
        <div class="insight-card blue">
          <div class="label">Touch</div>
          <div class="value">${tl}</div>
          <div class="sub">${session.dbStd != null ? `±${session.dbStd} dB` : '—'}</div>
        </div>
        <div class="insight-card green">
          <div class="label">Accuracy</div>
          <div class="value">${inKeyPct}%</div>
          <div class="sub">in key</div>
        </div>
      </div>

      <div class="coach-notes" style="margin-top:20px">
        <h4 style="font-size:13px; color:var(--deep-red); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:8px">Coach notes</h4>
        <p style="color:var(--navy-soft); line-height:1.6">${escapeHtml(notes)}</p>
      </div>

      ${session.ascending && session.descending ? `
        <div class="section-title" style="margin-top:20px"><h3>Ascending vs descending</h3></div>
        <div class="asc-desc-grid">
          <div class="asc-desc-card">
            <h4>Going up ↗</h4>
            <div class="ad-stat"><span class="ad-label">Notes</span><span class="ad-val">${session.ascending.noteCount}</span></div>
            <div class="ad-stat"><span class="ad-label">Speed</span><span class="ad-val">${speedLabel(session.ascending.npm)} (~${session.ascending.npm}/min)</span></div>
            <div class="ad-stat"><span class="ad-label">Rhythm</span><span class="ad-val">${rhythmLabel(session.ascending.cv)}</span></div>
          </div>
          <div class="asc-desc-card">
            <h4>Going down ↘</h4>
            <div class="ad-stat"><span class="ad-label">Notes</span><span class="ad-val">${session.descending.noteCount}</span></div>
            <div class="ad-stat"><span class="ad-label">Speed</span><span class="ad-val">${speedLabel(session.descending.npm)} (~${session.descending.npm}/min)</span></div>
            <div class="ad-stat"><span class="ad-label">Rhythm</span><span class="ad-val">${rhythmLabel(session.descending.cv)}</span></div>
          </div>
        </div>
      ` : ''}

      ${session.keyHeatmap ? `
        <div class="section-title" style="margin-top:24px"><h3>Key heatmap</h3></div>
        ${renderHeatmap(session.keyHeatmap, session.minKey, session.maxKey)}
      ` : ''}

      <div style="display:flex; gap:12px; margin-top:26px; flex-wrap:wrap">
        <button class="btn" data-action="go-home">Back to dashboard</button>
        <button class="btn-secondary" data-action="delete-session" data-id="${escapeHtml(session.id)}">Delete session</button>
      </div>
    </section>
  `;
}

/* ---------- Active session ---------- */

export function viewSessionLive({ snapshot, currentDeviceName }){
  return `
    <section class="glass session-live">
      <div><span class="rec-dot"></span><span class="muted" style="font-weight:700; text-transform:uppercase; letter-spacing:0.08em; font-size:12px">Recording · ${escapeHtml(currentDeviceName || 'MIDI')}</span></div>
      <div class="timer mono" id="liveTimer">${formatDuration(snapshot.durationSeconds)}</div>
      <div class="counter"><span id="liveNotes">${snapshot.totalNotes.toLocaleString()}</span> notes played</div>
      <div class="live-stat-row">
        <div class="live-stat"><div class="lbl">Unique keys</div><div class="val" id="liveUnique">${snapshot.uniqueKeys}</div></div>
        <div class="live-stat"><div class="lbl">Notes / min</div><div class="val" id="liveNpm">${snapshot.notesPerMinute}</div></div>
        <div class="live-stat"><div class="lbl">Avg velocity</div><div class="val" id="liveVel">${snapshot.avgVelocity}</div></div>
      </div>
      <div class="session-controls">
        <button class="btn big" data-action="end-session">End session</button>
        <button class="btn-secondary" data-action="discard-session">Discard</button>
      </div>
    </section>
  `;
}

export function updateLive(snapshot){
  const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  set('liveTimer', formatDuration(snapshot.durationSeconds));
  set('liveNotes', snapshot.totalNotes.toLocaleString());
  set('liveUnique', snapshot.uniqueKeys);
  set('liveNpm', snapshot.notesPerMinute);
  set('liveVel', snapshot.avgVelocity);
}

/* ---------- Session summary (MIDI) ---------- */

export function viewSessionSummary({ session, isFresh }){
  if (session.source === 'audio') {
    const passage = session.competitionPassageId ? LEVELS.flatMap(l => l.passages).find(p => p.id === session.competitionPassageId) : null;
    const score = session.competitionScore != null ? { total: session.competitionScore, speedPoints: session.scoreBreakdown?.speedPoints || 0, accuracyMultiplier: session.scoreBreakdown?.accuracyMultiplier || 0, evennessBonus: session.scoreBreakdown?.evennessBonus || 0 } : null;
    return viewAudioReport({ session, passage, score, isFresh });
  }

  const started = new Date(session.startedAt);
  const dateStr = started.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });
  const timeStr = started.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' });

  return `
    <section class="glass panel">
      <div class="summary-header">
        ${isFresh ? `<span class="pill">Session saved</span>` : ''}
        <h2>${escapeHtml(dateStr)}</h2>
        <p class="lede">Started ${escapeHtml(timeStr)} · ${formatDurationHuman(session.durationSeconds)}</p>
      </div>

      <div class="insight-grid">
        <div class="insight-card warm">
          <div class="label">Notes played</div>
          <div class="value">${session.totalNotes.toLocaleString()}</div>
          <div class="sub">${session.notesPerMinute} per minute</div>
        </div>
        <div class="insight-card pink">
          <div class="label">Unique keys</div>
          <div class="value">${session.uniqueKeys}</div>
          <div class="sub">${session.minKey!=null ? `${noteName(session.minKey)} → ${noteName(session.maxKey)}` : '—'}</div>
        </div>
        <div class="insight-card blue">
          <div class="label">Avg velocity</div>
          <div class="value">${session.avgVelocity}<span style="font-size:16px; opacity:.7">/127</span></div>
          <div class="sub">${velocityLabel(session.avgVelocity)}</div>
        </div>
        <div class="insight-card green">
          <div class="label">Duration</div>
          <div class="value">${formatDurationHuman(session.durationSeconds)}</div>
          <div class="sub">${session.sustainEvents ? `Pedal used ${session.sustainEvents}×` : 'No pedal'}</div>
        </div>
      </div>

      <div class="section-title" style="margin-top:26px"><h3>Key heatmap</h3><span class="muted">Frequency per key</span></div>
      ${renderHeatmap(session.keyHeatmap, session.minKey, session.maxKey)}

      <div class="section-title" style="margin-top:24px"><h3>Range covered</h3><span class="muted">${session.minKey!=null ? `${noteName(session.minKey)} to ${noteName(session.maxKey)} · ${session.maxKey - session.minKey} semitones` : '—'}</span></div>
      ${renderRange(session.minKey, session.maxKey)}

      <div style="display:flex; gap:12px; margin-top:26px; flex-wrap:wrap">
        <button class="btn" data-action="go-home">Back to dashboard</button>
        <button class="btn-secondary" data-action="delete-session" data-id="${escapeHtml(session.id)}">Delete session</button>
      </div>
    </section>
  `;
}

function velocityLabel(v){
  if(v === 0) return '—';
  if(v < 50) return 'Soft (pianissimo–piano)';
  if(v < 80) return 'Medium (mezzo)';
  if(v < 105) return 'Firm (forte)';
  return 'Powerful (fortissimo)';
}

function renderHeatmap(heatmap, minKey, maxKey){
  if(!heatmap || Object.keys(heatmap).length === 0){
    return `<div class="empty" style="padding:22px">No notes recorded.</div>`;
  }
  const counts = Object.values(heatmap).map(Number);
  const max = Math.max(1, ...counts);
  const lo = Math.max(21, Math.min(minKey ?? 60, 60) - 2);
  const hi = Math.min(108, Math.max(maxKey ?? 72, 72) + 2);

  const cells = [];
  for(let n = lo; n <= hi; n++){
    const c = Number(heatmap[n] || 0);
    const h = c ? Math.max(6, Math.round((c / max) * 100)) : 0;
    cells.push(`<div class="key-cell ${isBlackKey(n) ? 'black' : ''}" title="${noteName(n)} · ${c} note${c===1?'':'s'}">
      ${c ? `<div class="fill" style="height:${h}%"></div>` : ''}
    </div>`);
  }
  return `<div class="keyboard">${cells.join('')}</div>`;
}

function renderRange(minKey, maxKey){
  if(minKey == null || maxKey == null) return `<div class="muted">No range data.</div>`;
  const FLOOR = 21, CEIL = 108;
  const span = CEIL - FLOOR;
  const left = ((minKey - FLOOR) / span) * 100;
  const width = ((maxKey - minKey) / span) * 100;
  return `<div class="range-vis"><div class="fill" style="left:${left}%; width:${Math.max(1.5, width)}%"></div></div>
    <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--muted); margin-top:6px">
      <span>A0</span><span>Middle C</span><span>C8</span>
    </div>`;
}

/* ---------- discard-confirmation micro-view ---------- */

export function viewEmptySessionDiscard(){
  return `
    <section class="glass panel">
      <div class="empty">
        <h3>No notes played</h3>
        <p>This session had zero notes — discarded automatically.</p>
        <div style="margin-top:14px"><button class="btn" data-action="go-home">Back to dashboard</button></div>
      </div>
    </section>
  `;
}

/* ---------- topbar connection status ---------- */

export function renderConnStatus(el, { connected, deviceName }){
  el.classList.remove('ok', 'err');
  if(connected){
    el.classList.add('ok');
    el.innerHTML = `<span class="dot"></span>${escapeHtml(deviceName || 'Connected')}`;
  } else {
    el.innerHTML = `<span class="dot" style="background:var(--muted-soft)"></span>No piano`;
  }
}
