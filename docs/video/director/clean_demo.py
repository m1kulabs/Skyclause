"""Clean Kelvin demo narration to match the slide voice: mono, 48 kHz, 24-bit, -19 LUFS.

Usage: python3 -I video/director/clean_demo.py D3 [D1 ...]
Reads voice/kelvin/<id>.mp3, writes voice/processed/<id>.wav, prints a JSON report.
Same chain as logs/clean_voice.py (high-pass, 2:1 compression, gain, 4x limiter, linear
loudnorm) but with no silence trimming, so the ElevenLabs word times in
voice/kelvin/<id>.words.json stay exact. Pauses over 0.5 s are reported for the edit.
"""
import json, os, re, subprocess, sys
from pathlib import Path

ROOT = Path(os.environ.get('SKYCLAUSE_VIDEO_DIR', Path(__file__).resolve().parents[2]))
SRC, OUT = ROOT / 'voice' / 'kelvin', ROOT / 'voice' / 'processed'
TARGET_I, TARGET_TP, TARGET_LRA = -19.0, -1.5, 11
COMPRESS = 'acompressor=threshold=0.063:ratio=2:attack=10:release=150:knee=6'


def run(args):
    return subprocess.run(['nice', '-n', '10', 'ffmpeg', '-hide_banner', '-nostats', '-y', *args],
                          capture_output=True, text=True, check=True).stderr


def measure(path):
    err = run(['-i', str(path), '-af', f'loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}:print_format=json', '-f', 'null', '-'])
    return json.loads(err[err.rindex('{'):err.rindex('}') + 1])


def duration(path):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                                capture_output=True, text=True, check=True).stdout)


report = []
for bid in sys.argv[1:]:
    src, dst = SRC / f'{bid}.mp3', OUT / f'{bid}.wav'
    pre, lim = OUT / f'.{bid}.pre.wav', OUT / f'.{bid}.lim.wav'
    run(['-i', str(src), '-ac', '1', '-af', f'highpass=f=80,{COMPRESS}', '-ar', '48000', '-c:a', 'pcm_s24le', str(pre)])
    m = measure(pre)
    gain = TARGET_I - float(m['input_i'])
    run(['-i', str(pre), '-af', f'volume={gain:.2f}dB,aresample=192000,alimiter=limit=0.708:attack=5:release=50:level=false,aresample=48000',
         '-c:a', 'pcm_s24le', str(lim)])
    m2 = measure(lim)
    ln = (f"loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}:measured_I={m2['input_i']}:measured_TP={m2['input_tp']}:"
          f"measured_LRA={m2['input_lra']}:measured_thresh={m2['input_thresh']}:offset={m2['target_offset']}:linear=true:print_format=json")
    err = run(['-i', str(lim), '-af', ln, '-ar', '48000', '-c:a', 'pcm_s24le', str(dst)])
    final = json.loads(err[err.rindex('{'):err.rindex('}') + 1])
    if final['normalization_type'] != 'linear':
        sys.exit(f'{bid}: loudnorm fell back to {final["normalization_type"]}; measured {m2}')
    check = measure(dst)
    pre.unlink(); lim.unlink()
    err = run(['-i', str(dst), '-af', 'silencedetect=n=-45dB:d=0.5', '-f', 'null', '-'])
    long_pauses = [[round(float(a), 2), round(float(b), 2)] for a, b in
                   re.findall(r'silence_start: ([0-9.]+)\n.*?silence_duration: ([0-9.]+)', err, re.S)]
    report.append({'file': dst.name, 'seconds': round(duration(dst), 2), 'lufs_out': float(check['input_i']),
                   'tp_out': float(check['input_tp']), 'pauses_over_0.5s_at_and_length': long_pauses})

json.dump(report, sys.stdout, indent=1)
print()
