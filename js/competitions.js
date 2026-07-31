export const LEVELS = [
  {
    id: 'level-1',
    name: 'Level 1',
    subtitle: 'C major scale',
    locked: false,
    passages: [
      {
        id: 'c-major-2oct-asc',
        name: 'C major scale',
        detail: '2 octaves, ascending only',
        key: 'C major',
        keyPitchClasses: new Set([0,2,4,5,7,9,11]),
        octaves: 2,
        description: 'The simplest scale — all white keys. C3 up to C5.',
      },
    ],
    legendary: {
      id: 'c-major-2oct-full',
      name: 'C major scale (Legendary)',
      detail: '2 octaves, ascending + descending',
      key: 'C major',
      keyPitchClasses: new Set([0,2,4,5,7,9,11]),
      octaves: 2,
      description: 'Full round trip — C3 up to C5 and back down.',
    },
  },
  {
    id: 'level-2',
    name: 'Level 2',
    subtitle: 'F major scale',
    locked: false,
    passages: [
      {
        id: 'f-major-4oct',
        name: 'F major scale',
        detail: '4 octaves, ascending + descending',
        key: 'F major',
        keyPitchClasses: new Set([0,2,4,5,7,9,10]),
        octaves: 4,
        description: 'One flat (Bb). Tests thumb-under across a wide range.',
      },
    ],
    legendary: {
      id: 'f-major-contrary',
      name: 'F major contrary motion (Legendary)',
      detail: 'Contrary motion — hands expand outward',
      key: 'F major',
      keyPitchClasses: new Set([0,2,4,5,7,9,10]),
      octaves: 4,
      description: 'Start in the middle, expand outward (contrary motion) across the full range.',
    },
  },
  {
    id: 'level-3',
    name: 'Level 3',
    subtitle: 'F major arpeggio',
    locked: false,
    passages: [
      {
        id: 'f-major-arpeggio',
        name: 'F major arpeggio',
        detail: '4 octaves, ascending + descending',
        key: 'F major',
        keyPitchClasses: new Set([0,5,9]),
        octaves: 4,
        description: 'F-A-C arpeggiated across 4 octaves, up and back down.',
      },
    ],
    legendary: null,
  },
];

export function getPassage(passageId) {
  for (const level of LEVELS) {
    const p = level.passages.find(p => p.id === passageId);
    if (p) return p;
    if (level.legendary && level.legendary.id === passageId) return level.legendary;
  }
  return null;
}

export function computeScore(stats) {
  const speedPts = speedPoints(stats.npm);
  const accMul = accuracyMultiplier(stats.inKeyPct);
  const evenBonus = evennessBonus(stats.cv);
  const total = Math.round(speedPts * accMul + evenBonus);
  return {
    total: Math.min(100, Math.max(0, total)),
    speedPoints: Math.round(speedPts),
    accuracyMultiplier: Math.round(accMul * 100) / 100,
    evennessBonus: evenBonus,
  };
}

function speedPoints(npm) {
  if (npm <= 0) return 0;
  if (npm < 120) return lerp(10, 25, npm / 120);
  if (npm < 200) return lerp(25, 45, (npm - 120) / 80);
  if (npm < 300) return lerp(45, 60, (npm - 200) / 100);
  return lerp(60, 70, Math.min(1, (npm - 300) / 200));
}

function accuracyMultiplier(pct) {
  if (pct >= 99) return 1.0;
  if (pct >= 95) return 0.95;
  if (pct >= 90) return 0.85;
  if (pct >= 80) return 0.70;
  return 0.50;
}

function evennessBonus(cv) {
  if (cv < 0.20) return 15;
  if (cv < 0.30) return 12;
  if (cv < 0.45) return 8;
  if (cv < 0.60) return 4;
  return 0;
}

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

export function speedLabel(npm) {
  if (npm < 120) return 'Slow';
  if (npm < 200) return 'Medium';
  if (npm < 300) return 'Fluent';
  return 'Fast';
}

export function rhythmLabel(cv) {
  if (cv < 0.25) return 'Rock steady';
  if (cv < 0.40) return 'Mostly steady';
  if (cv < 0.60) return 'A bit rushed';
  return 'Uneven';
}

export function touchLabel(dbStd) {
  if (dbStd < 3) return 'Very even';
  if (dbStd < 5) return 'Mostly even';
  if (dbStd < 8) return 'Some spots';
  return 'Varies';
}

export function coachNotes(stats) {
  const lines = [];

  if (stats.npm >= 200) {
    lines.push('Great speed — your fingers are moving confidently!');
  } else if (stats.npm >= 120) {
    lines.push('Solid pace. As you get more comfortable, the speed will come naturally.');
  } else {
    lines.push('Take your time — accuracy matters more than speed at this stage.');
  }

  if (stats.cv >= 0.60) {
    lines.push('Try practicing with a metronome at a slower tempo to build evenness.');
  } else if (stats.cv >= 0.40) {
    lines.push('Your rhythm is getting there — a few spots rush or drag, but the shape is good.');
  } else {
    lines.push('Lovely steady rhythm — that kind of control is hard to build.');
  }

  if (stats.inKeyPct >= 95) {
    lines.push(`${stats.inKeyPct}% in key — really clean playing.`);
  } else if (stats.inKeyPct >= 85) {
    lines.push(`${stats.inKeyPct}% in key — a few strays, probably thumb crossings. Focus on those transitions.`);
  } else {
    lines.push(`${stats.inKeyPct}% in key — slow down through the tricky spots and the accuracy will follow.`);
  }

  return lines.join(' ');
}
