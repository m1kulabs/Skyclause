#!/usr/bin/env bash
# Final render and finish, from docs/video: bash scripts/finish-final.sh
# 1) HyperFrames render at quality looks, 2) two-pass master loudness to −16 LUFS / TP −1.5 (refuses a loudnorm that
# falls back from linear mode), 48 kHz, +faststart, 3) the QA gate (brief section 11) into logs/qa-final.txt.
set -euo pipefail
SHARED=${SKYCLAUSE_SHARED:-/mnt/c/Users/User/Downloads/skyclause-video}
EDIT=$(cd "$(dirname "$0")/../edit" && pwd)
RAW=$EDIT/renders/final-raw.mp4
OUT=$EDIT/renders/skyclause-prototype-final.mp4
QA=$SHARED/logs/qa-final.txt
cd "$EDIT"
nice -n 5 bunx hyperframes@0.9.39 lint >/dev/null
nice -n 5 bunx hyperframes@0.9.39 render --output "$RAW" --fps 30 --quality looks --video-frame-format png --workers 2
# Pass 1: measure.
M=$(nice -n 10 ffmpeg -hide_banner -nostats -i "$RAW" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$M" | sed -n "s/.*\"$1\" : \"\([^\"]*\)\".*/\1/p"; }
# Pass 2: apply linearly; refuse a dynamic fallback.
LOG=$(nice -n 10 ffmpeg -hide_banner -nostats -y -i "$RAW" -c:v copy -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true:print_format=json" -ar 48000 -c:a aac -b:a 192k -movflags +faststart "$OUT" 2>&1)
NORM=$(echo "$LOG" | sed -n 's/.*"normalization_type" : "\([^"]*\)".*/\1/p')
[ "$NORM" = "linear" ] || { echo "loudnorm fell back to $NORM: refusing" >&2; exit 1; }
# Hard rule 5: the label check on 5 s tiles (corner caption everywhere, Replay badge on D3, D4b, D5a).
LBL=$EDIT/renders/labels-final.txt
nice -n 10 python3 "$EDIT/../scripts/check-labels.py" "$OUT" "$SHARED/logs/timing.json" "$EDIT/renders/labels-final" > "$LBL" && LBL_OK=1 || LBL_OK=0
{
  echo "QA gate · $(TZ=Asia/Kuala_Lumpur date '+%Y-%m-%d %H:%M MYT') · $OUT"
  D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT"); echo "1 length: $D s (limit 600.0) $(awk -v d=$D 'BEGIN{print (d<=600)?"PASS":"FAIL"}')"
  echo "2 format: $(ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate -of csv=p=0 "$OUT" | tr '\n' ' ')"
  head -c 2000000 "$OUT" | grep -ac moov >/dev/null && echo "  faststart: moov near the start PASS" || echo "  faststart: FAIL"
  echo "3 loudness: $(nice -n 10 ffmpeg -hide_banner -nostats -i "$OUT" -af ebur128=peak=true -f null - 2>&1 | sed -n '/Summary/,$p' | grep -E 'I:|Peak:' | tr -s ' ' | tr '\n' ' ') (normalization: $NORM)"
  HITS=$(grep -rlE 'atempo|rubberband|setpts|playbackRate' "$EDIT/.." --include='*.ts' --include='*.tsx' --include='*.html' --include='*.js' --include='*.json' 2>/dev/null | grep -v node_modules || true)
  [ -z "$HITS" ] && echo "4 speed: no atempo/rubberband/setpts/playbackRate in the sources PASS" || echo "4 speed: FAIL, found in: $HITS"
  echo "8 silences over 1.5 s (planned: slate 0–3 s, end hold):"
  nice -n 10 ffmpeg -hide_banner -nostats -i "$OUT" -vn -af silencedetect=n=-45dB:d=1.5 -f null - 2>&1 | grep -oE "silence_(start|end): [0-9.]+" | paste - - | sed 's/^/  /'
  cat "$LBL"
} | tee "$QA"
nice -n 10 ffmpeg -v error -y -i "$OUT" -vf "select='not(mod(n\,150))',scale=384:216,drawtext=text='%{pts\:hms}':x=4:y=4:fontsize=14:fontcolor=yellow:box=1:boxcolor=black,tile=10x12" -frames:v 1 -vsync 0 "$SHARED/logs/qa-final-contact-5s.png"
[ "$LBL_OK" = 1 ] || { echo "label check failed (tiles in $QA): final not copied to $SHARED/renders" >&2; exit 1; }
cp "$OUT" "$SHARED/renders/skyclause-prototype-final.mp4"
cp "$SHARED/logs/captions.srt" "$SHARED/renders/skyclause-prototype-final.srt"
echo "copied to $SHARED/renders/: skyclause-prototype-final.mp4 and .srt ($(grep -c -- '-->' "$SHARED/renders/skyclause-prototype-final.srt") cues)"
