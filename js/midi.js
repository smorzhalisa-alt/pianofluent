const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;
const CONTROL_CHANGE = 0xB0;
const CC_SUSTAIN = 64;

export function isSupported(){
  return typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess;
}

export function browserHint(){
  const ua = navigator.userAgent;
  if(/Firefox/.test(ua)) return { ok:false, name:'Firefox', tip:'Firefox does not support Web MIDI. Use Chrome or Edge.' };
  if(/Safari/.test(ua) && !/Chrome/.test(ua)) return { ok:false, name:'Safari', tip:'Safari does not support Web MIDI. Use Chrome or Edge.' };
  if(/Edg\//.test(ua)) return { ok:true, name:'Edge' };
  if(/Chrome/.test(ua)) return { ok:true, name:'Chrome' };
  return { ok: isSupported(), name:'this browser', tip: isSupported() ? '' : 'Your browser may not support Web MIDI. Chrome or Edge are recommended.' };
}

export class MidiHub extends EventTarget{
  constructor(){
    super();
    this.access = null;
    this.currentInputId = null;
    this._boundOnMessage = (e) => this._onMessage(e);
  }

  async init(){
    if(!isSupported()) throw new Error('web-midi-unsupported');
    this.access = await navigator.requestMIDIAccess({ sysex:false });
    this.access.onstatechange = (e) => this._onStateChange(e);
    return this.listInputs();
  }

  listInputs(){
    if(!this.access) return [];
    return Array.from(this.access.inputs.values()).map(i => ({
      id: i.id, name: i.name || 'Unnamed device', manufacturer: i.manufacturer || '', state: i.state, connection: i.connection,
    }));
  }

  connect(inputId){
    if(!this.access) return false;
    this.disconnect();
    const input = this.access.inputs.get(inputId);
    if(!input) return false;
    input.onmidimessage = this._boundOnMessage;
    this.currentInputId = inputId;
    this.dispatchEvent(new CustomEvent('connected', { detail: { id: input.id, name: input.name } }));
    return true;
  }

  disconnect(){
    if(!this.access || !this.currentInputId) return;
    const input = this.access.inputs.get(this.currentInputId);
    if(input) input.onmidimessage = null;
    this.currentInputId = null;
  }

  currentInput(){
    if(!this.access || !this.currentInputId) return null;
    const input = this.access.inputs.get(this.currentInputId);
    if(!input) return null;
    return { id: input.id, name: input.name, state: input.state, connection: input.connection };
  }

  _onStateChange(e){
    const p = e.port;
    if(p.type !== 'input') return;
    this.dispatchEvent(new CustomEvent('devicechange', { detail: { id:p.id, name:p.name, state:p.state, connection:p.connection } }));
    if(this.currentInputId === p.id && p.state === 'disconnected'){
      this.dispatchEvent(new CustomEvent('disconnected', { detail: { id:p.id, name:p.name } }));
      this.currentInputId = null;
    }
  }

  _onMessage(e){
    const [status, data1, data2] = e.data;
    const cmd = status & 0xF0;
    const channel = status & 0x0F;
    const t = e.timeStamp; // ms since page origin

    if(cmd === NOTE_ON && data2 > 0){
      this.dispatchEvent(new CustomEvent('noteon', { detail:{ note:data1, velocity:data2, channel, t } }));
    } else if(cmd === NOTE_OFF || (cmd === NOTE_ON && data2 === 0)){
      this.dispatchEvent(new CustomEvent('noteoff', { detail:{ note:data1, velocity:data2, channel, t } }));
    } else if(cmd === CONTROL_CHANGE && data1 === CC_SUSTAIN){
      this.dispatchEvent(new CustomEvent('sustain', { detail:{ on: data2 >= 64, value:data2, channel, t } }));
    }
  }
}

// MIDI note number → name like "C4"
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
export function noteName(n){
  if(n == null || n < 0) return '—';
  const name = NOTE_NAMES[n % 12];
  const octave = Math.floor(n / 12) - 1;
  return `${name}${octave}`;
}
export function isBlackKey(n){
  return [1,3,6,8,10].includes(n % 12);
}
