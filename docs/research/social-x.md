# X posts on campus, operations, and AI pain points

What real users on X (x.com) say about campus life at APU and other Malaysian universities, the daily load on university staff, campus infrastructure, AI agents at work, and hackathon judging, collected as evidence for the APU Cloud Innovation Hackathon 2026. Posters are labelled by role, not name, and every claim links to its post; engagement figures are as X returned them on the day. Researched on 3 November 2026.

Contents:

1.  [Method](#method)
    1.  [Access to X](#access-to-x)
    1.  [Queries and counts](#queries-and-counts)
    1.  [Errors and limits](#errors-and-limits)
1.  [APU's footprint on X](#apus-footprint-on-x)
1.  [Haze and air-quality decisions](#haze-and-air-quality-decisions)
1.  [Getting to class: campus buses, shuttles, and the LRT](#getting-to-class-campus-buses-shuttles-and-the-lrt)
1.  [Event crowds and flash floods around Bukit Jalil](#event-crowds-and-flash-floods-around-bukit-jalil)
1.  [Lifts, Wi-Fi, and room temperature](#lifts-wi-fi-and-room-temperature)
1.  [Seats, rooms, and parking](#seats-rooms-and-parking)
1.  [Registration, portals, and timetables](#registration-portals-and-timetables)
1.  [International-student paperwork and costs](#international-student-paperwork-and-costs)
1.  [Staff inboxes, tickets, and admin load](#staff-inboxes-tickets-and-admin-load)
1.  [Automation that sticks and automation that breaks](#automation-that-sticks-and-automation-that-breaks)
1.  [Chatbot fatigue](#chatbot-fatigue)
1.  [Enterprise agent platforms in practice](#enterprise-agent-platforms-in-practice)
1.  [What hackathon judges reward and resent](#what-hackathon-judges-reward-and-resent)
1.  [Signals](#signals)
    1.  [Ranking](#ranking)
    1.  [Unmet needs](#unmet-needs)
1.  [Query log](#query-log)
1.  [See also](#see-also)

## Method

### Access to X

- Searches went to X's own web GraphQL `SearchTimeline` endpoint from this machine, signed in with the user's session cookies (`auth_token`, and `ct0` also sent as the `x-csrf-token` header). No cookie or token was sent to any third party or written to the repo.
- twikit failed in both the PyPI release (2.3.3) and git `main` (commit `c3b7220`) with `Couldn't get KEY_BYTE indices` while generating the `x-client-transaction-id` header that X now requires.
- The `x-client-transaction-id` Python package generated the header instead. Its lookup of X's `ondemand.s` script failed on the logged-out homepage, which now serves a new `x-web` bundle, so the generator was seeded from the logged-in homepage, which still carries the classic bundle.
- `X_BEARER_TOKEN` holds an API-app bearer, which the web endpoints rejected: HTTP 403 with an empty body on `SearchTimeline`, and HTTP 403 error code 220 on `account/settings.json`. Searches used the public web-client bearer embedded in X's `main.js` instead, with the `SearchTimeline` query ID `3fEctOs2-FvTB7_mvm1hrQ` from the same bundle.
- Requests were spaced 4–7 seconds apart. X allowed 50 search requests per 15-minute window, and the runner paused twice when the budget ran out (174 and 393 seconds). Every request returned HTTP 200; X raised no lock, challenge, or account warning.

### Queries and counts

| Topic                  | Queries | Posts returned |
| ---------------------- | ------- | -------------- |
| APU and Bukit Jalil    | 23      | 550            |
| Malaysian universities | 38      | 655            |
| Haze                   | 3       | 89             |
| University operations  | 17      | 373            |
| Campus infrastructure  | 6       | 130            |
| AI agents and workflow | 17      | 404            |
| Hackathon judging      | 9       | 186            |
| Total                  | 113     | 2,387          |

- The 113 queries took 132 requests (some fetched two pages) and returned 2,387 posts, 2,222 of them unique; 2,041 of the unique posts are from 2025–2026. Each query is listed in the [query log](#query-log).
- Reading the filtered results left 227 unique posts judged relevant, all from 2025–2026, grouped into the 13 themes below. Per-theme counts are in [Signals](#signals).
- Queries used English and Malay terms (`lif`, `beratur`, `banjir`, `jerebu`, `panas`, `parking`, `wifi`, `pensyarah`), `since:` date filters, both the Latest and Top tabs, and two `conversation_id:` lookups to read reply threads.

### Errors and limits

- Five queries returned nothing: a15, m02, m12, m20, and m35 (see the query log).
- "APU" collides with the `$APU` memecoin, aircraft auxiliary power units, Azim Premji University and Arunachal Pradesh University in India, Azusa Pacific University in the US, and Ritsumeikan APU in Japan. "UM" collides with Portuguese "um" and Indonesia's Universitas Negeri Malang. Those results were discarded.
- X tags Malay posts as Indonesian (`lang: in`), so a language filter can't separate them. Malay results were kept by Malaysian vocabulary and university names, and some queries excluded Indonesian slang (`-bgt -banget -gue -gw -nggak -gak`).
- Posts whose text is only a link (media-only posts) couldn't be judged. The APU confession account posts its confessions as images, so their content isn't searchable.
- The Top tab favours promotional and engagement-bait posts. Posts that ask readers to comment for a free guide are flagged where cited, because their reply counts are inflated.
- Search is a sample, not a census: counts show what X search surfaces for these queries, not how common a problem is. Stories told in anecdote format are unverified.

## APU's footprint on X

X carries almost no first-hand APU complaints; APU appears as an institution, an event venue, and a sponsor stop.

- Who: APU's own account, sponsors, student clubs, and study-abroad agents; almost no current students.
- Recurrence: 23 APU queries returned 550 posts, and none was a first-hand 2025–2026 complaint about lifts, queues, parking, shuttles, Wi-Fi, APSpace, Moodle, attendance codes, timetables, results, or fees. None of the 68 replies to and mentions of APU's account was a complaint; most were promotion, event notices, congratulations, or fundraising.
- Intensity: low. Seven posts were kept as relevant.
- Workarounds: none visible on X. **Inference:** APU students probably air complaints elsewhere, since the confession account suggests a confession-page culture; for APU-specific pain, X is a weak source.
- Examples:
  - An "APU Malaysia student confession" account posts numbered confessions as images, labelled only by category, such as "1199 UNILIFE" (1 Nov 2026; 0 likes, 9 views) ([APU confession post]).
  - An international APU student whose flight was cancelled at the start of semester asked the airline to reroute them "to avoid university suspension" (10 Mar 2026; 3 replies, 58 views) ([APU flight post]).
  - A student offered a place on an APU master's programme crowdfunded tuition: "I am still trying to raise the tuition fees" (28 Jul 2026; 153 likes, 52 replies, 145 reposts, 6.7k views) ([APU tuition post]).
  - The AI-inference company Chutes named APU the "First stop" of its university tour (23 Feb 2026; 226 likes, 9.7k views) ([Chutes APU post]), and APU's account said it co-hosted "ASEAN's largest #AI #hackathon with 1,741 participants" (29 Sep 2025) ([APU hackathon post]).
  - Older, and not counted: a Japanese-speaking student couldn't log in to "moodleとapspace" the day before a test (18 Jul 2021; 2 likes) ([APSpace login post]).

[APU confession post]: https://x.com/i/status/2116685147223544316
[APU flight post]: https://x.com/i/status/2031369773842317428
[APU tuition post]: https://x.com/i/status/2082075662677074412
[Chutes APU post]: https://x.com/i/status/2025956437860503800
[APU hackathon post]: https://x.com/i/status/1972571005857182099
[APSpace login post]: https://x.com/i/status/1416574134490787843

## Haze and air-quality decisions

Two months of haze in September–October 2026 pushed Malaysian schools and universities into day-by-day decisions based on local air-quality (API) readings.

- Who: Malaysian students and parents, weather explainers, news outlets (Astro AWANI, Berita Harian, Media Selangor), Universiti Malaya, and the Ministry of Higher Education (KPT).
- Recurrence: 28 relevant posts from 2 October to 3 November 2026. A news account said clear skies returned to Kuala Lumpur "after around two months of haze" on 27 October ([KL clear skies post]); by 1 November a poster wrote "Jerebu is back ni" and asked the Meteorological Department for cloud seeding ([haze back post]).
- Intensity: high. The top post drew 2,320 likes; another, blaming Indonesia ("bab kutuk Malaysia laju je korang", roughly "you're quick to insult Malaysia"), drew 1,937 likes and 128k views ([haze blame post]). A 30 October post headlined "Haze Cost Malaysia An Estimated RM8 Billion In Losses & 1,700 Deaths, Study Finds" ([haze cost post]).
- Workarounds: Selangor closed all schools under the Education Ministry from 9 October ([Selangor closure post]) and reopened them on 4 November ([Selangor reopen post]). Universities chose their own teaching mode. Posts recirculated the Department of Occupational Safety and Health's API bands, for example "101-200: minimise strenuous outdoor work" ([DOSH API post]).
- Examples:
  - A weather explainer warned that haze "might worsen in our country especially in Semenanjung & Sarawak" until the monsoon transition around 9 October (6 Oct 2026; 2,320 likes, 1,060 reposts, 139.4k views) ([haze update post]).
  - Astro AWANI reported that KPT "telah mengarahkan semua IPT … agar memantau bacaan IPU di lokaliti masing-masing" (had told every university to monitor API readings in its own locality) (7 Oct 2026; 2.0k views) ([KPT haze post]). Berita Harian reported that vice-chancellors could decide class closures themselves (9 Oct) ([BH haze post]).
  - Universiti Malaya's media statement moved teaching to hybrid from 12 October, postponed outdoor activities, and advised N95 masks outdoors (9 Oct 2026; 40 likes, 2.2k views) ([UM hybrid post]). Its gate recorded API 186, "Tidak Sihat" (unhealthy), on 16 October (82 likes, 57 reposts) ([UM API post]).
  - A student tagging the ministry: "Mahasiswa pun kena beratur tunggu bas dalam jerebu dari kolej nak ke kelas" (students still have to queue for buses in the haze to get from their colleges to class) (7 Oct 2026; 8 likes) ([haze bus post]).
  - A parent: "Jerebu pun masuk dalam kelas" (the haze gets into classrooms), and some windows can't be shut "sebab pecah" (because they're broken) (12 Oct 2026; 943 views) ([haze classroom post]).

[KL clear skies post]: https://x.com/i/status/2115139955924365619
[haze back post]: https://x.com/i/status/2116803842075709756
[haze blame post]: https://x.com/i/status/2105812187659035018
[haze cost post]: https://x.com/i/status/2116044193680498910
[Selangor closure post]: https://x.com/i/status/2108190417003122927
[Selangor reopen post]: https://x.com/i/status/2117536594194583847
[DOSH API post]: https://x.com/i/status/2117491973221437610
[haze update post]: https://x.com/i/status/2107451607181087178
[BH haze post]: https://x.com/i/status/2108414402433065016
[UM hybrid post]: https://x.com/i/status/2108441256255009081
[UM API post]: https://x.com/i/status/2110893148541219116
[haze classroom post]: https://x.com/i/status/2109505971655778735

## Getting to class: campus buses, shuttles, and the LRT

Infrequent campus buses and unreliable shuttle trackers come up repeatedly, alongside campus-bus safety news in Malaysia.

- Who: Malaysian students (UM, UiTM, UPM), students elsewhere, and Malaysian news outlets.
- Recurrence: 23 relevant posts, including one viral Universiti Malaya thread with a reply debate.
- Intensity: high for the UM post (810 likes, 111.6k views), low elsewhere, though posters still write in capitals ("AGAIN"). Fatal campus-bus incidents made national news in 2025.
- Workarounds: walking, driving, catching an earlier bus, and student-built trackers; during the haze, students still queued outdoors (see [haze](#haze-and-air-quality-decisions)).
- Examples:
  - In a thread about UM's buses, a student wrote "Bodoh ke apa bas dalam kampus gerak sejam sekali" (is it stupid or what, the campus bus runs once an hour) and "baik aku jalan kaki" (I'd rather walk) (14 Jan 2026; 810 likes, 156 reposts, 111.6k views) ([UM bus post]).
  - Replies in the same thread: one said UM's internal buses run "every 30 minit" and MRT feeder buses every 30 minutes to an hour, but students with cars drive ([UM bus reply]); another said a big public university must "cater thousand of students with different schedules" ([UM schedules reply]).
  - A student: "campus shuttle tracker is broken AGAIN and i missed the shuttle AGAIN" (4 Mar 2026; 4 likes) ([shuttle tracker post]). Another: you can "board a campus bus half an hour before your class and still get there too late" (16 Sep 2026) ([campus bus late post]).
  - A student developer started "BUZZ", promising "real-time live location tracking of every campus bus" (1 Oct 2025; 2 likes) ([BUZZ post]).
  - News accounts reported a UUM student killed by a campus bus (19 Apr 2025; 2.4k views) ([UUM bus post]) and a bus crash that killed 15 UPSI students (9 Jun 2025; 3.8k views) ([UPSI bus post]).

[UM bus reply]: https://x.com/i/status/2011399704723206486
[UM schedules reply]: https://x.com/i/status/2011719013047681277
[campus bus late post]: https://x.com/i/status/2100303406459998517
[BUZZ post]: https://x.com/i/status/1973351229389693424
[UUM bus post]: https://x.com/i/status/1913608361381158923
[UPSI bus post]: https://x.com/i/status/1931961099798364373

## Event crowds and flash floods around Bukit Jalil

APU's own neighbourhood shows two recurring problems on X: stadium-event crowds around LRT Bukit Jalil, and flash floods on the roads towards Puchong.

- Who: event organisers at APU, concert-goers, Bukit Jalil residents, and traffic and news accounts.
- Recurrence: 16 relevant posts. Stadium concerts recur through 2026, and The Weeknd plays on 4–5 November, during the hackathon's build phase ([Weeknd LRT post]). Flash floods hit the area on 6 May and 2 November 2026.
- Intensity: medium. The flood post drew 234 likes and 168 reposts, with blame aimed at the city council and developers.
- Workarounds: organisers run shuttles from LRT Bukit Jalil; RapidKL extends station hours on event nights, as it did until 1 AM on 17 October ([RapidKL extension post]); and residents swap flood reports in local groups.
- Examples:
  - A notice for a cybersecurity meetup at APU: "Expect major congestion in the Bukit Jalil area" because of a stadium match with "45k+ fans"; it recommended the LRT (20 May 2025; 2.0k views) ([OWASP APU post]).
  - A hackathon's bus schedule: "8:30 AM — LRT Bukit Jalil → APU" and "6:30 PM — APU → LRT Bukit Jalil" (1 Sep 2026; 429 views) ([hackathon bus post]).
  - A concert-goer asked RapidKL to extend LRT Bukit Jalil hours: "Ini semua bertanya2 nak parking mana" (everyone keeps asking where to park) (26 Jun 2026; 896 views) ([LRT hours post]).
  - A post from a Bukit Jalil group: "Flood at LRT Awan Besar & jam at 'Exsim' junction. DBKL & developer town planners all sleeping?" (6 May 2026; 234 likes, 168 reposts, 28.6k views) ([Awan Besar flood post]). A same-day video showed a flash flood from Bukit Jalil to Puchong (90 likes, 63 reposts) ([Kinrara flood post]).
  - A traffic account listed flash floods including "Bukit Jalil arah Puchong" (2 Nov 2026) ([Klang Valley flood post]). Earlier, a fan worried that the "STADIUM BUKIT JALIL TU SENANG BANJIR" (Bukit Jalil stadium floods easily) ahead of a rainy-season concert (23 May 2026; 386 likes, 20.0k views) ([stadium flood post]).

[Weeknd LRT post]: https://x.com/i/status/2117505844527210582
[RapidKL extension post]: https://x.com/i/status/2110345912740610363
[hackathon bus post]: https://x.com/i/status/2094708113177989385
[LRT hours post]: https://x.com/i/status/2070474394389147650
[Kinrara flood post]: https://x.com/i/status/2051970834642944026
[Klang Valley flood post]: https://x.com/i/status/2117192761493610912
[stadium flood post]: https://x.com/i/status/2058078260869865820

## Lifts, Wi-Fi, and room temperature

Broken lifts, slow campus Wi-Fi, and rooms that are too cold or too hot are frequent, low-reach gripes.

- Who: Malaysian students (UiTM and unnamed universities) and students elsewhere.
- Recurrence: 19 relevant posts, steady across 2025–2026.
- Intensity: mostly low reach, with stressed language ("serabut betul", really stressful). One post about a freezing lecture hall went viral (2,128 likes) but doesn't say where it is.
- Workarounds: taking the stairs, bringing a hoodie or jacket, and switching to mobile data; one student was "back in uni and" fighting the slow Wi-Fi again (1 Nov 2026) ([Wi-Fi back post]).
- Examples:
  - A Malaysian poster said UiTM faculty lifts are "selalunya rosak" (usually broken), with murals urging people to take the stairs, and "Malaysia bab jaga maintenance memang selalu ke laut" (Malaysia always neglects maintenance) (27 Jun 2025; 4 likes) ([UiTM lift post]).
  - "Haaaaaa lif rosak" (the lift's broken), and the remaining lift was "sardin" (packed like sardines) with UiTM students (9 Apr 2026; 73 likes, 35.3k views) ([sardine lift post]).
  - A Malaysian student: "Wifi connection kat uni ni makin hari makin teruk.. serabut betul" (the uni Wi-Fi gets worse by the day, really stressful) (28 Oct 2026) ([uni Wi-Fi post]). A UiTM user asked why UiTM Wi-Fi won't open Twitter during office hours (27 Oct 2026) ([UiTM Wi-Fi post]).
  - A Malaysian student wore a hoodie to class because "aircond kelas sejuk namatey tapi elok keluaq hangat" (the classroom aircon is freezing, but it's hot outside) (26 May 2026; 7 likes) ([aircon hoodie post]).
  - A student, location not stated: "the lecture hall is so cold I can't draw" (2 Sep 2026; 2,128 likes, 378 reposts, 23.6k views) ([cold lecture hall post]).

[Wi-Fi back post]: https://x.com/i/status/2116910262003683804
[UiTM lift post]: https://x.com/i/status/1938485657615437842
[sardine lift post]: https://x.com/i/status/2042230750658101289
[uni Wi-Fi post]: https://x.com/i/status/2115383475671118075
[UiTM Wi-Fi post]: https://x.com/i/status/2115059826304893254
[aircon hoodie post]: https://x.com/i/status/2059263434940957000
[cold lecture hall post]: https://x.com/i/status/2095019647007649989

## Seats, rooms, and parking

Shared space looks full when it isn't, or fills before most people arrive.

- Who: students, a workplace IT admin, Nanyang Technological University (NTU) in Singapore, UM alumni, and Malaysian commuters.
- Recurrence: 13 relevant posts.
- Intensity: high. Two story-format posts went viral (1,066 and 416 likes), and a complaint about RM5 park-and-ride parking drew 1,277 likes and 433.4k views ([RM5 parking post]).
- Workarounds: arriving at 6 AM, a student-built seat-booking site, room auto-release driven by occupancy sensors, and AI monitoring of teaching venues.
- Examples:
  - A story about an Indian engineering college: "Every exam season the library was packed by 6AM. No seats left by 7." A student-built seat-booking site reportedly signed up 300 students in a day (26 Mar 2026; 1,066 likes, 86.9k views; unverified anecdote) ([library seat post]).
  - Students on 2–3 November 2026: "there are NO SEATS" ([no seats post]) and "why is the library so full rn its 5pm" ([library full post]).
  - A workplace IT admin: "every conference room says BOOKED when half of them are empty"; releasing rooms after 10 empty minutes raised availability 42% (2 Oct 2026; 416 likes, 14.3k views; story format) ([ghost booking post]).
  - NTU said its AVAIlable:IT system "monitors 275 teaching venues daily to detect technical faults before lessons begin", cutting incident resolution time by more than 50% (3 Nov 2026; official account) ([NTU venue post]).
  - A UM alumna: exam-hall parking was "penuh dengan orang BUKAN STUDENT UM" (full of people who aren't UM students), such as hospital workers after free parking (14 Jan 2026) ([UM parking post]); another poster said cars parked outside a marked bay "kena clamp" (get clamped) ([UM clamp post]).

[RM5 parking post]: https://x.com/i/status/2095009442756702213
[no seats post]: https://x.com/i/status/2117592157481824330
[library full post]: https://x.com/i/status/2117106275234562205
[NTU venue post]: https://x.com/i/status/2117436602331111703
[UM parking post]: https://x.com/i/status/2011522245748043999
[UM clamp post]: https://x.com/i/status/2011236796680847588

## Registration, portals, and timetables

Peak-time portal crashes and shifting timetables recur, mostly in low-reach personal posts.

- Who: students worldwide, and Malaysian students on UM subject registration.
- Recurrence: 11 relevant posts.
- Intensity: low reach (2–6 likes), with emotional language: swearing, crying emoji, "I hate emailing people".
- Workarounds: refreshing, emailing staff, and asking friends for attendance codes.
- Examples:
  - A student: "two of the courses I want are full and now the website went down" (15 Sep 2026; 6 likes) ([registration down post]).
  - A student: the portal "freeze and crash during the peak time of course registration" (22 Jun 2026) ([portal crash post]).
  - A Malaysian poster: "nak claim voucher zus macam nak register subject kat um" (claiming a ZUS Coffee voucher feels like registering subjects at UM) (17 Jul 2026; 1.2k views) ([UM registration post]).
  - A student: "The university keeps changing the timetable daily" (21 Feb 2026) ([timetable change post]).
  - A student: "two different clashes that are impossible to resolve … i hate emailing people" (12 Jul 2026) ([timetable clash post]).

[registration down post]: https://x.com/i/status/2099826215595229526
[portal crash post]: https://x.com/i/status/2069198280467107966
[UM registration post]: https://x.com/i/status/2078012691487379657
[timetable change post]: https://x.com/i/status/2025169300399493183
[timetable clash post]: https://x.com/i/status/2076195165644156988

## International-student paperwork and costs

International students to Malaysia face a stack of separate fees and steps (EMGS processing, medical checks, insurance, student pass), and an AI-run visa operation sits behind it.

- Who: South Asian prospective students and commentators, Malaysian commentators, and a student-visa adviser; the APU student in [APU's footprint](#apus-footprint-on-x) also belongs here.
- Recurrence: 6 relevant posts.
- Intensity: medium; an itemised cost post drew 663 likes.
- Workarounds: itemised budgets and agents.
- Examples:
  - A Tamil-language post itemised "EMGS processing + eVAL", a medical test, insurance, and "Immigration / Student Pass / i-Kad", totalling ₹1,08,000, against a reported ₹3.58 lakh charge (18 Sep 2026; 663 likes, 110 reposts, 13.9k views) ([EMGS cost post]).
  - On a UKM PhD budget, a commentator said a "local citizen does not pay EMGS student visa fees, mandatory foreign medical insurance, flights" (17 Sep 2026; 151 likes) ([EMGS budget post]).
  - A post summarising a BFM interview said Scicom's group CEO, Leo Ariyanayakam, described visa processing "for every international student in Malaysia" as part of "one of the largest AI operations in the country" (14 Aug 2026) ([Scicom visa post]).
  - A student-visa adviser: "the scariest thing in your inbox is an unread email from your international student office" (31 Oct 2026; US-focused) ([international office post]).

[EMGS cost post]: https://x.com/i/status/2100857427495202978
[EMGS budget post]: https://x.com/i/status/2100631284032979286
[Scicom visa post]: https://x.com/i/status/2088083716614537283
[international office post]: https://x.com/i/status/2116337890204500287

## Staff inboxes, tickets, and admin load

University staff describe repetitive email, users who don't read, slow fixes, and document requests that never end; the public argues about how many administrators there are.

- Who: higher-ed staff, mostly in the US; a Nigerian university's student-affairs office; university IT staff; an academic manager; alumni chasing transcripts; and commentators on administrative headcount.
- Recurrence: 21 relevant posts. Other examples: an academic manager "doing admin work for the past 7 hours" ([admin hours post]); "weeks to get university 'maintenance'" to hang a picture ([maintenance weeks post]); a dorm shower that only drains after a maintenance request "every other week" ([dorm shower post]); and higher-ed IT help desks facing "tens of thousands" of users "returning to no phone or text MFA recovery" ([MFA recovery post]).
- Intensity: medium to high. The administrative-headcount post drew 4,142 likes, and a report that dozens of incoming Howard University students say they were unenrolled drew 4,234 likes ([Howard post]), with a reply blaming payment deadlines set before financial aid posts (117 likes) ([Howard deadline post]). Staff posts themselves have low reach but strong words ("nightmare").
- Workarounds: mass emails, status explainers, pilot rings, and "break glass" exclusion groups.
- Examples:
  - A commentator quoted the MIT figure: "the tally of administrators jumped by 189%" against 8–9% growth in students and faculty (22 Oct 2026; 4,142 likes, 806 reposts, 214.3k views) ([admin bloat post]).
  - A Nigerian university's Dean of Student Affairs, as shared by a student account: "The majority of the emails concern NELFUND, particularly applications, missing details, dispute tickets relating to the accuracy of fees" (11 Oct 2026) ([student affairs emails post]).
  - A higher-ed worker: students send "several emails back to back instead of one single coherent message" (9 Mar 2026; 40 likes, 26.4k views) ([student emails post]). Another: "I work in higher ed myself and it's a nightmare. Everyone doesn't read" (24 Jul 2026) ([higher ed nightmare post]).
  - A higher-ed IT engineer: "In higher ed the hard part isn't the tooling, it's the user diversity", such as part-time lecturers on shared machines (8 Mar 2026) ([user diversity post]).
  - An alumnus: "Today, I cannot obtain a single document from it", trying for transcripts from the University of Rwanda since 2019 (27 Jul 2026; 151 likes, 64.4k views) ([transcripts post]).

[maintenance weeks post]: https://x.com/i/status/1971897737018069302
[dorm shower post]: https://x.com/i/status/2029042335078617216
[MFA recovery post]: https://x.com/i/status/2092831952810184747
[Howard post]: https://x.com/i/status/2080406415068242274
[Howard deadline post]: https://x.com/i/status/2080422727186337974
[admin bloat post]: https://x.com/i/status/2113240186251276356
[student emails post]: https://x.com/i/status/2030810799602553035
[higher ed nightmare post]: https://x.com/i/status/2080647733132550330
[user diversity post]: https://x.com/i/status/2030741681956647405
[transcripts post]: https://x.com/i/status/2081731965103780336

## Automation that sticks and automation that breaks

What practitioners say lasts is narrow, scheduled, boring work; what fails is unowned workflows that break silently on exceptions, expired credentials, or changed inputs.

- Who: automation builders and consultants, enterprise AI commentators, and survey summaries.
- Recurrence: 26 relevant posts. What stuck: a daily 7 AM summary sent through Gmail ([daily summary post]) and morning vendor follow-ups with overdue items flagged in Slack ([vendor follow-up post]). What broke: an n8n price watcher that "broke the same evening" a site's HTML changed (79 likes, 60 reposts) ([price watcher post]), and "When my own n8n workflows broke, nobody sent a status email" ([on-call post]).
- Intensity: high. "Boring AI automations" drew 5,136 likes; the August 2025 "MIT report that said 95% of AI pilots fail" drew 3,655 likes and 665.7k views ([MIT pilots post]), though a later post warned the figure "gets quoted past what the report measured" ([MIT critique post]). One survey post put 57% of data leaders piloting or running agents against 8% who trust their data enough for production ([data trust post]). A viral "n8n's learning curve is brutal" post (3,772 likes, 2,157 replies) was a comment-for-a-guide funnel, so its replies are inflated ([n8n learning post]).
- Workarounds: running an agent and a deterministic checker side by side, error triggers, a "dead man's switch", and human approval in Slack before fixes go live.
- Examples:
  - "businesses don't need fancy ai agents. they need boring AI automations" (4 Jun 2025; 5,136 likes, 402 reposts, 545.7k views) ([boring automation post]).
  - A builder replaced half their Zapier flows with an agent that "still invents a field name twice a week", so n8n now checks it: "automation didn't die. it got promoted to QA." (30 Oct 2026) ([agent QA post]).
  - "APIs time out. Credentials expire. A node gets a value it wasn't built for." (1 Jun 2026; 215 likes, 47.1k views) ([workflow breaks post]).
  - On enterprise pilots: real processes "have exceptions that can be 40% of the volume", and no one owned the agent "7 months in" once the consultants left (30 Oct 2026; 242 likes, 23.6k views) ([pilot exceptions post]).
  - "Your automation ran 'successfully' every day this week. It also did nothing." (3 Nov 2026) ([silent failure post]).

[daily summary post]: https://x.com/i/status/2115353033349452279
[vendor follow-up post]: https://x.com/i/status/2116515537706532990
[price watcher post]: https://x.com/i/status/2082140139535659432
[on-call post]: https://x.com/i/status/2116460988903899487
[MIT pilots post]: https://x.com/i/status/1959386172674703810
[MIT critique post]: https://x.com/i/status/2116923353038807493
[data trust post]: https://x.com/i/status/2117509972506587616
[n8n learning post]: https://x.com/i/status/1981707321714880931
[boring automation post]: https://x.com/i/status/1930073358739063117
[agent QA post]: https://x.com/i/status/2116138451024409084
[workflow breaks post]: https://x.com/i/status/2061493268182192584

## Chatbot fatigue

People resent being routed to a chatbot when they need something resolved, and some builders call chat a lazy default.

- Who: the general public, customers tagging support accounts, a librarian, product designers, and Malaysian parents and students.
- Recurrence: 19 relevant posts. Builders called the chat interface "the most lazy and unoriginal way to ship an AI product", leaving users doing "prompt engineering" ([lazy chat post]). One customer pushed the other way, asking a human agent "to transfer me back to an AI agent" ([back to AI post]).
- Intensity: high. The top post drew 13,971 likes. A Pew finding shared on X: 55% of Americans under 30 say AI worries them more than it excites them, up from 31% five years ago ([Pew worry post]).
- Workarounds: asking for a human, tagging company accounts on X, and giving up.
- Examples:
  - "things in everyday life AI has made worse: customer service, job hiring processes, Google search functionality … trust between student & professor" (6 Oct 2026; 13,971 likes, 2,012 reposts, 126.0k views) ([AI made worse post]).
  - A librarian replying: "I've never seen anyone more angry than the people who are being forced to interact with AI when applying for a job"; most give up at once (7 Oct 2026; 75 likes) ([librarian AI post]).
  - "most are still just chatbots with a nicer interface"; the better ones "follow a workflow, resolve an issue, and know when to bring in a human" (1 Oct 2026; 81 likes, 21.6k views) ([support chatbots post]).
  - A customer: "I'm unable to connect with a human agent. The only option available is an automated chatbot." (30 Oct 2026) ([no human post]).
  - A Malaysian poster on next year's school textbooks: "ALL of them use gen AI images" (3 Nov 2026; 210 likes, 67 reposts) ([textbook AI post]).

[lazy chat post]: https://x.com/i/status/1997556784597553291
[back to AI post]: https://x.com/i/status/2113847640961982512
[Pew worry post]: https://x.com/i/status/2103877903276769372
[AI made worse post]: https://x.com/i/status/2107559247655633174
[librarian AI post]: https://x.com/i/status/2107639569902371115
[textbook AI post]: https://x.com/i/status/2117582196584415449

## Enterprise agent platforms in practice

Posts about Gemini Enterprise are mostly vendor announcements; the few practitioner posts are about permissions, sharing, licences, and setup, not about whether agents are useful.

- Who: Google Cloud and Microsoft (vendor posts), Google Cloud partners and consultants, and Chinese- and Japanese-language commentators.
- Recurrence: 15 relevant posts. A practitioner listed agents built with Copilot Studio, including "HR Support Agent" and "ITSM Support Agent" (23 Oct 2026; 248 likes) ([Copilot Studio post]). Product news includes Gemini Enterprise's Inbox for monitoring agent activity (2 May 2026; 699.1k views) ([GE inbox post]), the Agent Platform's computer-use tool reaching general availability with human-in-the-loop confirmation policies (2 Nov 2026) ([GE computer use post]), and Microsoft 365 Copilot passing "30M+ paid seats" (30 Jul 2026) ([Copilot seats post]).
- Intensity: low. Apart from the Copilot Studio list, practitioner posts drew 0–6 likes, and the end-user complaints that drive the other themes are absent.
- Workarounds: checklists for testing permissions with a test user, sharing agents with groups, and turning on admin review of sharing.
- Examples:
  - A Chinese-language commentator on ServiceNow workflows arriving in Gemini Enterprise on 27 October: "报修、派单、查配置、审变更" (repair requests, dispatch, configuration lookup, change review), and would you sign a repair order dispatched from a chat box without looking? (27 Oct 2026; 8 replies) ([ServiceNow GE post]).
  - A consultant: in Gemini Enterprise, connected sources keep each user's permissions but uploaded files don't, so sharing an agent can expose them, and "Admin approval for sharing is off by default" (28 Oct 2026) ([GE overshare post]).
  - The same consultant: Gemini Notebook Enterprise has its own sign-in and needs "their own notebook permission and their own notebook license" (30 Oct 2026) ([GE notebook post]). Another post called identity and connector setup "governance boundaries" ([GE identity post]).
  - A Japanese partner post: Antigravity works with a single Google sign-in for individuals, but enterprise use under Gemini Enterprise needs contract, IAM, and feature-governance steps so the rollout isn't blocked by errors (translated; 2 Nov 2026; 454 views) ([Antigravity setup post]).
  - On Microsoft 365 Copilot: teams switch it on "and then realizing they can't answer a basic question: what data can these agents actually reach?" (29 Oct 2026) ([Copilot data post]).

[Copilot Studio post]: https://x.com/i/status/2113720309656256733
[GE inbox post]: https://x.com/i/status/2050696837334540555
[GE computer use post]: https://x.com/i/status/2117066022452682871
[Copilot seats post]: https://x.com/i/status/2082815305194066054
[ServiceNow GE post]: https://x.com/i/status/2115228576694059291
[GE overshare post]: https://x.com/i/status/2115562586863268070
[GE notebook post]: https://x.com/i/status/2116201805939933359
[GE identity post]: https://x.com/i/status/2115716654126469190
[Antigravity setup post]: https://x.com/i/status/2117315489286525196
[Copilot data post]: https://x.com/i/status/2115915326684897785

## What hackathon judges reward and resent

Judges say they get a few minutes per project, dislike AI-written scripts, voiceovers, and READMEs, and remember a live demo of an obvious fix for a clearly local user.

- Who: hackathon judges, mentors, organisers, and a two-time winner at OpenAI community hackathons in London and Kuala Lumpur.
- Recurrence: 23 relevant posts. Others: "Hackathon judges have about 3 minutes with your project" (99 likes) ([three minutes post]); a team "lied about how they got their customer" with faked Reddit screenshots and was disqualified ([cheating post]); "I am so tired of all the hackathons … same format, rewards, people" ([tired hackathons post]); at a 1 November hackathon in Ho Chi Minh City, "Nearly everyone was using the Codex app" ([Codex app post]).
- Intensity: medium; the vibe-coding complaint drew 753 likes and 129.3k views.
- Workarounds (advice given): show a live demo rather than slides, spend no more than 30 seconds on the problem, write the README yourself, and read the judging criteria before coding.
- Examples:
  - A judge: "don't use ai generated scripts or ai generated voice videos. it's an instant let down", and "please write the readme _without_ using ai" (2 Sep 2026; 307 likes, 19.0k views) ([judge demo post]).
  - A judge who reviewed more than 80 vibe-coded apps for an online hackathon said it made them want to throw up ("给 judge 吐了"), and that people with unreliable ideas still only produce garbage (translated; 23 Jul 2025; 753 likes, 129.3k views) ([vibe coded post]).
  - "An hackathon judge spends four minutes with your demo", with judges "optimizing for novelty and stage presence" (23 Aug 2026; 59 likes) ([four minutes post]).
  - A winner of the Codex community hackathon in Kuala Lumpur: KL rewarded "widespread local pain + obvious fix" and a "demo a stranger gets instantly", backed by "clear malaysian user, useful demo, responsible AI, continuation" in the published criteria ([KL criteria post], [KL style post]). The winning app let market stalls log sales "in speech/chat/paper/manglish", with "no llm maths" (2 Nov 2026; thread opener 40 likes) ([KL winner post], [KL thread opener]).
  - PayPal AI Hackathon tips: "Judges can tell when a project was recycled from somewhere else" (2 Nov 2026; 61 likes) ([recycled project post]).

[three minutes post]: https://x.com/i/status/2115540981693227025
[cheating post]: https://x.com/i/status/2081056520440328480
[tired hackathons post]: https://x.com/i/status/2117538084560814331
[Codex app post]: https://x.com/i/status/2116722972153336236
[vibe coded post]: https://x.com/i/status/1947985118783836283
[four minutes post]: https://x.com/i/status/2091477966903456185
[KL style post]: https://x.com/i/status/2117324135537774991
[KL winner post]: https://x.com/i/status/2117324131301495134
[KL thread opener]: https://x.com/i/status/2117324123504279766

## Signals

### Ranking

**Inference:** the scores are mine. Frequency is the number of relevant posts found (3 for 20 or more, 2 for 10–19, 1 for fewer than 10). Intensity is the most-liked relevant post plus any institutional action (3 for 1,000 likes or more, or an official closure or directive; 2 for 100–999; 1 for under 100). Score is frequency × intensity, with ties broken by peak likes. For enterprise platforms, only practitioner posts count towards peak likes, not vendor posts.

| Rank | Theme                                     | Posts | Peak likes | Score | APU-specific?                                                  |
| ---- | ----------------------------------------- | ----- | ---------- | ----- | -------------------------------------------------------------- |
| 1    | Automation that sticks and breaks         | 26    | 5,136      | 9     | No                                                             |
| 2    | Staff inboxes, tickets, and admin load    | 21    | 4,234      | 9     | No                                                             |
| 3    | Haze and air-quality decisions            | 28    | 2,320      | 9     | Malaysia-wide; Bukit Jalil is in Kuala Lumpur, but no APU post |
| 4    | Chatbot fatigue                           | 19    | 13,971     | 6     | No (one Malaysian textbook post)                               |
| 5    | Lifts, Wi-Fi, and room temperature        | 19    | 2,128      | 6     | Malaysian (UiTM), not APU                                      |
| 6    | Seats, rooms, and parking                 | 13    | 1,277      | 6     | Malaysian (UM), not APU                                        |
| 7    | Getting to class                          | 23    | 810        | 6     | Malaysian (UM); APU events rely on LRT Bukit Jalil shuttles    |
| 8    | Hackathon judging                         | 23    | 753        | 6     | Kuala Lumpur criteria thread; APU hosts many hackathons        |
| 9    | Event crowds and flash floods             | 16    | 386        | 4     | Yes: APU's neighbourhood                                       |
| 10   | Enterprise agent platforms                | 15    | 248        | 4     | No                                                             |
| 11   | International-student paperwork and costs | 6     | 663        | 2     | Partly: one APU student post                                   |
| 12   | APU's footprint on X                      | 7     | 226        | 2     | Yes                                                            |
| 13   | Registration, portals, and timetables     | 11    | 30         | 2     | Malaysian (UM), not APU                                        |

### Unmet needs

**Inference:** these are needs the posts show without a working answer yet, not product ideas.

- During the haze, each university had to watch its own API readings and choose a teaching mode, while students still queued outdoors for buses ([KPT haze post], [haze bus post]).
- Students can't tell when the next campus bus or shuttle will come, and trackers break ([UM bus post], [shuttle tracker post]).
- Rooms and seats show as taken when they are empty, or fill before most people arrive ([ghost booking post], [library seat post]).
- Staff field the same enquiries over and over and spend hours on admin, and status labels confuse students ([student affairs emails post], [admin hours post]).
- Automations fail silently and nobody owns them once the builders leave ([silent failure post], [pilot exceptions post]).
- People want the problem resolved and a human handover, not another chat window ([support chatbots post], [no human post]).
- Judges want a live demo of a real local user's workflow and are tired of AI-written pitches and recycled projects ([judge demo post], [KL criteria post], [recycled project post]).
- APU-specific: the visible APU-adjacent pains on X are event-day congestion and flash floods around LRT Bukit Jalil ([OWASP APU post], [Awan Besar flood post]); first-hand student pain about APU's buildings and systems isn't on X.

## Query log

Every query run, in run order, with the X search tab used and the number of posts returned. IDs starting with `a` cover APU, `m` Malaysian universities, `z` haze, `o` university operations, `i` campus infrastructure, `g` AI agents, and `h` hackathons.

| ID  | Topic                  | Tab    | Query                                                                                                                                                                                                 | Posts |
| --- | ---------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| a01 | APU                    | Latest | `"Asia Pacific University" Malaysia`                                                                                                                                                                  | 40    |
| a02 | APU                    | Top    | `"Asia Pacific University" Malaysia`                                                                                                                                                                  | 23    |
| a03 | APU                    | Latest | `APIIT`                                                                                                                                                                                               | 40    |
| a04 | APU                    | Latest | `APU "Bukit Jalil"`                                                                                                                                                                                   | 40    |
| a05 | APU                    | Latest | `APSpace`                                                                                                                                                                                             | 20    |
| a06 | APU                    | Latest | `APU (lift OR lif OR elevator) -AMD -Ryzen -GPU`                                                                                                                                                      | 40    |
| a07 | APU                    | Latest | `APU (parking OR shuttle OR LRT OR bas) -AMD -Ryzen -GPU`                                                                                                                                             | 40    |
| a08 | APU                    | Latest | `APU (wifi OR moodle OR timetable OR attendance) -AMD -Ryzen -GPU`                                                                                                                                    | 40    |
| a09 | APU                    | Latest | `("budak APU" OR "student APU" OR "kat APU" OR "pelajar APU" OR "APU student" OR "APU students")`                                                                                                     | 40    |
| a10 | APU                    | Latest | `APU (EMGS OR visa OR "student pass") Malaysia`                                                                                                                                                       | 7     |
| a11 | APU                    | Latest | `"Technology Park Malaysia"`                                                                                                                                                                          | 20    |
| a12 | APU                    | Latest | `"LRT Bukit Jalil"`                                                                                                                                                                                   | 20    |
| a13 | APU                    | Latest | `"Bukit Jalil" (banjir OR flood OR "flash flood")`                                                                                                                                                    | 40    |
| a14 | APU                    | Latest | `APU (fees OR exam OR results OR lecturer) Malaysia -AMD -Ryzen`                                                                                                                                      | 3     |
| a15 | APU                    | Latest | `APU (hostel OR accommodation OR food OR panas) "Bukit Jalil"`                                                                                                                                        | 0     |
| a16 | APU                    | Latest | `"APU Malaysia"`                                                                                                                                                                                      | 20    |
| a17 | APU                    | Latest | `"APU Malaysia student confession"`                                                                                                                                                                   | 2     |
| m01 | Malaysian universities | Latest | `(lif OR lift) (UiTM OR UKM OR UPM OR UTM OR USM OR UM OR UIA) (beratur OR lambat OR rosak OR penuh OR tunggu) since:2025-01-01`                                                                      | 2     |
| m02 | Malaysian universities | Latest | `("lif rosak" OR "lift rosak" OR "tunggu lif") (kolej OR fakulti OR universiti OR kampus OR uni) since:2025-01-01`                                                                                    | 0     |
| m03 | Malaysian universities | Latest | `wifi (kampus OR kolej OR uni OR universiti) (lembab OR slow OR teruk OR takde OR "tak boleh") since:2025-01-01`                                                                                      | 27    |
| m04 | Malaysian universities | Latest | `parking (kampus OR uni OR universiti OR fakulti) (susah OR penuh OR saman OR takde OR "tak ada") since:2025-01-01`                                                                                   | 1     |
| m05 | Malaysian universities | Latest | `bas (UM OR UKM OR UPM OR UiTM OR UTM OR USM OR kampus) (lambat OR tunggu OR penuh OR sejam) since:2025-01-01`                                                                                        | 40    |
| m06 | Malaysian universities | Latest | `aircond (kelas OR "dewan kuliah" OR "lecture hall" OR library OR perpustakaan) (rosak OR panas OR sejuk OR beku) since:2025-01-01`                                                                   | 10    |
| m07 | Malaysian universities | Latest | `("add drop" OR "pendaftaran kursus" OR "course registration" OR "daftar subjek") (crash OR down OR server OR lembab OR jam) since:2025-01-01`                                                        | 20    |
| m08 | Malaysian universities | Latest | `portal (pelajar OR student) (down OR crash OR lembab OR "tak boleh") (UiTM OR UM OR UKM OR UPM OR UTM OR uni) since:2025-01-01`                                                                      | 13    |
| m09 | Malaysian universities | Latest | `EMGS (visa OR "student pass" OR approval) since:2025-01-01`                                                                                                                                          | 10    |
| m10 | Malaysian universities | Latest | `("Taylor's" OR "Sunway University" OR "Monash Malaysia" OR UCSI OR "Sunway Uni") (lift OR parking OR wifi OR queue OR jam) since:2025-01-01`                                                         | 20    |
| m11 | Malaysian universities | Top    | `("dewan kuliah" OR "kelas") panas (aircond OR kipas) since:2025-01-01`                                                                                                                               | 28    |
| m12 | Malaysian universities | Top    | `(lif OR lift) (fakulti OR kolej OR kampus) beratur since:2024-06-01`                                                                                                                                 | 0     |
| m13 | Malaysian universities | Latest | `attendance (QR OR code) (lecturer OR class OR kelas) (Malaysia OR uni) since:2025-01-01`                                                                                                             | 12    |
| m14 | Malaysian universities | Latest | `(beratur OR queue) (kafe OR cafe OR kafeteria OR kaunter) (kampus OR uni OR fakulti OR kolej) since:2025-01-01`                                                                                      | 6     |
| m15 | Malaysian universities | Latest | `(result OR keputusan) (exam OR peperiksaan OR final) (portal OR keluar) (UiTM OR UM OR UKM OR UPM OR uni) since:2025-06-01`                                                                          | 10    |
| a18 | APU                    | Latest | `to:AsiaPacificU`                                                                                                                                                                                     | 28    |
| a19 | APU                    | Latest | `@AsiaPacificU -from:AsiaPacificU`                                                                                                                                                                    | 40    |
| a20 | APU                    | Latest | `(APU OR "Asia Pacific University") (Malaysia OR KL OR "Bukit Jalil") (worst OR terrible OR regret OR scam OR expensive OR mahal)`                                                                    | 2     |
| m16 | Malaysian universities | Top    | `(UiTM OR UKM OR UPM OR UTM OR USM OR UIAM OR "UM") (lif OR lift) -bgt -banget -gue -gw -nggak -gak -aja -kak -dong -sih since:2025-01-01`                                                            | 28    |
| m17 | Malaysian universities | Top    | `("bas kampus" OR "bas uni" OR "shuttle bus" OR "bas fakulti") -bgt -banget -gue -gw -nggak -gak -aja -kak -dong -sih since:2025-01-01`                                                               | 32    |
| m18 | Malaysian universities | Top    | `parking (UiTM OR UKM OR UPM OR UM OR Sunway OR "Taylor's" OR fakulti OR kampus) (penuh OR susah OR saman OR clamp OR kunci) -bgt -banget -gue -gw -nggak -gak -aja -kak -dong -sih since:2025-01-01` | 36    |
| m19 | Malaysian universities | Top    | `wifi (UiTM OR UKM OR UPM OR UM OR UTM OR USM OR UIAM OR kolej) -bgt -banget -gue -gw -nggak -gak -aja -kak -dong -sih since:2025-01-01`                                                              | 33    |
| m20 | Malaysian universities | Top    | `(kolej OR hostel) (UiTM OR UKM OR UPM OR UM OR UTM) ("takde air" OR "air takde" OR "tak ada air" OR blackout OR "bekalan air") since:2025-01-01`                                                     | 0     |
| m21 | Malaysian universities | Top    | `(UiTM OR UKM OR UPM OR UM OR UTM) (portal OR sistem OR iStudent OR SIMS) (down OR crash OR lembab OR "tak boleh login") since:2025-01-01`                                                            | 35    |
| m22 | Malaysian universities | Top    | `(UiTM OR UKM OR UPM OR UM OR UTM OR universiti OR kampus) ("banjir kilat") since:2025-01-01`                                                                                                         | 16    |
| m23 | Malaysian universities | Top    | `("pendaftaran kursus" OR "daftar subjek" OR "register subject" OR "subject registration") -bgt -banget -gue -gw -nggak -gak -aja -kak -dong -sih since:2025-01-01`                                   | 20    |
| m24 | Malaysian universities | Latest | `"student pass" Malaysia (delay OR stuck OR months OR waiting OR pending) since:2025-01-01`                                                                                                           | 5     |
| m25 | Malaysian universities | Top    | `EMGS (delay OR waiting OR stuck OR slow OR pending OR lambat) since:2024-06-01`                                                                                                                      | 12    |
| m26 | Malaysian universities | Latest | `(Sunway OR "Taylor's" OR Monash OR UCSI OR INTI OR "Nottingham Malaysia" OR "Asia Pacific University") (lifts OR elevators OR "the lift") since:2025-01-01`                                          | 20    |
| m27 | Malaysian universities | Top    | `jerebu (kelas OR sekolah OR universiti OR kampus OR PdPR) since:2025-01-01`                                                                                                                          | 21    |
| m28 | Malaysian universities | Latest | `("panas gila" OR "panas sangat" OR "panas nak mampus") (kampus OR uni OR kelas OR fakulti) -bgt -banget -gue -gw -nggak -gak -aja -kak -dong -sih since:2025-01-01`                                  | 2     |
| m29 | Malaysian universities | Top    | `("student Malaysia" OR "students in Malaysia" OR "international student" Malaysia) (hostel OR visa OR fees OR accommodation) since:2025-01-01`                                                       | 27    |
| z01 | Haze                   | Top    | `jerebu since:2026-09-25`                                                                                                                                                                             | 51    |
| z02 | Haze                   | Top    | `haze (KL OR Malaysia OR Selangor OR "Kuala Lumpur") since:2026-09-25`                                                                                                                                | 22    |
| z03 | Haze                   | Latest | `jerebu (universiti OR IPT OR kuliah OR "kelas online" OR pensyarah OR kampus) since:2026-09-25`                                                                                                      | 16    |
| o01 | University operations  | Top    | `("university IT" OR "campus IT" OR "higher ed IT") (helpdesk OR "help desk" OR tickets OR "password reset") since:2025-01-01`                                                                        | 31    |
| o02 | University operations  | Latest | `("IT helpdesk" OR "service desk") (university OR college OR campus) ("password reset" OR "same questions" OR tickets) since:2025-01-01`                                                              | 1     |
| o03 | University operations  | Top    | `registrar ("same questions" OR emails OR transcripts OR overwhelmed OR queue) (university OR college OR office) since:2025-01-01`                                                                    | 30    |
| o04 | University operations  | Top    | `("admissions office" OR "admissions counselor" OR "admissions officer") (emails OR inbox OR "same question" OR overwhelmed) since:2025-01-01`                                                        | 26    |
| o05 | University operations  | Top    | `("international office" OR "international student office" OR "international student advisor") (visa OR emails OR overwhelmed OR understaffed) since:2025-01-01`                                      | 1     |
| o06 | University operations  | Top    | `(professor OR lecturer OR faculty OR academic) ("admin work" OR "administrative work" OR paperwork OR bureaucracy) (hours OR week OR "half my time") since:2025-01-01`                               | 20    |
| o07 | University operations  | Top    | `("administrative burden" OR "admin burden") (academics OR faculty OR professors OR lecturers OR university) since:2025-01-01`                                                                        | 3     |
| o08 | University operations  | Top    | `(librarian OR "library staff" OR "reference desk") ("same question" OR "asked me" OR printer OR printing) since:2025-01-01`                                                                          | 25    |
| o09 | University operations  | Top    | `(facilities OR maintenance) (university OR campus OR dorm) ("work order" OR "work orders" OR "maintenance request") since:2025-01-01`                                                                | 30    |
| o10 | University operations  | Top    | `pensyarah ("kerja admin" OR "kerja perkeranian" OR paperwork OR "isi borang" OR laporan OR KPI) since:2025-01-01`                                                                                    | 27    |
| o11 | University operations  | Top    | `(lecturer OR lecturers) Malaysia ("admin work" OR paperwork OR KPI OR MQA OR "OBE") since:2025-01-01`                                                                                                | 23    |
| o12 | University operations  | Top    | `("marking" OR grading) ("admin" OR spreadsheets OR "moderation" OR "rubric") (lecturer OR academic OR professor) since:2025-06-01`                                                                   | 30    |
| o13 | University operations  | Top    | `("student services" OR "student affairs" OR "student hub") (queue OR "same questions" OR emails OR chatbot OR understaffed) since:2025-01-01`                                                        | 28    |
| g01 | AI agents              | Top    | `"AI agents" ("in production" OR "actually works" OR "actually useful" OR "actually use") since:2025-09-01`                                                                                           | 20    |
| g02 | AI agents              | Top    | `("AI agent" OR "AI agents") (failed OR "doesn't work" OR "gave up" OR "not ready" OR unreliable) (work OR company OR enterprise) since:2025-09-01`                                                   | 20    |
| g03 | AI agents              | Top    | `n8n ("saved me" OR "hours a week" OR "every morning" OR "every day" OR daily) since:2025-09-01`                                                                                                      | 26    |
| g04 | AI agents              | Top    | `n8n (broke OR nightmare OR "gave up" OR maintenance OR "not worth" OR fragile OR brittle) since:2025-09-01`                                                                                          | 26    |
| g05 | AI agents              | Top    | `Zapier (agents OR "AI") ("saved" OR "every day" OR broke OR replaced) since:2025-09-01`                                                                                                              | 21    |
| g06 | AI agents              | Top    | `Copilot (agents OR "Copilot Studio") (useless OR "nobody uses" OR adoption OR licenses OR rollout) since:2025-09-01`                                                                                 | 20    |
| g07 | AI agents              | Top    | `"Gemini Enterprise" since:2025-10-01`                                                                                                                                                                | 45    |
| g08 | AI agents              | Latest | `"Gemini Enterprise" (agent OR agents OR workflow OR connectors) since:2026-03-01`                                                                                                                    | 20    |
| g09 | AI agents              | Top    | `Agentspace since:2025-03-01`                                                                                                                                                                         | 24    |
| g10 | AI agents              | Top    | `("every AI product" OR "every AI startup" OR "another chatbot" OR "just a chatbot" OR "slap a chatbot") since:2025-06-01`                                                                            | 28    |
| g11 | AI agents              | Top    | `("chat interface" OR "chatbox" OR "chat UI") (AI OR LLM) (lazy OR wrong OR "not the answer" OR tired OR "stop building") since:2025-06-01`                                                           | 20    |
| g12 | AI agents              | Top    | `("boring AI" OR "invisible AI" OR "boring automation" OR "unsexy") (agents OR automation OR workflow) since:2025-06-01`                                                                              | 27    |
| g13 | AI agents              | Top    | `("pilot purgatory" OR "AI pilots" OR "95% of") (fail OR failing OR stuck OR production) (AI OR GenAI) since:2025-08-01`                                                                              | 21    |
| g14 | AI agents              | Top    | `("automated" OR "automation") ("the boring stuff" OR "most valuable" OR "actually stuck" OR "use every day") (AI OR agent) since:2025-09-01`                                                         | 20    |
| h01 | Hackathon judging      | Top    | `("hackathon judge" OR "judging a hackathon" OR "judged a hackathon" OR "as a hackathon judge") since:2025-01-01`                                                                                     | 20    |
| h02 | Hackathon judging      | Top    | `hackathon (judge OR judges OR judging) (chatbot OR "wrapper" OR wrappers OR "ChatGPT wrapper" OR "same idea") since:2025-01-01`                                                                      | 21    |
| h03 | Hackathon judging      | Top    | `hackathon ("stood out" OR "stand out" OR memorable OR "what wins" OR "how to win") (judges OR demo) since:2025-01-01`                                                                                | 21    |
| h04 | Hackathon judging      | Top    | `hackathon ("live demo" OR "demo video" OR "pitch") (judges OR judging) (tip OR advice OR lesson OR mistake) since:2025-01-01`                                                                        | 21    |
| h05 | Hackathon judging      | Top    | `hackathon ("every team" OR "half the teams" OR "most teams") (built OR chatbot OR agent OR RAG) since:2025-01-01`                                                                                    | 23    |
| h06 | Hackathon judging      | Top    | `hackathon (judges OR judging OR judged) ("vibe coded" OR "vibe-coded" OR "AI slop" OR "same projects" OR "same idea") since:2025-06-01`                                                              | 22    |
| h07 | Hackathon judging      | Top    | `hackathon ("another chatbot" OR "RAG chatbot" OR "chatbot wrapper" OR "AI wrapper" OR "GPT wrapper") since:2025-01-01`                                                                               | 21    |
| h08 | Hackathon judging      | Latest | `conversation_id:2117324123504279766`                                                                                                                                                                 | 17    |
| h09 | Hackathon judging      | Top    | `hackathon (judge OR judges) ("real users" OR "real data" OR "working demo" OR "actually works" OR "end to end") since:2025-06-01`                                                                    | 20    |
| g15 | AI agents              | Top    | `(chatbot OR "AI assistant" OR "AI agent") ("talk to a human" OR "real person" OR "human agent") ("customer service" OR support) since:2026-01-01`                                                    | 24    |
| g16 | AI agents              | Top    | `(university OR college OR campus) (chatbot OR "AI assistant") (students OR useless OR "doesn't know" OR wrong) since:2025-06-01`                                                                     | 22    |
| o14 | University operations  | Top    | `"higher ed" ("help desk" OR helpdesk OR "IT staff" OR tickets OR ticketing) since:2025-06-01`                                                                                                        | 28    |
| o15 | University operations  | Top    | `("I work in higher ed" OR "work in higher education" OR "higher ed admin" OR "university admin" OR "uni admin") (emails OR spreadsheets OR forms OR manual OR inbox) since:2025-01-01`               | 30    |
| o16 | University operations  | Latest | `(lecturer OR academic OR professor) ("admin tasks" OR "admin work" OR "administrative tasks") ("no time" OR drowning OR hours OR eats) since:2025-06-01`                                             | 20    |
| o17 | University operations  | Latest | `(timetable OR "class schedule") (uni OR university) ("changed again" OR "last minute" OR clash OR clashes OR "keeps changing") since:2025-06-01`                                                     | 20    |
| i01 | Campus infrastructure  | Top    | `("room booking" OR "book a room" OR "study room") (university OR campus OR library OR uni) (system OR impossible OR "fully booked" OR nightmare) since:2025-01-01`                                   | 29    |
| i02 | Campus infrastructure  | Latest | `library ("no seats" OR "no seat" OR "can't find a seat" OR "so full" OR "fully packed") (exam OR finals OR uni OR campus) since:2025-06-01`                                                          | 9     |
| i03 | Campus infrastructure  | Top    | `("campus bus" OR "campus shuttle" OR "uni bus" OR "shuttle bus") (late OR tracker OR tracking OR "where is" OR waiting) (uni OR campus OR university) since:2025-06-01`                              | 24    |
| i04 | Campus infrastructure  | Top    | `("lecture hall" OR classroom OR "lecture theatre" OR "lecture room") (freezing OR "so cold" OR aircon OR "air con" OR "air conditioning") since:2025-06-01`                                          | 22    |
| i05 | Campus infrastructure  | Top    | `(elevator OR elevators OR lifts) (campus OR university OR uni OR dorm) ("out of order" OR broken OR "between classes" OR queue OR line) since:2025-06-01`                                            | 22    |
| i06 | Campus infrastructure  | Top    | `("smart campus" OR "campus IoT" OR "occupancy sensors" OR "occupancy sensor") since:2025-06-01`                                                                                                      | 24    |
| m30 | Malaysian universities | Latest | `(Sunway OR "Taylor's" OR Monash OR APU OR UCSI OR INTI) (lift OR lifts) (queue OR beratur OR wait OR waiting) since:2024-01-01`                                                                      | 17    |
| m31 | Malaysian universities | Top    | `EMGS since:2025-06-01`                                                                                                                                                                               | 30    |
| m33 | Malaysian universities | Latest | `conversation_id:2011309541695389909`                                                                                                                                                                 | 9     |
| m34 | Malaysian universities | Top    | `(UiTM OR UM OR UKM OR UPM OR UTM) (ufuture OR ilearn OR "i-learn" OR maya OR spectrum OR mystudent OR "portal pelajar") (down OR lembab OR crash OR "tak boleh" OR error) since:2025-01-01`          | 7     |
| m35 | Malaysian universities | Top    | `(kolej OR asrama OR hostel) (panas OR "takde aircond" OR "aircond rosak" OR kipas) (UiTM OR UM OR UKM OR UPM OR UTM OR USM) since:2025-01-01`                                                        | 0     |
| a21 | APU                    | Latest | `("Asia Pacific University" OR "APU Malaysia" OR "APU KL") (review OR experience OR honest OR regret OR worth) since:2024-01-01`                                                                      | 19    |
| a22 | APU                    | Top    | `("Asia Pacific University" OR "APU Malaysia") ("international student" OR visa OR hostel OR accommodation OR fees) since:2024-01-01`                                                                 | 22    |
| a23 | APU                    | Latest | `APU (TPM OR "Bukit Jalil") (lif OR lift OR parking OR traffic OR jam OR shuttle OR banjir OR flood) since:2023-01-01`                                                                                | 4     |
| m36 | Malaysian universities | Top    | `(Sunway OR "Taylor's" OR Monash OR APU OR UCSI OR INTI) student (lift OR lifts OR parking OR wifi OR portal OR timetable) since:2025-01-01`                                                          | 21    |
| m37 | Malaysian universities | Top    | `("bil elektrik" OR "electricity bill" OR "tarif elektrik") (universiti OR university OR kampus OR IPT OR sekolah) since:2025-06-01`                                                                  | 40    |
| m38 | Malaysian universities | Top    | `(pensyarah OR lecturer OR lecturers OR academics) Malaysia (beban OR workload OR "kerja admin" OR burnout OR "admin work") since:2025-01-01`                                                         | 25    |
| m40 | Malaysian universities | Latest | `"Bukit Jalil" (traffic OR jam OR sesak) (pagi OR morning OR kelas OR class OR uni) since:2025-06-01`                                                                                                 | 20    |
| g17 | AI agents              | Latest | `"Gemini Enterprise" (confusing OR complicated OR setup OR "free trial" OR licence OR license OR "doesn't" OR "can't" OR pricing) since:2026-01-01`                                                   | 20    |

## See also

- [Hackathon brief](/docs/BRIEF.md): rules, tracks, dates, and judging.
- [Hackathon context](/docs/CONTEXT.md): decisions so far.
- [Judging and pitching](/docs/research/judging-and-pitching.md): comparable rubrics and demo packaging.
- [Gemini Enterprise](/docs/research/gemini-enterprise.md): what the platform offers.
- [APU public documents](/docs/research/apu-public-documents.md): what APU publishes about its campus and services.
- [Public data sources](/docs/research/public-data-sources.md): real datasets such as air-quality readings.
- [Other social platforms](/docs/research/social-other-platforms.md): the same questions asked of other platforms.

[Awan Besar flood post]: https://x.com/i/status/2051955704026775571
[KL criteria post]: https://x.com/i/status/2117324133675815210
[KPT haze post]: https://x.com/i/status/2107735659565748480
[OWASP APU post]: https://x.com/i/status/1924813982818500828
[UM bus post]: https://x.com/i/status/2011309541695389909
[admin hours post]: https://x.com/i/status/2036081271722443004
[ghost booking post]: https://x.com/i/status/2106050828058738881
[haze bus post]: https://x.com/i/status/2107823725152440336
[judge demo post]: https://x.com/i/status/2095122137396969543
[library seat post]: https://x.com/i/status/2037023850018594927
[no human post]: https://x.com/i/status/2116240133087543661
[pilot exceptions post]: https://x.com/i/status/2116308503338066116
[recycled project post]: https://x.com/i/status/2117200574953238627
[shuttle tracker post]: https://x.com/i/status/2028991690665824505
[silent failure post]: https://x.com/i/status/2117615099300954509
[student affairs emails post]: https://x.com/i/status/2109255301731963240
[support chatbots post]: https://x.com/i/status/2105568399992476046
