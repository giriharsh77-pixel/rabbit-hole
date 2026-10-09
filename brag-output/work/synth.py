"""Soundtrack for the Rabbit Hole brag video — music + SFX written as one piece.

120 BPM, D major (I–V–vi–IV). Every effect is pitched to the key and placed on the
composition's event times (see composition.html, T = {...}). Writes stems and audio.wav.
    python3 synth.py
"""
import wave

import numpy as np
from scipy import signal as sg

SR = 48000
DUR = 23.0
N = int(SR * DUR)
BEAT = 0.5
rng = np.random.default_rng(7)

# scene starts (must match composition.html)
S2, S3, S4, S5, S6, S7 = 2.5, 5.5, 10.0, 13.5, 17.0, 19.5


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(n):
    return np.arange(n) / SR


class Bus:
    def __init__(self):
        self.x = np.zeros((N, 2))

    def add(self, start, sig, gain=1.0, pan=0.0):
        if sig.ndim == 1:
            a = (pan + 1) * np.pi / 4
            sig = np.stack([sig * np.cos(a), sig * np.sin(a)], axis=1)
        i = int(round(start * SR))
        if i >= N:
            return
        j = min(N, i + len(sig))
        if i < 0:
            sig, i = sig[-i:], 0
        self.x[i:j] += sig[: j - i] * gain


def lp(x, fc, order=2):
    b, a = sg.butter(order, min(fc, SR / 2 * 0.95) / (SR / 2), 'low')
    return sg.lfilter(b, a, x, axis=0)


def hp(x, fc, order=2):
    b, a = sg.butter(order, fc / (SR / 2), 'high')
    return sg.lfilter(b, a, x, axis=0)


def bp(x, lo, hi, order=2):
    b, a = sg.butter(order, [lo / (SR / 2), min(hi, SR / 2 * 0.95) / (SR / 2)], 'band')
    return sg.lfilter(b, a, x, axis=0)


def saw(f, n, detune=0.0):
    t = tt(n)
    out = np.zeros(n)
    kmax = int(min(40, (SR / 2) / (f * 1.02)))
    ph = rng.random() * 2 * np.pi
    for k in range(1, kmax + 1):
        out += np.sin(2 * np.pi * k * f * (1 + detune) * t + k * ph) / k
    return out * 0.55


def env(n, a=0.005, d=0.1, s=0.0, r=0.05, hold=None):
    """ADSR over n samples; hold = sustain length (s) before release, default fills."""
    e = np.zeros(n)
    A, D, R = int(a * SR), int(d * SR), int(r * SR)
    H = n - A - D - R if hold is None else int(hold * SR)
    H = max(H, 0)
    seg = [np.linspace(0, 1, A, endpoint=False), np.linspace(1, s, D, endpoint=False), np.full(H, s), np.linspace(s, 0, R)]
    e2 = np.concatenate(seg)[:n]
    e[: len(e2)] = e2
    return e


def expdec(n, tau):
    return np.exp(-tt(n) / tau)


def reverb_ir(length=1.8, tone=6000):
    n = int(length * SR)
    d = expdec(n, length / 6.5)
    ir = np.stack([lp(rng.standard_normal(n), tone) * d, lp(rng.standard_normal(n), tone) * d], axis=1)
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))[:, None]
    return ir / np.sqrt((ir ** 2).sum(axis=0).max())


def reverb(x, ir):
    y = np.stack([sg.fftconvolve(x[:, 0], ir[:, 0])[:N], sg.fftconvolve(x[:, 1], ir[:, 1])[:N]], axis=1)
    return y


# ── arrangement ───────────────────────────────────────────────────────────────
CH = {  # pad voicing (no root; the bass carries it), bass root, arp tones
    'D': ([62, 66, 69, 74], 38, [74, 78, 81, 86]),
    'A': ([61, 64, 69, 73], 33, [73, 76, 81, 85]),
    'Bm': ([62, 66, 71, 74], 35, [74, 78, 83, 86]),
    'G': ([62, 67, 71, 74], 31, [74, 79, 83, 86]),
}
BARS = [('D', 0, 2), ('D', 2, 4), ('A', 4, 6), ('Bm', 6, 8), ('G', 8, 10), ('D', 10, 12), ('A', 12, 14),
        ('Bm', 14, 16), ('G', 16, 18), ('A', 18, S7), ('D', S7, DUR)]
