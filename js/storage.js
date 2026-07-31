const NS = 'pianofluent.v1';
const K = {
  state: `${NS}.state`,
  devices: `${NS}.devices`,
  sessions: `${NS}.sessions`,
};

function read(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }catch{ return fallback; }
}
function write(key, val){
  localStorage.setItem(key, JSON.stringify(val));
}

export const storage = {
  getState(){
    return read(K.state, { onboarded:false, preferredDeviceId:null, idleAutoEndSeconds:300 });
  },
  setState(patch){
    const next = { ...this.getState(), ...patch };
    write(K.state, next);
    return next;
  },

  getDevices(){ return read(K.devices, []); },
  saveDevice(dev){
    const list = this.getDevices();
    const idx = list.findIndex(d => d.midiId === dev.midiId);
    const now = new Date().toISOString();
    const merged = { ...dev, lastConnectedAt: now };
    if(idx >= 0) list[idx] = { ...list[idx], ...merged };
    else list.push({ id: cryptoId(), createdAt: now, ...merged });
    write(K.devices, list);
    return list[idx >= 0 ? idx : list.length - 1];
  },
  removeDevice(id){
    write(K.devices, this.getDevices().filter(d => d.id !== id));
  },

  getSessions(){ return read(K.sessions, []); },
  getSession(id){ return this.getSessions().find(s => s.id === id) || null; },
  saveSession(session){
    const list = this.getSessions();
    list.unshift(session);
    write(K.sessions, list);
    return session;
  },
  deleteSession(id){
    write(K.sessions, this.getSessions().filter(s => s.id !== id));
  },

  clearAll(){
    Object.values(K).forEach(k => localStorage.removeItem(k));
  },
};

export function cryptoId(){
  if(crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
