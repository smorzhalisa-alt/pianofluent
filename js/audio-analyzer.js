import { cryptoId } from './storage.js';

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function midiToName(m) {
  return `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
}

function freqToMidi(f) {
  if (f <= 0) return null;
  return Math.round(69 + 12 * Math.log2(f / 440));
}

export async function analyzeAudioFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const copy = arrayBuffer.slice(0);
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  let audioBuffer;
  try {
    audioBuffer = await new Promise((resolve, reject) => {
      audioCtx.decodeAudioData(copy, resolve, reject);
    });
  } catch (decodeErr) {
    audioCtx.close();
    return { error: `Cannot decode this audio format (${file.type || file.name.split('.').pop()}). Browser said: ${decodeErr?.message || decodeErr}. Try converting to WAV or MP3.` };
  }
  audioCtx.close();

  const sampleRate = audioBuffer.sampleRate;
  const raw = audioBuffer.getChannelData(0);
  const duration = audioBuffer.duration;

  const onsets = detectOnsets(raw, sampleRate);
  const notes = [];

  for (const onsetSample of onsets) {
    const time = onsetSample / sampleRate;
    const freq = detectPitch(raw, sampleRate, onsetSample);
    if (!freq || freq < 27 || freq > 4200) continue;

    const midi = freqToMidi(freq);
    if (midi === null || midi < 21 || midi > 108) continue;

    const rms = computeRmsAt(raw, onsetSample, sampleRate);
    const db = rms > 0 ? Math.round(20 * Math.log10(rms) * 10) / 10 : -60;

    notes.push({ time: Math.round(time * 1000) / 1000, midi, name: midiToName(midi), db });
  }

  if (notes.length < 2) {
    return { error: 'Could not detect enough notes. Try a clearer recording.' };
  }

  const ioi = [];
  for (let i = 1; i < notes.length; i++) {
    ioi.push((notes[i].time - notes[i - 1].time) * 1000);
  }
  const playingIoi = ioi.filter(v => v < 1500 && v > 20);

  if (playingIoi.length === 0) {
    return { error: 'Notes detected but timing unclear. Try a steadier recording.' };
  }

  const medianGap = median(playingIoi);
  const meanGap = mean(playingIoi);
  const stdGap = std(playingIoi);
  const cv = meanGap > 0 ? stdGap / meanGap : 0;
  const npm = Math.round(notes.length / (duration / 60));

  const dbs = notes.map(n => n.db);
  const dbStd = std(dbs);

  const midis = notes.map(n => n.midi);
  const peakIdx = midis.indexOf(Math.max(...midis));
  const ascending = notes.slice(0, peakIdx + 1);
  const descending = notes.slice(peakIdx);

  const heatmap = {};
  for (const n of notes) {
    heatmap[n.midi] = (heatmap[n.midi] || 0) + 1;
  }

  return {
    id: cryptoId(),
    source: 'audio',
    fileName: file.name,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    duration: Math.round(duration * 10) / 10,
    durationSeconds: Math.round(duration),
    totalNotes: notes.length,
    uniqueKeys: new Set(midis).size,
    minKey: Math.min(...midis),
    maxKey: Math.max(...midis),
    npm,
    notesPerMinute: npm,
    medianGapMs: Math.round(medianGap),
    cv: Math.round(cv * 100) / 100,
    dbStd: Math.round(dbStd * 10) / 10,
    keyHeatmap: heatmap,
    sustainEvents: 0,
    avgVelocity: 0,
    notes,
    ascending: ascending.length >= 2 ? passageStats(ascending) : null,
    descending: descending.length >= 2 ? passageStats(descending) : null,
  };
}

function passageStats(pnotes) {
  const ioi = [];
  for (let i = 1; i < pnotes.length; i++) {
    ioi.push((pnotes[i].time - pnotes[i - 1].time) * 1000);
  }
  const playing = ioi.filter(v => v < 1500 && v > 20);
  if (playing.length === 0) return null;

  const dur = pnotes[pnotes.length - 1].time - pnotes[0].time;
  const npm = dur > 0 ? Math.round(pnotes.length / (dur / 60)) : 0;
  const mg = median(playing);
  const cv = mean(playing) > 0 ? std(playing) / mean(playing) : 0;
  const dbs = pnotes.map(n => n.db);

  return {
    noteCount: pnotes.length,
    durationS: Math.round(dur * 10) / 10,
    npm,
    medianGapMs: Math.round(mg),
    cv: Math.round(cv * 100) / 100,
    dbStd: Math.round(std(dbs) * 10) / 10,
  };
}

export function computeInKeyPct(notes, pitchClasses) {
  if (!notes.length || !pitchClasses) return 0;
  const inKey = notes.filter(n => pitchClasses.has(n.midi % 12)).length;
  return Math.round(inKey / notes.length * 100);
}

function detectOnsets(samples, sr) {
  const hopSize = 512;
  const frameSize = 1024;
  const numFrames = Math.floor((samples.length - frameSize) / hopSize);
  const energy = new Float32Array(numFrames);

  for (let i = 0; i < numFrames; i++) {
    let sum = 0;
    const start = i * hopSize;
    for (let j = start; j < start + frameSize; j++) {
      sum += samples[j] * samples[j];
    }
    energy[i] = Math.sqrt(sum / frameSize);
  }

  const flux = new Float32Array(numFrames);
  for (let i = 1; i < numFrames; i++) {
    flux[i] = Math.max(0, energy[i] - energy[i - 1]);
  }

  const windowSize = 10;
  const threshold = 1.5;
  const onsets = [];
  const minGapFrames = Math.floor(0.05 * sr / hopSize);

  for (let i = windowSize; i < numFrames - windowSize; i++) {
    let localMean = 0;
    for (let j = i - windowSize; j < i + windowSize; j++) {
      localMean += flux[j];
    }
    localMean /= (windowSize * 2);

    if (flux[i] > localMean * threshold && flux[i] > 0.005) {
      const samplePos = i * hopSize;
      if (onsets.length === 0 || (samplePos - onsets[onsets.length - 1]) > minGapFrames * hopSize) {
        onsets.push(samplePos);
      }
    }
  }

  return onsets;
}

function detectPitch(samples, sr, startSample) {
  const windowSize = 4096;
  const end = Math.min(startSample + windowSize, samples.length);
  const segment = samples.slice(startSample, end);
  if (segment.length < 2048) return null;

  const minPeriod = Math.floor(sr / 4200);
  const maxPeriod = Math.floor(sr / 27);
  const n = segment.length;

  let bestCorr = -1;
  let bestPeriod = 0;

  for (let period = minPeriod; period < Math.min(maxPeriod, n / 2); period++) {
    let sum = 0;
    let norm1 = 0;
    let norm2 = 0;
    const len = Math.min(n - period, 2048);
    for (let i = 0; i < len; i++) {
      sum += segment[i] * segment[i + period];
      norm1 += segment[i] * segment[i];
      norm2 += segment[i + period] * segment[i + period];
    }
    const denom = Math.sqrt(norm1 * norm2);
    const corr = denom > 0 ? sum / denom : 0;

    if (corr > bestCorr) {
      bestCorr = corr;
      bestPeriod = period;
    }
  }

  if (bestCorr < 0.5 || bestPeriod === 0) return null;
  return sr / bestPeriod;
}

function computeRmsAt(samples, pos, sr) {
  const windowSize = 2048;
  const end = Math.min(pos + windowSize, samples.length);
  let sum = 0;
  let count = 0;
  for (let i = pos; i < end; i++) {
    sum += samples[i] * samples[i];
    count++;
  }
  return count > 0 ? Math.sqrt(sum / count) : 0;
}

function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}