GROOVE = (2.0, S6)            # drums + bass
KICKS = [k * BEAT for k in range(int(GROOVE[0] / BEAT), int(GROOVE[1] / BEAT))] + [S7]

music, sfx, send = Bus(), Bus(), Bus()

# sidechain: duck everything melodic under each kick
duck = np.ones(N)
for k in KICKS:
    i = int(k * SR)
    n = min(N - i, int(0.45 * SR))
    duck[i:i + n] = np.minimum(duck[i:i + n], 1 - 0.55 * np.exp(-tt(n) / 0.11))

# pad
pad = np.zeros((N, 2))
for name, a, b in BARS:
    notes, _, _ = CH[name]
    n = int((b - a + 0.6) * SR)
    sig = np.zeros(n)
    for m in notes:
        f = mtof(m)
        sig += saw(f, n, 0.0035) + saw(f, n, -0.004)
    e = env(n, a=0.08, d=0.2, s=0.85, r=0.6)
    sig = lp(sig * e, 2700 if name != 'D' or a < S7 else 3400)
    tmp = Bus()
    tmp.add(a, sig, pan=-0.35)
    tmp.add(a + 0.011, sig, pan=0.35)
    pad += tmp.x
# hook: pad opens from dark to bright over the first two seconds
open_k = np.clip(tt(N) / 2.0, 0, 1)[:, None]
pad = lp(pad, 520) * (1 - open_k) + pad * open_k
pad *= duck[:, None]
music.x += pad * 0.075
send.x += pad * 0.04

# arp plucks (16ths), ping-pong panned
arp = Bus()
for name, a, b in BARS:
    _, _, tones = CH[name]
    pattern = [0, 1, 2, 3, 2, 1, 2, 3]
    steps = int(round((b - a) / (BEAT / 4)))
    for s in range(steps):
        t0 = a + s * BEAT / 4
        if t0 >= DUR - 0.8:
            break
        m = tones[pattern[s % 8]]
        n = int(0.26 * SR)
        f = mtof(m)
        x = (np.sin(2 * np.pi * f * tt(n)) * 0.7 + sg.sawtooth(2 * np.pi * f * tt(n), 0.5) * 0.3) * expdec(n, 0.07)
        vel = 0.75 + 0.25 * ((s % 4) == 0)
        if S6 <= t0 < S7:
            vel *= 0.6
        arp.add(t0, x * vel, pan=-0.45 if s % 2 else 0.45)
arpx = lp(arp.x, 7500)
arpx = lp(arpx, 900) * (1 - open_k) + arpx * open_k
arpx *= duck[:, None]
music.x += arpx * 0.065
send.x += arpx * 0.05

# bass: off-beat 8ths with a sub, plus a long sub on the outro hit
for name, a, b in BARS:
    _, root, _ = CH[name]
    for s in range(int(round((b - a) / BEAT))):
        t0 = a + s * BEAT + BEAT / 2
        if not (GROOVE[0] <= t0 < GROOVE[1]):
            continue
        n = int(0.24 * SR)
        f = mtof(root)
        x = np.sin(2 * np.pi * f * tt(n)) + 0.35 * lp(saw(f * 2, n), 900)
        music.add(t0, x * env(n, 0.004, 0.08, 0.6, 0.08), gain=0.21)
n = int(3.4 * SR)
music.add(S7, np.sin(2 * np.pi * mtof(38) * tt(n)) * env(n, 0.01, 0.4, 0.5, 2.6), gain=0.26)

