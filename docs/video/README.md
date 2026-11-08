# Skyclause video pipeline

This directory renders the 3:45 submission video from the director script, the shot contract, stored readings, and recorded takes. It keeps replays labelled and leaves unavailable recorded segments as title cards.

Contents:

1.  [Rules](#rules)
1.  [Pipeline](#pipeline)
1.  [Shot status](#shot-status)
1.  [Commands](#commands)
1.  [Recording a dev-pilot shot](#recording-a-dev-pilot-shot)
1.  [Voice](#voice)
1.  [Fallbacks](#fallbacks)

## Rules

- `director-script.md` and `shots.json` are the script and recording contract. Do not change them as part of a video build.
- Use the stored JPS series for rainfall. Do not fill missing data, smooth a line, or create per-day haze values.
- Label every stored replay. Show a mode word with its glyph. Keep the crimson mark to one element on a screen.
- Keep recordings and voice files under `public/`; both folders are ignored by git. Never automate Google sign-in or enter a password through the recorder.
- The tools are Playwright, Remotion, ffmpeg, and ElevenLabs.

## Pipeline

1.  Run `bun scripts/extract-replay.ts` to verify the stored JPS readings and write `src/data/replay-2nov.json`.
1.  Record developer-pilot shots with Playwright. Each run gets a new ID and stores cue times and viewport boxes with the take.
1.  Render `Video` in Remotion. It uses a recorded take when a passing take manifest exists, or a title card while a required segment is unavailable.
1.  Run the optional voice command for confirmed script sections. Remotion includes each available MP3 and stays silent for the rest.
1.  Run `bun run finish` to typecheck, render, apply three-pass loudness processing, write SRT captions, and run QA.

## Shot status

| Id  | Needs     | Status     |
| --- | --------- | ---------- |
| V2  | none      | not filmed |
| D1  | dev-pilot | not filmed |
| D2  | dev-pilot | not filmed |
| D3  | none      | not filmed |
| D4  | ge        | not filmed |
| D5  | dev-pilot | not filmed |
| D6  | dev-pilot | not filmed |
| V3  | none      | not filmed |

## Commands

Run these commands from `docs/video/`:

```sh
bun install
bun run studio
bun run typecheck
bun scripts/extract-replay.ts
bun run record
bun run record:check
bun run voice -- V1
bun run finish
```

The render and still outputs go to `out/`. `record:check` runs the browser actions and cue checks without recording a video. It writes its check manifest under the ignored `record/preflight/` folder.

## Recording a dev-pilot shot

1.  Save a signed-in Google session by hand:

    ```sh
    bunx playwright codegen --save-storage=record/.state/google.json --viewport-size="1920,1080" https://docs.google.com/
    ```

2.  Sign in in the opened browser yourself, then close it so Playwright writes the storage state. The recorder never types a password.
3.  Set the URLs needed for the shot. For example:

    ```sh
    SKYCLAUSE_FORM_URL="<dev form URL>" SKYCLAUSE_SHEET_URL="<dev sheet URL>" bun run record
    ```

    D6 also needs `SKYCLAUSE_GMAIL_URL`. D4 always skips until the Gemini Enterprise licence is available.

Recorded takes are append-only under `public/footage/runs/<run-id>/`. Cues include their time from the first screencast frame and their on-screen box in 1920×1080 CSS pixels. D1, D2, D5, and D6 use role-based locators where available; selectors that need confirmation are marked in `record/takes.rec.ts`.

## Voice

Set `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`, then run `bun run voice -- V1 D3`. The command reads spoken lines from the matching director-script headings, skips picture lines, and writes MP3 and word-timing JSON files. It refuses any selected segment with an open `{...}` script line. The `voice` command is not run as part of `finish`.

## Fallbacks

- Missing developer-pilot takes render as `Waiting for: dev pilot recording` title cards.
- D4 remains `Waiting for: Gemini Enterprise licence`; the recorder never uses a stand-in.
- V4 and V5 wait for confirmed research findings and team lanes from their open script lines.
- Missing MP3 files leave their segments silent. No voice sample is generated.
- `finish` stops if title cards remain. Set `ALLOW_TITLE_CARDS=1` only when rendering a cut that should keep those cards.
- The end-card video URL stays empty until its final URL is supplied through composition props. The repo and live URLs come from the project docs.
