# Everyday signals on X

What X posts say about everyday life away from the lecture hall, collected to find needs that the campus-focused [social research](/docs/research/social.md) didn't cover: people who live alone and want someone to notice if they stop responding, home internet, water and power cuts, old phones and Raspberry Pis that households actually use, viral 2025–2026 apps that reveal demand (the "Are You Dead?" check-in app, bitchat, Life360), working alone, group assignments, survey respondents, long commutes, and money and scams. It adds APU and Bukit Jalil posts not already in `social.md`, and posts from students who study, intern or live far from campus. The pass ran 97 searches on X on 5 November 2026 (84 topic searches, 7 follow-up searches and 6 reply-thread reads), returning 2,138 posts (2,081 unique); reading them left 299 posts judged relevant, 283 of them in the ten themes below, and 196 of those are cited. Searches were in English, Malay and Chinese. Posters are labelled by role, not name: no handle appears in prose or in the query log, and every post link uses X's handle-free `x.com/i/status/` form. Dates are UTC as X returned them, and engagement figures (likes, reposts, replies, views) are as X returned them on the day. Interpretations are labelled **Inference**.

Contents:

1.  [Method](#method)
    1.  [Access route](#access-route)
    1.  [Query counts](#query-counts)
    1.  [Errors and limits](#errors-and-limits)
    1.  [Query log](#query-log)
1.  [Signals](#signals)
    1.  [Signal ranking](#signal-ranking)
    1.  [Living alone and check-ins](#living-alone-and-check-ins)
    1.  [Home internet, water and power cuts](#home-internet-water-and-power-cuts)
    1.  [Old phones and Raspberry Pis at home](#old-phones-and-raspberry-pis-at-home)
    1.  [Location sharing between students and parents](#location-sharing-between-students-and-parents)
    1.  [Offline mesh messaging during outages](#offline-mesh-messaging-during-outages)
    1.  [Long commutes, cancelled classes and internships away](#long-commutes-cancelled-classes-and-internships-away)
    1.  [Working alone: body doubling and study-with-me](#working-alone-body-doubling-and-study-with-me)
    1.  [Group assignments and survey respondents](#group-assignments-and-survey-respondents)
    1.  [Money, rent and scams](#money-rent-and-scams)
    1.  [APU and Bukit Jalil footprint](#apu-and-bukit-jalil-footprint)
1.  [What people keep using](#what-people-keep-using)
1.  [Unmet needs (Inference)](#unmet-needs-inference)
1.  [Disconfirming signals and gaps](#disconfirming-signals-and-gaps)
1.  [See also](#see-also)

## Method

### Access route

- Searches went to X's own web GraphQL `SearchTimeline` endpoint from this machine, signed in with the user's session cookies from the `X_AUTH_TOKEN` (`auth_token`) and `X_CT0` (`ct0`, also sent as the `x-csrf-token` header) environment variables, the access route described in [Access to X](/docs/research/social.md#access-to-x). The cookies stayed in process memory, went only to X, and were never printed or written to any file.
- The bearer token was the public web-client bearer embedded in X's `main.js`. The `SearchTimeline` query ID had not rotated since 3 November (`3fEctOs2-FvTB7_mvm1hrQ`), and the 42 feature switches the endpoint expects were read from the same bundle.
- The `x-client-transaction-id` header came from the `x-client-transaction-id` Python package (0.0.1), seeded from the logged-in homepage and its `ondemand.s` script.
- Requests were spaced 4–7 seconds apart under a 50-request, 15-minute budget, and the runner also paused when X's `x-rate-limit-remaining` header fell to 3. It paused twice, for 597 and 578 seconds. Every request returned HTTP 200; X raised no lock, challenge or account warning.
- All requests were read-only: no posting, liking, following or messaging.

### Query counts

| Angle                                            | IDs     | Queries | Posts returned |
| ------------------------------------------------ | ------- | ------- | -------------- |
| Viral apps and latent demand                     | v01–v17 | 17      | 401            |
| Old phones, Raspberry Pi, self-built tools       | p01–p17 | 17      | 385            |
| Malaysian life away from campus (English, Malay) | l01–l25 | 25      | 580            |
| Malaysian and student life (Chinese)             | c01–c05 | 5       | 129            |
| APU and Bukit Jalil                              | u01–u12 | 12      | 177            |
| Remote and far-from-campus students              | r01–r08 | 8       | 162            |
| Follow-up searches                               | f01–f07 | 7       | 204            |
| Reply-thread reads (`conversation_id:`)          | k01–k06 | 6       | 100            |
| Total                                            |         | 97      | 2,138          |

- Each query fetched one page of 0–43 posts. Two queries (v04, l01) were set to fetch a second page, but the runner's cursor parser didn't match X's bottom-cursor field, so no second pages were fetched. The 97 queries returned 2,138 posts, 2,081 of them unique; 2,061 of the unique posts are from 2025–2026.
- Reading every result left 299 posts judged relevant: 283 in the 10 themes in [Signal ranking](#signal-ranking) and 16 side observations (student-built tools, viral friend-widget apps, regional cyber and cable news). The rest were noise (see [Errors and limits](#errors-and-limits)).
- 78 queries used the Top tab and 19 the Latest tab. `since:` filters kept most queries to 2025–2026; Malay queries excluded Indonesian slang (`-bgt -banget -gue -gw -nggak -gak -aja -dong -sih`).

### Errors and limits

- Four queries returned nothing: u01 (Bukit Jalil water cuts), r05 (poor mobile coverage in home villages during online classes), r08 (international students studying from home) and k05 (replies to a Malaysian living-alone post); see the [query log](#query-log).
- The Top tab loosens queries. Several Malaysia-keyword searches (v09, l09, l15, r07) came back as general Malaysian posts that didn't contain the other required terms, and "bot" matched "boat" in p07. Those results were discarded, so their counts overstate the relevant volume.
- Name collisions: "APU" matched The Simpsons character, the `$APU` memecoin, AMD accelerated processing units, Azim Premji University, Ritsumeikan APU in Japan, and American Public University and Azusa Pacific University in the US; "吉隆" (from 吉隆坡, Kuala Lumpur) matched Gyirong in Tibet, so c01 is almost all coverage of an August 2026 Tibet–Nepal flood; "bajir" (Indonesian slang) swamped f02. These were discarded.
- X tags Malay as Indonesian, so many Malay-language results were Indonesian posts; they were kept only as labelled regional analogues.
- Search is a sample, not a census: counts show what X surfaces for these queries, not how common a problem is. Malaysian complaint posts are numerous but individually quiet (often 0–5 likes), so engagement understates them; global viral posts overstate how much a typical person cares. Stories in anecdote format are unverified, and viral "your old phone is a free…" posts come from AI-growth influencer accounts whose format farms engagement.

### Query log

Every query in run order, with the X search tab and the number of posts returned. IDs: `v` viral apps, `p` phones, Pi and self-built tools, `l` Malaysian life (English and Malay), `c` Chinese, `u` APU and Bukit Jalil, `r` remote students, `f` follow-ups, `k` reply threads.

| ID  | Language | Tab    | Query                                                                                                                                                                                                                                            | Posts |
| --- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| v01 | English  | Latest | `"Are You Dead" app since:2026-01-01`                                                                                                                                                                                                            | 24    |
| v02 | Chinese  | Top    | `(死了么 OR 死了吗 OR 死了麼 OR 死了嗎) app since:2026-01-01`                                                                                                                                                                                    | 27    |
| v03 | English  | Top    | `(Demumu OR "Are You Dead") ("living alone" OR "live alone" OR "lives alone") since:2026-01-01`                                                                                                                                                  | 20    |
| v04 | English  | Top    | `bitchat (outage OR blackout OR protest OR offline OR mesh OR "no internet") since:2025-07-01`                                                                                                                                                   | 27    |
| v05 | English  | Top    | `("mesh messaging" OR "bluetooth mesh" OR "offline messaging" OR "off-grid messaging") (blackout OR "no internet" OR outage OR flood OR shutdown) since:2025-06-01`                                                                              | 27    |
| v06 | English  | Top    | `(Zenly OR "location sharing" OR "Find My Friends") (friends OR replacement OR miss OR Life360) since:2025-06-01`                                                                                                                                | 27    |
| v07 | English  | Top    | `"body doubling" (app OR focus OR study OR ADHD) since:2025-06-01`                                                                                                                                                                               | 23    |
| v08 | English  | Top    | `(Focusmate OR "study with me" OR "focus app" OR "Forest app") (students OR exams OR study OR finals) since:2025-06-01`                                                                                                                          | 25    |
| v09 | English  | Top    | `("scam call" OR "scam calls" OR "spam calls" OR "scam SMS") (block OR blocker OR app OR Truecaller) Malaysia since:2025-01-01`                                                                                                                  | 25    |
| v10 | English  | Top    | `("viral app" OR "app went viral") ("living alone" OR lonely OR loneliness OR safety OR "check in") since:2026-01-01`                                                                                                                            | 24    |
| v11 | English  | Top    | `("top of the App Store" OR "#1 on the App Store" OR "No. 1 paid app" OR "top paid app") since:2026-03-01`                                                                                                                                       | 27    |
| v12 | English  | Top    | `("live alone" OR "living alone") ("if something happens" OR "no one would know" OR "nobody would know" OR "if I die" OR "if I collapse") since:2025-06-01`                                                                                      | 25    |
| v13 | English  | Top    | `("power outage" OR blackout OR "internet outage") (map OR tracker) (crowdsourced OR "reported by users" OR "user reports") since:2025-06-01`                                                                                                    | 13    |
| v14 | English  | Top    | `(Downdetector OR "Down Detector") (Unifi OR Maxis OR CelcomDigi OR TM OR "TIME Internet") since:2025-06-01`                                                                                                                                     | 1     |
| v15 | English  | Top    | `(Life360 OR "share location" OR "location sharing") (college OR university OR uni) (parents OR safety OR mom) since:2025-06-01`                                                                                                                 | 30    |
| v16 | Malay    | Top    | `("share location" OR "live location" OR "share loc") (kawan OR malam OR balik OR Grab OR mak) -bgt -banget -gue -gw -nggak -gak -aja -dong -sih since:2025-06-01`                                                                               | 29    |
| v17 | English  | Top    | `(Locket OR "widget app" OR "BeReal") (friends OR "long distance" OR "every day") (viral OR "top charts" OR obsessed) since:2025-09-01`                                                                                                          | 27    |
| p01 | English  | Top    | `"old phone" ("security camera" OR webcam OR "baby monitor" OR sensor OR dashboard OR server) since:2025-06-01`                                                                                                                                  | 27    |
| p02 | English  | Top    | `("old android" OR "old iPhone" OR "spare phone") ("Home Assistant" OR server OR camera OR "wall panel" OR dashboard) since:2025-06-01`                                                                                                          | 32    |
| p03 | English  | Top    | `"Raspberry Pi 5" ("my family" OR "my wife" OR housemates OR roommates OR "every day" OR daily OR "my parents") since:2025-01-01`                                                                                                                | 32    |
| p04 | English  | Top    | `"Pi-hole" ("my family" OR "my parents" OR roommates OR housemates OR "whole house" OR years) since:2025-06-01`                                                                                                                                  | 29    |
| p05 | English  | Top    | `"Home Assistant" ("presence detection" OR "presence sensor" OR "who is home" OR "phone location" OR "bluetooth tracker") since:2025-06-01`                                                                                                      | 24    |
| p06 | English  | Top    | `"Home Assistant" ("my wife" OR "my partner" OR "my family" OR "my kids" OR "my parents") ("every day" OR loves OR "actually use" OR "uses it") since:2025-06-01`                                                                                | 10    |
| p07 | English  | Top    | `(Telegram OR WhatsApp OR Discord) bot ("my university" OR "my uni" OR "my college" OR campus OR "students at") (users OR "use it" OR built OR made) since:2025-01-01`                                                                           | 22    |
| p08 | English  | Top    | `("I built" OR "I made" OR "I created") ("for my university" OR "for my uni" OR "for my college" OR "for students at" OR "for my classmates") since:2025-01-01`                                                                                  | 30    |
| p09 | Malay    | Latest | `("bot telegram" OR "telegram bot" OR "bot whatsapp") (pelajar OR universiti OR kampus OR UiTM OR UKM OR UPM OR kelas) -bgt -banget -gue -gw -nggak -gak -aja -dong -sih since:2024-06-01`                                                       | 2     |
| p10 | English  | Latest | `("Raspberry Pi" OR "Pi 5" OR "home server" OR homelab) (Malaysia OR "Kuala Lumpur" OR Selangor OR Unifi) since:2025-01-01`                                                                                                                      | 24    |
| p11 | English  | Top    | `("Raspberry Pi" OR "Pi 5" OR homelab) ("power outage" OR "power cut" OR "internet down" OR "ISP down" OR "outage log" OR uptime) (monitor OR alert OR log OR notify) since:2025-06-01`                                                          | 24    |
| p12 | English  | Top    | `("self-hosted" OR selfhosted) ("my family uses" OR "family uses it" OR "roommates use" OR "wife uses" OR "my parents use") since:2025-01-01`                                                                                                    | 2     |
| p13 | English  | Top    | `(laundry OR "washing machine" OR dryer) ("Home Assistant" OR "Raspberry Pi" OR ESP32 OR vibration OR accelerometer) (done OR notify OR notification OR alert) since:2025-01-01`                                                                 | 33    |
| p14 | English  | Top    | `(Tasker OR MacroDroid OR "Apple Shortcuts" OR "iOS Shortcuts") (automation OR routine) ("every day" OR "life changing" OR "can't live without" OR "game changer" OR "use daily") since:2025-06-01`                                              | 19    |
| p15 | English  | Top    | `("Raspberry Pi" OR "Pi 5") (Gemini OR LLM OR "local AI" OR agent OR Ollama) ("my house" OR "at home" OR family OR "my room") since:2025-06-01`                                                                                                  | 28    |
| p16 | English  | Top    | `("I built" OR "side project" OR "I made") (students OR "thousands of students") ("my university" OR campus OR "my uni") ("users" OR "daily active" OR signups) since:2025-01-01`                                                                | 21    |
| p17 | English  | Top    | `("old phone" OR "old smartphone" OR "spare phone" OR "old android") ("Raspberry Pi" OR sensor OR "weather station" OR "air quality" OR noise OR motion) (repurpose OR repurposed OR turned) since:2025-01-01`                                   | 26    |
| l01 | Malay    | Top    | `("gangguan bekalan air" OR "air terputus" OR "takde air" OR "tiada bekalan air") -bgt -banget -gue -gw -nggak -gak -aja -dong -sih since:2026-06-01`                                                                                            | 27    |
| l02 | Malay    | Top    | `"Air Selangor" (gangguan OR "tiada air" OR lori OR tangki OR update OR jadual) since:2026-06-01`                                                                                                                                                | 5     |
| l03 | Malay    | Top    | `("bekalan elektrik terputus" OR "elektrik putus" OR "blackout" OR "black out") (TNB OR rumah OR kawasan OR taman) -bgt -banget -gue -gw -nggak -gak -aja -dong -sih since:2026-06-01`                                                           | 28    |
| l04 | Malay    | Top    | `(Unifi OR "TM Unifi") (down OR "tak boleh" OR putus OR lembab OR gangguan OR "takde internet") -bgt -banget -gue -gw -nggak -gak -aja -dong -sih since:2026-06-01`                                                                              | 25    |
| l05 | English  | Top    | `(Maxis OR "Maxis fibre" OR "TIME Internet" OR "TIME fibre" OR CelcomDigi OR Unifi) ("no internet" OR down OR outage OR "since morning" OR "whole day") since:2026-06-01`                                                                        | 34    |
| l06 | Malay    | Top    | `(deposit OR "duit deposit") ("tuan rumah" OR landlord OR "owner rumah" OR agent) ("tak pulang" OR "tak bagi" OR potong OR "never returned" OR "tak return") -bgt -banget -gue -gw -nggak -gak -aja -dong -sih since:2025-06-01`                 | 12    |
| l07 | Malay    | Top    | `(housemate OR housemates OR "rumah sewa") ("bil elektrik" OR "bil air" OR "split bill" OR "bayar bil" OR "bil wifi") -bgt -banget -gue -gw -nggak -gak -aja -dong -sih since:2025-06-01`                                                        | 8     |
| l08 | Malay    | Top    | `("duduk sorang" OR "tinggal sorang" OR "hidup sorang" OR "duduk seorang") (rumah OR KL OR sakit OR takut OR sunyi) -bgt -banget -gue -gw -nggak -gak -aja -dong -sih since:2025-06-01`                                                          | 33    |
| l09 | English  | Top    | `("international student" OR "international students") Malaysia (lonely OR loneliness OR homesick OR alone OR safety OR unsafe OR scam) since:2025-01-01`                                                                                        | 29    |
| l10 | Malay    | Top    | `(scam OR scammer OR penipuan OR tertipu) (pelajar OR student OR students OR "budak uni") (Malaysia OR "part time" OR macau OR PTPTN) -bgt -banget -gue -gw -nggak -gak -aja -dong -sih since:2025-06-01`                                        | 36    |
| l11 | Malay    | Top    | `(denggi OR dengue OR aedes) (rumah OR kawasan OR taman OR nyamuk OR hospital) -bgt -banget -gue -gw -nggak -gak -aja -dong -sih since:2026-06-01`                                                                                               | 22    |
| l12 | Malay    | Top    | `(panas OR bahang) (bilik OR rumah OR tidur) ("tak boleh tidur" OR "tak dapat tidur" OR "can't sleep") -bgt -banget -gue -gw -nggak -gak -aja -dong -sih since:2026-03-01`                                                                       | 2     |
| l13 | Malay    | Top    | `("part time" OR partime OR "kerja part time") (pelajar OR student OR uni OR "budak U") (gaji OR lambat OR shift OR boss OR penat) -bgt -banget -gue -gw -nggak -gak -aja -dong -sih since:2025-06-01`                                           | 35    |
| l14 | Malay    | Top    | `"latihan industri" (elaun OR "tak dibayar" OR jauh OR "rumah sewa" OR susah OR company OR tolak) since:2025-06-01`                                                                                                                              | 13    |
| l15 | English  | Top    | `(internship OR intern OR interns) Malaysia (allowance OR unpaid OR "RM500" OR "RM800" OR "far from" OR rent) since:2025-06-01`                                                                                                                  | 29    |
| l16 | Malay    | Top    | `("kelas online" OR "online class" OR "exam online" OR "online exam" OR "quiz online") (internet OR line OR wifi OR putus OR lag OR "line teruk") -bgt -banget -gue -gw -nggak -gak -aja -dong -sih since:2025-06-01`                            | 28    |
| l17 | English  | Top    | `("group assignment" OR "group project" OR "kerja berkumpulan" OR "assignment group") (freeloader OR freeloaders OR "free rider" OR "tak buat kerja" OR "did nothing" OR ghosting OR ghosted) since:2025-06-01`                                  | 33    |
| l18 | Malay    | Top    | `("isi survey" OR "fill my survey" OR "fill up my survey" OR respondents OR responden OR "borang soal selidik") (FYP OR "final year" OR tesis OR thesis OR PSM) since:2025-06-01`                                                                | 20    |
| l19 | English  | Top    | `("water cut" OR "no water" OR "water disruption" OR "water supply") (Selangor OR KL OR "Kuala Lumpur" OR "Air Selangor") since:2025-06-01`                                                                                                      | 28    |
| l20 | English  | Top    | `("power cut" OR blackout OR "no electricity" OR "power outage") (KL OR Selangor OR "Kuala Lumpur" OR Malaysia OR TNB) since:2026-01-01`                                                                                                         | 30    |
| l21 | Malay    | Top    | `(tidur OR sleep) (assignment OR exam OR pelajar OR student OR "budak U") ("tak cukup tidur" OR "all nighter" OR "pukul 4 pagi" OR "pukul 3 pagi" OR insomnia) -bgt -banget -gue -gw -nggak -gak -aja -dong -sih since:2026-01-01`               | 24    |
| l22 | English  | Top    | `(rent OR sewa OR room OR bilik) (KL OR "Kuala Lumpur" OR Selangor) (student OR students OR pelajar) (expensive OR mahal OR naik OR scam OR "fake listing") since:2025-06-01`                                                                    | 19    |
| l23 | Malay    | Top    | `("lori air" OR "tangki air" OR "water tanker" OR "tadah air") since:2026-01-01`                                                                                                                                                                 | 28    |
| l24 | Malay    | Top    | `("bil elektrik" OR "bil TNB") (naik OR mahal OR tinggi OR terkejut OR "rumah sewa") -bgt -banget -gue -gw -nggak -gak -aja -dong -sih since:2026-01-01`                                                                                         | 23    |
| l25 | English  | Top    | `(Malaysia OR Malaysian) (student OR students) ("living alone" OR "live alone" OR "first time living" OR "moved out") since:2025-06-01`                                                                                                          | 9     |
| c01 | Chinese  | Top    | `(大马 OR 马来西亚 OR 雪兰莪 OR 吉隆坡) (停水 OR 断水 OR 制水) since:2025-06-01`                                                                                                                                                                 | 31    |
| c02 | Chinese  | Top    | `(马来西亚 OR 大马 OR 吉隆坡) (留学生 OR 留学 OR 读书) (孤独 OR 安全 OR 诈骗 OR 租房 OR 押金) since:2025-01-01`                                                                                                                                  | 25    |
| c03 | Chinese  | Top    | `(一个人住 OR 独居 OR 独居者) (签到 OR 报平安 OR 安全 OR app) since:2026-01-01`                                                                                                                                                                  | 24    |
| c04 | Chinese  | Top    | `(大马 OR 马来西亚 OR 吉隆坡) (停电 OR 断网 OR 没网 OR Unifi OR 网络) since:2025-06-01`                                                                                                                                                          | 24    |
| c05 | Chinese  | Top    | `(小组作业 OR 小组报告 OR group) (划水 OR 不做事 OR 躺平 OR 摆烂) (大学 OR 同学 OR 组员) since:2025-06-01`                                                                                                                                       | 25    |
| u01 | Malay    | Latest | `"Bukit Jalil" ("takde air" OR "air takde" OR "gangguan bekalan air" OR "water cut" OR "no water" OR "air putus") since:2024-01-01`                                                                                                              | 0     |
| u02 | Malay    | Latest | `"Bukit Jalil" (blackout OR "power cut" OR elektrik OR TNB OR "black out") since:2024-01-01`                                                                                                                                                     | 20    |
| u03 | English  | Latest | `"Bukit Jalil" (condo OR rent OR sewa OR room OR bilik OR housemate) (student OR students OR pelajar OR APU) since:2024-01-01`                                                                                                                   | 1     |
| u04 | English  | Latest | `(APU OR APIIT OR "Asia Pacific University") (internship OR intern OR "latihan industri" OR placement) Malaysia -AMD -Ryzen -GPU since:2024-01-01`                                                                                               | 1     |
| u05 | English  | Latest | `(APU OR APIIT) (FYP OR "final year project" OR survey OR respondents) -AMD -Ryzen -GPU -Xbox since:2024-01-01`                                                                                                                                  | 21    |
| u06 | English  | Latest | `(APU OR APIIT) (online OR remote OR "from home" OR hybrid) (class OR classes OR exam OR lecture OR lecturer) -AMD -Ryzen -GPU -Xbox -PS5 -Nvidia since:2024-01-01`                                                                              | 18    |
| u07 | English  | Latest | `("Asia Pacific University" OR "APU Malaysia" OR APIIT) (hackathon OR club OR society OR GDG OR "student council") since:2025-01-01`                                                                                                             | 20    |
| u08 | English  | Latest | `"Bukit Jalil" (scam OR stolen OR curi OR snatch OR robbery OR rompak OR pecah) since:2025-01-01`                                                                                                                                                | 21    |
| u09 | English  | Latest | `"Bukit Jalil" (Unifi OR Maxis OR wifi OR internet OR "TIME fibre" OR coverage) since:2024-01-01`                                                                                                                                                | 13    |
| u10 | English  | Latest | `(APU OR APIIT) (housemate OR roommate OR "living alone" OR lonely OR homesick OR condo) -AMD -Ryzen -GPU -Xbox since:2024-01-01`                                                                                                                | 22    |
| u11 | English  | Latest | `("studying at APU" OR "study at APU" OR "graduated from APU" OR "APU graduate" OR "APU alumni" OR "APU alum" OR "student at APU" OR "studying in APU")`                                                                                         | 20    |
| u12 | Malay    | Latest | `"Bukit Jalil" (denggi OR dengue OR nyamuk OR aedes OR jerebu OR panas) since:2025-01-01`                                                                                                                                                        | 20    |
| r01 | English  | Top    | `("studying remotely" OR "remote student" OR "online degree" OR "distance learning") ("time zone" OR timezone OR lonely OR isolation OR "miss out" OR "group project") since:2025-06-01`                                                         | 26    |
| r02 | English  | Top    | `("far from campus" OR "live far from" OR "2 hour commute" OR "two hour commute" OR "hour commute") (uni OR university OR class OR lecture) since:2025-06-01`                                                                                    | 31    |
| r03 | English  | Top    | `(internship OR intern) ("another state" OR "far from home" OR "new city" OR "moved for") (lonely OR alone OR rent OR housing OR "no friends") since:2025-06-01`                                                                                 | 24    |
| r04 | Malay    | Top    | `("rumah jauh" OR "jauh dari kampus" OR "duduk jauh" OR "ulang alik") (kelas OR kuliah OR pensyarah OR uni OR kampus) -bgt -banget -gue -gw -nggak -gak -aja -dong -sih since:2025-06-01`                                                        | 28    |
| r05 | Malay    | Top    | `(kampung OR "balik kampung") ("line teruk" OR "takde line" OR "line slow" OR "takde coverage" OR "line lembab") (kelas OR online OR exam OR assignment OR kerja OR meeting) -bgt -banget -gue -gw -nggak -gak -aja -dong -sih since:2025-06-01` | 0     |
| r06 | English  | Top    | `("group project" OR "group assignment" OR teammates) ("time zone" OR "time zones" OR timezone OR "different countries") (students OR uni OR class) since:2025-06-01`                                                                            | 23    |
| r07 | English  | Top    | `("work from home" OR WFH OR "online class") ("power cut" OR blackout OR "internet down" OR "water cut" OR "no internet") Malaysia since:2025-06-01`                                                                                             | 30    |
| r08 | English  | Top    | `("international student" OR "international students") ("back home" OR "home country" OR "flew home") (online OR remote OR "time difference" OR "sem break") (Malaysia OR uni) since:2025-06-01`                                                 | 0     |
| k01 | English  | Latest | `conversation_id:2011146779958386708`                                                                                                                                                                                                            | 9     |
| k02 | English  | Latest | `conversation_id:2100772921828409741`                                                                                                                                                                                                            | 17    |
| k03 | English  | Top    | `conversation_id:2101226053263839239`                                                                                                                                                                                                            | 28    |
| k04 | English  | Latest | `conversation_id:2059351770501972330`                                                                                                                                                                                                            | 20    |
| f01 | Malay    | Top    | `("mak duduk sorang" OR "ayah duduk sorang" OR "mak tinggal sorang" OR "parents live alone" OR "mak sorang kat kampung" OR "ibu tinggal sendirian") -bgt -banget -gue -gw -nggak -gak -aja -dong -sih since:2025-01-01`                          | 39    |
| f02 | Malay    | Top    | `banjir ("takde line" OR "no signal" OR "line putus" OR "takde coverage" OR "tiada liputan" OR "takde signal") -bgt -banget -gue -gw -nggak -gak -aja -dong -sih since:2025-06-01`                                                               | 43    |
| f03 | English  | Top    | `("check-in app" OR "check in app" OR "wellness check" OR "dead man's switch") ("live alone" OR "living alone" OR elderly OR parents OR solo) -crypto since:2026-01-01`                                                                          | 33    |
| f04 | English  | Top    | `("my mom lives alone" OR "my dad lives alone" OR "my mother lives alone" OR "my father lives alone" OR "parents live alone") (worry OR app OR call OR check) since:2025-06-01`                                                                  | 18    |
| k05 | Malay    | Latest | `conversation_id:1982270486408044846`                                                                                                                                                                                                            | 0     |
| f05 | Malay    | Top    | `("korang je ke" OR "korang punya" OR "is it just me" OR "aku sorang ke" OR "ada yang sama") (unifi OR wifi OR internet OR line OR maxis) -bgt -banget -gue -gw -nggak -gak -aja -dong -sih since:2026-01-01`                                    | 20    |
| f06 | Malay    | Top    | `(Maxis OR CelcomDigi OR "U Mobile" OR Unifi) ("no signal" OR "takde line" OR "line hilang" OR "takde signal" OR "no service") -bgt -banget -gue -gw -nggak -gak -aja -dong -sih since:2026-06-01`                                               | 18    |
| f07 | English  | Top    | `bitchat (Malaysia OR Malaysian OR banjir OR Indonesia OR Batam OR Nepal) since:2025-07-01`                                                                                                                                                      | 33    |
| k06 | English  | Top    | `conversation_id:1931937088955351270`                                                                                                                                                                                                            | 26    |

## Signals

### Signal ranking

Themes are ranked by judgement on two things together: how often relevant posts came up (posts and the number of queries that surfaced them) and how strongly people reacted (engagement and first-person urgency). Volume alone would put home outages first; the check-in theme ranks above it because it pairs high recurrence with the pass's highest engagement and a direct Malaysian ask. "Relevant posts" counts posts kept in the session notes for that theme, not only those cited.

| Rank | Theme                                                                                                          | Relevant posts | Queries | Peak engagement                                        | Malaysian or APU evidence                            |
| ---- | -------------------------------------------------------------------------------------------------------------- | -------------- | ------- | ------------------------------------------------------ | ---------------------------------------------------- |
| 1    | [Living alone and check-ins](#living-alone-and-check-ins)                                                      | 52             | 12      | 60,989 likes, 1.86M views (launch news)                | A direct ask for an automatic alert, plus four posts |
| 2    | [Home internet, water and power cuts](#home-internet-water-and-power-cuts)                                     | 69             | 13      | 2,108 likes (Unifi); 10,440 likes (Batam, regional)    | Strongest: most posts are Malaysian households       |
| 3    | [Old phones and Raspberry Pis at home](#old-phones-and-raspberry-pis-at-home)                                  | 46             | 13      | 5,976 likes; 5,649 likes and 870k views (first-person) | One post                                             |
| 4    | [Location sharing between students and parents](#location-sharing-between-students-and-parents)                | 19             | 4       | 25,521 likes (against parental tracking)               | Four posts, on late-night rides and trips home       |
| 5    | [Offline mesh messaging during outages](#offline-mesh-messaging-during-outages)                                | 21             | 3       | 26,478 likes, 5.48M views                              | None; Indonesia is the nearest                       |
| 6    | [Long commutes, cancelled classes and internships away](#long-commutes-cancelled-classes-and-internships-away) | 16             | 6       | 33,052 likes (meme)                                    | Internship allowance debate (574 likes, 554k views)  |
| 7    | [Working alone: body doubling and study-with-me](#working-alone-body-doubling-and-study-with-me)               | 9              | 2       | 16,195 likes, 1.3M views                               | None                                                 |
| 8    | [Group assignments and survey respondents](#group-assignments-and-survey-respondents)                          | 15             | 3       | 1,860 likes                                            | FYP survey pleas; "free rider" as the local term     |
| 9    | [Money, rent and scams](#money-rent-and-scams)                                                                 | 19             | 9       | 1,535 likes                                            | Most posts, but scattered                            |
| 10   | [APU and Bukit Jalil footprint](#apu-and-bukit-jalil-footprint)                                                | 17             | 8       | 478 likes (outage restoration list)                    | All; mostly official and club news                   |

### Living alone and check-ins

The strongest signal in the pass: people who live alone fear that if something happened to them, nobody would notice for days, and they paid for, cloned and rebuilt a one-button app that tells someone when they go quiet. A Malaysian living alone asked X for exactly this kind of automation, but no Malaysian product or community answer showed up.

- **Who:** young urban adults living alone (the original app's founder said most buyers were women over 25), adult children whose parents live alone far away, students moving out for university, and indie developers who built their own versions.
- **Recurrence:** 52 relevant posts across 12 queries in English, Malay and Chinese, from January 2025 to November 2026, most of them in 2026.
- **Intensity:** the top news post about the app, on an influencer-news account, drew 60,989 likes and 1.86M views; the top "living alone… no one would know" post drew 529 likes and 44.0k views; an Indian founder's story about a father living alone drew 23,020 likes and 2.2M views.
- **Workarounds:** a paid daily tap (Sileme, renamed Demumu, then "Are You There"), relatives and grandmothers calling repeatedly, employers or colleagues noticing absence, neighbours noticing untouched mail, and remote access to a parent's home camera.

**Malaysia:**

- A Malaysian X user who lives alone asked (Malay): "living alone, if I die, is there any trigger to tell people I've died? Like, is there any automation prompt to notify family members or friends so they know you died alone at home?" (26 Oct 2025; 14 likes, 13 replies, 3,568 views) ([my-trigger-ask]). The reply thread couldn't be retrieved (k05 returned nothing).
- A working Malaysian adult living alone wrote (Malay) that as a teenager they boasted they could live alone, "but since working and living alone I think, what if I get sick, who will look after me? If I die in the house, people will only find a carcass" (5 Sep 2025; 15 likes, 1,186 views) ([my-sick-alone]).
- A Johor poster whose sibling had applied for university through UPU wrote (Malay) that they'd now be living alone at home, with "nobody to listen to my stories, nobody to eat with" (26 Feb 2026; 89 likes, 10,147 views) ([my-sibling-upu]).
- Living alone is also expensive: "just living alone, RM2.5k a month isn't enough", with condo rent at RM1.1k before electricity (Malay; 17 Sep 2025; 3 likes, 748 views) ([my-alone-cost]).

**Global analogues:**

- The app: "An app named 'Are You Dead?' has topped the app store in China. It's designed for young people living alone and requires users to check in every 2 days to confirm they are alive" (13 Jan 2026; 60,989 likes, 1,584 reposts, 365 replies, 1,857,846 views) ([sileme-dexerto]). A New York Times China reporter who interviewed a developer reported it was #1 on Apple's paid chart in China, had inquiries from over 60 investors, had been renamed Demumu, and that the team wanted to "add AI to it" (13 Jan 2026; 842 likes, 147 reposts, 154,180 views) ([sileme-nyt]).
- How it works and who bought it, from a long post on the app: one green "check in today" button, no account, one contact's email; after two missed days, the app emails the contact on the third. "At that speed, it's probably a death notice, not an emergency warning," one user noted, yet people bought it after the price rose from one yuan to eight. A founder said seven or eight in ten buyers were women older than 25 living alone, and the idea partly came from female friends in Shenzhen followed home late at night (2 Nov 2026; 224 likes, 6,719 views) ([sileme-explainer]).
- Chinese-language posts put the team at three developers born after 1995, the build cost at about 1,000 yuan, and downloads up 100-fold (12 Jan 2026; 34 likes, 64 replies, 29,831 views) ([sileme-cost]); a Chinese tech company chief executive said it was built with AI and that a rival "活着么" ("Still Alive?") clone went from empty folder to launch in six hours (13 Jan 2026; 116 likes, 34,641 views) ([sileme-clone]). A Chinese writer tied it to China's more than 125 million single-person households (11 Jan 2026; 1,212 likes, 393,340 views) ([sileme-households]).
- Where it went: an account presenting itself as Demumu claimed "3M+ users in 20+ countries" (2 Feb 2026; vendor claim) ([demumu-claim]); a Chinese state newspaper said it became an eldercare platform, "Zaime Zaime" ("Are you there"), rolled out in a Hangzhou district (24 May 2026; 10 likes, 2,627 views) ([sileme-eldercare]); a Shanghai financial outlet said the renamed "Are You There" was raising CNY6 million for 3% and charges CNY99–199 a year (23 Oct 2026; 5 likes, 794 views) ([sileme-raise]); a Chinese-language poster said it had entered government procurement (1 Nov 2026; 4 likes, 978 views) ([sileme-procurement]). An overseas broadcaster critical of Beijing said it was ordered off the store soon after going viral (2 May 2026; 8 likes, 2,000 views) ([sileme-removed]); that claim wasn't independently confirmed.
- The fear, in people's own words: "Living alone is a trip cause you can die and no one would know" (18 Sep 2026; 529 likes, 82 reposts, 39 replies, 43,973 views) ([alone-trip]); its replies answered with "if i don't come to work 2 days in a row my job know im dead" and "it's always interesting finding out how long it was before the wellness check" (18 Sep 2026; 4 likes and 10 likes) ([alone-work], [alone-wellness]). A skincare reviewer: "Please check in with your friends that live alone… we fear that if we died in our house, no one would know for days" (16 Aug 2026; 53 likes, 1,537 views) ([alone-check-friends]). A BBC China correspondent quoted a user: "I worry that if something happened to me, I could die alone in the place I rent and no-one would know" (12 Jan 2026; 8 likes, 3,430 views) ([alone-bbc]).
- Parents living alone far from their children: an Indian AI founder described a 3 AM call from a friend in the US asking him to check on his 84-year-old father living alone in Jaipur (3 Aug 2025; 23,020 likes, 3,297 reposts, 2,434 replies, 2,218,608 views) ([parent-jaipur]). An anecdote post about a 50-year-old mother found on the floor after three days because "my phone was on the table, I couldn't reach it" drew 8,479 likes and 893,523 views (24 May 2026; anecdote, unverified) ([parent-floor]). A US letter carriers' union credited a carrier who noticed untouched mail and called a wellness check (4 May 2026; 24 likes, 947 views) ([parent-mail]).
- People built their own: an indie iPhone developer shipped QuietOK, which "checks in automatically using your phone's step activity… You don't tap anything, and it doesn't track your location," but "almost nobody knows it exists" (7 Oct 2026; 5 likes, 158 views) ([quietok]) and later said they were "still struggling to reach actual app users" (10 Oct 2026; 4 likes, 186 views) ([quietok-users]); a developer built CheckIn because "my mom lives alone. I just wanted to know she was okay without calling every day" (22 Aug 2026; 2 likes, 55 views) ([checkin-mom]); a consultant built a check-in app for "elderly, solo-travellers, dating strangers" (17 May 2026; 5 likes, 1,595 views) ([checkin-consultant]); an open-source developer reported a solo developer's self-hosted dead man's switch, whose README opens "It is a notification tool, not a guarantee" (20 Oct 2026; 3 likes, 104 views) ([deadman-switch]).
- Doubts: "99% of the time the emergency contacts will be bc people forget to respond, which will cause unnecessary panic" (14 Jan 2026; 12 likes, 1,813 views) ([checkin-false-alarm]); "How do you even add AI to this lmao" (14 Jan 2026; 12 likes, 1,756 views) ([checkin-ai-doubt]).

**Inference:** the demand is for being noticed, not for rescue, and it is broad (young renters, students, parents far away). The two complaints about the paid app, a daily tap people forget and a two-to-three-day delay, are the gaps the self-built passive versions target, but none of those has found users yet.

[my-trigger-ask]: https://x.com/i/status/1982270486408044846
[my-sick-alone]: https://x.com/i/status/1963971874343497792
[my-sibling-upu]: https://x.com/i/status/2027098283416715586
[my-alone-cost]: https://x.com/i/status/1968201888412864780
[sileme-dexerto]: https://x.com/i/status/2010879731403571571
[sileme-nyt]: https://x.com/i/status/2011146779958386708
[sileme-explainer]: https://x.com/i/status/2117270519313756351
[sileme-cost]: https://x.com/i/status/2010573506967224479
[sileme-clone]: https://x.com/i/status/2010987327838175650
[sileme-households]: https://x.com/i/status/2010310221646979300
[demumu-claim]: https://x.com/i/status/2018232185220632981
[sileme-eldercare]: https://x.com/i/status/2058544999206449166
[sileme-raise]: https://x.com/i/status/2113516810372886977
[sileme-procurement]: https://x.com/i/status/2116863474420830215
[sileme-removed]: https://x.com/i/status/2050596921324994589
[alone-trip]: https://x.com/i/status/2100772921828409741
[alone-work]: https://x.com/i/status/2100777311897362656
[alone-wellness]: https://x.com/i/status/2100774693884043286
[alone-check-friends]: https://x.com/i/status/2088977345013051553
[alone-bbc]: https://x.com/i/status/2010660555930173727
[parent-jaipur]: https://x.com/i/status/1951889200271282428
[parent-floor]: https://x.com/i/status/2058616311920685219
[parent-mail]: https://x.com/i/status/2051381639113314642
[quietok]: https://x.com/i/status/2107825313983996158
[quietok-users]: https://x.com/i/status/2108937096463327242
[checkin-mom]: https://x.com/i/status/2090960674608578792
[checkin-consultant]: https://x.com/i/status/2056145268861448579
[deadman-switch]: https://x.com/i/status/2112444562031665197
[checkin-false-alarm]: https://x.com/i/status/2011351020845351402
[checkin-ai-doubt]: https://x.com/i/status/2011286945947959766

### Home internet, water and power cuts

The most Malaysian theme in the pass. Home internet, water and electricity fail often, people learn about it from their own taps and router lights rather than from the provider, and official status channels lag or break. Individual posts are quiet, but they come from many households across states.

- **Who:** Malaysian tenants and homeowners, people working or studying from home, Unifi, Maxis and CelcomDigi customers, Air Selangor and TNB customers.
- **Recurrence:** 69 relevant posts across 13 queries, most of them Malaysian, from June 2025 to 4 November 2026.
- **Intensity:** mostly 0–25 likes per complaint; the high-engagement posts are political or regional (651 likes on a water-cut jab between states; 2,108 likes on a Unifi termination complaint; 10,440 likes on the October 2026 Batam blackout next door).
- **Workarounds:** tagging Unifi's, Air Selangor's and MCMC's official accounts on X, calling hotlines (one customer called 100 nine times), asking X whether "it's just my house", community-news accounts asking "are you one of them?", and shifting appliance use to off-peak hours.

**Home internet (Malaysia):**

- "My internet's down. The auth light is completely gone. Trying to talk to customer care fails" (Malay; 4 Nov 2026; 1 reply, 277 views) ([unifi-auth-light]). The same morning, a customer reported an area disruption to MCMC and Unifi ([unifi-mcmc]), TM's support account replied by pointing to its outage-status web page ([tm-status-reply]), and a Malaysian community-news account posted "Unifi is reportedly down for some users. Are you one of them?" (4 Nov 2026; 488 views) ([unifi-community]).
- Multi-day outages: "Unifi down almost 2 days" (22 Jun 2026; 2 likes, 2 replies, 788 views) ([unifi-2days]); "wifi has been down since thurs night. your last update claimed maintenance was completed on 30 Oct, but i STILL have no connection (LOS red blinking)… your website to check the outage doesn't seem to work properly… almost 4 days" (1 Nov 2026; 2 replies, 121 views) ([unifi-4days], [unifi-status-broken]); "it's been around a week that the wifi has no internet connection" (4 Jun 2026; 556 views) ([unifi-week]); "day 13 broken since last month, called 100 nine times… wanted to report to MCMC, the website doesn't work either" (Malay; 1 Jun 2026; 5 likes, 803 views) ([unifi-13days]).
- Not noticing: a Malaysian VTuber in bed with a fever for two days "didn't realise no WiFi at home until my father said Unifi sent WhatsApp they detected no internet at home" (22 Oct 2026; 3 likes, 228 views) ([unifi-whatsapp]).
- Mobile lines too: a Malaysian tech-news account asked "Were you affected?" after a nationwide U Mobile 4G and 5G outage from 1 AM (22 Jul 2026; 6 likes, 3 replies, 7,639 views) ([umobile-outage]); a U Mobile user found their SIM stuck on Maxis's network with no calls, data or SMS (22 Jul 2026; 2 likes, 338 views) ([umobile-maxis]); CelcomDigi customers reported two hours of no service, one tagging MCMC (1 Jul 2026; 5 likes, 480 views) ([celcomdigi-2h]).
- Cables, rain and repeats: "Unifi says the cable outside isn't its responsibility, but I'm not the one who damaged it… I have to find an outside contractor" (Malay; 8 Sep 2026; 643 likes, 94 reposts, 81,926 views) ([unifi-cable]); a software developer's Maxis broadband suddenly lost its line, "blinking red", with a TM contractor's lorry behind the house (Malay; 9 Sep 2026; 5 likes, 1,598 views) ([maxis-contractor]); "Maxis fibre is like Astro now, every heavy rain there's no line" (Malay; 2 Nov 2026; 0 likes, 23 views) ([maxis-rain]); "every start of the month I have to report no line. EVERY MONTH" (Malay; 2 Nov 2026; 0 likes, 1 reply, 56 views) ([unifi-monthly]); Unifi's "self fix" website "can't be used either" (Malay; 31 Oct 2026; 559 views) ([unifi-selffix]).
- Speed and trust: "300 Mbps plan, only getting 30 Mbps" (Malay; 31 Oct 2026; 0 likes, 23 views) ([unifi-speed]); "TM is always quick with promo updates… but when customers face service disruptions, the updates are nowhere to be found" (30 Oct 2026; 248 views) ([tm-promo]); a customer said their termination request was ignored for months, they had "ZERO internet" for two months because a cable was stolen, and Unifi was quick to threaten blacklisting once they stopped paying (Malay and English; 10 Aug 2026; 2,108 likes, 648 reposts, 198,287 views) ([unifi-blacklist]); the new Unifi app won't install on Android 9 and the old one was shut down (3 Nov 2026; 0 likes, 1 reply, 48 views) ([unifi-android9]).

**Water (Malaysia):**

- "Almost 5 pm and I still haven't bathed, no water at home. Only found out when leaving for work, no notice. Now in the evening there's water but it's murkier" (Malay; 28 Oct 2026; 98 views) ([water-no-notice]).
- "Why is there no water in Seksyen 28? No updates in the app either" (to Air Selangor; 20 Jul 2026; 1 reply, 122 views) ([water-seksyen28]), with Air Selangor's apology and explanation the same day (725 views) ([water-airsel-reply]); "there is NO WATER in Pandan Perdana since this morning. When is the water coming?" (21 Apr 2026; 638 views) ([water-pandan]).
- Scale: three Perak districts without water for five days (16 Sep 2026; 23 likes, 6,214 views) ([water-perak]); 130,790 users affected in Penang (Berita Harian, 14 Oct 2026; 1 like, 666 views) ([water-penang]); Taman Tun Sardon residents hit four times in a few weeks (Harian Metro, 3 Oct 2026; 0 likes, 764 views) ([water-tunsardon]); a third day of disruption shutting food stalls (Bernama, 6 Oct 2026; 0 likes, 900 views) ([water-day3]); a Johor resident asking the state's chief minister to end repeated cuts in Pasir Gudang, Masai and Plentong (3 Oct 2026; 11 replies) ([water-johor]). A political account's jab, "Selangor without water for 3 days and it's like the end of the world", drew 651 likes and 44,782 views (Malay; 15 Sep 2026) ([water-selangor-jab]).
- Local warnings come from community pages: a Gombak page warned of a pipe burst at Prima Sri Gombak and told residents to prepare (1 Aug 2026; 3,394 views) ([water-gombak]); a traffic account reported a burst pipe flooding the Bukit Jalil road at the TPM flyover (18 Feb 2026; 3 likes, 393 views) ([water-bukitjalil-pipe]).

**Power (Malaysia):**

- "Almost 7 hours and they still haven't come, half the house blacked out, the meter cable outside burned, they said it's an emergency case" (to TNB; 4 Jul 2026; 3 likes, 420 views) ([tnb-7hours]); "2 nights of blackout, what's wrong with this house's wiring" (Malay; 13 Sep 2026; 23 likes, 2,155 views) ([tnb-2nights]); "is my house blacked out? can't find a thread" (Malay; 3 Nov 2026; 0 likes, 33 views) ([tnb-just-me]).
- Area outages: the October 2025 Edra Melaka power plant disruption cut parts of the Klang Valley and Johor Bahru, with Bukit Jalil among the areas restored by 5:30 PM (BFM, 15 Oct 2025; 478 likes, 397 reposts, 164,313 views) ([edra-bfm]); TNB's own post listed its reporting channels as the SARA chatbot, the 15454 line and Facebook messages (15 Oct 2025; 38 likes, 11,264 views) ([edra-tnb]). A major Johor outage from 6 PM on 16 Oct 2026 left thousands in the dark (BFM; 60 likes, 16,024 views) ([johor-outage]).
- Transit: "Bukit Jalil station even suffered a total blackout" during a week of Kelana Jaya line disruptions (10 Apr 2026; 11 likes, 292 views) ([bukitjalil-station-blackout]); a power outage at University station delayed Kelana Jaya trains (13 Aug 2026; 24 likes, 5,745 views) ([kj-university-outage]).
- Bills: a viral "haunted electricity bill" thread brought TNB staff to investigate (Malay; 3 Jul 2026; 561 likes, 213 reposts, 157,506 views) ([tnb-ghost-bill]); after nearly a year on the time-of-use tariff, a poster's bill fell about 20% by running the washer, dryer, air conditioner and iron off-peak (Malay; 17 Aug 2026; 482 likes, 43,463 views) ([tnb-tou]); the government widened domestic bill protection from 600 to 800 kWh a month (17 Sep 2026; 2 likes, 1 reply, 31 views) ([tnb-800kwh]).

**Global and regional analogues:**

- The 12 October 2026 Batam, Bintan and Tanjungpinang blackout across the strait: "BLACKOUT TOTAL" (10,440 likes, 2,944 reposts, 348,131 views) ([batam-blackout]); "a day without electricity, water, signal and full of smoke" (8,901 likes, 3,337 reposts, 291,132 views) ([batam-day]). A Malaysian commenter: "Batam: haze, blackout, water cut" (13 Oct 2026; 9 likes, 396 views) ([batam-my]).
- The same "is it just me?" question appears worldwide: Jio Fiber users in India facing "temporary service interruption & the wifi is gone for 4-5 hours" every other day (20 Oct 2026; 70 likes, 3,395 views) ([jio-just-me]); Maldives' Dhiraagu "INSANELY slow since the past 2-3 weeks" (5 Oct 2026; 96 likes, 9,146 views) ([dhiraagu-slow]); Nigerian networks "terrible since morning… Anyone else experiencing this?" (12 Sep 2026; 38 likes, 22 replies, 2,032 views) ([ng-network]).
- A sponsored streamer: "Multiple times a day for the last few weeks my internet keeps getting reset mid stream" (10 Mar 2026; 1,533 likes, 115 replies, 323,780 views) ([streamer-resets]); a reply suggested "If you've got a Raspberry Pi or a mini PC, you could set up a network monitor… so you can log packet loss and figure out the source" (10 Mar 2026; 5 likes, 4,014 views) ([pi-packet-loss]).
- Online classes and exams: a US student's provider "improving" Wi-Fi by "shutting it off for 12 hours the same day I gotta do a final exam online" (8 Dec 2025; 9 likes) ([exam-xfinity]); a Filipino student: not everyone has decent internet at home for online classes and work-from-home (14 Aug 2026; 123 likes, 5,882 views) ([ph-online-class]); a Kenyan trainee discovered during a Wi-Fi outage that "a single two hour online class consumed 2GB of my bundle" (27 Aug 2026; 6 likes, 175 views) ([ke-bundle]).

**Inference:** the gap is not information from providers (status pages, WhatsApp alerts and chatbots exist) but knowing, from your own home, whether it's just you or the whole area, since when, and having a record to show the provider or MCMC.

[unifi-auth-light]: https://x.com/i/status/2117963306778624252
[unifi-mcmc]: https://x.com/i/status/2117795848457482310
[tm-status-reply]: https://x.com/i/status/2117800863477735707
[unifi-community]: https://x.com/i/status/2117842800104403338
[unifi-2days]: https://x.com/i/status/2069077156576346467
[unifi-4days]: https://x.com/i/status/2116923427873505340
[unifi-status-broken]: https://x.com/i/status/2116924099004149777
[unifi-week]: https://x.com/i/status/2062479472130166961
[unifi-13days]: https://x.com/i/status/2061312246232539158
[unifi-whatsapp]: https://x.com/i/status/2113131112428097964
[unifi-speed]: https://x.com/i/status/2116389502315073652
[tm-promo]: https://x.com/i/status/2116031074644246900
[unifi-blacklist]: https://x.com/i/status/2086689942898655704
[unifi-android9]: https://x.com/i/status/2117548845538406571
[umobile-outage]: https://x.com/i/status/2079760770628190380
[umobile-maxis]: https://x.com/i/status/2079819317634621930
[celcomdigi-2h]: https://x.com/i/status/2072405374641332519
[unifi-cable]: https://x.com/i/status/2097309462369632616
[maxis-contractor]: https://x.com/i/status/2097624683281854618
[maxis-rain]: https://x.com/i/status/2117167673801072760
[unifi-monthly]: https://x.com/i/status/2117277275712569592
[unifi-selffix]: https://x.com/i/status/2116669519708278828
[water-no-notice]: https://x.com/i/status/2115363732473982976
[water-seksyen28]: https://x.com/i/status/2079061990417518614
[water-airsel-reply]: https://x.com/i/status/2079063567676874770
[water-pandan]: https://x.com/i/status/2046516796623372708
[water-perak]: https://x.com/i/status/2100153674333053049
[water-penang]: https://x.com/i/status/2110242030114705604
[water-tunsardon]: https://x.com/i/status/2106253169609384181
[water-day3]: https://x.com/i/status/2107385918374191609
[water-johor]: https://x.com/i/status/2106329774981558732
[water-selangor-jab]: https://x.com/i/status/2099800965520269783
[water-gombak]: https://x.com/i/status/2083363346989105355
[water-bukitjalil-pipe]: https://x.com/i/status/2023926703140032706
[tnb-7hours]: https://x.com/i/status/2073416127787766043
[tnb-2nights]: https://x.com/i/status/2099217161042702658
[tnb-just-me]: https://x.com/i/status/2117592763718099119
[edra-bfm]: https://x.com/i/status/1978402310892974315
[edra-tnb]: https://x.com/i/status/1978400840164561293
[johor-outage]: https://x.com/i/status/2111060586746585333
[bukitjalil-station-blackout]: https://x.com/i/status/2042450074329121021
[kj-university-outage]: https://x.com/i/status/2087758620821749970
[tnb-ghost-bill]: https://x.com/i/status/2072983650229264584
[tnb-tou]: https://x.com/i/status/2089254922139435341
[tnb-800kwh]: https://x.com/i/status/2100597122559311973
[batam-blackout]: https://x.com/i/status/2109631746140733683
[batam-day]: https://x.com/i/status/2109660564628869355
[batam-my]: https://x.com/i/status/2109914254426202125
[jio-just-me]: https://x.com/i/status/2112451977154326789
[dhiraagu-slow]: https://x.com/i/status/2107065269537685735
[ng-network]: https://x.com/i/status/2098870751138881603
[streamer-resets]: https://x.com/i/status/2031245933657108943
[pi-packet-loss]: https://x.com/i/status/2031258086636175726
[exam-xfinity]: https://x.com/i/status/1998129599444852863
[ph-online-class]: https://x.com/i/status/2088093143715782995
[ke-bundle]: https://x.com/i/status/2093014513381523952

### Old phones and Raspberry Pis at home

Repurposing a spare phone as a camera, sensor or server is one of the most engaged-with hobby topics on X in 2025–2026, and the most-liked first-person example used a cheap phone's sensors to tell its owner when the dryer finished. The adoption evidence is mostly global and hobbyist; only one Malaysian post appeared.

- **Who:** engineers and hobbyists, tech publications (XDA, How-To Geek), AI-tools influencers, and a few households where the build serves family members.
- **Recurrence:** 46 relevant posts across 13 queries, including one reply-thread read.
- **Intensity:** high on the influencer posts (5,976 likes for an old-Android-as-Linux-server script; 1,046 likes for "your old phone is a free 24×7 security camera") and on one first-person build (5,649 likes, 870k views).
- **Workarounds:** AlfredCamera and similar apps, Termux running Home Assistant on Android, smart plugs that watch power draw, Pi-hole, and Telegram bots on a Pi.

**Malaysia:** the only Malaysian hit was a Malaysian developer community's founder announcing a free online class at 9 PM Malaysia time on "How to build your first basic homelab" (9 Oct 2026; 5 likes, 379 views) ([my-homelab-class]).

**What people built and use:**

- "I made an app this past weekend using a $30 android smartphone to send me notifications when my dryer was done drying… use for DIY projects in place of a raspberry pi or esp32" (an ML and robotics engineer; 9 Jun 2025; 5,649 likes, 270 reposts, 148 replies, 870,553 views) ([dryer-phone]); the post it quoted called the phone "basically a raspberry pi replacement that comes with a screen, cameras, microphone, etc." (17 May 2025; 598 likes, 848,501 views) ([dryer-phone-quoted]). Others did the same with an ESP32 watch's accelerometer (24 Aug 2026; 19 likes, 5,438 views) ([dryer-watch]) or a $15 smart plug (10 Jun 2025; 2 likes, 1 reply, 219 views) ([dryer-plug]), and a user with ADHD called washer-done alerts "a godsend" (7 Jul 2025; 6 likes, 1 reply, 919 views) ([dryer-adhd]).
- "YOUR OLD PHONE IS A FREE 24X7 SECURITY CAMERA… took me 2 mins to set up" (an AI-tools influencer; 18 Apr 2026; 1,046 likes, 260 reposts, 242,559 views) ([oldphone-camera]); "Someone built a script that turns it into a full Linux desktop. Or a smart home server" (an AI-guides influencer; 15 Apr 2026; 5,976 likes, 1,176 reposts, 269,316 views) ([oldphone-linux]).
- XDA: "An old Android phone is a better first home server than a $100 Raspberry Pi in 2026, and you probably already own one" (27 Oct 2026; 164 likes, 23,350 views) ([xda-oldphone-server]) and "I turned an old Android phone into a home server, and it outperformed my Raspberry Pi" (25 Jun 2026; 169 likes, 15,771 views) ([xda-outperformed]); How-To Geek: an old Android phone "is a better Home Assistant dashboard than any cheap tablet" (5 Oct 2026; 3 likes, 860 views) ([htg-dashboard]).
- A Turkish R&D engineer connected an old phone to a Raspberry Pi and turned it into a bot that "can now imitate everything done with a phone" (Turkish; 9 Jun 2026; 5,448 likes, 946,583 views) ([phone-pi-bot]).
- Pi builds for a household: a kitchen "live Weather Channel" on an old $40 Pi (2 Sep 2026; 303 likes, 16,448 views) ([pi-weather]); Pi-hole bedtime internet shutoffs "for my family" (How-To Geek, 20 Aug 2026; 2 likes, 761 views) ([pihole-bedtime]); a self-hosted beacon replacing the "Find my…" app "that my family uses to see where I am" (18 Aug 2026; 2 likes, 1 reply, 377 views) ([family-beacon]); an AI agent on a Pi 5 "dropped into a telegram… now my wife finally uses AI" (4 Apr 2026; 4 likes) ([pi-wife-ai]), against another builder whose Pi agent "already annoyed most of my family" (2 Feb 2026; 30 likes, 2,996 views) ([pi-annoyed-family]).
- Watching the network: a Fing Agent Raspberry Pi network-monitoring kit (27 Sep 2025; 134 likes, 7,553 views) ([fing-pi]); Uptime Kuma replacing paid uptime monitoring (20 Jul 2026; 125 likes, 7,460 views) ([uptime-kuma]).

**Pushback:** replies to the dryer post questioned the need: "It already makes a noise when it completes… Not sure this was a problem that needed fixing" (9 Jun 2025; 4 likes) ([dryer-skeptic]) and "Just tell Siri to set a timer" (9 Jun 2025; 5 likes, 1,614 views) ([dryer-siri]); the builder answered that "having a cheap device you don't have to add sensors to for each and every different use case is a big sell" (9 Jun 2025; 23 likes, 3,340 views) ([dryer-builder-reply]), and another reply warned of battery swelling in cheap phones left on charge ([dryer-battery]). More broadly, "I can think of zero reasons why my refrigerator, dishwasher, oven, washer and dryer should be on the internet" (a US Air Force veteran; 4 Apr 2026; 3,782 likes, 85,862 views) ([no-internet-appliances]); a poster who rooted their 2025 Samsung TV after "weirdly targeted ads" and announced a "PRIVACY HORROR" drew 36,734 likes and 4.85M views (21 Oct 2026) ([smart-tv-ads]); a smart-home YouTuber warned that phone-based presence detection "sounds simple until you start trusting it with important automations" (18 Aug 2026; 2 likes, 47 views) ([presence-trust]).

**Inference:** a phone already in a drawer is accepted as a free sensor when it answers one concrete household question ("is the laundry done?", "who's at the door?"), and distrusted when it feels like surveillance or vendor data collection.

[my-homelab-class]: https://x.com/i/status/2108535006469800189
[dryer-phone]: https://x.com/i/status/1931937088955351270
[dryer-phone-quoted]: https://x.com/i/status/1923581332854120597
[dryer-watch]: https://x.com/i/status/2091971645938528720
[dryer-plug]: https://x.com/i/status/1932244709965213939
[dryer-adhd]: https://x.com/i/status/1942225701559730294
[oldphone-camera]: https://x.com/i/status/2045532564098805854
[oldphone-linux]: https://x.com/i/status/2044377191832830363
[xda-oldphone-server]: https://x.com/i/status/2115186856237093004
[xda-outperformed]: https://x.com/i/status/2070220677861241062
[htg-dashboard]: https://x.com/i/status/2107244519158583392
[phone-pi-bot]: https://x.com/i/status/2064395792345907512
[pi-weather]: https://x.com/i/status/2095000530703827339
[pihole-bedtime]: https://x.com/i/status/2090514281351545247
[family-beacon]: https://x.com/i/status/2089691766865776753
[pi-wife-ai]: https://x.com/i/status/2040414092679114906
[pi-annoyed-family]: https://x.com/i/status/2018282583218335833
[fing-pi]: https://x.com/i/status/1971896272769765636
[uptime-kuma]: https://x.com/i/status/2079108817967821085
[dryer-skeptic]: https://x.com/i/status/1932129732495106093
[dryer-siri]: https://x.com/i/status/1932078525902889398
[dryer-builder-reply]: https://x.com/i/status/1932124749968138614
[dryer-battery]: https://x.com/i/status/1932314339538596097
[no-internet-appliances]: https://x.com/i/status/2040282823626551392
[smart-tv-ads]: https://x.com/i/status/2113014142600953868
[presence-trust]: https://x.com/i/status/2089759229536317850

### Location sharing between students and parents

Location sharing is everyday behaviour, and Malaysians use it for one thing in particular: getting home late. Parents tracking university-age children, though, set off the largest pile-ons in the pass.

- **Who:** students, their parents, Malaysian women taking late-night rides, couples.
- **Recurrence:** 19 relevant posts across four queries, two of them reply-thread reads.
- **Intensity:** very high, and mostly against parental tracking: 25,521, 19,164, 17,881 and 16,755 likes on four posts mocking parents who track college students.
- **Workarounds:** Grab's trip tracking, WhatsApp live location to a group chat, Life360 circles among friends, sharing "until end of day".

**Malaysia:**

- "Even on a Grab in the middle of the night, everyone starts sharing location or Grab's ride tracking (please normalise this especially if you're a girl/woman), bonus if you have Life360" (Malay and English; 5 Dec 2025; 5 likes, 497 views) ([my-grab-share]).
- Asked whether couples share location all the time, a Malaysian user said no, "except when coming home late at night" (Malay; 12 Jun 2026; 29 likes, 15 replies, 24,678 views) ([my-couple-share]); a reply said they share mostly "to plan ETA, ETD", for example driving back to their hometown (12 Jun 2026; 5 likes, 1 reply, 956 views) ([my-eta-share]). Advice to someone asking whether running alone at night is safe: pick bright, busy places and "share live location with family or friends" (Malay; 10 Jul 2026; 2 likes, 26 views) ([my-run-share]).

**Global analogues:**

- A lecturer and father quote-posted a parent tracking an adult student: "This is wild" (19 Sep 2026; 19,164 likes, 403 replies, 1,459,528 views) ([life360-wild]); a writer: "I'd hate for my parents to know my movements like this as a student" (19 Sep 2026; 25,521 likes, 362,225 views) ([life360-writer]); a former London Assembly member: "would have driven me insane at 9, never mind 19" (19 Sep 2026; 17,881 likes, 2,429,133 views) ([life360-london]). In that thread a New England user pushed back: "most entire families track each other. most friend groups do. this isn't weird" (42 likes, 70 replies, 27,704 views) ([life360-normal]), and a retiree drew the line at tracking "a specific journey… driving home when it's late or bad weather" (11 likes) ([life360-journey]).
- A screenshot of a college student's tracking parents drew 16,755 likes, 524 replies and 1,312,505 views (26 May 2026) ([life360-screenshot]); the most-liked reply separated "keeping tabs on" from "you will not take a step without my permission" (3,603 likes) ([life360-tabs]), and another simply said "Leave your phone in the dorm" (249 likes) ([life360-dorm]).
- A mother and lawyer worried about her children leaving the family's Life360 group: "Maybe there is a third option, where the kids track one another and I don't?… Not for bedtimes or partying but for safety" (26 May 2026; 11 likes, 25 replies, 23,020 views) ([life360-third-option]). When Life360 itself had an outage, "tons of parents of college aged kids are panicking" (20 Oct 2025; 4 likes, 311 views) ([life360-outage]); the company's official account, which posted the outage notice, describes the app in its profile as used by "70+ million people" ([life360-official]).

**Inference:** sharing a journey, time-boxed and chosen by the person travelling, is accepted; continuous parental tracking of adult students is socially toxic on X.

[my-grab-share]: https://x.com/i/status/1996982600989323324
[my-couple-share]: https://x.com/i/status/2065352947136160252
[my-eta-share]: https://x.com/i/status/2065383078818930952
[my-run-share]: https://x.com/i/status/2075573222825943312
[life360-wild]: https://x.com/i/status/2101226053263839239
[life360-writer]: https://x.com/i/status/2101385054274400455
[life360-london]: https://x.com/i/status/2101325213409362304
[life360-normal]: https://x.com/i/status/2101283339026018353
[life360-journey]: https://x.com/i/status/2101325881322934400
[life360-screenshot]: https://x.com/i/status/2059351770501972330
[life360-tabs]: https://x.com/i/status/2059376504220385701
[life360-dorm]: https://x.com/i/status/2059379629350154577
[life360-third-option]: https://x.com/i/status/2059414380010504498
[life360-outage]: https://x.com/i/status/1980345401766211783
[life360-official]: https://x.com/i/status/1980278569864737003

### Offline mesh messaging during outages

bitchat, a Bluetooth mesh chat app, shows that phone-to-phone messaging without internet gets installed in bursts when networks fail or are cut. No Malaysian post mentioned it; the nearest evidence is Indonesia during the September 2025 protests.

- **Who:** protesters and residents during telecom outages or shutdowns (France, India), Bitcoin and privacy communities, digital-rights groups.
- **Recurrence:** 21 relevant posts across three queries, clustered around July 2025 (launch), September 2025 (Nepal and Indonesia), July 2026 (India) and 21–26 October 2026 (France).
- **Intensity:** launch post 26,478 likes and 5.48M views; the France surge 13,539 likes and 1.2M views on one post.

**Timeline:**

- Launch: bitchat's creator called it "my weekend project to learn about bluetooth mesh networks, relays and store and forward models" (6 Jul 2025; 26,478 likes, 3,508 reposts, 1,741 replies, 5,482,194 views) ([bitchat-launch]); a January update added photos and voice notes over the mesh and a third-party security audit (15 Jan 2026; 7,266 likes, 421,335 views) ([bitchat-update]).
- Nepal and Indonesia, September 2025: during protests and a social media ban, Nepal recorded 48,781 bitchat downloads on 8 September 2025 (a payments and privacy poster; 12 Sep 2025; 3 likes, 187 views) ([bitchat-nepal-48k]), and a PR agency's post on the surge drew 1,282 likes and 322,612 views (11 Sep 2025) ([bitchat-nepal-pr]); a crypto-conference account reported "Indonesia records one of the fastest Bitchat adoption rates as installs surge amid mounting free speech concerns" (11 Sep 2025; 125 likes, 26,614 views) ([bitchat-indonesia]). A Bitcoin fundraising platform's co-founder countered that his Nepali sources "downloaded VPN and could access their normal messaging platforms" (11 Sep 2025; 2 likes) ([bitchat-nepal-vpn]).
- India, July to October 2026: an Android news account reported Apple pulled bitchat from India's App Store under a government order after it was "widely used during July telecom shutdowns around protest sites" (4 Oct 2026; 2 likes, 111 views) ([bitchat-india]); India's Internet Freedom Foundation crowdsourced guides to mesh messaging for shutdowns (21 Jul 2026; 2,277 likes, 394 reposts, 44,402 views) ([iff-mesh]).
- India's GitHub order: a trader's post that India gave GitHub three hours to delete bitchat and "by the time the deadline hit, the app was already back" drew 9,437 likes and 948,950 views (24 Jul 2026) ([bitchat-github]).
- France, October 2026: after protests and a nationwide Orange mobile outage on 21 October, bitchat reached #1 in France's App Store social networking chart (a Bitcoin news account, 23 Oct 2026; 237 likes, 17,068 views) ([bitchat-orange]) and then #1 of all free apps (a French digital-sovereignty commentator, 23 Oct 2026; 164 likes, 168,866 views) ([bitchat-france-1]); "people started mass-downloading an app that doesn't need internet" (a Latin American cybersecurity developer, Spanish; 24 Oct 2026; 1,630 likes, 173,249 views) ([bitchat-spanish]); "THE MOST DOWNLOADED APP IN FRANCE" (a Bitcoin journalist, 23 Oct 2026; 13,539 likes, 1,201,514 views) ([bitchat-most-downloaded]).
- Spreading without app stores: bitchat's community account said the app can send itself to another Android phone over Nearby Share or a Wi-Fi hotspot (4 Oct 2026; 1,077 likes, 33,149 views) ([bitchat-sideload]).

[bitchat-launch]: https://x.com/i/status/1941989435962212728
[bitchat-update]: https://x.com/i/status/2011602189807202401
[bitchat-orange]: https://x.com/i/status/2113602675006648395
[bitchat-france-1]: https://x.com/i/status/2113709326640513125
[bitchat-spanish]: https://x.com/i/status/2113809766006837614
[bitchat-most-downloaded]: https://x.com/i/status/2113451089034969303
[bitchat-india]: https://x.com/i/status/2106765536814084276
[iff-mesh]: https://x.com/i/status/2079610876542484789
[bitchat-sideload]: https://x.com/i/status/2106781543528096185
[bitchat-nepal-48k]: https://x.com/i/status/1966435711143559260
[bitchat-nepal-pr]: https://x.com/i/status/1966119141091234147
[bitchat-indonesia]: https://x.com/i/status/1965974094077382768
[bitchat-nepal-vpn]: https://x.com/i/status/1966240703249580152
[bitchat-github]: https://x.com/i/status/2080709524688945212

### Long commutes, cancelled classes and internships away

Students far from campus complain most about trips wasted by late changes, and interns who move away complain about loneliness and allowances. These posts are global and meme-heavy; Malaysian evidence is about internship allowances and long working hours.

- **Who:** commuting students, interns who relocated, students working part-time.
- **Recurrence:** 16 relevant posts across six queries; two remote-study queries (r05, r08) returned nothing.
- **Intensity:** very high on the memes (33,052 likes for a wasted two-hour commute), moderate on internship allowances in Malaysia (574 likes, 145 replies, 554k views).

**Malaysia:**

- A Malaysian resume coach objected to students' internship applications stating "Minimum allowance: RM1,000" (Malay; 4 Feb 2026; 574 likes, 145 replies, 554,521 views) ([my-intern-allowance]); an Indonesian poster held up a Malaysian internship paying RM1,000 as generous (6 Jul 2026; 4,866 likes, 106,398 views) ([id-my-intern]); a Selangor agency's RM1,500 internship allowance made news (14 Nov 2025; 0 likes, 139 views) ([selangor-allowance]).
- A Malaysian who was a full-time student "worked part time every day (5pm–2am) after class" (20 Aug 2025; 3 likes) ([my-parttime-nights]).

**Global analogues:**

- "2 hour commute just for professor to move the class online" (30 Apr 2026; 33,052 likes, 921 reposts, 220,300 views) ([commute-moved-online]); "commuted to uni 1,5h just for the class to end after 25mins" (8 Oct 2026; 7,646 likes, 83,163 views) ([commute-25min]); a one-hour commute in the rain "to get to my 7:30 class just for the lecturer to cancel" (12 Feb 2026; 54 likes, 54,136 views) ([commute-rain]); "the hard part of living far from campus is not how long it takes… it's finding the motivation to go" (10 Oct 2025; 3 likes, 1 reply, 46 views) ([commute-motivation]).
- An Indonesian commuter student in semester five had never joined a campus activity "because I commute and the campus is far from home" (Indonesian; 25 Jul 2025; 1,264 views) ([id-commuter]); an Indonesian student said a power cut took out the phone signal across the whole campus, and messages only went through after leaving (23 Apr 2026; 3,362 views) ([id-campus-signal]).
- Interns: "i moved to a new city for an internship and spent my entire first week eating alone in my apartment" (13 Oct 2026; 10 likes, 1,184 views) ([intern-eating-alone]); "new city, living alone" before an internship (10 Dec 2025; 231 likes, 45 replies, 6,059 views) ([intern-new-city]); Indian interns "far from home… ₹7500 can't cover rent & food" (4 Sep 2026; 3 likes, 28 views) ([intern-stipend]).

[my-intern-allowance]: https://x.com/i/status/2018916254145487274
[id-my-intern]: https://x.com/i/status/2074001347033387055
[selangor-allowance]: https://x.com/i/status/1989298841900765419
[my-parttime-nights]: https://x.com/i/status/1958127290543702417
[commute-moved-online]: https://x.com/i/status/2049895890840645772
[commute-25min]: https://x.com/i/status/2108170207219028186
[commute-rain]: https://x.com/i/status/2021840825206890916
[commute-motivation]: https://x.com/i/status/1976466342598582325
[id-commuter]: https://x.com/i/status/1948726942368497918
[id-campus-signal]: https://x.com/i/status/2047193393227616579
[intern-eating-alone]: https://x.com/i/status/2109811361718980656
[intern-new-city]: https://x.com/i/status/1998676817612337470
[intern-stipend]: https://x.com/i/status/2095810955985002640

### Working alone: body doubling and study-with-me

People who study or work alone say they can't start without someone else present, and they fake presence with "study with me" videos, focus apps and virtual coworking. No Malaysian posts surfaced; the signal is global.

- **Who:** students and remote workers, especially people with ADHD.
- **Recurrence:** 9 relevant posts across two queries, in English, Korean, Japanese and Arabic.
- **Intensity:** high (16,195 likes and 1.3M views for a list that opens with body doubling; 8,640 likes for a virtual-coworking game; 4,462 likes for study-with-me videos).

**Evidence (global):**

- "Body doubling — you can't start alone, but with someone nearby, it happens" (a viral ADHD-list account; 28 May 2026; 16,195 likes, 1,506 reposts, 1,299,475 views) ([body-doubling-list]).
- "Have your friends sit with you at the bottom of your screen while you all work/study together for some cozy online body doubling" (a virtual-coworking game's developer; 27 Nov 2025; 8,640 likes, 1,011 reposts, 290,696 views) ([body-doubling-game]).
- "Playing a Study with me video while studying feels like sharing a goal, and my motivation goes up" (Japanese; 17 May 2026; 4,462 likes, 545 reposts, 193,704 views) ([study-with-me-jp]); a Korean ADHD tip list recommends the same (11 Feb 2026; 717 likes, 108,077 views) ([study-with-me-kr]); an Arabic-speaking student: "I can't study at home… I need to see people studying" (1 Nov 2026; 0 likes, 3 replies, 183 views) ([study-with-me-ar]); an Indonesian student invited others to "study with me on YPT", a study-timer app (3 Nov 2026; 16 replies) ([ypt-invite]).
- A product engineer with ADHD works better "where I have people to report daily progress to" (4 Nov 2026; 18 likes) ([daily-progress]).

[body-doubling-list]: https://x.com/i/status/2060000027980824729
[body-doubling-game]: https://x.com/i/status/1994020997368828176
[study-with-me-jp]: https://x.com/i/status/2055989134582546628
[study-with-me-kr]: https://x.com/i/status/2021513688642183566
[study-with-me-ar]: https://x.com/i/status/2116882358599033314
[ypt-invite]: https://x.com/i/status/2117443188596335103
[daily-progress]: https://x.com/i/status/2117872558720847941

### Group assignments and survey respondents

Two chronic coursework pains: group members who don't contribute, and final-year students begging strangers to fill in surveys. The survey problem has spawned paid respondent markets in neighbouring countries.

- **Who:** university students, final-year project (FYP) and thesis students.
- **Recurrence:** 15 relevant posts across three queries (English, Malay, Chinese).
- **Intensity:** moderate; one group-project story drew 1,860 likes and 519 replies, while most survey requests get 0–17 likes.

**Evidence:**

- Group work: an anecdote account's story of documenting "every single unread receipt and empty contribution log" in a four-person project worth 40% of the grade, then asking the professor for individual grading (11 May 2026; 1,860 likes, 519 replies, 83,120 views; anecdote, unverified) ([group-ruined-grades]); "I did like 80% of the work, she did nothing & saved it on HER laptop" (21 Apr 2026; 5 likes, 3 replies, 652 views) ([group-80pct]); in Malaysia the term is "free rider or silent partner: we do everything, they get their name on it too" (Malay; 4 Mar 2026; 3 likes, 812 views) ([my-free-rider]); a Chinese-language student wrote that they did 80% of their undergraduate group presentations alone, with AI (28 Oct 2026; 32 likes) ([cn-group-80pct]).
- Survey respondents (Malaysia): "I need 50+ more respondents for my FYP survey… about Malaysian K-Pop fans" (2 Nov 2026; 0 likes, 6 views) ([my-fyp-50]); "aiming to collect 150 respondents for my fyp… please share with your friends" (Malay and English; 13 Mar 2026; 13 likes, 17 reposts, 1,300 views) ([my-fyp-150]); a call for final-year UiTM tourism students as respondents (29 Oct 2026; 0 likes, 17 views) ([uitm-respondents]); "If I don't get enough respondents, I won't be able to graduate" (3 Nov 2026; 0 likes, 7 views) ([fyp-graduate]).
- Respondent markets (regional): a Filipino student commissioning 300 survey responses where "All answers will be provided. No need to analyze" (15 May 2026; 20 replies, 3,041 views) ([ph-commission-300]); an Indonesian questionnaire-respondent service for theses (11 Aug 2026; 34 replies, 21,053 views) ([id-respondent-service]).

[group-ruined-grades]: https://x.com/i/status/2053868550616457439
[group-80pct]: https://x.com/i/status/2046527097171308735
[my-free-rider]: https://x.com/i/status/2029314645161590805
[cn-group-80pct]: https://x.com/i/status/2115440342032134367
[my-fyp-50]: https://x.com/i/status/2117100552085795011
[my-fyp-150]: https://x.com/i/status/2032323164173422938
[uitm-respondents]: https://x.com/i/status/2115720270736658872
[fyp-graduate]: https://x.com/i/status/2117443619175235686
[ph-commission-300]: https://x.com/i/status/2055111949554487478
[id-respondent-service]: https://x.com/i/status/2087101236634059221

### Money, rent and scams

Cost of living, rentals and scams come up often in Malaysian posts, but scattered across many small threads; scams against international students are the sharpest.

- **Who:** Malaysian renters, international students in Malaysia, students targeted by scams.
- **Recurrence:** 19 relevant posts across nine queries.
- **Intensity:** mixed (1,535 likes for a call to feed hungry university students; 1,258 likes for a scam warning; 537 likes for an international PhD budget debate).

**Evidence:**

- Scams: a Chinese-language account, citing Hangzhou Daily, reported a 20-year-old Chinese student who arrived in Malaysia in March 2025, was hit by a telecom scam on day five and took her own life on day nine (20 Aug 2025; 12 likes, 22,867 views) ([cn-student-scam]); a Malaysian user warned about a scammer who took RM622 (7 Feb 2026; 1,258 likes, 846 reposts, 112,476 views) ([my-scam-622]); a Malaysian cybersecurity writer explained how fake base stations send scam SMS that bypass telco filters (Malay; 30 Oct 2025; 76 likes, 51 reposts, 4,047 views) ([my-fake-bts]); KL police detained 18 people in two condos over a fake Hong Kong police scam, seizing 69 phones (Chinese; 3 Nov 2026; 0 likes, 172 views) ([kl-scam-raid]).
- International students' costs: a self-described rage-bait account mocking an international PhD student's RM52,800-a-year (RM4,400 a month) living-expenses budget drew 537 likes and 67,893 views (17 Sep 2026) ([intl-phd-budget]); a Tamil PhD student replied with what locals don't pay: EMGS visa fees, mandatory foreign medical insurance and flights, at a UKM campus in expensive Cheras (17 Sep 2026; 151 likes) ([intl-phd-costs]); Sin Chew reported international students debating renting versus staying in hotels for a short stay (29 Jul 2025; 1 like, 973 views) ([sinchew-rent-hotel]).
- Food and rent: "give food to those who need it more: university students studying while holding back hunger" (28 Oct 2025; 1,535 likes, 50,087 views) ([my-hungry-students]); a Malaysian renter's culture shock at mixed-gender rooms for Muslims in KL (Malay; 26 Mar 2026; 444 likes, 167,939 views) ([my-mixed-rental]); a landlord who kept a RM200 deposit and stopped answering WhatsApp (Malay; 18 Jan 2026; 3 likes, 542 views) ([my-deposit]).
- Dengue appears mostly as official messaging: a Malaysian health-information account pointed people to the iDengue portal for daily case data and active outbreak locations (22 Jul 2026; 3,758 views) ([idengue]). Haze prompted one home measurement: a Malaysian poster's pH reading of rainwater collected after heavy haze drew 5,635 likes, 2,208 reposts and 355,383 views (8 Oct 2026) ([rain-ph]).

[cn-student-scam]: https://x.com/i/status/1958008574736757248
[my-scam-622]: https://x.com/i/status/2020231635703304373
[my-fake-bts]: https://x.com/i/status/1983749935368696285
[kl-scam-raid]: https://x.com/i/status/2117648320072212510
[intl-phd-budget]: https://x.com/i/status/2100614985164718106
[intl-phd-costs]: https://x.com/i/status/2100631284032979286
[sinchew-rent-hotel]: https://x.com/i/status/1950088081446440969
[my-hungry-students]: https://x.com/i/status/1983144923802021918
[my-mixed-rental]: https://x.com/i/status/2037009377853681878
[my-deposit]: https://x.com/i/status/2012896516843987282
[idengue]: https://x.com/i/status/2079779714315788565
[rain-ph]: https://x.com/i/status/2108105045057097766

### APU and Bukit Jalil footprint

APU's own X presence is club and hackathon news; APU students' off-campus complaints don't surface on X under APU's name. Bukit Jalil appears in utility, transit and haze news.

- APU's student community is hackathon- and Web3-heavy: APU students won USD 10,000 at the IOTA Hackathon Malaysia 2025 (APU's official account; 25 Nov 2025; 27 likes, 7,812 views) ([apu-iota]) and first place at Build Week Hackathon 2026 with an agent-escrow project (16 Sep 2026; 3 likes, 201 views) ([apu-buildweek]); APU ran its first Red Hat Linux Ops Arena Hackathon (30 Oct 2026; 0 likes, 113 views) ([apu-redhat]); a Web3 learning platform called the APU Blockchain & Cryptocurrency Club "Malaysia's first and largest student-led" blockchain club (3 Dec 2025; 12 likes, 20 replies, 12,581 views) ([apubcc]); a high-schooler-run global hackathon, Campfire KL, was held at APU (5 Mar 2026; 4 likes, 335 views) ([campfire-kl]); APU's Final Year Project Showcase 2026 had over 100 students from 17 programmes (18 Jun 2026; 1 like, 209 views) ([apu-fyp-showcase]).
- A blockchain infrastructure company spoke to "70 students" at APU about careers, telling them "Hackathons > internship applications" (13 Apr 2026; 11 likes, 6,565 views) ([apu-blockchain-talk]).
- A post alleging that a Maldivian student with a disability at APU was bullied and blackmailed drew 115 likes and 51,905 views (25 Aug 2025; allegation, unverified) ([apu-allegation]).
- Bukit Jalil: power was restored there in the October 2025 Edra outage, its LRT station blacked out in April 2026, and a burst pipe flooded the road at the TPM flyover in February 2026, all cited in [Home internet, water and power cuts](#home-internet-water-and-power-cuts); the national Sports Day event in Bukit Jalil was postponed for haze (9 Oct 2026; 347 likes, 15,158 views) ([bukitjalil-haze]); a Bukit Jalil resident said they share a house with IMU students in a condo full of students opposite IMU (Malay; 22 Aug 2024; 3 likes, 1 reply, 3,289 views) ([bukitjalil-condo]). A search for Bukit Jalil water cuts (u01) returned nothing.

[apu-iota]: https://x.com/i/status/1993243270806151619
[apu-buildweek]: https://x.com/i/status/2100162791302701392
[apu-redhat]: https://x.com/i/status/2116017250641567958
[apubcc]: https://x.com/i/status/1996051767658762636
[campfire-kl]: https://x.com/i/status/2029482160814424474
[apu-fyp-showcase]: https://x.com/i/status/2067562980942786933
[apu-blockchain-talk]: https://x.com/i/status/2043541629458600311
[apu-allegation]: https://x.com/i/status/1960125800448934159
[bukitjalil-haze]: https://x.com/i/status/2108407285206921653
[bukitjalil-condo]: https://x.com/i/status/1826528626768314713

## What people keep using

Tools and habits with adoption evidence in the posts, strongest first. Figures are as posted and mostly self-reported.

| Tool or habit                                        | Adoption evidence                                                                                                                                                 | Where                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Sileme / Demumu / "Are You There" check-in app       | #1 paid app in China (Jan 2026), price raised 1 → 8 yuan, 60+ investor inquiries, claimed 3M+ users                                                               | [Living alone][s-a]  |
| Life360 and phone location sharing                   | "70+ million people" (official profile); Malaysians share Grab trips and live location when out late                                                              | [Location][s-l]      |
| bitchat (Bluetooth mesh chat)                        | #1 free app in France after the 21 Oct 2026 Orange outage; used in India's July 2026 shutdowns                                                                    | [Mesh][s-m]          |
| Old phone as camera or server (AlfredCamera, Termux) | Repeated tech-press guides (XDA, How-To Geek); influencer posts with 1,000–6,000 likes                                                                            | [Old phones][s-o]    |
| Home Assistant laundry-done alerts                   | First-person builds with a $30 phone, a watch accelerometer, a smart plug; "a godsend" for a user with ADHD                                                       | [Old phones][s-o]    |
| Pi-hole and Pi household services                    | Family bedtime shutoffs, kitchen weather display, a family location beacon                                                                                        | [Old phones][s-o]    |
| Study-with-me videos, YPT, virtual coworking         | Study-with-me posts with thousands of likes in several languages; a coworking game's demo post 8,640 likes                                                        | [Working alone][s-w] |
| Student-built campus tools                           | A syllabus tool "over 32,000 users across multiple universities, growing by 500+ each week" ([syllabus-32k]); a jobs tool "crossed 5,000 users" ([careerlift-5k]) | Global               |
| TNB time-of-use tariff                               | A poster cut their bill about 20% by moving laundry and air conditioning off-peak (482 likes)                                                                     | [Utilities][s-u]     |
| Tagging providers and MCMC on X                      | Daily Unifi, Air Selangor and TNB complaints; community-news accounts asking "are you one of them?"                                                               | [Utilities][s-u]     |

[s-a]: #living-alone-and-check-ins
[s-l]: #location-sharing-between-students-and-parents
[s-m]: #offline-mesh-messaging-during-outages
[s-o]: #old-phones-and-raspberry-pis-at-home
[s-w]: #working-alone-body-doubling-and-study-with-me
[s-u]: #home-internet-water-and-power-cuts
[syllabus-32k]: https://x.com/i/status/1948438176370188644
[careerlift-5k]: https://x.com/i/status/2090458415906672845

## Unmet needs (Inference)

Needs the posts show without a working answer, stated without proposing products. All are **Inference**.

1.  **Being noticed when you go quiet, without a daily chore.** A Malaysian living alone asked for an automatic "tell my family if I stop responding", the viral paid app needs a manual tap and takes two to three days, critics fear false alarms, and the passive versions that exist can't find users. Nobody visible serves Malaysian students or young workers living alone, or their families back home ([Living alone and check-ins](#living-alone-and-check-ins)).
2.  **"Is it just me?" for home outages, with proof.** Unifi customers can't tell an area outage from a household fault, status pages and apps fail or lag, and multi-day outages need evidence for providers and MCMC. Water and power cuts arrive without notice for some households ([Home internet, water and power cuts](#home-internet-water-and-power-cuts)).
3.  **A middle ground between parental tracking and nothing.** Students reject continuous tracking, but share journeys late at night and parents want "a third option… for safety" ([Location sharing between students and parents](#location-sharing-between-students-and-parents)).
4.  **Household sensing from phones people already own.** The global appetite for "use the spare phone" is strong, but no Malaysian community doing it surfaced, and there is no evidence that non-hobbyists set it up themselves ([Old phones and Raspberry Pis at home](#old-phones-and-raspberry-pis-at-home)).
5.  **Not wasting a trip.** Commuting students lose hours to classes cancelled or moved online after they set off ([Long commutes, cancelled classes and internships away](#long-commutes-cancelled-classes-and-internships-away)).
6.  **Company while working alone.** Solo students fake presence with videos and apps; nothing ties that presence to the people they actually study with ([Working alone: body doubling and study-with-me](#working-alone-body-doubling-and-study-with-me)).
7.  **Real, verifiable survey respondents.** FYP students beg for 50–150 respondents while paid respondent markets fabricate answers next door ([Group assignments and survey respondents](#group-assignments-and-survey-respondents)).

## Disconfirming signals and gaps

- **The check-in app's own critics:** a two-to-three-day delay ("a death notice, not an emergency warning"), false alarms from forgotten taps, a pivot from young users to eldercare and government procurement, and an unconfirmed report of removal. Builders of passive versions can't reach users ([Living alone and check-ins](#living-alone-and-check-ins)). Demand may be a January 2026 novelty spike as much as a lasting habit.
- **Tracking backlash:** the biggest location-sharing posts are against tracking adult students, so anything that watches students' movements risks rejection on sight.
- **Mesh is event-driven:** bitchat's surges cluster around outages and protests (Nepal and Indonesia in September 2025, India in July 2026, France in October 2026), with little everyday use visible between them; a medical student's "This is a CIA tool" post drew 1,191 likes and 85,167 views (25 Oct 2026) ([bitchat-cia]), and India removed it from app stores.
- **Old-phone posts are mostly influencer content:** the high-engagement "your old phone is a free…" posts follow an AI-growth template, and first-person, long-running household use is rare; distrust of connected appliances and smart TVs is louder ([Old phones and Raspberry Pis at home](#old-phones-and-raspberry-pis-at-home)).
- **Quiet Malaysian complaints:** outage posts are frequent but rarely pass 25 likes; the loud posts are political or about bills. This is evidence of frequency, not of willingness to install something.
- **Coverage gaps:** no APU-student posts about off-campus life surfaced under APU's name; APU's X footprint is official news and clubs. Malaysian students' remote-study and coverage problems (r05, r08) and Bukit Jalil water cuts (u01) returned nothing. Malaysian evidence on body doubling, old-phone builds and mesh messaging is absent. Dengue and heat are official messaging, not complaints. TikTok, Threads, Facebook groups and WhatsApp, where Malaysian students more likely discuss these topics, weren't searched in this pass.
- **Search artefacts:** the Top tab dropped query terms for Malaysia-keyword searches, and several queries were dominated by name collisions (see [Errors and limits](#errors-and-limits)), so per-theme counts are lower bounds on noise-free volume, not prevalence.

[bitchat-cia]: https://x.com/i/status/2114212799639367756

## See also

- [Social research](/docs/research/social.md): the earlier X, Reddit and other-platform pass on campus pain (buses, Wi-Fi, lifts, repairs, timetables, haze, admin replies, chatbot fatigue, judging), including the [access route to X](/docs/research/social.md#access-to-x) reused here.
- [Hackathon brief](/docs/BRIEF.md): rules, dates and judging outline.