# drums
def kick(gain=1.0):
    n = int(0.42 * SR)
    t = tt(n)
    f = 54 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * expdec(n, 0.13)
    click = hp(rng.standard_normal(n), 2500) * expdec(n, 0.004) * 0.25
    return (body + click) * gain


def clap():
    n = int(0.3 * SR)
    x = np.zeros(n)
    for off in (0.0, 0.009, 0.018):
        i = int(off * SR)
        m = n - i
        x[i:] += rng.standard_normal(m) * expdec(m, 0.012 if off < 0.018 else 0.09)
    return bp(x, 900, 3200)


def hat(open_=False):
    n = int((0.18 if open_ else 0.06) * SR)
    return hp(rng.standard_normal(n), 7500) * expdec(n, 0.05 if open_ else 0.014)


for k in range(int(GROOVE[0] / BEAT), int(GROOVE[1] / BEAT)):
    t0 = k * BEAT
    music.add(t0, kick(), gain=0.5)
    if k % 2 == 1:
        c = clap()
        music.add(t0, c, gain=0.19, pan=0.05)
        send.add(t0, c, gain=0.12)
    music.add(t0 + BEAT / 2, hat(open_=(k % 4 == 3)), gain=0.11, pan=0.25)
    for q in (1, 3):  # quiet 16th shaker, slightly swung
        music.add(t0 + q * BEAT / 4 + 0.012, hat(), gain=0.04, pan=-0.3)
# little fills before the tab click and the bridge
for t0 in (S4 - 0.375, S4 - 0.25, S4 - 0.125, S5 - 0.25, S5 - 0.125):
    music.add(t0, clap(), gain=0.09, pan=-0.1)
music.add(S7, kick(), gain=0.62)

# ── SFX (pitched into D major, tucked under the music) ───────────────────────
def boom(f0=73.4, length=1.4):
    n = int(length * SR)
    t = tt(n)
    f = f0 * (0.55 + 0.45 * np.exp(-t / 0.25))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.004, 0.2, 0.5, length - 0.25)


def noise_sweep(length, f_from, f_to, shape='rise'):
    n = int(length * SR)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 512
    for i in range(0, n, blk):
        k = i / n
        fc = f_from * (f_to / f_from) ** k
        seg = x[i:i + blk]
        out[i:i + blk] = bp(seg, max(60, fc * 0.6), fc * 1.5, 1)
    e = np.linspace(0, 1, n) ** 2 if shape == 'rise' else np.sin(np.linspace(0, np.pi, n)) ** 1.5
    return out * e


def bell(m, length=1.2):
    n = int(length * SR)
    f = mtof(m)
    t = tt(n)
    x = np.sin(2 * np.pi * f * t) * expdec(n, 0.35) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * expdec(n, 0.12) + 0.2 * np.sin(2 * np.pi * f * 5.4 * t) * expdec(n, 0.05)
    return x * env(n, 0.002, 0.0, 1.0, 0.05)


def blip(m, length=0.22):
    n = int(length * SR)
    f = mtof(m)
    return np.sin(2 * np.pi * f * tt(n)) * expdec(n, 0.05) * env(n, 0.002, 0, 1, 0.02)


def click():
    n = int(0.05 * SR)
    return bp(rng.standard_normal(n), 1800, 6000) * expdec(n, 0.004) + 0.4 * np.sin(2 * np.pi * 1760 * tt(n)) * expdec(n, 0.006)


def whoosh(length=0.45, pan_from=-0.6, pan_to=0.6):
    x = noise_sweep(length, 300, 4200, 'arc')
    n = len(x)
    p = np.linspace(pan_from, pan_to, n)
    a = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1)


