import { cryptoId } from './storage.js';

export class SessionRecorder extends EventTarget{
  constructor(midiHub, { idleAutoEndSeconds = 300 } = {}){
    super();
    this.midi = midiHub;
    this.idleAutoEndSeconds = idleAutoEndSeconds;
    this.active = false;
    this._reset();
    this._onNoteOn = (e) => this._handleNoteOn(e);
    this._onSustain = (e) => this._handleSustain(e);
  }

  _reset(){
    this.startedAt = null;
    this.endedAt = null;
    this.totalNotes = 0;
    this.velocitySum = 0;
    this.heatmap = new Map();
    this.minKey = null;
    this.maxKey = null;
    this.sustainEvents = 0;
    this.lastActivityMs = null;
    this._tickHandle = null;
  }

  start(){
    if(this.active) return;
    this._reset();
    this.active = true;
    this.startedAt = Date.now();
    this.lastActivityMs = this.startedAt;
    this.midi.addEventListener('noteon', this._onNoteOn);
    this.midi.addEventListener('sustain', this._onSustain);
    this._tickHandle = setInterval(() => this._tick(), 1000);
    this.dispatchEvent(new CustomEvent('start', { detail: this.snapshot() }));
  }

  stop({ save = true } = {}){
    if(!this.active) return null;
    this.active = false;
    this.endedAt = Date.now();
    this.midi.removeEventListener('noteon', this._onNoteOn);
    this.midi.removeEventListener('sustain', this._onSustain);
    if(this._tickHandle){ clearInterval(this._tickHandle); this._tickHandle = null; }
    const summary = this._buildSummary();
    this.dispatchEvent(new CustomEvent('stop', { detail: { summary, save } }));
    return summary;
  }

  _handleNoteOn(e){
    if(!this.active) return;
    const { note, velocity } = e.detail;
    this.totalNotes += 1;
    this.velocitySum += velocity;
    this.heatmap.set(note, (this.heatmap.get(note) || 0) + 1);
    if(this.minKey == null || note < this.minKey) this.minKey = note;
    if(this.maxKey == null || note > this.maxKey) this.maxKey = note;
    this.lastActivityMs = Date.now();
    this.dispatchEvent(new CustomEvent('progress', { detail: this.snapshot() }));
  }

  _handleSustain(e){
    if(!this.active) return;
    if(e.detail.on) this.sustainEvents += 1;
    this.lastActivityMs = Date.now();
  }

  _tick(){
    if(!this.active) return;
    this.dispatchEvent(new CustomEvent('tick', { detail: this.snapshot() }));
    const idle = (Date.now() - this.lastActivityMs) / 1000;
    if(this.idleAutoEndSeconds > 0 && idle >= this.idleAutoEndSeconds){
      this.dispatchEvent(new CustomEvent('idle-auto-end', { detail: { idleSeconds: idle } }));
    }
  }

  snapshot(){
    const now = this.active ? Date.now() : (this.endedAt || Date.now());
    const durationSeconds = this.startedAt ? Math.max(0, Math.round((now - this.startedAt) / 1000)) : 0;
    return {
      active: this.active,
      startedAt: this.startedAt,
      durationSeconds,
      totalNotes: this.totalNotes,
      uniqueKeys: this.heatmap.size,
      avgVelocity: this.totalNotes ? Math.round(this.velocitySum / this.totalNotes) : 0,
      notesPerMinute: durationSeconds > 0 ? Math.round((this.totalNotes / durationSeconds) * 60) : 0,
    };
  }

  _buildSummary(){
    const durationSeconds = Math.max(0, Math.round((this.endedAt - this.startedAt) / 1000));
    const heatmap = {};
    for(const [note, count] of this.heatmap.entries()) heatmap[note] = count;
    return {
      id: cryptoId(),
      startedAt: new Date(this.startedAt).toISOString(),
      endedAt: new Date(this.endedAt).toISOString(),
      durationSeconds,
      totalNotes: this.totalNotes,
      uniqueKeys: this.heatmap.size,
      minKey: this.minKey,
      maxKey: this.maxKey,
      avgVelocity: this.totalNotes ? Math.round(this.velocitySum / this.totalNotes) : 0,
      notesPerMinute: durationSeconds > 0 ? Math.round((this.totalNotes / durationSeconds) * 60) : 0,
      keyHeatmap: heatmap,
      sustainEvents: this.sustainEvents,
    };
  }
}

/* ---------- Aggregation helpers over saved sessions ---------- */

export function computeStreak(sessions){
  if(!sessions.length) return { current:0, longest:0 };
  const days = new Set(sessions.map(s => dayKey(new Date(s.startedAt))));
  const sortedDays = [...days].sort().reverse();

  let current = 0;
  const todayKey = dayKey(new Date());
  const yesterdayKey = dayKey(new Date(Date.now() - 86400000));
  let cursor = null;
  if(days.has(todayKey)) cursor = new Date();
  else if(days.has(yesterdayKey)) cursor = new Date(Date.now() - 86400000);

  if(cursor){
    while(days.has(dayKey(cursor))){
      current += 1;
      cursor = new Date(cursor.getTime() - 86400000);
    }
  }

  let longest = 0, run = 0, prev = null;
  for(const k of [...days].sort()){
    if(prev){
      const diff = (Date.parse(k) - Date.parse(prev)) / 86400000;
      run = diff === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    if(run > longest) longest = run;
    prev = k;
  }
  return { current, longest };
}

export function personalRecords(sessions){
  if(!sessions.length){
    return { longestDurationSeconds:0, mostNotes:0, highestAvgVelocity:0, widestRange:0 };
  }
  return {
    longestDurationSeconds: Math.max(...sessions.map(s => s.durationSeconds || 0)),
    mostNotes: Math.max(...sessions.map(s => s.totalNotes || 0)),
    highestAvgVelocity: Math.max(...sessions.map(s => s.avgVelocity || 0)),
    widestRange: Math.max(...sessions.map(s => (s.maxKey != null && s.minKey != null) ? (s.maxKey - s.minKey) : 0)),
  };
}

export function weeklyTotals(sessions){
  const cutoff = Date.now() - 7 * 86400000;
  const recent = sessions.filter(s => Date.parse(s.startedAt) >= cutoff);
  return {
    count: recent.length,
    totalNotes: recent.reduce((sum, s) => sum + (s.totalNotes || 0), 0),
    totalSeconds: recent.reduce((sum, s) => sum + (s.durationSeconds || 0), 0),
  };
}

export function dayKey(d){
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDuration(seconds){
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if(h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

export function formatDurationHuman(seconds){
  const s = Math.max(0, Math.round(seconds));
  if(s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if(m < 60) return sec ? `${m}m ${sec}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}
