import { noteName, isBlackKey } from './midi.js';
import { formatDuration, formatDurationHuman, computeStreak, personalRecords, weeklyTotals } from './session.js';

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

/* ---------- views ---------- */

export function viewWelcome({ browser }){
  const warn = browser.ok ? '' : `<div class="alert warn">
      <h4>Browser not supported</h4>
      <p>You're on <b>${escapeHtml(browser.name)}</b>. Web MIDI needs Chrome or Edge. Open PianoFluent in one of those browsers to continue.</p>
    </div>`;

  return `
    ${warn}
    <section class="glass hero">
      <span class="pill">MIDI-connected practice tracker</span>
      <h2 style="margin-top:16px">Every practice session, measured.</h2>
      <p class="lede">Plug in your digital piano over Bluetooth or USB and PianoFluent turns your playing into stats — notes, range, dynamics, streaks. Like Strava, but for the keys.</p>
      <div class="cta-row">
        <button class="btn big pink" data-action="start-connect" ${browser.ok ? '' : 'disabled'}>Connect my piano</button>
        <button class="btn-secondary" data-action="skip-to-home">Skip for now</button>
      </div>
    </section>

    <div class="features">
      <div class="feature">
        <div class="icon">1</div>
        <h4>Pair once</h4>
        <p>Bluetooth MIDI or USB — the browser talks to your piano directly. No app install.</p>
      </div>
      <div class="feature">
        <div class="icon">2</div>
        <h4>Play</h4>
        <p>Hit Start and practice. Every note is captured live: which key, how hard, when.</p>
      </div>
      <div class="feature">
        <div class="icon">3</div>
        <h4>See yourself grow</h4>
        <p>Notes per minute, range, dynamics, streaks, personal records — all after each session.</p>
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
    ? `<div class="device-list">${inputs.map(i => `
        <div class="device-item ${i.id === currentDeviceIdShim() ? 'selected' : ''}" data-action="connect-device" data-id="${escapeHtml(i.id)}">
          <div>
            <div class="name">${escapeHtml(i.name)}</div>
            <div class="meta">${escapeHtml(i.manufacturer || 'MIDI input')} · ${escapeHtml(i.connection)}</div>
          </div>
          <button class="btn-ghost">${i.id === currentDeviceIdShim() ? 'Connected' : 'Connect'}</button>
        </div>`).join('')}</div>`
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
    <div class="note-detect ${testNote ? '' : 'waiting'}">
      <div style="flex:1">
        ${testNote
          ? `<div class="big-note">✓ Note detected: ${escapeHtml(noteName(testNote.note))}</div>
             <div class="muted" style="margin-top:2px">Velocity ${testNote.velocity} · You're all set.</div>`
          : `<div class="big-note muted">Waiting for a note…</div>
             <div class="muted" style="margin-top:2px">Press any key on <b>${escapeHtml(currentDeviceName)}</b> to test the connection.</div>`}
      </div>
      ${testNote ? `<button class="btn pink" data-action="go-home">Start tracking</button>` : ''}
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

// Shim so the template can reference currentDeviceId without a global
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

/* ---------- Home dashboard ---------- */

export function viewHome({ sessions, currentDeviceName, connected }){
  const streak = computeStreak(sessions);
  const records = personalRecords(sessions);
  const week = weeklyTotals(sessions);

  const connBlock = connected
    ? `<div class="alert info"><h4>Connected to ${escapeHtml(currentDeviceName)}</h4><p>You're ready to start a session.</p></div>`
    : `<div class="alert warn"><h4>No piano connected</h4><p>Connect your piano to start recording a session. <a href="#/connect">Open device setup →</a></p></div>`;

  const insights = `
    <div class="insight-grid">
      <div class="insight-card warm">
        <div class="label">Current streak</div>
        <div class="value">${streak.current}<span style="font-size:16px; margin-left:4px">day${streak.current===1?'':'s'}</span></div>
        <div class="sub">Longest: ${streak.longest}</div>
      </div>
      <div class="insight-card pink">
        <div class="label">This week</div>
        <div class="value">${week.count}</div>
        <div class="sub">${formatDurationHuman(week.totalSeconds)} · ${week.totalNotes.toLocaleString()} notes</div>
      </div>
      <div class="insight-card blue">
        <div class="label">Longest session</div>
        <div class="value">${formatDurationHuman(records.longestDurationSeconds)}</div>
        <div class="sub">Personal record</div>
      </div>
      <div class="insight-card green">
        <div class="label">Most notes</div>
        <div class="value">${records.mostNotes.toLocaleString()}</div>
        <div class="sub">In a single session</div>
      </div>
    </div>
  `;

  const historyBlock = sessions.length ? `
    <section class="glass panel">
      <div class="section-title"><h3>Session history</h3><span class="muted">${sessions.length} total</span></div>
      <div class="history">
        ${sessions.slice(0, 20).map(s => historyRow(s)).join('')}
      </div>
    </section>
  ` : `
    <section class="glass panel">
      <div class="empty">
        <h3>No sessions yet</h3>
        <p>Start your first tracked practice below.</p>
      </div>
    </section>
  `;

  return `
    ${connBlock}
    <section class="glass panel" style="display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap">
      <div>
        <h2 style="margin-bottom:4px">Ready to practice?</h2>
        <p class="muted" style="margin:0">Hit Start and every note is captured. End when you're done — we'll do the math.</p>
      </div>
      <button class="btn big pink" data-action="start-session" ${connected ? '' : 'disabled'}>Start session</button>
    </section>

    <div style="height:20px"></div>
    ${insights}
    <div style="height:24px"></div>
    ${historyBlock}
  `;
}

function historyRow(s){
  const started = new Date(s.startedAt);
  const dateStr = started.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' });
  const timeStr = started.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' });
  return `
    <div class="history-item" data-action="open-session" data-id="${escapeHtml(s.id)}">
      <div>
        <div class="when">${escapeHtml(dateStr)}</div>
        <div class="when-sub">${escapeHtml(timeStr)}</div>
      </div>
      <div class="history-stat"><b>${formatDurationHuman(s.durationSeconds)}</b>duration</div>
      <div class="history-stat"><b>${s.totalNotes.toLocaleString()}</b>notes</div>
      <div class="history-stat hide-sm"><b>${s.notesPerMinute}</b>notes/min</div>
    </div>
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

/* ---------- Session summary / detail ---------- */

export function viewSessionSummary({ session, isFresh }){
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
  const FLOOR = 21, CEIL = 108; // A0..C8
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
