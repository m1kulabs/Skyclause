#!/usr/bin/env python3
"""Build logs/timing.json and the slide captions from the measured voice files.

Run: python3 video/director/build.py [--slide-rate 1.00] (from the repo, set SKYCLAUSE_VIDEO_DIR to the shared folder)
Reads:  voice/processed/S<nn>.wav (ffprobe), logs/voice-gaps.json,
        video/director/captions-slides.txt, voice/processed/D<n>.wav if present.
Writes: logs/timing.json, logs/captions-slides.srt (film time).
"""
import argparse, json, os, pathlib, subprocess
from datetime import datetime, timezone, timedelta

# The shared video folder (voice/, logs/, video/director/). Set SKYCLAUSE_VIDEO_DIR when running from the repo.
ROOT = pathlib.Path(os.environ.get("SKYCLAUSE_VIDEO_DIR", pathlib.Path(__file__).resolve().parents[2]))
VOICE = ROOT / "voice" / "processed"
LOGS = ROOT / "logs"
MYT = timezone(timedelta(hours=8))

LEAD, TAIL = 0.12, 0.25          # silence already inside each cleaned file (README)
GAP = 0.80                       # audible silence between slides (hard rule 3)
HOLD = round(GAP - LEAD - TAIL, 2)  # still time added after each slide's voice
TARGET, LIMIT, CAP = 590.0, 600.0, 1.20
# Demo beats as locked in the Demo composition, seconds at 1.0x. D6 carries +0.062 s so the
# demo sums to demo-v3.mp4 as probed (161.685 s, AAC padding) and S07 onward matches the HyperFrames timeline.
DEMO = [("D1", "declare", 25.0), ("D2", "watch", 23.24), ("D3", "decide (replay)", 38.6),
        ("D4", "approve (fallback)", 29.0), ("D5", "notify (fallback)", 17.0), ("D6", "record (fallback)", 24.962)]


def dur(p):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", str(p)], capture_output=True, text=True, check=True)
    return float(out.stdout)


def captions():
    cues, cur = {}, None
    for line in (ROOT / "video" / "director" / "captions-slides.txt").read_text().splitlines():
        if line.startswith("## "):
            cur = line[3:].strip(); cues[cur] = []
        elif line.strip() and not line.startswith("#") and cur:
            cues[cur].append(line.strip())
    return cues


def align(lines, length, gaps):
    """Spread cue boundaries over the speech by characters, snapping each to a pause."""
    t, end, out = LEAD, length - TAIL, []
    for i, text in enumerate(lines):
        left = sum(len(x) for x in lines[i:])
        if i == len(lines) - 1:
            out.append([t, end, text]); break
        est = t + (end - t) * len(text) / left
        near = [g for g in gaps if g[0] > t + 0.6 and abs((g[0] + g[1]) / 2 - est) <= 0.9]
        if near:
            g = min(near, key=lambda g: abs((g[0] + g[1]) / 2 - est))
            out.append([t, g[0], text]); t = g[1]
        else:
            out.append([t, est, text]); t = est
    return out


def two_lines(text):
    """Keep every word: one line up to 42 characters, else split at the space nearest the middle."""
    if len(text) <= 42:
        return text
    spaces = [i for i, c in enumerate(text) if c == " "]
    i = min(spaces, key=lambda i: abs(i - len(text) / 2))
    return text[:i] + "\n" + text[i + 1:]


