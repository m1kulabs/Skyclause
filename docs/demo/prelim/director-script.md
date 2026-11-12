# Director script

The word-for-word script for Skyclause's prototype-round video, slide by slide, following the [prelim deck](deck/skyclause-pitch-deck.html). The video is a recording, labelled as one, and runs about 9:24, with the voiceover sped up 1.2×, inside the organisers' 10-minute limit.

Status: a full draft. The live demo runs on production at `app.skyclause.m1ku.tech`; work through [Check before recording](#check-before-recording) first.

Two roles: the narrator speaks every line, as a teammate's voice or an ElevenLabs voice; the recorder drives the browser and the edit, and says nothing. No one narrates clicks.

Contents:

1.  [Timing](#timing)
1.  [Slide 1, who we are](#slide-1-who-we-are)
1.  [Slide 2, the problem](#slide-2-the-problem)
1.  [Slide 3, who it is for](#slide-3-who-it-is-for)
1.  [Slide 4, the solution](#slide-4-the-solution)
1.  [Slide 5, how it works](#slide-5-how-it-works)
1.  [The live demo, slide 6](#the-live-demo)
1.  [Slide 7, why Skyclause](#slide-7-why-skyclause)
1.  [Slide 8, impact](#slide-8-impact)
1.  [Slide 9, technical architecture](#slide-9-technical-architecture)
1.  [Slide 10, who pays](#slide-10-who-pays)
1.  [Slide 11, the close](#slide-11-the-close)
1.  [Claim guardrails](#claim-guardrails)
1.  [Claims ledger](#claims-ledger)
1.  [Check before recording](#check-before-recording)

## Timing

At 140 words a minute, a natural pace for spoken lines.

| Slide | Time        | Beat                                                                      | Words |
| ----- | ----------- | ------------------------------------------------------------------------- | ----- |
| 1     | 0:00–0:34   | Who we are, and what we built                                             | 75    |
| 2     | 0:34–1:36   | One afternoon, three numbers, and the missing rule                        | 142   |
| 3     | 1:36–2:13   | Who it is for, who approves, and the first pilot window                   | 83    |
| 4     | 2:13–2:55   | Public signals in, one approved call out                                  | 95    |
| 5     | 2:55–3:36   | The six-step loop, then the demo handoff                                  | 94    |
| 6     | 3:36–6:36   | Live demo: declare, watch, the replayed crossing, approve, notify, record | 420   |
| 7     | 6:36–7:50   | Why Skyclause, not a weather app                                          | 170   |
| 8     | 7:50–8:52   | Impact: time, reach, honesty, 3 and 6 months                              | 140   |
| 9     | 8:52–9:22   | Technical architecture on Google Cloud                                    | 67    |
| 10    | 9:22–10:12  | Who pays, and the pilot roadmap                                           | 113   |
| 11    | 10:12–10:41 | The close, the pilot ask, then 3 seconds on the QR codes                  | 59    |

About 1458 spoken words; at 140 words a minute the cut ends at about 10:41, with 1.5 seconds of breath between slides and the demo's holds included. With the voiceover sped up 1.2× in the edit, it ends at about 9:24, which leaves about 36 seconds under the limit.

The demo is the longest beat on purpose: it is the proof that the product runs. If a full read runs long, speed the voiceover up in the edit, by up to 20% with the pitch kept: it still sounds natural, and at 1.2× this cut runs about 9:24 (the demo picture and holds stay at their own speed).

## Slide 1, who we are

**Narrator**, 0:00 to 0:34

> Hi, we're team Miku (M1KU).
>
> Every campus has a weather app. Every student has one in their pocket.
>
> But when a storm hits at half past three, not one of them can tell you who made the call, or where it's written down.
>
> Until now, nobody could. So we built Skyclause.
>
> Weather apps give you readings. Skyclause turns them into one approved call for your class, sends everyone the same notice, and keeps the evidence.

On screen: the title, "The Call for Every Window.", the five of us, and the organiser, sponsor and SDG 11 marks. A small caption in the corner for the whole video: "Recording of the live system, captured {capture date}".

Why it works: open on something everyone owns, then a question nobody can answer. "Until now" is the hook the demo pays off.

## Slide 2, the problem

**Narrator**, 0:34 to 1:36

> Picture this. Monday, 3:25. Your lecture ends in five minutes, and the sky over Bukit Jalil has just gone black.
>
> Run for the LRT? Wait it out? Nobody tells you. So you check your phone, the group chat, the window, and walk out anyway.
>
> That's what happened on the second of November. 63 millimetres of rain in two hours. At half past three, 89 classes let out, straight into it.
>
> And it keeps happening. 77.5 millimetres, three days earlier. LRT Bukit Jalil's fare gates under water in May. Unhealthy air near campus on 20 of 31 days, from early October into November.
>
> For an international student, fall below 80% attendance, and your student pass is on the line.
>
> Schools shut down above 180 on the haze index. Universities? None.
>
> So every lecturer decides alone. Every student guesses. And nobody writes it down.

On screen: the 2 November rain bars with the 15:30 line over the storm background, then the four tiles in reading order: 77.5 mm, 20 of 31 days, 190, and 0 written rules. The band "Nobody Made the Call" lands on the last line. The storm background is generated art, not a photograph of 2 November.

Why it works: the room lives the 3:25 moment before it hears a number, so every number lands on someone they can picture. The attendance line turns a wet walk into real stakes. Slow down on the last line.

## Slide 3, who it is for

**Narrator**, 1:36 to 2:13

> Who is Skyclause for?
>
> Well, club organisers, for their evening events. And commuting students, before the half-past-three wave.
>
> Most importantly, nothing goes out until one person in charge that day says yes.
>
> And we start small, with one pilot. A window is simply a stretch of time someone is responsible for, like the moment a class lets out. Our first one is the weekday 3:30 release by LRT Bukit Jalil, with a campus office, like Student Affairs, naming the person who says yes.

On screen: the four cards, then the band "The Moment". The fourth card, "First Pilot", lands on the pilot line.

## Slide 4, the solution

**Narrator**, 2:13 to 2:55

> Now, you might be thinking: why not just use Google Weather?
>
> Because a weather app answers one question: what's the weather? A campus needs three. Will the storm, or the haze, hit when my class lets out? What do we do about it? And who decided?
>
> That's Skyclause. Public signals in, one approved call out.
>
> It reads the real rain gauge by the LRT every five minutes, adds MET storm warnings and the haze index, and Gemini on Vertex AI drafts the call. Every day, on its own. And every call, sealed on the record.

On screen: the table, row by row as each is named. Don't read the row labels; the narration covers them.

Why it works: it names the judge's first objection out loud, before they can raise it, and answers it with the three questions a weather app can't.

## Slide 5, how it works

**Narrator**, 2:55 to 3:36

> A clause is the condition behind a call, like more than 31 millimetres of rain in an hour.
>
> Here's the whole loop.
>
> You declare a window. Skyclause watches the rain gauge, the storm warnings and the haze index. The clause decides, and Gemini drafts the call. One person approves. The notice goes out, by email and calendar. And the call goes on the record.
>
> What if a feed goes quiet? No call. Never an old number. And no call doesn't mean clear skies. It means we don't have fresh evidence, so we say so.

On screen: the journey line. The edit lights each station as it is named: Declare, Watch, Decide, Approve, Notify, Record.

## The live demo

**Slide 6**, the demo cue, on screen for 3 seconds: "One Window, Gauge to Record.", with the six steps in one line.

> Let's watch one window, from the gauge to the record.

_[Cut from the deck to the browser recording.]_

This segment proves three things to an investor. One: a person spends 30 seconds declaring a window, and never has to watch the sky again. Two: when the rain crosses the line, there are 25 minutes to act, and Skyclause uses them. Three: the output is a decision somebody owns and can defend later, not another weather reading.

**Narrator**, about 3:00 of picture, straight after slide 6 (see [Timing](#timing) for its place in the cut). The **Recorder** screen-records the production app and says nothing. Each beat gives the page, the Recorder's actions in order, the Narrator's lines, then what the edit must make the viewer notice. The six beats add up to 3:00: 2:51 of narration at 140 words a minute, plus 9 seconds of holds, most of them on the replay.

Every label below was read off `main` at `d45a0b2` (#733, the redesign) on 13 November 2026, which is the build production runs. Nobody signed in to check them. If a label on screen differs, the Recorder follows the screen and the Narrator's lines stay as written: no line reads a label aloud.

### Read this first: what records today

Status from a live walk on production at 04:40 MYT, 13 November 2026 (main `4834c7f0`, deploy 8). Five beats record as written; D4's live verdict depends on the real sky. A rehearsal **Ask for a call** drafted a bundle end to end on Gemini, reading "Normal; 5 inputs fresh". Recheck with the team's troubleshooting session before the take, and run step 10 of the setup.

| Beat        | Records as written?   | What to know                                                                                                                                                                                                                                                 | Fallback                                                       |
| ----------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| D1, declare | Yes                   | The dialog has Title, Kind, Date, Start (MYT), End (MYT) and **Save window**, and saving works. Don't tick **Repeat weekly** or open **Import an ICS calendar**: neither is built.                                                                           | None needed.                                                   |
| D2, watch   | Yes                   | All four sources read Fresh, and the overview shows "Sky: 4 inputs reporting". Readings stay fresh for 40 minutes between batches (#783). If one still reads stale, keep the take: the line "if a feed goes quiet, we say No call" is what the screen shows. | None needed.                                                   |
| D3, decide  | Yes                   | The labelled replay. Nothing live is needed.                                                                                                                                                                                                                 | None needed.                                                   |
| D4, approve | Yes, if the sky turns | Declare the window first, then press **Ask for a call** on the overview before 15:30 MYT and open the new bundle; it drafts in under a minute. A clear sky gives "Normal: nothing to send." **On duty now** needs the rota shift from setup step 4.          | The live bundle as it reads, then the replay's worked example. |
| D5, notify  | Partly                | The pilot's calendar feed is live. The email needs a confirmed subscriber (setup step 5) and an approved call that isn't Normal. Don't open the link in the email: the public call page isn't built.                                                         | The notice wording from the replay.                            |
| D6, record  | Yes                   | The ledger and **Check integrity** work. Without an approved call it reads "No entries yet (n=0)" and "Chain intact: 0 checked".                                                                                                                             | Show it as it is, and say so.                                  |

Slide 6 says "The rest is recorded from the live system." If D4 or D5 ends up as replay, change that note on the slide to "Storm, call and notice replay the real JPS gauge record of 2 November. Windows, signals, rota and ledger are recorded from the live system." Don't leave a slide that claims more than the cut shows.

### Before the recording

A teammate sets up production the day before, about 30 minutes. The Recorder signs in by hand; nothing automates the sign-in.

1.  Open Chrome with a clean profile: no bookmarks bar, no extensions, no other tabs. Set the window to 1920×1080 at 100% zoom (Ctrl+0). Turn on Do Not Disturb in the operating system, and close mail and chat apps.
1.  Go to `https://app.skyclause.m1ku.tech/sign-in` and click **Continue with Google**. Use the team's pilot account, not a personal one. The account avatar and email must never be on screen: keep the account menu closed, and mask it in the edit if it shows.
1.  Open `https://app.skyclause.m1ku.tech/skyclause-pilot/bukit-jalil`. The page heading is **Project overview**. Check that **Signal health** lists the four bound sources: the JPS gauge `0232901RF`, MET warnings, the MET forecast for Kuala Lumpur and the DOE station at Cheras (`CA16W`). They were bound on 13 November; a source may read "No reading yet" until its next poll. If the header shows "Projects unavailable", reload: the database wakes from idle.
1.  Set the rota. Go to `/skyclause-pilot/bukit-jalil/settings/rota`, the **Rota** page. Click **Add an approver**, pick yourself under **Person**, pick **Custom times** under **Template** and set 07:30–12:00 MYT, tick Friday under **Days**, click **Add shift**, then **Save rota**. Wait for "Rota saved." **On duty now** must show a person during the recording; the 08:00 takes need this shift, because **Storm afternoons** covers only 14:00–19:15.
1.  Add one subscriber. Go to `/skyclause-pilot/bukit-jalil/subscribers`, the **Subscribers** page. Under **Add or import addresses**, type the team's own test address in **Email addresses, one per line** and click **Send confirmations**. Open that inbox, confirm, and reload until the row reads **Confirmed**. It's the team's address, by its own consent. Mask the address in the edit everywhere it appears.
1.  Keep the window's field values on a card next to the laptop. The 15:30 release wave is real: it's the wave the 2 November story is about, and it runs every teaching weekday. Check the date against the APU timetable before you record.

    | Field           | Value                                                                                 |
    | --------------- | ------------------------------------------------------------------------------------- |
    | **Title**       | `15:30 release wave, LRT Bukit Jalil`                                                 |
    | **Kind**        | **Commute wave**                                                                      |
    | **Date**        | Today, Friday 13 November 2026: recording starts at 08:00 MYT, before the 15:30 wave. |
    | **Start (MYT)** | `15:30`                                                                               |
    | **End (MYT)**   | `15:30` (a commute wave may start and end at the same time)                           |

1.  Don't declare the window yet. D1 declares it on camera.
1.  Have the replay clip ready: the Remotion composition `D3Crossing` (30 seconds, 1920×1080), rendered from `docs/video/src/D3Crossing.tsx`.
1.  Only if **Signals** shows a stale row just before the D2 take: have someone with Cloud Scheduler access pull the newest readings with `gcloud scheduler jobs run ticks-batch --location=asia-southeast1 --project=skyclause`, then wait about a minute.
1.  Run the two-minute check, opening each page once so it's warm: **Windows** shows no error banner; **Signals** lists four rows; **Calls** and **Ledger** load; click **Check integrity** and note the number it reports, for D6.
1.  Leave the browser on **Windows**, `/skyclause-pilot/bukit-jalil/windows`, in the **Timeline** view, with the mouse parked in the middle of the page.

Record each beat as its own take, with two seconds of still screen at each end. Move the mouse slowly and stop it on the thing the Narrator names. Never type an email address, a name or a phone number on camera.

### D1, declare (0:25)

**Page:** Windows, `/skyclause-pilot/bukit-jalil/windows`, headed "Windows".

**Recorder:**

1.  Click **Declare a window**. The dialog "Declare a window" opens on **Enter a window**.
1.  In **Title**, type `15:30 release wave, LRT Bukit Jalil`.
1.  Under **Kind**, choose **Commute wave**.
1.  Leave **Date** on the card's date. Type `15:30` in **Start (MYT)** and `15:30` in **End (MYT)**.
1.  Click **Save window**. The dialog closes with "Window saved.", and the new row appears on the timeline, marked **Added**, with **No call yet** beside it.

> This is Skyclause, running live.
>
> It starts with a window. That's just a slot of time somebody's responsible for. A class. A club night. A commute.
>
> This one's the 15:30 release wave, by LRT Bukit Jalil.
>
> A title, a day, a start, an end. That's all a person ever has to tell us.

**On screen:** punch in to the dialog while the Recorder types, so the four fields fill the frame. Then pull back to the timeline and put a one-second callout on the new row. The viewer must see how little was typed: one line and two times.

The line never says "saved", so it holds in the fallback too. The so-what is the last sentence: the cost of using Skyclause is 30 seconds, once.

### D2, watch (0:30)

**Page:** Signals, `/skyclause-pilot/bukit-jalil/signals`, headed "Signals", with the line "Sky: 3 inputs reporting; oldest … min" under it.

**Recorder:**

1.  Click **Signals** in the project menu. Rest the mouse on the line under the heading for one second.
1.  Move down the table slowly, one row per feed as the Narrator names it: **Rainfall gauge, JPS**, then **Weather warnings, MET**, then **Air pollution index, DOE**.
1.  On "You see this column?", run the mouse down the **Age** column and stop on the gauge's age.
1.  Click the **Rainfall gauge, JPS** row. The panel "Source detail · 0232901RF" opens with the last 24 hours of five-minute readings. Hold for two seconds.

> From there, Skyclause watches that window. Three public feeds.
>
> The rain gauge by the LRT, every five minutes. Storm warnings, every ten. The haze index, every hour.
>
> You see this column? Every reading carries its age.
>
> Here's the thing. If a feed goes quiet, we don't show you an old number. We say "No call".
>
> Because nobody can defend a decision made on stale data.

**On screen:** punch in on the **Age** column and box it for two seconds. If any row's **Health** is not fresh on the day, don't hide it: it proves the line. Don't read any number aloud; they change every five minutes.

The so-what is the last line. An investor hears "we fail safe, in public", which is the risk a campus office is afraid of.

### D3, decide (0:35)

**Page:** none. This is the labelled replay, cut in from the Remotion composition `D3Crossing`. It is the crux of the whole video.

**Recorder:** nothing to record. The editor cuts from the gauge panel in D2 straight to the clip, so the same gauge carries the viewer across.

**Editor:**

1.  Keep the mark **Replay (2 Nov 2026)** on screen, top left, for the whole clip. The clip also names "Monday 2 November 2026 · gauge 0232901RF" itself.
1.  The clip runs 30 seconds and the beat runs 35, with 33 seconds of narration. Hold the last frame before the crossing (14:55, 29.5 mm) for 1 extra second, the flipped verdict (second 20 of the clip) for 2, and the final frame, "25 min before 89 sessions end at 15:30.", for 2.
1.  Land each line on its picture: "14:55" on the bar at 29.5 mm, "39" as the total crosses the Lebat line, "the verdict flips" exactly on the change from **Normal** to **Commute disruption**.
1.  Cut the room tone under "Now look at the clock." Leave one second of silence before "89 sessions".

> But what happens when the sky turns? This next part is a replay. It's the gauge's own record, from Monday the second of November.
>
> 14:55. 29.5 millimetres in the last hour. The clause says Normal.
>
> Five minutes later, 39. That's past Lebat, JPS's own line for heavy rain.
>
> Then, at the 15:05 check, the verdict flips. Commute disruption.
>
> Look at the clock. 89 sessions end at 15:30. That's 25 minutes.
>
> Nobody made a call that day. With Skyclause, one could be on the record before anyone walks out.

**On screen:** the big "25 min" stays up through the last line. Nothing else moves.

Say "could be on the record". No call was made on 2 November, and the clip says nothing else. Say only the numbers the clip draws: 29.5, 39, 15:05, 89, 15:30, 25.

### D4, approve (0:35)

**Page:** Bundle review, `/skyclause-pilot/bukit-jalil/bundles/{id}`, headed "Bundle review". Reach it from **Project overview**, **Recent bundles**: after D1, click **Ask for a call** there, wait for the new row, and click it. Do this before 15:30 MYT; it covers today's open windows only.

This beat needs the sky to give a verdict that isn't Normal while you record: heavy rain at the gauge, a MET warning in force, or unhealthy haze. Nothing here may be staged. If the sky is clear, the bundle reads "Normal: nothing to send." and you use the fallback.

**Recorder:**

1.  Open the bundle. Rest the mouse on the line under the heading, "Input crossing at … · Sky", then on "SLA due …".
1.  Move to the call. Point at its verdict, then at **Fired clauses**, then at the input line that ends "… min old".
1.  On "a second check", point at the summary line "Calls: 1 · disagreements with the clause engine: 0". If the banner "Shadow check: the agent and the clause engine disagree on 1 call" is showing, point at it instead, choose the verdict under "Choose a verdict for …", and carry on.
1.  Point at **Wording**, then at the bar at the bottom: "Sends 1 notice to 1 recipient".
1.  On "and approves", click **Approve 1 call**. Wait for "Approved at …" and "Sent 1 notice to 1 recipient at …". Hold for two seconds.

> Back on the live system. Here's what lands in front of the person on duty.
>
> Gemini has drafted the call. Its reasons are there, and so is the age of every reading.
>
> At the same time, a second check runs. The clause engine works it out on its own, with plain arithmetic. If the two disagree, that shows first.
>
> The AI drafts. It never sends.
>
> One person reads it, and approves. One click. And now the call has an owner.

**On screen:** box the summary line on "a second check". Punch in on the **Approve 1 call** button a beat before the click, and stay on "Approved at …" for the last line. Mask the recipient's address if **Recipients** is open.

The record shows the approver's role, never a name, so the line is "has an owner", not "has a name on it". The so-what is risk: today each lecturer decides alone, and here one accountable person signs off in one click.

### D5, notify (0:25)

**Page:** the test inbox, in a second browser window prepared before the take, showing only the one message. Then the bundle again.

**Recorder:**

1.  Switch to the inbox. The notice is at the top; its subject starts with the verdict, then the window and the date.
1.  Open it. Point at the headline, then at the line that starts "Approved by the approver on duty at …".
1.  Don't click the link after "Details and readings:". The public call page isn't built.
1.  Switch back to the bundle and rest on "Sent 1 notice to 1 recipient at …".

> The moment it's approved, the notice goes out.
>
> An email, in plain words. What the call is, which window, and why.
>
> On top of that, it lands in a calendar feed, so it sits right next to the class it's about. No app to install.
>
> One call, the same words for everyone. The student gets the action. The office keeps the reason.

**On screen:** the email fills the frame, with the sender and recipient addresses masked. Put a small caption under it for the calendar line: "ICS calendar feed · Outlook and Google Calendar". Show a calendar only if the pilot's feed answers on the day; see the risks.

The so-what is the last line. Each lecturer no longer sends a different message, and nobody installs anything.

### D6, record (0:30)

**Page:** Ledger, `/skyclause-pilot/bukit-jalil/ledger`, headed "Ledger", on the **Entries** tab.

**Recorder:**

1.  On the bundle, click **See it in the ledger**. The newest rows are **Notice sent** and **Call approved**.
1.  Run the mouse along the **Call approved** row: **Time (MYT)**, **Decided by**, **To approval**, **To notice**.
1.  On "this check catches it", click **Check integrity**. Wait for "Chain intact: … checked". Hold for three seconds.
1.  Rest the mouse on **Export CSV**. Don't click it.

> Finally, every call ends up here. The ledger.
>
> Who approved it, when, and how long it took.
>
> Each row is sealed to the one before it. So if anybody edits history later, this check catches it.
>
> You see, that's what we're really selling. It's not a weather app.
>
> It's one decision, made in time, that you can still defend six months later.

**On screen:** box **To approval** and **To notice** on the second line. Punch in on "Chain intact: … checked" and hold it through "that's what we're really selling". End on the full ledger, still, for the last line.

_[Cut back to the deck, on slide 7.]_

The last line hands over to slide 7, "Others Show the Weather. Skyclause Makes the Call." Don't mention grades in this beat. Grading against the gauge is built but paused in production, and slide 8 says "n=0 today". If the **Mode and grade** column shows nothing for the grade, leave it alone.

### Guardrails for every take

- Say "notice", "clause", "window" and "call". Never "alert", "rule", "event" or "forecast" for them.
- Never say "predicts", "guarantee", "real-time warning", "AI decides", "real user", or "accurate" without a count.
- Skyclause is not a safety or emergency service. No line may sound like one.
- Anything from 2 November carries the **Replay** mark for as long as it's on screen.
- Don't show the dashboard, the public pages or a grade. They aren't live.
- No personal data: no account menu, no email address, no name in the rota close-up unless that teammate agrees.

### If something isn't live

Each fallback records on today's production build. Each says honestly what it is.

**D1, if Save fails.** Do steps 1 to 4 and stop. Don't click **Save window**: today it answers "Your changes were not saved. Check the fields and try again." Hold on the filled form for two seconds and cut. The page behind the dialog shows "Couldn’t read the windows list.", so punch in on the dialog from the first frame. Add a caption for the whole beat: "Form recorded on production. Saving from the web app ships next." The narration stays word for word; it never says the window was saved. If the dialog won't open at all, record the **Window picker** on the public site, `https://skyclause.m1ku.tech`: set **Window start** and **Window end** to 15:30 and stop. Don't click **Check this window**, which prints "The live verdict is not built yet."

**D2, if Signals fails.** Record **Project overview**, `/skyclause-pilot/bukit-jalil`, and scroll to **Signal health**. The table has the same four columns: **Source**, **Newest value**, **Age**, **Health**. Frame only that table; the panels around it show their own "not built" messages, and none of them is claimed. The narration stays word for word. Skip the last Recorder step, and cut to D3 from the gauge row. If **Signal health** is empty, record the section "Read from public sources" on the public site, and change one line: say "Every reading carries its age." without "You see this column?".

**D3, if the clip isn't rendered.** Screen-record the same replay on the public site: `https://skyclause.m1ku.tech`, **How it works**, stages **Readings**, **Clause**, then **Verdict and call**. Every panel carries its own **Replay** mark and the words "No call was made that day." The narration stays word for word, except "14:55. 29.5 millimetres in the last hour. The clause says Normal.", which that page doesn't draw. Replace it with: "By three o'clock, 39 millimetres had fallen in the hour." Then drop "Five minutes later, 39."

**D4, if there's no bundle to approve.** Record two things. First the **Rota** page, `/skyclause-pilot/bukit-jalil/settings/rota`, resting on **On duty now**: that is live. Then the public site, **How it works**, stage **Approval and notice**, the panel headed "Worked example: no call was made that day" with "Bundle for the Sky pack". Say this instead, 84 words:

"Back on the live system. Here's who's on duty right now. And this is what would have landed in front of them on the second of November. It's the replay's worked example. No call was made that day. Gemini drafts the call, with its reasons and the age of every reading. The clause engine checks it on its own arithmetic. If the two disagree, that shows first. So the AI drafts. It never sends. One person approves. And now the call has an owner."

If a bundle exists but **Approve 1 call** is greyed out under "Window strip could not be read. Retry before approving.", use this same fallback. Don't record a disabled button. If the bundle reads "Normal: nothing to send.", you may show it for two seconds first and open with: "Right now the sky is clear, so the call is Normal, and nothing goes out."

**D5, if no notice was sent.** Record the public site, **The record**, part **The notice**. It shows the notice wording for 2 November under a **Replay** mark, and prints "n=0: this project has no sent call yet". Say this instead, 50 words:

"Once a call's approved, the notice goes out by email. This is the wording the replay produces. What the call is, which window, and why. No notice has gone out from this project yet, and the page says so. It works with a calendar feed too. No app to install."

**D6, if the ledger is short or empty.** Record it as it is. Click **Check integrity** anyway. Replace the first two lines with: "And every call ends up here, in the ledger. It's live, and today it's short. We'd rather show you an honest empty page than a full fake one." Keep the last three lines. For the picture of a full row, cut for three seconds to the public site, **The record**, part **The ledger entry**, which is marked **Replay** and reads "Empty: no call was made that day" on its call row.

### Risks found in the code

- **Windows can't be listed or saved.** `listWindows`, `createWindow`, `updateWindow` and `cancelWindow` have no handler, so the server answers 501: `packages/api/src/routes/index.ts` (no windows entry), listed by `scripts/check-unbuilt.ts` under `b-windows-api`. Issue #139 is open. The page shows the error from `apps/web/features/windows/windows-page.tsx`.
- **The Signals page fails whole.** It reads the sources and `getProjectStrip` together, and the strip has no handler: `apps/web/features/signals/signals-page.tsx` (lines 113 to 116), `packages/contracts/src/api/v1/strip.ts`. Issue #134 is open. `getProjectIndicators` and `getProjectVerdicts` are unbuilt too, so **Mode now** on the overview is empty.
- **Approve is disabled while any read fails.** `blocked` includes `errors.length`, and the strip read always fails today: `apps/web/features/bundles/use-bundle-review.ts` (lines 118 and 236). The call page fails for the same reason: `apps/web/features/calls/call-detail.tsx` (line 227).
- **No web control starts a run.** `createRun` exists in the API but nothing in `apps/web` calls it. A bundle appears only from a schedule, a crossing or a window change.
- **A live approval depends on the weather.** A Normal verdict closes the bundle with nothing to approve ("Normal: nothing to send."). Nothing may be staged to change that.
- **The dashboard isn't built.** `getDashboard` has no handler, and the shell's **Review** link opens the dashboard: `apps/web/features/shell/navigation.ts` (line 102). Reach bundles from **Recent bundles** on the overview.
- **Every public read answers 501.** Checked on 13 November: `https://api.skyclause.m1ku.tech/v1/public/skyclause-pilot/bukit-jalil/ledger` and `/v1/public/status` both return "Not built", owner `d-public-api`. The public ledger, the public call permalink and the landing's live verdict are not live (#187, #189). The link in the notice email leads there.
- **The pilot's calendar feed answers 404.** `https://skyclause.m1ku.tech/p/skyclause-pilot/bukit-jalil/calendar.ics` returned "No public conditions calendar answers here." The feed is built (`packages/api/src/services/ics/index.ts`), but the project isn't public, and the public settings panel is a placeholder: `apps/web/features/settings/project/public/panel.tsx`.
- **Grading is paused in production.** `infra/environments/production/grade-sky.tf` and `grade-crowd.tf` set `paused = true` (#426, open). Don't show or mention a live grade.
- **The pilot project is half set up.** On 12 November #717 recorded the organisation and project as created, with the sources not yet verified. If **Signal health** is empty, D2 has no live picture.
- **Approval may ask for a fresh sign-in.** The bundle page can show "Re-authenticate before approving", or "A Malay-reading approver must review this call." for Malay wording: `apps/web/features/bundles/use-bundle-review.ts`. Rehearse one approval before the take.
- **The ledger shows a role, not a name.** "Approved by the Approver on duty." (`packages/i18n/catalogue/en/calls.json`). Don't promise a name on the record.
- **Nobody has seen these pages signed in.** Every label is from the code. The Recorder follows the screen where it differs.

### Labels used

| Label                                                                                                                                                                                                      | Source file                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Continue with Google                                                                                                                                                                                       | `packages/i18n/catalogue/en/sign-in.json`                                                                                                    |
| Overview, Windows, Signals, Calls, Ledger, Subscribers, Project settings, Review                                                                                                                           | `packages/i18n/catalogue/en/app-shell.json`                                                                                                  |
| Project overview, Signal health, Recent bundles, Mode now, "No sources bound (n=0)"                                                                                                                        | `packages/i18n/catalogue/en/overview.json`                                                                                                   |
| Source, Newest value, Age, Health                                                                                                                                                                          | `packages/i18n/catalogue/en/data.json` (`signal`)                                                                                            |
| "Couldn’t read {source}.", "Not built yet, so there is nothing to show here."                                                                                                                              | `packages/i18n/catalogue/en/data.json` (`source_error`)                                                                                      |
| Packs and sources, Rota                                                                                                                                                                                    | `packages/i18n/catalogue/en/settings.json`                                                                                                   |
| On duty now, Add an approver, Person, Template, Storm afternoons, Custom times, Days, Add shift, Save rota, "Rota saved."                                                                                  | `packages/i18n/catalogue/en/rota.json`                                                                                                       |
| Subscribers, Add or import addresses, "Email addresses, one per line", Send confirmations, Confirmed                                                                                                       | `packages/i18n/catalogue/en/subscribers.json`                                                                                                |
| Windows, Declare a window, Enter a window, Title, Kind, Commute wave, Date, Start (MYT), End (MYT), Save window, "Window saved.", Added, No call yet, Timeline                                             | `packages/i18n/catalogue/en/windows.json`                                                                                                    |
| "the windows list", "Your changes were not saved. Check the fields and try again.", "A commute wave may start and end at the same time."                                                                   | `packages/i18n/catalogue/en/windows.json`                                                                                                    |
| Signals, "Sky: {count} inputs reporting; oldest {age} min", "Rainfall gauge, JPS", "Weather warnings, MET", "Air pollution index, DOE", "Source detail · {source}", "the bound sources"                    | `packages/i18n/catalogue/en/signals.json`                                                                                                    |
| Bundle review, "{trigger} at {time} · {pack}", Input crossing, Sky, "SLA due {time}", Needs review                                                                                                         | `packages/i18n/catalogue/en/bundles.json`                                                                                                    |
| "Calls: {count} · disagreements with the clause engine: {disagreements}", "Shadow check: the agent and the clause engine disagree on 1 call", "Choose a verdict for {name}"                                | `packages/i18n/catalogue/en/bundles.json`                                                                                                    |
| Fired clauses, "{count} min old", Wording, Recipients, "Sends {notices} to {recipients}", Approve 1 call, "Approved at {time}", "Sent {notices} to {recipients} at {time}.", See it in the ledger          | `packages/i18n/catalogue/en/bundles.json`                                                                                                    |
| "Normal: nothing to send. Windows: {count}", "{operation} could not be read. Retry before approving.", Window strip, "Re-authenticate before approving", "A Malay-reading approver must review this call." | `packages/i18n/catalogue/en/bundles.json`                                                                                                    |
| Commute disruption, Normal                                                                                                                                                                                 | `packages/i18n/catalogue/en/bundles.json` (`modes`)                                                                                          |
| "{mode}: {window}, {date}", "Approved by the {role} on duty at {time}. Details and readings: {permalink}"                                                                                                  | `packages/i18n/catalogue/en/notices.json`                                                                                                    |
| "Replay of JPS gauge {station}, {date}. n=0: this project has no sent call yet, …"                                                                                                                         | `packages/i18n/catalogue/en/notices.json` (`replay`)                                                                                         |
| Calls, "No calls yet (n=0). …", "Approved by the Approver on duty."                                                                                                                                        | `packages/i18n/catalogue/en/calls.json`                                                                                                      |
| Ledger, Entries, Check integrity, "Chain intact: {count} checked", Export CSV, Time (MYT), Decided by, Mode and grade, To approval, To notice, Call approved, Notice sent                                  | `packages/i18n/catalogue/en/ledger.json`                                                                                                     |
| Window picker, Window start, Window end, Check this window, "The live verdict is not built yet.", How it works, The record                                                                                 | `packages/i18n/catalogue/en/landing-hero.json`                                                                                               |
| Readings, Clause, Verdict and call, Approval and notice, "Worked example: no call was made that day", "Bundle for the Sky pack", The notice, The ledger entry, "Empty: no call was made that day"          | `apps/web/features/landing/fragments.tsx`, `how-it-works.tsx`, `showcase.tsx` (text confirmed on `https://skyclause.m1ku.tech`, 13 November) |
| "Read from public sources"                                                                                                                                                                                 | `apps/web/features/landing/proof.tsx`                                                                                                        |
| "Monday 2 November 2026 · gauge 0232901RF", Normal, Commute disruption, "25 min", "before 89 sessions end at 15:30."                                                                                       | `docs/video/src/D3Crossing.tsx`                                                                                                              |
| Replay (2 Nov 2026)                                                                                                                                                                                        | `docs/demo/prelim/deck/skyclause-pitch-deck.html` (slide 6)                                                                                  |

## Slide 7, why Skyclause

**Narrator**, 6:36 to 7:50

> Let's be fair to weather apps. Google, MET, AirVisual. They're great at telling you what the sky is doing.
>
> On the second of November, those apps were all there. And 89 classes still let out into the storm. Knowing the weather was never the problem. Deciding what to do about it was.
>
> Today, a lecturer checks the feeds, types the group-chat message, and digs up the evidence later, if anyone asks. With Skyclause, one person reviews one draft and says yes.
>
> Here's what Skyclause does that they don't.
>
> First, it knows your timetable. Not "rain in KL today", but rain at 3:30, when your class lets out.
>
> Second, it puts a person in charge. One call, one yes, and everyone hears the same thing.
>
> Third, it's honest when it's blind. If a reading is late, it says so, instead of showing an old number.
>
> Last, it remembers. Every call is written down and checked against what actually fell, the next morning.
>
> We looked hard. No other app does all five.

On screen: the comparison table. Light each Skyclause tick as its line is spoken: knows your window, a person approves, says "No call" when a feed is stale, written record, graded next day.

Why it works: it concedes what weather apps do well, then moves the fight to deciding, where they have no answer. Each "doesn't" lands on a column of the table.

## Slide 8, impact

**Narrator**, 7:50 to 8:52

> What does that change for a campus?
>
> Time. On the second of November, Skyclause flips the verdict 25 minutes before the wave. Enough for one person to make the call, and for every student to hear it.
>
> Reach. Every weekday evening, from half past four to quarter past seven, up to 174 sessions end by that one station. One call covers them all.
>
> Proof. We ran a month of haze, 5 October to 3 November, back through the same clauses. On 9 of 22 weekdays, Skyclause would have called hybrid classes early.
>
> There's no app to install. Just email, and the calendar students already use. Next, we bring the call into APSpace, beside the timetable students already check.
>
> Looking ahead: in three months, Skyclause is calling the monsoon. In six, a campus can show exactly what it decided, and why.

On screen: the four cards, then the 3- and 6-month band.

Why it works: time, reach and proof, each with a real number, then the promise of a record. Leave a beat of silence after "25 minutes" and after "9 of 22".

## Slide 9, technical architecture

**Narrator**, 8:52 to 9:22

> Under the hood, it runs on Google Cloud.
>
> Cloud Scheduler wakes our source adapters on Cloud Run. Pub/Sub and Cloud Tasks carry every reading, with its age, to the clause engine. Gemini on Vertex AI drafts. A person approves. And the record is sealed in Postgres, with its keys in Cloud KMS.
>
> Behind all of it, more than 4,400 automated tests pass, many of them on real captures of the public feeds.

On screen: the architecture diagram. Point to each zone as it is named: Signals, Google Cloud, Decide, Act. The Edge Devices box is dashed.

## Slide 10, who pays

**Narrator**, 9:22 to 10:12

> Who pays? Never students. Clubs use it free, and every club brings its members onto the calendar.
>
> The money comes from the office that answers for the call. Student affairs. Campus operations. The inbox that fills up when 89 classes walk into a storm.
>
> We're starting at 99 ringgit a month for an office, against about 45 to run it. A whole campus is 990, for up to 25,000 people. About four sen each. And the pilot has to prove the time it saves before anyone pays.
>
> First, one APU office signs a pilot. In three months, we measure the hours saved. In six, it renews. Then the next campus down the line.

On screen: the money flow first, Office Buyer and Campus Buyer into Skyclause, then the roadmap, P0 to GA, as the last paragraph names each step.

Why it works: free users grow it, a named office pays, the unit cost proves the margin, and the roadmap shows the first customer is one walk away.

## Slide 11, the close

**Narrator**, 10:12 to 10:41

> Skyclause. The call for every window. Signals in, one person approves, and every call on the record.
>
> We're looking for one APU office to own that pilot. In three months, we'll measure the staff time saved and how fast the notice lands. In six, it earns its renewal.
>
> Scan to try the prototype, or read the code. Thank you.

_[Hold 3 seconds on the two QR codes.]_

The close repeats slide 1's line, so the last thing heard is the first thing promised.

## Claim guardrails

- **Words of the trade** from the [glossary](/docs/PRODUCT.md#glossary): notice, not alert; clause, not rule; window, not event; call, not forecast.
- **Never say:** "predicts", "guarantee", "real-time warning", "AI decides", "real user", "accurate" without n, or any grade before one exists.
- **Not a safety service:** the close carries "Skyclause is not a safety or emergency service. In an emergency, call 999."
- **Replays are labelled:** the 2 November storm moment in the demo carries `Replay (2 Nov 2026)` on screen for as long as it shows.
- **Times after 15:05 are inferred:** say "could be on the record before the wave", never that a call was made on 2 November. No call was made that day.
- **No personal data:** no email addresses, subscriber names or faces on screen, except the team's own names and portraits on slide 1.

## Claims ledger

| Claim                                                                                                                | Source                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 63.0 mm over (14:00, 16:00] on 2 November at gauge `0232901RF`                                                       | [Skyclause storms](/docs/ideas/02-skyclause.md#storms-the-exit-wave-meets-the-afternoon-cell), our arithmetic on the stored JPS capture                                                                       |
| 89 sessions ended at 15:30 on 2 November                                                                             | [IDEA: haze and storms](/docs/IDEA.md#haze-and-storms-at-the-exit-wave)                                                                                                                                       |
| 77.5 mm over (18:00, 20:00] on 30 October                                                                            | [Skyclause storms](/docs/ideas/02-skyclause.md#storms-the-exit-wave-meets-the-afternoon-cell)                                                                                                                 |
| API over 100 on 20 of 31 days at Cheras `CA16W`, peak 190, 3 Oct–3 Nov                                               | [Skyclause haze](/docs/ideas/02-skyclause.md#haze-a-ministry-instruction-with-no-university-rule)                                                                                                             |
| Schools close above API 180; universities got no threshold                                                           | [Skyclause haze](/docs/ideas/02-skyclause.md#haze-a-ministry-instruction-with-no-university-rule), The Star, 8 October                                                                                        |
| 38,447 exits at LRT Bukit Jalil on 10 January                                                                        | Rapid Rail SP17 exits, as on the deck's slide 3                                                                                                                                                               |
| 29.5 mm in 60 min at 14:55; 39.0 mm at 15:00; verdict flips at the 15:05 poll                                        | [DESIGN: landing copy deck](/docs/DESIGN.md#landing-copy-deck), from the stored JPS 5-minute series                                                                                                           |
| Haze replay: 9 Hybrid recommended, 5 Outdoor-limited, 7 Normal, 1 no data                                            | [IDEA: haze and storms](/docs/IDEA.md#haze-and-storms-at-the-exit-wave)                                                                                                                                       |
| 139–174 sessions end between 16:30 and 19:15 each weekday                                                            | [IDEA: haze and storms](/docs/IDEA.md#haze-and-storms-at-the-exit-wave)                                                                                                                                       |
| LRT Bukit Jalil's fare gates went under at the evening peak on 6 May 2026                                            | [Skyclause storms](/docs/ideas/02-skyclause.md#storms-the-exit-wave-meets-the-afternoon-cell)                                                                                                                 |
| Student-pass renewal needs at least 80% attendance each semester                                                     | [Rules and guarantees: student pass renewal](/docs/research/rules-and-guarantees.md#student-pass-renewal)                                                                                                     |
| Running cost about RM 45 a month per office and RM 490 per campus                                                    | Our estimate on Google Cloud Run, Vertex AI Gemini, Resend and Neon list prices; office: 300 drafts, 5,000 emails, a share of one database; campus: 1,500 drafts, 50,000 emails, half a database compute unit |
| APSpace is APU's student app and carries the timetable students check; showing calls in it is a next step, not built | [APU research: APSpace timetable feed](/docs/research/apu.md#apspace-timetable-feed)                                                                                                                          |
| Live grades: n=0                                                                                                     | Recheck on the recording day                                                                                                                                                                                  |
| More than 4,400 automated tests pass on main                                                                         | `bun run test` on main c250a78, 13 Nov 2026: 4,406 passed, 19 failed, 46 todo                                                                                                                                 |
| Office RM 99 and Campus RM 990 a month                                                                               | [PRODUCT pricing](/docs/PRODUCT.md), #757                                                                                                                                                                     |

## Check before recording

1.  Time a full read at a natural pace. If it runs past 8:30, cut in the order under [Timing](#timing).
1.  Recheck the live grade count and the test count on the recording day, and change slide 8 and slide 9 if they moved.
1.  Rehearse the demo from [Before the recording](#before-the-recording) on production, at 1920×1080 and 100% zoom, with notifications off.
1.  Avoid recording between 22:00 and 22:59 MYT (#686).
1.  Put the capture date in the slate caption, the video title and the YouTube description.
1.  Watch the whole cut once for personal data before upload.
