#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

bun run typecheck
bun -e "import { missingTitleCards } from './src/lib.ts'; const ids = missingTitleCards(); if (ids.length && process.env.ALLOW_TITLE_CARDS !== '1') { console.error('TitleCard segments would render: ' + ids.join(', ') + '. Set ALLOW_TITLE_CARDS=1 to keep them.'); process.exit(1) }"
mkdir -p out
bunx remotion render src/index.ts Video out/video-raw.mp4 --codec=h264 --crf=16 --audio-bitrate=320k

# Pass 1 measures the rendered mix. Pass 2 applies gain and the oversampled peak limiter. Pass 3 applies measured loudnorm to −14 LUFS.
json() { sed -n '/^{/,/^}/p'; }
json_value() { sed -n "s/^[[:space:]]*\"$1\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" | tail -n 1; }
input=out/video-raw.mp4
output=out/video.mp4
input_i=$(ffmpeg -hide_banner -nostats -i "$input" -af loudnorm=print_format=json -f null - 2>&1 | json | json_value input_i)
pre="volume=$(awk "BEGIN{print -13 - $input_i}")dB,aresample=192000,alimiter=limit=0.794:attack=1:release=60:level=disabled,aresample=48000"
measured=$(ffmpeg -hide_banner -nostats -i "$input" -af "$pre,loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1 | json)
measured_i=$(printf '%s\n' "$measured" | json_value input_i)
measured_tp=$(printf '%s\n' "$measured" | json_value input_tp)
measured_lra=$(printf '%s\n' "$measured" | json_value input_lra)
measured_thresh=$(printf '%s\n' "$measured" | json_value input_thresh)
target_offset=$(printf '%s\n' "$measured" | json_value target_offset)
normalization=$(ffmpeg -hide_banner -nostats -y -i "$input" -c:v copy \
  -af "$pre,loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$measured_i:measured_TP=$measured_tp:measured_LRA=$measured_lra:measured_thresh=$measured_thresh:offset=$target_offset:linear=true:print_format=json,aresample=48000" \
  -c:a aac -b:a 320k "$output" 2>&1 | json | json_value normalization_type)
[ "$normalization" = linear ] || { echo "$output: loudnorm fell back to $normalization" >&2; exit 1; }

bun scripts/captions.ts > out/video.srt
bun scripts/qa.ts out/video.mp4 out/video.srt