def srt_time(s):
    ms = round(s * 1000)
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slide-rate", type=float, default=1.00)
    a = ap.parse_args()
    if not 1.0 <= a.slide_rate <= CAP:
        raise SystemExit(f"slide rate {a.slide_rate} is outside 1.00 to {CAP}")
    r = a.slide_rate
    gaps = json.loads((LOGS / "voice-gaps.json").read_text())["gaps"]
    segs, t = [], 0.0

    def add(**s):
        nonlocal t
        s["start_s"] = round(t, 3); t += s["dur_s"]; s["end_s"] = round(t, 3)
        segs.append(s)

    def slide(n, hold=HOLD, label=None):
        f = VOICE / f"S{n:02}.wav"; v = dur(f)
        add(id=f"S{n:02}", kind="slide", label=label or f"Slide {n}",
            still=f"docs/demo/prelim/deck/out/slide-{n:02}.png", voice=f"voice/processed/{f.name}",
            voice_s=round(v, 3), rate=r, hold_s=hold, dur_s=round(v / r + hold, 3), status="measured")

    add(id="slate", kind="slate", label="Slate", dur_s=3.0, status="planned")
    for n in range(1, 6):
        slide(n)
    slide(6, label="Slide 6, demo cue (inside demo.mp4)")
    for bid, name, planned in DEMO:
        f = VOICE / f"{bid}.wav"
        v = round(dur(f), 3) if f.exists() else None
        add(id=bid, kind="demo", label=f"{bid}, {name}", voice=f"voice/processed/{bid}.wav",
            voice_s=v, rate=1.0, dur_s=float(planned),
            status="voice measured, picture planned" if v else "planned")
    for n in range(7, 11):
        slide(n)
    slide(11, hold=0.0)
    add(id="end", kind="hold", label="End hold on slide 11 QR codes",
        still="docs/demo/prelim/deck/out/slide-11.png", dur_s=3.0, status="planned")

    total = round(t, 3)
    slide_voice = sum(s["voice_s"] for s in segs if s["kind"] == "slide")
    over = total - TARGET
    need = slide_voice / (slide_voice / r - over) if over > 0 else r
    timing = {
        "generated": datetime.now(MYT).strftime("%Y-%m-%d %H:%M MYT"),
        "method": "ffprobe per file; slide = voice/rate + hold; gap between slides "
                  f"{GAP}s = {LEAD}s lead + {TAIL}s tail inside the file + {HOLD}s hold",
        "target_s": TARGET, "limit_s": LIMIT, "speed_cap": CAP,
        "speed": {"slides": r, "demo": 1.0, "tool": "atempo (pitch kept)"},
        "total_s": total, "total_mmss": f"{int(total // 60)}:{total % 60:04.1f}",
        "margin_to_target_s": round(TARGET - total, 3),
        "slide_rate_needed_for_target": round(min(need, 99), 4),
        "segments": segs,
    }
    (LOGS / "timing.json").write_text(json.dumps(timing, indent=1) + "\n")

    cues, n, blocks = captions(), 0, []
    for s in segs:
        if s["kind"] != "slide":
            continue
        for a0, a1, text in align(cues[s["id"]], s["voice_s"], gaps.get(s["id"], [])):
            n += 1
            body = two_lines(text)
            blocks.append(f"{n}\n{srt_time(s['start_s'] + a0 / r)} --> "
                          f"{srt_time(s['start_s'] + a1 / r)}\n{body}\n")
    (LOGS / "captions-slides.srt").write_text("\n".join(blocks))

    # Demo cues: Kelvin word times, placed per video/director/demo-place.json
    # {"D3": {"offset": 0.0, "splits": [[26.6, 1.0]]}} = voice starts `offset` s into the beat,
    # and `splits` insert silence (voice time, seconds) as the edit does.
    place_file = ROOT / "video" / "director" / "demo-place.json"
    place = json.loads(place_file.read_text()) if place_file.exists() else {}
    timed = [(s["start_s"] + a0 / r, s["start_s"] + a1 / r, text)
             for s in segs if s["kind"] == "slide"
             for a0, a1, text in align(cues[s["id"]], s["voice_s"], gaps.get(s["id"], []))]
    demo_ids = []
    for s in segs:
        words_file = ROOT / "voice" / "kelvin" / f"{s['id']}.words.json"
        if s["kind"] != "demo" or s["id"] not in place or not words_file.exists():
            continue
        p, base = place[s["id"]], s["start_s"]
        shift = lambda t: t + sum(g for at, g in p.get("splits", []) if t >= at)
        for c0, c1, text in demo_cues(json.loads(words_file.read_text())["words"]):
            timed.append((base + p["offset"] + shift(c0), base + p["offset"] + shift(c1), text))
        demo_ids.append(s["id"])
    timed.sort()
    (LOGS / "captions.srt").write_text("\n".join(
        f"{i}\n{srt_time(a)} --> {srt_time(b)}\n{two_lines(t)}\n" for i, (a, b, t) in enumerate(timed, 1)))
    print(f"total {timing['total_mmss']} ({total}s), margin to {TARGET}s: "
          f"{timing['margin_to_target_s']}s, slide rate {r}, needed {timing['slide_rate_needed_for_target']}; "
          f"{n} slide cues; captions.srt {len(timed)} cues (demo: {', '.join(demo_ids) or 'none'})")


def demo_cues(words):
    """Group ElevenLabs words into cues: end on a sentence stop, or at a comma past 50 characters, or at 80."""
    out, cur = [], []
    for w in words:
        cur.append(w)
        text = " ".join(x["word"] for x in cur)
        if w["word"][-1] in ".?!" or (w["word"][-1] == "," and len(text) > 50) or len(text) > 80:
            out.append((cur[0]["start"], cur[-1]["end"], text)); cur = []
    if cur:
        out.append((cur[0]["start"], cur[-1]["end"], " ".join(x["word"] for x in cur)))
    # A bare time or number ("14:55.") merges with the next cue; other short sentences stand alone.
    merged = []
    for c in out:
        if merged and len(merged[-1][2]) <= 8 and len(merged[-1][2]) + len(c[2]) < 80:
            a = merged.pop(); merged.append((a[0], c[1], f"{a[2]} {c[2]}"))
        else:
            merged.append(c)
    return merged


if __name__ == "__main__":
    main()
