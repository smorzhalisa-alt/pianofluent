export const KNOWN_DEVICES = [
  {
    key: 'roland-fp30x',
    label: 'Roland FP-30X',
    matchers: [/fp[-\s]?30x/i, /roland.*fp.?30/i],
    instructions: [
      'Turn on your FP-30X.',
      'Hold Function (Bluetooth icon) and press A1 (the leftmost white key) — the LED blinks to indicate pairing mode.',
      'Return here and click "Scan for pianos" below.',
      'Select "FP-30X" from the list to pair.',
    ],
  },
  {
    key: 'doutreligne-mhp2000',
    label: 'Doutreligne MHP-2000 / 2000S',
    matchers: [/mhp[-\s]?2000/i, /doutreligne/i],
    instructions: [
      'Power the MHP-2000 on and hold the Bluetooth button for ~3 seconds until the indicator flashes.',
      'Return to this page and click "Scan for pianos".',
      'Pick "MHP-2000" (or the model-specific name) from the list.',
    ],
  },
  {
    key: 'roland-generic',
    label: 'Other Roland (FP / GO / HP series)',
    matchers: [/roland/i],
    instructions: [
      'Enable Bluetooth on the piano (usually a Function menu — see your model\'s manual).',
      'The Bluetooth indicator should blink while pairing.',
      'Click "Scan for pianos" and select your model from the list.',
    ],
  },
  {
    key: 'yamaha-generic',
    label: 'Yamaha (P-series, Clavinova, YDP)',
    matchers: [/yamaha/i, /csp/i, /p-?\d{2,3}/i, /clp/i, /ydp/i],
    instructions: [
      'Turn on the piano and enable Bluetooth via the Function menu.',
      'Click "Scan for pianos" — the app requests MIDI access from your browser.',
      'Select your Yamaha device from the list to pair.',
    ],
  },
  {
    key: 'kawai-generic',
    label: 'Kawai (ES / CN / CA / ES-series)',
    matchers: [/kawai/i],
    instructions: [
      'Enable Bluetooth MIDI on the piano (see the panel Function menu).',
      'Click "Scan for pianos" and pick your Kawai from the list.',
    ],
  },
  {
    key: 'usb-generic',
    label: 'USB MIDI (any brand)',
    matchers: [/usb/i, /midi/i],
    instructions: [
      'Plug your piano into this computer with a USB-B → USB-A/C cable.',
      'Turn the piano on.',
      'Click "Scan for pianos" — it should appear as a USB MIDI device.',
    ],
  },
];

export const GENERIC_INSTRUCTIONS = [
  'Turn on your piano and enable Bluetooth MIDI (usually in the Function menu — see your model\'s manual).',
  'Or connect it directly with a USB MIDI cable.',
  'Click "Scan for pianos" — the browser will ask for MIDI access; click Allow.',
  'Pick your piano from the list.',
];

export function guessDevice(name){
  if(!name) return null;
  for(const dev of KNOWN_DEVICES){
    if(dev.matchers.some(rx => rx.test(name))) return dev;
  }
  return null;
}
