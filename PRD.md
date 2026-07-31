# PianoFluent — Product Requirements Document

A Strava-style web app for piano practice tracking. Players record sessions via MIDI keyboard or audio file upload, get personal analytics, and compete on standardized passages.

## Input modes

### MIDI (live session)
- Web MIDI API (`navigator.requestMIDIAccess`) — Chrome/Edge only
- Real-time note capture: pitch, velocity, timing, sustain pedal
- Auto-reconnect to preferred device
- Idle auto-end after 5 minutes of silence

### Audio upload (universal)
- User uploads an audio file (m4a, mp3, wav)
- Server-side or client-side analysis via pitch detection (librosa pyin / Web Audio API)
- Extracts: note onsets, pitch, loudness per note, inter-onset intervals
- Works with any piano — no MIDI hardware required

Both modes produce the same session data structure for dashboard and competition.

## Personal dashboard

### Commitment grid
GitHub-style square grid showing practice days. Each square = one day. Color intensity = number of sessions or total practice minutes that day. Shows current streak and longest streak.

### Last session widget
Compact card showing the most recent session stats:
- **Speed**: label (Slow / Medium / Fluent / Fast) + notes per minute
- **Rhythm**: label (Rock steady / Mostly steady / A bit rushed / Uneven) + short description
- **Touch**: label (Very even / Mostly even / Some spots / Varies) + description
- **Accuracy**: percentage of notes in the expected key

### Session history
Scrollable list of past sessions with date, duration, passage type, speed label, and accuracy.

### Personal improvement
Trend charts showing speed, accuracy, and evenness over time for repeated passages. Ascending vs descending comparison when applicable.

## Session report

After every MIDI session or audio upload, the app generates a full report:
- Overall stats (speed, rhythm, touch, accuracy)
- Ascending vs descending split (if scale detected)
- Speed curve chart (smoothed trend, not raw per-note)
- Touch/loudness chart across the keyboard
- Coach notes: positive, cheerful, concise, detail-oriented text insights with specific advice
- Beginner dictionary panel with plain-English definitions

### Report UX guidelines
- Speed shown as label (Fast) not raw number — notes/min as secondary
- Rhythm described in plain language ("Speeds up in the middle")
- Touch described as feel ("Bass notes quieter", "Louder up high")
- Accuracy as concise "93% in F major"
- Coach notes: motivational, specific, actionable. Never negative.
- All musical terms linkable to dictionary definitions

## Competition system

### Structure
Competitions are organized by levels. Each level contains a set of standardized passages. Users can submit attempts (from MIDI sessions or audio uploads) and improve their scores over time. Leaderboard shows best score per user per passage.

### Level 1: Easy

#### Passages

**1. C major scale — 2 octaves**
- Ascending: C3 → C5 (white keys only)
- Descending: C5 → C3
- The simplest scale — no sharps or flats

**2. F major scale — 4 octaves**
- Ascending: F1 → F5
- Descending: F5 → F1
- One flat (Bb) — tests thumb-under technique across wide range

**3. A major scale — contrary motion + long arpeggio**
- Contrary motion (расходящаяся гамма): both hands start at A3, one goes up, one goes down, then reverse — expanding outward then contracting back
- For single-hand recording: ascending passage, then descending passage, scored separately and combined
- Long arpeggio: A C# E A ascending and descending across full range

#### What is contrary motion?
Contrary motion (расходящаяся гамма) means playing outward from a center note. You start in the middle, go up a bit, then come back and go down past where you started, then back up even higher, then all the way down. Like breathing — expand, contract, expand further, contract further. In competition, we detect ascending and descending segments and check that the pattern alternates direction.

### Scoring formula

Each attempt gets a **Competition Score** (0–100):

```
Score = (Speed points) × (Accuracy multiplier) + (Evenness bonus)
```

**Speed points (0–70)**:
Based on notes per minute relative to passage benchmarks.
- Slow (<120 npm): 10–25 points
- Medium (120–200 npm): 25–45 points
- Fluent (200–300 npm): 45–60 points
- Fast (>300 npm): 60–70 points

Linear interpolation within each band.

**Accuracy multiplier (0.0–1.0)**:
Percentage of notes correctly in the expected key, applied as a multiplier to speed points.
- 99–100%: ×1.0
- 95–98%: ×0.95
- 90–94%: ×0.85
- 80–89%: ×0.70
- Below 80%: ×0.50

This means a Fast player at 75% accuracy scores worse than a Medium player at 99% accuracy. Speed without accuracy is penalized.

