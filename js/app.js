import { storage } from './storage.js';
import { MidiHub, isSupported, browserHint, noteName } from './midi.js';
import { guessDevice, KNOWN_DEVICES } from './devices.js';
import { SessionRecorder } from './session.js';
import * as ui from './ui.js';

const midi = new MidiHub();
const recorder = new SessionRecorder(midi, { idleAutoEndSeconds: 300 });
const browser = browserHint();

const app = {
  view: document.getElementById('view'),
  connStatusEl: document.getElementById('connStatus'),
  navConnect: document.getElementById('navConnect'),
  navHome: document.getElementById('navHome'),
  midiReady: false,
  midiInputs: [],
  testNote: null,
  freshSummaryId: null,
};

/* ---------- initial boot ---------- */

async function boot(){
  wireGlobalClicks();
  wireNavButtons();
  window.addEventListener('hashchange', renderCurrent);

  if(isSupported()){
    try{
      app.midiInputs = await midi.init();
      app.midiReady = true;
      midi.addEventListener('devicechange', () => { app.midiInputs = midi.listInputs(); attemptAutoReconnect(); renderCurrent(); });
      midi.addEventListener('connected', (e) => onDeviceConnected(e.detail));
      midi.addEventListener('disconnected', (e) => onDeviceDisconnected(e.detail));
      attemptAutoReconnect();
    }catch(err){
      console.warn('MIDI init failed', err);
      app.midiReady = false;
    }
  }

  refreshConnStatus();
  renderCurrent();
}

function attemptAutoReconnect(){
  if(midi.currentInput()) return;
  const state = storage.getState();
  if(!state.preferredDeviceId) return;
  const preferred = app.midiInputs.find(i => i.id === state.preferredDeviceId);
  if(preferred) midi.connect(preferred.id);
}

/* ---------- routing ---------- */