# hook
sfx.add(0.0, boom(73.4, 1.6), gain=0.4)
sh = hp(rng.standard_normal(int(1.2 * SR)), 6000) * expdec(int(1.2 * SR), 0.25)
send.add(0.0, sh, gain=0.06)
sfx.add(0.8, noise_sweep(1.25, 400, 6000, 'rise'), gain=0.10)
sfx.add(S2 - 0.47, whoosh(0.5, 0.0, 0.0), gain=0.22)
sfx.add(S2, boom(55.0, 1.0), gain=0.35)
imp = lp(rng.standard_normal(int(0.9 * SR)), 2500) * expdec(int(0.9 * SR), 0.12)
send.add(S2, imp, gain=0.10)
# reveal: chips
for i, m in enumerate((74, 78, 81)):
    sfx.add(S2 + 0.8 + i * 0.14, blip(m), gain=0.10, pan=-0.2 + 0.2 * i)
    send.add(S2 + 0.8 + i * 0.14, blip(m), gain=0.05)
# relevance sparkle
for i, m in enumerate((81, 86, 90)):
    sfx.add(S3 + 1.25 + i * 0.05, bell(m, 1.0), gain=0.07, pan=0.3)
    send.add(S3 + 1.25 + i * 0.05, bell(m, 1.0), gain=0.07)
# tab click + content swap
sfx.add(S4 - 0.03, click(), gain=0.22, pan=0.1)
sfx.add(S4 + 0.02, whoosh(0.32, 0.4, -0.4), gain=0.08)
# section chips tick up the pentatonic
for i, m in enumerate((86, 88, 90, 93)):
    sfx.add(S4 + 1.75 + i * 0.32, blip(m, 0.18), gain=0.09, pan=-0.3 + 0.2 * i)
    send.add(S4 + 1.75 + i * 0.32, blip(m, 0.18), gain=0.05)
sfx.add(S4 + 2.95, bell(85, 0.8), gain=0.05, pan=0.2)
# bridge
sfx.add(S5 - 0.22, whoosh(0.42, -0.7, 0.7), gain=0.16)
sfx.add(S5 + 1.02, click(), gain=0.22, pan=0.15)
sfx.add(S5 + 1.06, whoosh(0.34, 0.3, -0.3), gain=0.10)
# privacy: breakdown, bell on the footer, riser into the outro
sfx.add(S6 + 0.45, bell(74, 1.6), gain=0.07)
send.add(S6 + 0.45, bell(74, 1.6), gain=0.08)
sfx.add(S7 - 1.0, noise_sweep(0.98, 300, 7000, 'rise'), gain=0.10)
# outro hit
sfx.add(S7, boom(73.4, 2.6), gain=0.32)
cr = hp(rng.standard_normal(int(2.6 * SR)), 4500) * expdec(int(2.6 * SR), 0.6)
send.add(S7, cr, gain=0.05)
sfx.add(S7, cr, gain=0.03)
for i, m in enumerate((86, 93)):
    sfx.add(S7 + 0.02 + i * 0.07, bell(m, 2.2), gain=0.08, pan=-0.2 + 0.4 * i)
    send.add(S7 + 0.02 + i * 0.07, bell(m, 2.2), gain=0.08)
sfx.x *= np.clip(1 - 0.0 * duck, 0, 1)[:, None]

# ── mix & master ──────────────────────────────────────────────────────────────
ir = reverb_ir(2.0, 6500)
wet = reverb(send.x, ir)
mix = music.x + sfx.x * 0.85 + wet * 0.55
mix = hp(mix, 40)
# end: gentle fade over the last 0.9 s so the tail lands inside the video
fade = np.ones(N)
fn = int(0.9 * SR)
fade[-fn:] = np.linspace(1, 0, fn) ** 1.6
mix *= fade[:, None]
peak = np.abs(mix).max()
mix = np.tanh(1.25 * mix / peak) / np.tanh(1.25) * 0.9


def write(path, x):
    y = np.clip(x, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((y * 32767).astype('<i2').tobytes())


for name, bus in (('stem-music.wav', music.x), ('stem-sfx.wav', sfx.x + wet * 0.3)):
    write(name, bus / max(1e-9, np.abs(bus).max()) * 0.8)
write('audio-premaster.wav', mix)
print('✓ audio-premaster.wav', f'{DUR}s', 'peak', round(float(np.abs(mix).max()), 3))