**Evenness bonus (0–15)**:
Based on coefficient of variation (CV) of inter-onset intervals.
- CV < 0.20 (metronome-like): +15
- CV < 0.30: +12
- CV < 0.45: +8
- CV < 0.60: +4
- CV >= 0.60: +0

Evenness is a bonus, not a blocker. An uneven but fast and accurate run still scores well.

**Example scores**:
| Player | Speed | Accuracy | Evenness | Score |
|--------|-------|----------|----------|-------|
| Fast + accurate + steady | 65 | ×1.0 | +14 | **79** |
| Fast + sloppy (78%) | 65 | ×0.50 | +4 | **37** |
| Medium + perfect + steady | 40 | ×1.0 | +15 | **55** |
| Fluent + accurate + uneven | 55 | ×0.95 | +2 | **54** |

### Leaderboard
- Best score per user per passage
- Shows: rank, username, score, speed label, accuracy %, date
- Personal best history visible on own profile
- Multiple attempts encouraged — only best counts

### Future levels (not in MVP)
- Level 2: Intermediate — minor scales, chromatic scale, longer arpeggios
- Level 3: Advanced — thirds, sixths, octaves, full contrary motion at speed

## Dictionary

In-app glossary of musical terms in plain, beginner-friendly language. Accessible from any screen via a help icon. Terms include:

| Term | Definition |
|------|-----------|
| Scale | Playing notes in order up and down the keyboard, like a ladder |
| F major | 7 notes (F G A Bb C D E) that sound happy and bright together |
| C major | The simplest scale — all white keys (C D E F G A B) |
| A major | A bright scale with 3 sharps (F#, C#, G#) |
| Arpeggio | Playing chord notes one at a time (like a harp) instead of all together |
| Contrary motion | Starting in the middle and expanding outward — one hand up, one hand down, then reversing |
| Steadiness / Evenness | How equal the time between notes is — like a ticking clock |
| Touch | How hard or soft you press each key — "even touch" means same volume throughout |
| Notes per minute | Playing speed. ~120 = relaxed, ~200 = brisk, ~400 = concert fast |
| Octave | 8 notes from one note to the same note higher (C to C) |
| Ascending | Going up the keyboard (left to right, low to high) |
| Descending | Going down the keyboard (right to left, high to low) |
| Coefficient of variation | How spread out your note timing is — lower = more even |

## Tech stack

- Vanilla HTML/JS/CSS — single-page app, no framework
- LocalStorage persistence (namespace: `pianofluent.v1`)
- Hash-based SPA routing (#/welcome, #/connect, #/home, #/session, #/summary/:id, #/compete)
- GitHub Pages deployment at smorzhalisa-alt.github.io/pianofluent
- Audio analysis: librosa (Python, for development/analysis) → Web Audio API + pitch detection (for in-browser MVP)
- Design system: Liquid Drama variant — pink accents, deep-cold red, glass blur, vibrant gradient insight cards

## Data model

### Session (LocalStorage)
```json
{
  "id": "crypto-random-id",
  "startedAt": "ISO timestamp",
  "endedAt": "ISO timestamp",
  "source": "midi | audio",
  "duration": 23.4,
  "totalNotes": 72,
  "speed": { "label": "Fast", "npm": 215, "medianGapMs": 186 },
  "rhythm": { "label": "Uneven", "cv": 0.78 },
  "touch": { "label": "Varies", "dbStd": 10.1 },
  "accuracy": { "inKeyPct": 93, "key": "F major" },
  "ascending": { "...same stats..." },
  "descending": { "...same stats..." },
  "notes": [{ "time": 0.5, "midi": 65, "name": "F4", "db": -8 }],
  "competitionPassageId": "f-major-4oct | null",
  "competitionScore": 79
}
```

### Competition attempt
```json
{
  "sessionId": "ref to session",
  "passageId": "c-major-2oct-asc",
  "score": 79,
  "speedPoints": 65,
  "accuracyMultiplier": 1.0,
  "evennessBonus": 14,
  "submittedAt": "ISO timestamp"
}
```

## Screens

1. **Welcome** — first-time onboarding, choose MIDI or audio upload
2. **Connect** — MIDI device pairing with troubleshooting
3. **Home** — commitment grid + last session widget + session history + competition entry
4. **Upload** — audio file upload with drag-and-drop, processing indicator
5. **Session live** — real-time MIDI capture with live stats
6. **Session report** — full analytics with charts, coach notes, dictionary
7. **Compete** — level browser, passage picker, leaderboard, personal bests
8. **Dictionary** — searchable glossary of musical terms