function currentRoute(){
  const hash = location.hash || '';
  const [path, ...rest] = hash.replace(/^#\/?/, '').split('/');
  return { path: path || '', param: rest.join('/') };
}

function goto(hash){
  if(location.hash === hash) renderCurrent();
  else location.hash = hash;
}

function renderCurrent(){
  const state = storage.getState();
  const { path, param } = currentRoute();

  // Bounce first-time users to welcome unless they explicitly navigate
  if(!state.onboarded && path !== 'welcome' && path !== 'connect'){
    location.hash = '#/welcome';
    return;
  }

  toggleTopbarNav(path);

  if(recorder.active && path !== 'session'){
    location.hash = '#/session';
    return;
  }

  switch(path){
    case '':
    case 'welcome':
      renderView(ui.viewWelcome({ browser }));
      break;
    case 'connect':
      renderConnect();
      break;
    case 'home':
      renderHome();
      break;
    case 'session':
      renderSessionLive();
      break;
    case 'summary':
      renderSummary(param, param === app.freshSummaryId);
      break;
    default:
      renderView(`<section class="glass panel"><h2>Not found</h2><p class="lede">Nothing at <code>${ui.escapeHtml(location.hash)}</code>.</p><button class="btn" data-action="go-home">Home</button></section>`);
  }
}

function renderView(html){
  app.view.innerHTML = html;
}

function toggleTopbarNav(path){
  app.navHome.hidden = path === 'home' || path === '' || path === 'welcome';
  app.navConnect.hidden = path === 'connect' || path === 'welcome' || path === '';
}

/* ---------- connect view ---------- */

function renderConnect(){
  const modelSelect = document.getElementById('modelSelect');
  const chosenKey = modelSelect?.value || null;
  const guessed = chosenKey
    ? KNOWN_DEVICES.find(k => k.key === chosenKey)
    : (app.midiInputs.length ? guessDevice(app.midiInputs[0].name) : null);
  const current = midi.currentInput();
  ui._setCurrentDeviceIdShim(current?.id || null);

  renderView(ui.viewConnect({
    browser,
    inputs: app.midiInputs,
    currentDeviceName: current?.name || null,
    savedDevices: storage.getDevices(),
    guess: guessed,
    testNote: app.testNote,
  }));

  const sel = document.getElementById('modelSelect');
  if(sel){
    sel.addEventListener('change', () => renderConnect());
  }
}

/* ---------- home view ---------- */

function renderHome(){
  const current = midi.currentInput();
  renderView(ui.viewHome({
    sessions: storage.getSessions(),
    currentDeviceName: current?.name || null,
    connected: !!current,
  }));
}

/* ---------- session live view ---------- */

function renderSessionLive(){
  if(!recorder.active){
    // Nothing to render — bounce home
    location.hash = '#/home';
    return;
  }
  const current = midi.currentInput();
  renderView(ui.viewSessionLive({
    snapshot: recorder.snapshot(),
    currentDeviceName: current?.name || null,
  }));
}

/* ---------- session summary view ---------- */

function renderSummary(id, isFresh){
  const session = storage.getSession(id);
  if(!session){
    renderView(`<section class="glass panel"><h2>Session not found</h2><button class="btn" data-action="go-home">Home</button></section>`);
    return;
  }
  renderView(ui.viewSessionSummary({ session, isFresh }));
  if(isFresh) app.freshSummaryId = null; // consume the "fresh" flag
}

/* ---------- MIDI connection events ---------- */

function onDeviceConnected({ id, name }){
  storage.saveDevice({ midiId: id, name });
  storage.setState({ preferredDeviceId: id });
  app.testNote = null;
  refreshConnStatus();
  midi.addEventListener('noteon', onTestNote);
  renderCurrent();
}

function onDeviceDisconnected(){
  app.testNote = null;
  refreshConnStatus();
  if(recorder.active){
    // Surface the disconnect but keep the session running so brief drops don't lose data
    flashAlert('Piano disconnected. Reconnect to keep capturing notes.');
  }
  renderCurrent();
}

function onTestNote(e){
  app.testNote = { note: e.detail.note, velocity: e.detail.velocity, at: Date.now() };
  if(currentRoute().path === 'connect') renderConnect();
}

function refreshConnStatus(){
  const c = midi.currentInput();
  ui.renderConnStatus(app.connStatusEl, { connected: !!c, deviceName: c?.name });
}

/* ---------- session lifecycle ---------- */

function startSession(){
  if(!midi.currentInput()){
    flashAlert('Connect a piano first.');
    goto('#/connect');
    return;
  }
  recorder.start();
  recorder.addEventListener('tick', onRecorderTick);
  recorder.addEventListener('progress', onRecorderProgress);
  recorder.addEventListener('idle-auto-end', onIdleAutoEnd);
  goto('#/session');
}

function endSession({ discard = false } = {}){
  const summary = recorder.stop({ save: !discard });
  cleanupRecorderListeners();

  if(!summary || summary.totalNotes === 0 || discard){
    // Empty or discarded — don't save.
    renderView(ui.viewEmptySessionDiscard());
    return;
  }
  storage.saveSession(summary);
  storage.setState({ onboarded: true });
  app.freshSummaryId = summary.id;
  goto(`#/summary/${summary.id}`);
}

function cleanupRecorderListeners(){
  recorder.removeEventListener('tick', onRecorderTick);
  recorder.removeEventListener('progress', onRecorderProgress);
  recorder.removeEventListener('idle-auto-end', onIdleAutoEnd);
}

function onRecorderTick(){ ui.updateLive(recorder.snapshot()); }
function onRecorderProgress(){ ui.updateLive(recorder.snapshot()); }
function onIdleAutoEnd(){ flashAlert('Auto-ending after 5 minutes idle.'); endSession(); }

/* ---------- click routing ---------- */

function wireGlobalClicks(){
  document.body.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if(!target) return;
    const action = target.dataset.action;
    const id = target.dataset.id;
    switch(action){
      case 'start-connect':
        storage.setState({ onboarded: true });
        goto('#/connect');
        break;
      case 'skip-to-home':
        storage.setState({ onboarded: true });
        goto('#/home');
        break;
      case 'scan':
        rescan();
        break;
      case 'connect-device':
        midi.connect(id);
        renderConnect();
        break;
      case 'forget-device':
        storage.removeDevice(id);
        if(storage.getState().preferredDeviceId){
          const still = storage.getDevices();
          if(!still.find(d => d.id === id) && still.length === 0){
            storage.setState({ preferredDeviceId: null });
          }
        }
        renderConnect();
        break;
      case 'go-home':
        goto('#/home');
        break;
      case 'start-session':
        startSession();
        break;
      case 'end-session':
        endSession();
        break;
      case 'discard-session':
        if(confirm('Discard this session? Stats will not be saved.')){
          endSession({ discard: true });
        }
        break;
      case 'open-session':
        goto(`#/summary/${id}`);
        break;
      case 'delete-session':
        if(confirm('Delete this session permanently?')){
          storage.deleteSession(id);
          goto('#/home');
        }
        break;
    }
  });
}

function wireNavButtons(){
  app.navHome.addEventListener('click', () => goto('#/home'));
  app.navConnect.addEventListener('click', () => goto('#/connect'));
}

async function rescan(){
  if(!isSupported()){
    flashAlert('Web MIDI is not available in this browser. Use Chrome or Edge.');
    return;
  }
  if(!app.midiReady){
    try{ app.midiInputs = await midi.init(); app.midiReady = true; }
    catch{ flashAlert('MIDI access denied. Check your browser permissions.'); return; }
  }
  app.midiInputs = midi.listInputs();
  renderConnect();
}

/* ---------- transient alert (no persistent state) ---------- */

function flashAlert(msg){
  const bar = document.createElement('div');
  bar.className = 'glass';
  bar.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); padding:12px 20px; z-index:9999; font-weight:700; color:var(--deep-red);';
  bar.textContent = msg;
  document.body.appendChild(bar);
  setTimeout(() => { bar.style.transition='opacity .4s'; bar.style.opacity='0'; }, 3200);
  setTimeout(() => bar.remove(), 3800);
}

boot();
