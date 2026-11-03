# Reddit pain points for the hackathon

What APU students, Malaysian students, university staff, facilities and IT workers, automation builders and hackathon participants complain about on Reddit, how often, how strongly, and how they cope today. It covers 220 threads read in full and about 3,100 post titles screened, mostly from 2024 to 2026, as evidence for the APU Cloud Innovation Hackathon 2026. Researched on 3 November 2026.

Contents:

1.  [Method](#method)
    1.  [Access and errors](#access-and-errors)
    1.  [Queries and counts](#queries-and-counts)
    1.  [Limits of this sample](#limits-of-this-sample)
1.  [APU-specific themes](#apu-specific-themes)
    1.  [Attendance, Moodle locks and the 80% visa rule](#attendance-moodle-locks-and-the-80-visa-rule)
    1.  [Slow replies from bursary, admissions and accommodation](#slow-replies-from-bursary-admissions-and-accommodation)
    1.  [Campus Wi-Fi and network filtering](#campus-wi-fi-and-network-filtering)
    1.  [Lifts, laundry and deposits](#lifts-laundry-and-deposits)
    1.  [Getting to campus: shuttle, LRT Bukit Jalil and traffic](#getting-to-campus-shuttle-lrt-bukit-jalil-and-traffic)
    1.  [Information scattered across channels](#information-scattered-across-channels)
    1.  [Account setup at intake](#account-setup-at-intake)
    1.  [Reputation and safety context](#reputation-and-safety-context)
1.  [Malaysia-wide student themes](#malaysia-wide-student-themes)
    1.  [EMGS student-pass waiting](#emgs-student-pass-waiting)
    1.  [Haze, heat and flash floods](#haze-heat-and-flash-floods)
    1.  [Campus Wi-Fi beyond APU](#campus-wi-fi-beyond-apu)
    1.  [Staff channels and student trust](#staff-channels-and-student-trust)
    1.  [Survey respondents for final-year projects](#survey-respondents-for-final-year-projects)
1.  [University operations themes](#university-operations-themes)
    1.  [Lecturers: attendance policing and email load](#lecturers-attendance-policing-and-email-load)
    1.  [IT helpdesk tickets](#it-helpdesk-tickets)
    1.  [Facilities: approvals, follow-ups and proof of work](#facilities-approvals-follow-ups-and-proof-of-work)
    1.  [Building automation: alarm floods and occupancy control](#building-automation-alarm-floods-and-occupancy-control)
1.  [Sensors in practice](#sensors-in-practice)
1.  [Automation people keep running](#automation-people-keep-running)
    1.  [What survives daily use](#what-survives-daily-use)
    1.  [Chatbot and agent fatigue](#chatbot-and-agent-fatigue)
1.  [Hackathons: overdone versus memorable](#hackathons-overdone-versus-memorable)
1.  [Signals](#signals)
    1.  [Themes ranked by frequency and intensity](#themes-ranked-by-frequency-and-intensity)
    1.  [Unmet needs](#unmet-needs)
1.  [See also](#see-also)

## Method

### Access and errors

Reddit's public JSON endpoints were not usable from this machine on 3 November 2026, so the sources used were Reddit's own RSS feeds and a paid third-party Reddit API. No Reddit account, cookie or session token was used.

- `www.reddit.com/.../search.json` and `api.reddit.com`: HTTP 403 with a "blocked" HTML page.
- `old.reddit.com/.../search.json`: HTTP 302 redirect to the login page (`reason=lor2`).
- `api.pullpush.io`: HTTP 522 (Cloudflare origin timeout) on two attempts.
- `arctic-shift.photon-reddit.com` full-text search: HTTP 422, "Timeout. Maybe slow down a bit", for every query tried.
- Reddit's official RSS search (`www.reddit.com/r/<sub>/search.rss`): works, returns up to 100 posts per query with body text, but no scores. After the first few calls it reported `x-ratelimit-remaining: 0` and allowed roughly one request a minute; 40 queries completed (2 needed retries after HTTP 429) before the run was stopped.
- ScrapeCreators Reddit API (API key, no Reddit credentials): 566 successful calls for subreddit search (7 posts a page, 2 pages per query), global search, and thread fetches with scores and up to 15 top-level comments plus their reply trees. It supplied every score and comment count quoted here; scores are as of 3 November 2026.

### Queries and counts

- APU: `APU`, `APIIT`, `"Asia Pacific University"`, `"Bukit Jalil"`, `APSpace`, and APU plus `lift`, `wifi`, `parking`, `hostel`, `attendance`, `timetable`, `fees`, `international student`, `lecturer`, `EMGS visa`, in r/malaysiauni, r/malaysia, r/kualalumpur, r/malaysians and across Reddit.
- Malaysian students: r/malaysiauni (the active Malaysian university sub; r/unimalaysia and per-university subs such as r/myUTM and r/MonashUniversityMY were found but not searched) for `EMGS`, `student visa`, `international student`, `hostel`, `wifi`, `lift`, `parking`, `flood`, `haze`, `timetable`, `moodle`, `results`, `lecturer email reply`, `student portal down`, `bus shuttle`, `canteen queue`, `complaint`, `library`, plus r/malaysia and r/KualaLumpur for haze, flash floods, heat, LRT Bukit Jalil and buses.
- Staff and operations: r/college, r/University, r/Professors, r/AskAcademia, r/highereducation, r/sysadmin, r/ITCareerQuestions, r/FacilityManagement, r/BuildingAutomation, with queries such as `attendance`, `admin`, `email students`, `LMS`, `classroom temperature`, `password reset`, `higher ed`, `university help desk`, `work order`, `CMMS`, `occupancy`, `CO2`, `energy savings`.
- Sensors and automation: r/homeassistant (`mmwave presence`, `occupancy sensor reliable`, `CO2 sensor`, `air quality sensor`, `battery life zigbee`), r/n8n, r/automation and r/AI_Agents (`actually use`, `daily`, `production`, `abandoned`, `chatbot`, `hype`).
- Hackathons: r/hackathon, r/csMajors, r/cscareerquestions and Reddit-wide (`judge`, `judged a hackathon`, `AI wrapper`, `every project chatbot`, `winning project`).

Results: 1,444 unique posts from RSS and 1,928 from the API, 3,091 unique after merging. From these, 220 threads were fetched with comments (3,774 comments retrieved) and read: each post body plus its highest-scored comments, typically 4–12 per thread. By year the threads read were 140 from 2026, 55 from 2025, 21 from 2024 and 4 from 2023. By subreddit: r/malaysiauni 99, r/malaysia 19, r/Professors 14, r/FacilityManagement 13, r/hackathon 10, r/automation 9, r/n8n 7, r/homeassistant 7, r/sysadmin 6, r/BuildingAutomation 6, others 30.

Empty or unusable results:

- r/facilitiesmanagement returned no posts for any of 8 queries; the active sub is r/FacilityManagement, which was searched instead.
- r/devpost (`judge`) and r/hackathon (`overdone`) returned nothing; r/college `wifi` (past year) returned nothing.
- "APU" matches unrelated aircraft and truck auxiliary power units and AMD APUs; r/rapu is Ritsumeikan Asia Pacific University in Japan, and most "APIIT" hits are APIIT Sri Lanka. All of these were excluded.

### Limits of this sample

- Counts are of posts found by these queries, not of everything on Reddit. The r/malaysiauni sample (1,354 posts from 2024 onwards) is skewed towards APU because APU queries were run first and capped at 100 results.
- Reddit over-represents complaints and English-speaking, international and private-university students. Several commenters say r/malaysiauni is dominated by APU posts, and APU students and alumni push back on the negativity in the same threads ([After one sem in APU][1nsp664], [Is APU that bad?][1v53euk]).
- r/automation, r/AI_Agents and r/n8n carry many self-promotional posts; commenters themselves complain that "All posts seem like a disguised pitch for something" ([AI agencies thread][1wtpinc]). Vendor posts were not counted as evidence of demand.

[1v53euk]: https://www.reddit.com/r/malaysiauni/comments/1v53euk/

## APU-specific themes

### Attendance, Moodle locks and the 80% visa rule

- **Who posts:** international APU students near a visa renewal, plus local APU students worried about being barred from exams.
- **How often:** 24 attendance titles in the r/malaysiauni sample from 2024 to 2026, at least 18 of them about the 80% threshold and about 10 naming APU; new ones appear every month or two (May, September and October 2026).
- **Intensity:** low scores (1–16) but anxious wording ("help", "worry", "cooked"), and a public warning post with 127 points. The stake is the visa, not a grade.
- **Workarounds:** asking lecturers or the visa office for a support letter, begging lecturers to allow the exam, getting classmates to share the attendance code, and crowdsourcing what the rule actually is.

Examples:

- An international APU student at 70–75% said the shortfall came from a locked Moodle account, not from skipping class: "the attendance was depend on Moodle submission and my moodle was locked for long time so they didn't give me the attendance" (7 Sep 2026, 2 points, 9 comments) ([Attendes less than 80% visa][1w9k6q1]).
- One cause of Moodle locks is slow payment confirmation. An international student wrote that bursary delays left "my Moodle access (Learning platform and courses) blocked for long periods of time over and over again" (27 Nov 2024, 326 points, 106 comments) ([APU Is pure garbage][1h0u08i]).
- Nobody is sure how the rule works. A first-year asked whether 80% applies per module or overall; one reply said "My thinking is that its intentionally opaque"; months later the student posted that it is "Your average attendance for every semester has to be above 80% not module wise" (31 Oct 2025, 5 points, 18 comments) ([EMGS visa renewal requirements enquiry][1okozxu]).
- An APU commenter described the existing alerting: "after missing 4 classes in a row they'll send you a email alerting you", and the workaround: "ask a classmate to send the Attendance Code for the class" (3 Sep 2026) ([Apu attendance exam bar?][1w5zjkp]).
- A public warning to other international students: "Malaysia is very strict with its attendance = visa renewal thing … otherwise it's deportation or expel" (5 Oct 2026, 127 points, 9 comments) ([Fellow international students please take the 80 percent above attendance criteria seriously][1wyb7lc]). Related: an APU commenter said lecturers describe the rule as "a requirement by MQA" ([Going under 80% Attendance][1grq0jd]), and a student at an unnamed Malaysian university said poor Wi-Fi means "student can't sign-in to their attendance" ([How do you survive when you are having poor campus WiFi][1nu15wi]).

**Inference:** at APU, attendance is the point where three systems meet: bursary (payment confirmation), Moodle (access and attendance codes) and the visa office (80% for renewal). A failure in one shows up as a visa risk, and students have no single place to see their standing or the rule.

[1grq0jd]: https://www.reddit.com/r/malaysiauni/comments/1grq0jd/
[1nu15wi]: https://www.reddit.com/r/malaysiauni/comments/1nu15wi/
[1okozxu]: https://www.reddit.com/r/malaysiauni/comments/1okozxu/
[1w5zjkp]: https://www.reddit.com/r/malaysiauni/comments/1w5zjkp/
[1w9k6q1]: https://www.reddit.com/r/malaysiauni/comments/1w9k6q1/
[1wyb7lc]: https://www.reddit.com/r/malaysiauni/comments/1wyb7lc/

### Slow replies from bursary, admissions and accommodation

- **Who posts:** international students (payments, deposits, admissions), incoming students waiting on accommodation, and alumni.
- **How often:** 7 threads read from November 2024 to October 2026, plus recurring mentions inside general "is APU bad?" threads.
- **Intensity:** high. The two biggest threads have 326 and 216 points; language includes "garbage", "ghosted", "cash grab".
- **Workarounds:** repeated emails and WhatsApp, going through an education agent, waiting until 1–2 weeks before intake, Google reviews, and threats to report to the Ministry of Education.

Examples:

- An international student called bursary "my most hated aspect of APU", saying it can take weeks to reply (27 Nov 2024, 326 points, 106 comments). The top reply, from an alumnus (137 points), said APU "can't keep up with the growth of the number of students being enrolled every year"; another reply said "the parking issues has been raised a lot of times and this was never taken seriously" ([APU Is pure garbage][1h0u08i]).
- A student lost RM100 of a deposit for "wall paint" and wrote "they didnt respond to my email at all after a week" (6 Feb 2026, 216 points, 40 comments) ([APU charged me RM100 for "Wall paint"][1qxe918]).
- An undergraduate applicant: "I also sent them E-mail, contacted on whatsapp and send query through their platform. but all of them getting ghosted." A reply suggested going through an agent: "I got mine within a day" (26 Oct 2026) ([APU not answering for my application since 7th october][1xftzeg]).
- November-intake students waiting on the accommodation portal: "i submitted my form over a week ago still no response", and a counsellor said confirmations come only "1-2 weeks before intake" (2 Oct 2026) ([Any news from apu accomodation portal for november batch?][1ww5pjj]).
- A prospective international student listed what they had read online: "slow administration", "overcrowded campus", "dorm/accommodation issues" (8 May 2026, 10 points, 19 comments) ([HELP IMPORTANT PLS][1t763sl]).

[1t763sl]: https://www.reddit.com/r/malaysiauni/comments/1t763sl/
[1ww5pjj]: https://www.reddit.com/r/malaysiauni/comments/1ww5pjj/
[1xftzeg]: https://www.reddit.com/r/malaysiauni/comments/1xftzeg/

### Campus Wi-Fi and network filtering

- **Who posts:** APU students on campus and in APU's off-campus residence City of Green (COG); lecturers are reported to joke about it too.
- **How often:** 5 APU threads from 2025–2026 complain about Wi-Fi, 2 of them about the COG residence.
- **Intensity:** medium-high (32–87 points), with sarcasm about APU's "top technology university" branding.
- **Workarounds:** mobile data plans and hotspots (RM30 a month unlimited plans are the usual advice), Ethernet cables, VPNs, and "Bring own wifi".

Examples:

- "Entire uni about technology and can't have good fast wifi" (19 May 2026, 32 points, 14 comments). The poster added "Bring own device. Bring own wifi. Bring own lecturer." (24 points); another said lecturers repeat "top 1 technology uni but wifi is so bad"; another loses signal "around the cafeteria when there's a lot of people and near any of the stairs" ([APU Wi-Fi][1thgkyj]).
- "The wifi hilang kadang2 and or is just genuinely slow gila" (the Wi-Fi sometimes disappears or is crazy slow), from an APU first-year thinking of dropping out (5 Jun 2025, 69 points, 35 comments) ([I think I've hit rock bottom][1l3zujy]).
- At COG the complaint is filtering, not speed: "The university admin blocks almost everything", including YouTube comments (6 Jun 2025, 87 points, 33 comments). The top reply (28 points) advised buying a prepaid SIM ([Don't ever come to APU's off-campus City of Green][1l4ub3h]). A private COG tenant found fixed broadband "doesnt cover my block" ([Wifi for COG][1nfyg5j]).

[1l3zujy]: https://www.reddit.com/r/malaysiauni/comments/1l3zujy/
[1nfyg5j]: https://www.reddit.com/r/malaysiauni/comments/1nfyg5j/
[1thgkyj]: https://www.reddit.com/r/malaysiauni/comments/1thgkyj/

### Lifts, laundry and deposits

- **Who posts:** APU students on campus and in APU's on-campus and off-campus residences and nearby condos.
- **How often:** lifts come up in 4 threads (2025–2026: 2 about the campus, 2 about residences), laundry queues in 2, a disputed deposit in 1; the sample has 37 APU accommodation threads overall, most of them requests for advice.
- **Intensity:** medium. "Fix your damn elevators" drew support; the deposit thread drew 216 points.
- **Workarounds:** stairs, living off campus (Parkhill, M Vertica, Bloomsvale and others are the usual names), and timing laundry.

Examples:

- An APU student who otherwise defended APU said the only terrible thing was the elevators: "APU if you're reading this fix your damn elevators lah" (28 Sep 2025, 54 points, 21 comments). A reply: "Elevators also always break down because there are just so many people" ([After one sem in APU][1nsp664]).
- A diploma student in their first week listed why they might leave: "As APU is quite overpopulated, bus queues are insane in peak hour, food quality not very good, lifts are always full" (19 Jul 2025) ([MMU better than APU?][1m3mxwi]).
- At COG, "the lifts always breakdown and are very slow, sometimes taking me upwards to 10 mins" ([APU charged me RM100 for "Wall paint"][1qxe918]).
- Also at COG: "All gyms haven't been operational for months now lol. There are only about three washers and dryers for the whole building", and people leave laundry for hours ([Don't ever come to APU's off-campus City of Green][1l4ub3h]). An exchange student had heard of "bad WiFi and long queues for washing machines" before arriving ([On or off-campus accommodation?][1ik7tgi]).
- An alumnus answering questions said of the off-campus M Vertica condo: "the main thing is the lifts — the wait can be really long because it's such a packed place" ([APU Q&A][1mrn8qj]).

**Inference:** lift crowding at peak times is mentioned in passing rather than as its own topic; no thread measured waits or described specific class changeovers.

[1ik7tgi]: https://www.reddit.com/r/malaysiauni/comments/1ik7tgi/

### Getting to campus: shuttle, LRT Bukit Jalil and traffic

- **Who posts:** incoming international students without cars, commuting local students.
- **How often:** 6 APU transport titles in the sample, plus peak-hour shuttle queues mentioned in general threads, and Bukit Jalil traffic and KL bus threads on r/malaysia.
- **Intensity:** low on the APU side (practical questions), higher on KL buses (498 points).
- **Workarounds:** APU's shuttle from LRT Bukit Jalil, arriving early to beat the queue, Grab, renting close to campus.

Examples:

- An applicant abroad asked whether they could walk from LRT Bukit Jalil because "easy lrt/mrt access is kinda a must for me without a car"; replies pointed to the APU shuttle (28 Sep 2026) ([Possible to walk from Bukit Jalil station to APU?][1ws57o8]).
- A new student asked whether they could ride the shuttle without a student card; a reply: "if you have to be on campus at 9, make sure you're at the station by 820 or 830" (18 Apr 2026, 3 points, 17 comments) ([Anyone from APU?][1souu9p]).
- The queue is a known cost of living off campus: a first-week diploma student wrote that "bus queues are insane in peak hour" ([MMU better than APU?][1m3mxwi]).
- "There is no park and ride in Bukit Jalil station, the nearest station with parking space is Sri Petaling" (15 Jun 2024) ([Lrt Bukit jalil parking options?][1dg8z4o]).
- Teresa Kok, quoted by paultan.org, blamed Bukit Jalil and Sri Petaling congestion on "the lack of adequate public transport access, especially the LRT/MRT station network" (28 Aug 2026, 32 points, 33 comments) ([Teresa Kok urges DBKL to study Bukit Jalil congestion][1w0kk7i]). An APU graduate's first tip for applicants was "Expects traffic issues" ([How's the experience studying at APU?][1gapiho]).
- A Bukit Jalil-area student weighing commuting against rent wrote "Mentally tired from class, then stuck in jam" (21 Mar 2025) ([Commuting to uni or renting a room][1jgfhra]); a KL bus rider complained that "the bus frequency is freaking 30 mins" (8 Dec 2025, 498 points, 58 comments) ([KL public buses][1pgzenc]).

[1dg8z4o]: https://www.reddit.com/r/malaysia/comments/1dg8z4o/
[1gapiho]: https://www.reddit.com/r/malaysiauni/comments/1gapiho/
[1jgfhra]: https://www.reddit.com/r/malaysiauni/comments/1jgfhra/
[1pgzenc]: https://www.reddit.com/r/malaysia/comments/1pgzenc/
[1souu9p]: https://www.reddit.com/r/malaysiauni/comments/1souu9p/
[1w0kk7i]: https://www.reddit.com/r/malaysia/comments/1w0kk7i/
[1ws57o8]: https://www.reddit.com/r/malaysiauni/comments/1ws57o8/

### Information scattered across channels

- **Who posts:** prospective and incoming APU students, mostly international, and new students looking for clubs, schedules and exam formats.
- **How often:** the most frequent APU post type in the sample. 36 APU titles are intake or friend-finding posts ("APU Sept Intake (Want to connect)"), 37 are accommodation questions, and two Q&A threads by APU students drew 117 and 165 comments of questions.
- **Intensity:** low per post, but high volume; several basic questions got no answer at all.
- **Workarounds:** Reddit AMAs, seniors, agents, Instagram, WhatsApp and Discord groups.

Examples:

- An APU student opened an AMA because the information "Was a bit hard for me to find info on APU right after I finished SPM"; the 117 comments are questions about accommodation, the shuttle, visas, part-time work and course choice (24 Dec 2025) ([APU Student here, Ask me Anything][1puqcva]). An alumnus's Q&A drew 165 comments, and a reader wrote "I wish there are threads for others too" (16 Aug 2025) ([APU Q&A][1mrn8qj]).
- A student building a clubs app for an assignment: "all the information regarding clubs are just scattered over ig and hidden in like the corners of APSpace" (28 Jun 2026) ([APU Students PLease help me OUTTTT][1uhrrv9]).
- Questions with zero replies: the December break date ("I really need to know when the first break starts" to book flights, 5 Aug 2025) ([Asia Pacific University Expected December break date][1mi5uxh]) and the full-time MBA schedule, which is not on the website (8 Jan 2026) ([APU Full Time MBA Schedule][1q7klpo]).
- An international IT student looking for exam formats and past papers: "I actually don't have friends from my batch and I'm not even friends with seniors" (12 Jun 2025) ([APU / Asia Pacific University Malaysian HELP PLS][1l9mh1f]).
- Accommodation seekers say reviews are stale ("most of them are from years back") ([Best Off-Campus Accommodation for APU in 2025?][1kspg6l]) or that it is "hard to tell what's actually good and what's just nice in photos" ([Anyone joining APU this September?][1vdsaud]).

[1kspg6l]: https://www.reddit.com/r/malaysiauni/comments/1kspg6l/
[1l9mh1f]: https://www.reddit.com/r/malaysiauni/comments/1l9mh1f/
[1mi5uxh]: https://www.reddit.com/r/malaysiauni/comments/1mi5uxh/
[1puqcva]: https://www.reddit.com/r/malaysiauni/comments/1puqcva/
[1q7klpo]: https://www.reddit.com/r/malaysiauni/comments/1q7klpo/
[1uhrrv9]: https://www.reddit.com/r/malaysiauni/comments/1uhrrv9/
[1vdsaud]: https://www.reddit.com/r/malaysiauni/comments/1vdsaud/

### Account setup at intake

- **Who posts:** new APU students in the week they get their APKey.
- **How often:** 2 threads (September 2024 and September 2026), both with others replying "same".
- **Intensity:** low on Reddit; the helpdesk side of the same problem is in [IT helpdesk tickets](#it-helpdesk-tickets).
- **Workarounds:** waiting, or going to the IT desk in person.

Examples:

- A September 2026 student copied their APKey into APSpace and got "This username may be incorrect … contact your admin"; a week later another replied "Ive also gotten the same error" (8 Sep 2026, 9 comments) ([Account log in][1wavtzj]).
- In 2024: "I just can't login to their services( APSpace, microsoft365)", answered with "I couldn't login either" ([Help me pls][1fe6oo5]).

[1fe6oo5]: https://www.reddit.com/r/malaysiauni/comments/1fe6oo5/
[1wavtzj]: https://www.reddit.com/r/malaysiauni/comments/1wavtzj/

### Reputation and safety context

These threads explain why APU dominates r/malaysiauni and set the tone for the specific complaints above.

- "My honest experience at APU Malaysia — left after one semester", by an international student, centred on job prospects for foreigners and value for money (1 Sep 2026, 339 points, 173 comments) ([My honest experience at APU][1w4edrf]).
- "Do not come to APU(save your sanity)" (29 Sep 2026, 194 points, 104 comments). The top reply (72 points): "everytime this sub appears on my fyp its about apu". A 2022 entrant said fees went from about RM80k to about RM100k "But the syllabus like no update" ([Do not come to APU][1wt49ge]).
- A video of a fight in APU's open-air car park on 14 April 2026 reached 1,235 points and 193 comments on r/malaysia ([APU Fight][1sl4e1u]).
- After graduation, international APU alumni struggle to find the Malaysian individual sponsor the Graduate Pass requires; one alumnus said "I had zero luck finding someone that would sponsor me" (5 Nov 2025) ([Need help finding a Malaysian citizen sponsor for Graduate Pass][1oowrp7]).

[1oowrp7]: https://www.reddit.com/r/malaysiauni/comments/1oowrp7/
[1sl4e1u]: https://www.reddit.com/r/malaysia/comments/1sl4e1u/
[1w4edrf]: https://www.reddit.com/r/malaysiauni/comments/1w4edrf/
[1wt49ge]: https://www.reddit.com/r/malaysiauni/comments/1wt49ge/

## Malaysia-wide student themes

### EMGS student-pass waiting

- **Who posts:** incoming and renewing international students at APU, Monash, UM, MMU, Swinburne and others.
- **How often:** the largest single topic in the r/malaysiauni sample: 164 titles from 2024 to 2026 mention EMGS, visa or student pass. The `EMGS` query alone hit the 100-result cap. Posts peak from July to October, before the September and November intakes, with smaller peaks in January and March.
- **Intensity:** low scores (1–25) but panic about deadlines, deferral and deportation.
- **Workarounds:** comparing timelines on Reddit, calling the university and EMGS, and asking universities for late-arrival extensions.

Examples:

- "my EMGS visa application has been completely frozen at 32% for 20 calendar days now", with the EMGS app showing zero required actions; the university would allow "a maximum one-week extension to arrive late" before deferral (APU entrant, 24 Aug 2026) ([Stuck at 32% for 20 days on EMGS app][1vwuwld]).
- Timelines traded as data: "it took me 16 business days at 35%" (24 Sep 2024, 34 comments) ([EMGS student visa][1fo3ox5]); "they really edge it close to the deadline" and "Nothing like the dopamine rush of a EMGS update" (18 May 2026) ([EMGS Progression][1tgj3d9]); "expect the whole process to take anywhere between 3-5 weeks" (17 Sep 2025, 29 comments) ([HOW LONG WILL EMGS TAKE][1nj69ca]). A Monash entrant was stuck at 15% with a 16 October arrival deadline ([EMGS student pass stuck at 15%][1ws8kvg]).
- The visa constrains the end of study too. At MMU, "The postgraduate department is refusing to accept my submission because my student visa isn't valid!" (2 Jul 2025) ([Student Visa Expired Just before Thesis Submission][1lpywdm]); at UM, graduates must cancel the visa "within 21 days otherwise they will get reported to be deported" (29 Aug 2025, 50 points) ([Uni is making intl students cancel student visa][1n321tq]).
- An APU cybersecurity student whose renewal was questioned over pending modules was told "you basically violate your Visa terms (student visa 80%) with your attendance" (14 Mar 2026, 41 comments) ([Visa problems][1rtfrtk]). Even late arrival feeds the attendance worry: one APU entrant cannot apply for leave because "I'm not an official student there until i land in malaysia and do the medical check up" ([Visa delay][1wtv3ke]).

[1fo3ox5]: https://www.reddit.com/r/malaysiauni/comments/1fo3ox5/
[1lpywdm]: https://www.reddit.com/r/malaysiauni/comments/1lpywdm/
[1n321tq]: https://www.reddit.com/r/malaysiauni/comments/1n321tq/
[1nj69ca]: https://www.reddit.com/r/malaysiauni/comments/1nj69ca/
[1rtfrtk]: https://www.reddit.com/r/malaysiauni/comments/1rtfrtk/
[1tgj3d9]: https://www.reddit.com/r/malaysiauni/comments/1tgj3d9/
[1vwuwld]: https://www.reddit.com/r/malaysiauni/comments/1vwuwld/
[1ws8kvg]: https://www.reddit.com/r/malaysiauni/comments/1ws8kvg/
[1wtv3ke]: https://www.reddit.com/r/malaysiauni/comments/1wtv3ke/

### Haze, heat and flash floods

- **Who posts:** students, lecturers, parents and residents across the Klang Valley; the haze ran for months in August–October 2026.
- **How often:** 29 haze posts between August and early November 2026 in the sample alone, plus heat and flood posts through 2025–2026.
- **Intensity:** the highest engagement in this study. Haze posts reached 3,418, 2,226, 1,598 and 1,555 points; comments mention lung infections and depression.
- **Workarounds:** staying indoors, AirVisual or aqicn.org instead of official readings, ad hoc switches to online classes, the library for air-conditioning.

Examples:

- The UTeM campus in haze drew 2,226 points and 54 comments (11 Oct 2026) ([current haze situation in UTeM][1x31mjd]); "After months of the haze, this photo doesn't look real" drew 3,418 points (26 Oct 2026) ([After months of the haze][1xfqtvy]).
- Commenters said universities stayed open while schools closed. In a 647-point meme thread, a lecturer wrote "Sigh as a lecturer I too wanna WFH but alas college management don't think like that"; another commenter wrote "Sekolah saja ada paru paru. Kita dkt IPT ni bernafas pakai insang kot" (only schools have lungs; do we at universities breathe through gills?); a third: "my class got changed to online because of jerebu" (8 Oct 2026) ([Students be like][1x0u9hu]).
- The closure threshold kept moving. The King asked for school closures above API 150 ("almost 70-80% of schools" on that day's readings, 180 points) ([King wants schools in areas with APIs of more than 150 to close][1x0lpcd]); a week later it was "raised to 200" (175 points, 55 comments) ([Haze limit for school closure just raised to API 200][1x6984t]). At APU, an Oct 2026 reply said most martial-arts clubs "are closed down no due to the Haze but will reopen soon" ([international student going to APU Nov intake][1xfle8z]).
- Trust in the official index is low: "the readings could stay at like 80 even though the air quality is clearly in the unhealthy/very unhealthy range. And it seems like they are delayed" (14 Oct 2026); a reply explained the API is a 24-hour running average ([Are the API readings by the DOE even accurate?][1x5nhs2]). An FMM-commissioned report estimated RM8 billion in welfare losses and said fine particles "may have contributed to about 1,700 deaths" (Malay Mail, 29 Oct 2026, 209 points) ([Malaysia's latest haze cost RM8b][1xi7d0s]).
- Floods and heat: UM's degree registration day flooded (27 Sep 2026, 558 points) ([Flood on the 1st day of the registration at UM][1wretph]); "Sunway area had a sudden flash rain just now and the car park was lightly flooded" (6 May 2026) ([Flash floods hit parts of Klang Valley][1t598qk]); "God i hate this country's heat" (3 Aug 2026, 1,116 points, 146 comments) ([God i hate this country's heat][1veerwc]). A Bukit Jalil dorm resident cannot use portable air-conditioning ("only an appliace within 1000 watts below") and was told to use the "University Library- Free aircon" ([Dorm in Bukit Jalil with just a ceiling fan][1n1y6vn]).

[1n1y6vn]: https://www.reddit.com/r/malaysiauni/comments/1n1y6vn/
[1t598qk]: https://www.reddit.com/r/malaysia/comments/1t598qk/
[1veerwc]: https://www.reddit.com/r/malaysia/comments/1veerwc/
[1wretph]: https://www.reddit.com/r/malaysiauni/comments/1wretph/
[1x0lpcd]: https://www.reddit.com/r/malaysia/comments/1x0lpcd/
[1x0u9hu]: https://www.reddit.com/r/malaysiauni/comments/1x0u9hu/
[1x31mjd]: https://www.reddit.com/r/malaysiauni/comments/1x31mjd/
[1x5nhs2]: https://www.reddit.com/r/malaysia/comments/1x5nhs2/
[1x6984t]: https://www.reddit.com/r/malaysia/comments/1x6984t/
[1xfle8z]: https://www.reddit.com/r/malaysiauni/comments/1xfle8z/
[1xfqtvy]: https://www.reddit.com/r/malaysia/comments/1xfqtvy/
[1xi7d0s]: https://www.reddit.com/r/malaysia/comments/1xi7d0s/

### Campus Wi-Fi beyond APU

- UiTM Puncak Alam: "I CANT DO ANYTHING ONLINE ON THIS CAMPUS" (9 Jul 2026, 307 points, 30 comments); replies name UniKL MIIT as "painfully slow" and advise "Find the lecturers wifi, they are faster" ([amazing student wifi...][1urpjkp]). A UiTM hostel resident blames "congestion and bandwitdh" ([Any ways to increase internet connection speed in hostel?][1o878q3]).
- At UPM, a commenter said that after ransomware attacks the university blocks its websites for anyone "not connected to UPM's private WiFis … This has made life incredibly difficult for those living outside" (28 Oct 2026, 565 points) ([just tried to look for info on UPM's website][1xhkkhv]).
- The default workaround is a phone plan: "RM30 … for unlimited 4G/5G and 12gb hotspot" (9 Jul 2024, 46 comments) ([What internet plan are you using for university?][1dyxbhk]).

[1dyxbhk]: https://www.reddit.com/r/malaysiauni/comments/1dyxbhk/
[1o878q3]: https://www.reddit.com/r/malaysiauni/comments/1o878q3/
[1urpjkp]: https://www.reddit.com/r/malaysiauni/comments/1urpjkp/
[1xhkkhv]: https://www.reddit.com/r/malaysiauni/comments/1xhkkhv/

### Staff channels and student trust

- A programme coordinator's reply drew 1,104 points and 107 comments; the student said the coordinator "did not check email until the finance person replied, who looped in everyone else" (13 Oct 2026) ([Anyone's uni programme coordinator speak like this too?][1x4neoz]). In another case students advised "Make sure you have a proper and official paper trail" ([Programme coordinator keeps insisting to see me in person][1vfv3e5]).
- UM students hit a reply-all storm on the all-student mailing list: "It was sent to student_list. All siswamail is under the list. Then, those people do "Reply All"" (13 Mar 2026, 521 points) ([UM Unsubscribe Situation is Insane][1rshhto]).
- "I thought the lecturer evaluation was anonymous. Then this morning I received this message from him" (2 Dec 2024, 346 points, 148 comments) ([Guys pls help!!!][1h4kodo]).
- An entrepreneurship class was told to record "3 hours of our own voice" on DingTalk for a "Malaysian AI Language" collection; someone who said they had worked on the project called it "a serious breach" of consent and PDPA rules (27 Apr 2026, 218 points, 50 comments) ([Compulsory "AI voice collection" assignment??][1swy5eb]).

[1h4kodo]: https://www.reddit.com/r/malaysiauni/comments/1h4kodo/
[1rshhto]: https://www.reddit.com/r/malaysiauni/comments/1rshhto/
[1swy5eb]: https://www.reddit.com/r/malaysiauni/comments/1swy5eb/
[1vfv3e5]: https://www.reddit.com/r/malaysiauni/comments/1vfv3e5/
[1x4neoz]: https://www.reddit.com/r/malaysiauni/comments/1x4neoz/

### Survey respondents for final-year projects

- 22 survey-request titles in the r/malaysiauni sample, 2024–2026, from final-year and psychology students, including several at APU.
- "my lecturer need 100 responders for my fyp survey plsss help me I only have 2 days" drew 181 points and 133 comments (13 Jun 2026); the top reply (41 points) was "U could just fill it up urselves lol" ([fyp survey][1u4gncr]).

**Inference:** final-year research at Malaysian universities depends on convenience samples begged for on social media, which is both a time sink and a data-quality risk.

[1u4gncr]: https://www.reddit.com/r/malaysiauni/comments/1u4gncr/

## University operations themes

### Lecturers: attendance policing and email load

- **Who posts:** faculty and adjuncts on r/Professors, mostly in the US.
- **How often:** 23 r/Professors titles on attendance and 18 on email in the sample, most from 2025–2026.
- **Intensity:** high: email and accommodations threads reach 77–369 points, attendance threads 59–163 points with up to 198 comments.
- **Workarounds:** sign-in sheets and roll calls, inbox rules, syllabus clauses, hiding LMS grades until marking is done, routing problems back to the relevant office.

Examples:

- "at my university we have to take attendance. I hate it." (22 Oct 2026, 198 comments); replies range from "Just pass a list around" to telling the new professor to toughen up ([Hate taking attendance][1xcbbck]).
- Attendance is required for reporting, and students fake it: "For reporting purposes (ie federal loans and stuff) we still have to record attendance", yet students "write in their friends' names on the list" (29 Oct 2026, 59 points, 51 comments) ([Grumble Grumble re: faking attendance][1xipfks]); "there are 6 students present. _Magically_ though there are 9 students that sign in" (27 Apr 2026, 153 points, 74 comments) ([Attendance & Academic Dishonesty][1sxfvx5]). One lecturer would make attendance mandatory "but too much overhead and excuse emails" (16 Dec 2025, 114 comments) ([How was your attendance this semester?][1poao48]).
- Email volume: "it is impossible to keep up on other emails related to my job with student emails flooding in all term" (28 Dec 2025, 77 points, 73 comments). Top fixes: "Inbox rules and folders" (99 points) and putting fuller instructions in the LMS, after which one lecturer gets "almost no emails" ([Student emails- this feels unsustainable][1py0iel]).
- Grade-chasing: "Do students forget that I am not a bot?" (22 Jul 2025, 221 points, 64 comments); the top fix (240 points): "I put in my syllabus that it may take up to 7 days to return grades" ([Do students forget that I am not a bot?][1m6bauz]).
- LMS defaults create tickets: missing work shows as zero, producing "four emails asking why they have 0s" (19 Sep 2026, 79 points) ([Assignment was due at Friday midnight][1wkqa0g]); a student blamed five weeks' absence on "the LMS not showing any content", and the top reply was to "Submit a ticket to your IT help desk" ([Student missed 5 weeks and blamed a broken LMS][1x0r3zy]).
- Accommodations paperwork: "I have at least 14 accommodation letters" in a class of 30, and "the accommodations office places the responsibility of finding a notetaker on me" (29 May 2025, 369 points, 237 comments) ([Accommodations Hellscape][1ky7n17]). On r/AskAcademia, faculty describe "a massive increase in administrative tasks that have been passed on to faculty" (7 Jun 2025, 306 points) ([How did administrators manage to gain so much control?][1l5lqvc]).
- Room heat: "My classroom was 29C (or 84F). The sweat was dripping off me throughout my 3-hr lecture" and "The AC is broken in one of my classrooms" (2 Sep 2025) ([How hot was your classroom today?][1n6s361]); a US student "can't seem to ever be able to last more than an hour" in the hot library (15 Nov 2024) ([Can't study on campus because the library is so HOT][1grz90i]).

[1grz90i]: https://www.reddit.com/r/college/comments/1grz90i/
[1ky7n17]: https://www.reddit.com/r/Professors/comments/1ky7n17/
[1l5lqvc]: https://www.reddit.com/r/AskAcademia/comments/1l5lqvc/
[1m6bauz]: https://www.reddit.com/r/Professors/comments/1m6bauz/
[1n6s361]: https://www.reddit.com/r/Professors/comments/1n6s361/
[1poao48]: https://www.reddit.com/r/Professors/comments/1poao48/
[1py0iel]: https://www.reddit.com/r/Professors/comments/1py0iel/
[1sxfvx5]: https://www.reddit.com/r/Professors/comments/1sxfvx5/
[1wkqa0g]: https://www.reddit.com/r/Professors/comments/1wkqa0g/
[1x0r3zy]: https://www.reddit.com/r/Professors/comments/1x0r3zy/
[1xcbbck]: https://www.reddit.com/r/Professors/comments/1xcbbck/
[1xipfks]: https://www.reddit.com/r/Professors/comments/1xipfks/

### IT helpdesk tickets

- **Who posts:** university helpdesk staff, student workers and sysadmins.
- **How often:** steady; password resets top the list in every university-helpdesk thread read (6 threads, 2024–2026).
- **Intensity:** medium for ticket content; high for burnout (1,140 points for a higher-ed IT burnout rant).
- **Workarounds:** self-service password reset (SSPR), refusing phone resets, knowledge bases, escalating to tier 2 through chat.

Examples:

- A former university tier-1 worker: "You're effectively a receptionist for the university … The most common tech-related calls are password resets, help getting connected to the wireless network", plus SaaS how-to questions (18 Aug 2026) ([What is tier 1 IT like in a fairly large and well known university?][1vrqtex]).
- A student helpdesk worker: "most of them were password reset"; a reply: "It gets crazy at the start and end of the semester", with "New/returning students who will have issues accessing their accounts" (3 Feb 2024) ([University IT help desk experience][1ai2841]).
- A school sysadmin has "about 30 students and 10 teachers calling us every 1 or 2 months because they've lost their password"; the top reply (219 points) blamed the 3-month expiry policy, "against all current best-practice guidance" (27 Nov 2025, 77 comments) ([How do you handle frequent password resets for students and teachers?][1p81hlk]). A state university still resets over the phone; peers asked "If you have SSPR setup then why are you entertaining the phone calls?" (9 Sep 2026, 65 comments) ([Password resets over the phone][1wbkm43]).
- Tier 1 often has no knowledge base: "most of the things people call about aren't even in the knowledge base" (23 Apr 2026, 158 points); top reply: "your department lacks proper documentation" ([Anyone else feel like tech support/help desk is braindead?][1stirrz]).
- Pay and burnout: "We require at least a Masters in computer science." "Starting salary: $25k." (859 points, under "Higher Ed IT, fuck this....", 25 Oct 2024, 1,140 points, 351 comments) ([Higher Ed IT][1gc0cuj]).

[1ai2841]: https://www.reddit.com/r/ITCareerQuestions/comments/1ai2841/
[1gc0cuj]: https://www.reddit.com/r/sysadmin/comments/1gc0cuj/
[1p81hlk]: https://www.reddit.com/r/sysadmin/comments/1p81hlk/
[1stirrz]: https://www.reddit.com/r/ITCareerQuestions/comments/1stirrz/
[1vrqtex]: https://www.reddit.com/r/ITCareerQuestions/comments/1vrqtex/
[1wbkm43]: https://www.reddit.com/r/sysadmin/comments/1wbkm43/

### Facilities: approvals, follow-ups and proof of work

- **Who posts:** facilities managers and project managers in government, campus, municipal and commercial buildings on r/FacilityManagement, a small sub (most posts under 50 points).
- **How often:** 13 threads read, 2023–2026; "what eats your time" and CMMS threads recur.
- **Intensity:** low to medium; frustration is with chasing people and clunky software, not with repairs.
- **Workarounds:** Excel pivot tables beside the CMMS, QR codes for fault reports and cleaning rounds, email-based request inboxes.

Examples:

- "Biggest hurdle is purchase orders", with contractors "chasing me while it slowly moves up the chain of approval"; another FM said the drain is "the follow-ups and status tracking … Is the PM done? Why is this still open?", which "easily eats a few hours every week" (28 Feb 2026, 28 comments) ([Facilities PMs: what eats up the most time each week?][1rgugm8]).
- A hackathon participant asked FMs what to build ("rather build something you'd genuinely use than something that demos nice and dies"); one answered "I use excel because my cmms is clunky and has trash ai features so I just track work with pivot tables" (11 Aug 2026, 37 comments) ([Need help for identifying problems in FM][1vld4kn]).
- Proving that cleaning happened: "QR code check in doesn't check the quality", and after geofencing, "found some cleaners had the QR code at their homes" (24 Apr 2026, 30 comments) ([How do you actually prove cleaning rounds?][1subfh7]). QR fault reporting is already common, but "Sometimes tenants leave out vital detail information", and some built it in-house ([Would a QR-based issue reporting tool save you time?][1mnej2o]).
- AI use is modest: "It writes my emails" (13 points) versus "I see little to no good reason for using AI in FM" (10 Jun 2026, 38 comments) ([AI for FM - IRL use cases][1u296rm]). Silent failures worry them too: "the real test isn't whether you can see a live feed it's whether you can pull up a recording from last tuesday" ([security camera stopped recording][1xgafzo]).

[1mnej2o]: https://www.reddit.com/r/FacilityManagement/comments/1mnej2o/
[1rgugm8]: https://www.reddit.com/r/FacilityManagement/comments/1rgugm8/
[1subfh7]: https://www.reddit.com/r/FacilityManagement/comments/1subfh7/
[1u296rm]: https://www.reddit.com/r/FacilityManagement/comments/1u296rm/
[1vld4kn]: https://www.reddit.com/r/FacilityManagement/comments/1vld4kn/
[1xgafzo]: https://www.reddit.com/r/FacilityManagement/comments/1xgafzo/

### Building automation: alarm floods and occupancy control

- **Who posts:** BMS technicians and controls engineers, including campus staff.
- **How often:** 6 threads read, 2024–2026; nuisance alarms and demand control recur.
- **Intensity:** low scores; strong scepticism about adding variables or AI.
- **Workarounds:** alarm classes and delays, CO2 thresholds with timers, schedules over sensing.

Examples:

- "I got 99 problems and my BMS' alarms are 368 of them" (67 points) and "Nuisance alarms should be engineered out" (21 Sep 2026) ([If your BMS generates 300 alarms a day][1wm8qx2]).
- Asked about occupancy-based airflow from CO2 and anonymous camera counts, technicians replied "Sounds like more ways to cause yourself problems" and "Demand ventilation based off Co2 sensors seems like the route to go" (12 Sep 2026, 35 comments) ([Occupancy-based airflow in a medical facility][1wepcg2]). The common CO2 alarm practice: "set it for 900-1000 ppm if it exceeds it on the space co2 sensor for 10 minutes" ([How do you generate an alarm for CO2 levels?][1dl6gzg]).
- Energy efficiency in one line: "Turn shit off as much as possible whilst pissing off the fewest occupants" (23 points) ([Energy Efficiency… has it helped?][1tgxpo7]). At APU, a student noticed classrooms "use AC at all time even when no one's in the class" ([After one sem in APU][1nsp664]).
- A campus BAS tech stuck with one vendor heard "Most of the times when I see a large messy BAS, it's because of a large messy organization" ([Switching campus away from Siemens][1fvbbbt]); an open-source fault-detection tool with AI tagging got "I downvoted you as soon as I saw AI" ([Open Fault Detection & Diagnostics][1rodpz8]).

[1dl6gzg]: https://www.reddit.com/r/BuildingAutomation/comments/1dl6gzg/
[1fvbbbt]: https://www.reddit.com/r/BuildingAutomation/comments/1fvbbbt/
[1rodpz8]: https://www.reddit.com/r/BuildingAutomation/comments/1rodpz8/
[1tgxpo7]: https://www.reddit.com/r/BuildingAutomation/comments/1tgxpo7/
[1wepcg2]: https://www.reddit.com/r/BuildingAutomation/comments/1wepcg2/
[1wm8qx2]: https://www.reddit.com/r/BuildingAutomation/comments/1wm8qx2/

## Sensors in practice

From r/homeassistant, where hobbyists run the same presence and air-quality sensors a campus pilot would use.

- **Presence sensors stick or drop out.** "I currently have Tuya one's and they work 90% of the time which is frustrating", and one of three Sonoff units "gets stuck in "occupied"" (18 Jun 2026, 70 comments) ([Reliable zigbee presence sensor][1u987kn]); an Aqara FP2 "was stuck at reporting occupation after just a short uptime" before going unavailable (20 Jul 2026) ([In need of reliable presence sensors][1v1iqlx]).
- **Network choice matters.** "Considering how much data comes from a presence sensor, I'd recommend not using Zigbee" (52 points); one user has seven Everything Presence Lite units that are "rock solid", while a Meross MS600 "was extremely flaky" (24 Aug 2026, 105 comments) ([MMWave presence sensors - which ones do you like?][1vx9cea]).
- **Cheap DIY often beats retail.** "I've been using ESP32-C3 and ld2410c modules. Cost is about $10" (11 points) ([In need of reliable presence sensors][1v1iqlx]).
- **Accurate CO2 costs money.** "many of the truly accurate ones use expensive sensors, especially for real CO₂ detection" drew 944 points and 250 comments; AirGradient's open-hardware kits were the top recommendation (24 Apr 2026) ([Building My Own Air Quality Monitor][1sub6bs]). An Apollo AIR-1 with CO2 "costs like 250 Euros here" ([Any recommendations for Co2 sensors?][1hu5hug]); IKEA's ALPSTUGA "works reasonably well, and is fairly cheap" ([Air quality sensors][1v7xemn]).

**Inference:** a credible campus sensing pilot needs mains or USB power, Wi-Fi or Ethernet rather than Zigbee for mmWave, and NDIR CO2 sensors (such as SCD4x) rather than estimated eCO2, or reviewers who know the hardware will discount the data.

[1hu5hug]: https://www.reddit.com/r/homeassistant/comments/1hu5hug/
[1sub6bs]: https://www.reddit.com/r/homeassistant/comments/1sub6bs/
[1u987kn]: https://www.reddit.com/r/homeassistant/comments/1u987kn/
[1v1iqlx]: https://www.reddit.com/r/homeassistant/comments/1v1iqlx/
[1v7xemn]: https://www.reddit.com/r/homeassistant/comments/1v7xemn/
[1vx9cea]: https://www.reddit.com/r/homeassistant/comments/1vx9cea/

## Automation people keep running

### What survives daily use

- **Who posts:** automation builders, small-business operators, IT and support staff.
- **How often:** "what do you actually use?" threads appear monthly across r/automation, r/n8n and r/AI_Agents (at least 12 such threads with 30–230 comments, 2025–2026).
- **Intensity:** medium; the strongest feeling is disappointment with flashy builds.
- **What stays:** email triage and digests, invoice and receipt filing, scheduled scrapes into a sheet, "when X happens, notify Y", ticket classification, backups with restore checks. **What gets dropped:** general "ops agents", personal RAG assistants, and anything that breaks when a channel or field is renamed.

Examples:

- "Real automation..... the kind that keeps lights on and payroll running ..is boring. It is deterministic"; the poster conceded "Using LLMs to parse unstructured text is their one actual killer feature" (18 Dec 2025, 128 points, 65 comments) ([The "AI Agent" fatigue is real][1ppfdrs]).
- "most of the "life changing" stories are just people automating their email replies and calling it revolution" (128 points) and "The boring agents have been way more useful than the flashy ones" (30 Sep 2026, 227 comments) ([What is an AI agent that changed your life for real?][1wu2d7b]).
- What people keep: a weekly email-to-spreadsheet summary that "cut about 40 minutes down to 5 and I still read it before sending" ([What's the smallest automation that saved you the most time?][1xedd82]); an email triage flow where urgent mail is pushed to the phone and "everything else gets a daily digest", and "The ones that last are the ones that run while you're away and don't ask you to confirm anything" ([What's the most useful thing you've set up to run automatically?][1wzajfb]); "just "when X happens, notify Y." Thats it. No branching logic, no AI" ([Most Useful "Boring" Automation][1vtlt00]).
- What gets dropped: a builder's Slack RAG assistant and AI news digest "work well technically, but honestly, they don't really deliver tangible value in my day-to-day life" (21 Jul 2025, 73 points, 67 comments) ([personal n8n automations that actually deliver value][1m5ip5g]); a Slack standup bot "was fine until someone changed the channel name and everything broke" ([Are AI agents in Slack actually useful?][1x996za]). The advice: pick a job that "happens at least weekly, and a wrong answer is cheap to fix" ([same thread][1x996za]).
- A team replaced a fragile morning routine ("Run a Google Apps Script to pull shift data • Export a CSV from one system • Import it into another") with eight n8n workflows ([How 8 n8n workflows replaced our entire staff scheduling system][1rb4rbs]).
- Silent failure is the main operating problem: "A run can finish green and still do nothing" (2 Nov 2026, 52 comments), answered with row-count checks, a dead man's switch and a daily canary record ([My workflow showed green for a week and did nothing][1xlq9m9]); "I broke them in three different ways, and not one produced a real error" ([My agent jobs succeed and fail at the same time][1u6azb3]); "none of it matters when a token expires" ([Biggest Real-World Problems AI Automation Engineers Face][1t61o9n]). Agency builds "quietly stop working" after three months because "Nobody has clean data" ([AI agencies are selling prompt wrappers][1wtpinc]).

[1m5ip5g]: https://www.reddit.com/r/n8n/comments/1m5ip5g/
[1ppfdrs]: https://www.reddit.com/r/automation/comments/1ppfdrs/
[1rb4rbs]: https://www.reddit.com/r/n8n/comments/1rb4rbs/
[1t61o9n]: https://www.reddit.com/r/n8n/comments/1t61o9n/
[1u6azb3]: https://www.reddit.com/r/automation/comments/1u6azb3/
[1vtlt00]: https://www.reddit.com/r/automation/comments/1vtlt00/
[1wu2d7b]: https://www.reddit.com/r/AI_Agents/comments/1wu2d7b/
[1wzajfb]: https://www.reddit.com/r/automation/comments/1wzajfb/
[1x996za]: https://www.reddit.com/r/automation/comments/1x996za/
[1xedd82]: https://www.reddit.com/r/automation/comments/1xedd82/
[1xlq9m9]: https://www.reddit.com/r/n8n/comments/1xlq9m9/

### Chatbot and agent fatigue

- **Who posts:** sysadmins, helpdesk leads, faculty, students.
- **How often:** frequent and loud through 2025–2026.
- **Intensity:** among the highest engagement in this study (2,053 points, 967 comments).

Examples:

- Executives at an organisation supporting 100,000 users planned to replace the whole helpdesk with AI agents within the year; top replies were "Let them do it and let it fail" (615 points) and "in 6 months rehire everyone when the complaints come in" (266 points) (6 May 2026, 2,053 points, 967 comments) ([My company executives thinks it can replace 100 percent of our help desk teams with AI agents][1t5hbop]).
- "Nobody actually wants AI service desks. Not us, not the users" (162 points). A builder reported their agent "can answer tier 0 tickets, and create a ticket. But reality is, no one wants to use it", and another warned that a front-door chatbot lets vendors claim "it handled 5000 issues this month!" (9 Dec 2025, 65 comments) ([Anyone actually running an AI service desk][1pi6lrr]).
- Universities buying chatbots: a student said their university "subscribed to ChatGPT Edu" at great cost; replies said institutions "have been burned/basically scammed by AI products like this", and at one university "professors cried foul, as did students and we blocked it" (28 Sep 2026, 100 points, 38 comments) ([My university … subscribed to ChatGPT Edu][1ws9hli]). A faculty member said that as posts go unfilled there is "a lot of "we don't have enough people for X, so of course we have to use AI"" ([Any AI bots replacing college staff?][1vr4p10]).
- Students are tired of AI-written coursework too: "Why should I be required to respond to robots like we're all real people having a real discussion?" (5 Jul 2024, 519 points, 118 comments) ([Sick of all the robots in my online course][1dvrwcr]).

[1dvrwcr]: https://www.reddit.com/r/college/comments/1dvrwcr/
[1pi6lrr]: https://www.reddit.com/r/sysadmin/comments/1pi6lrr/
[1t5hbop]: https://www.reddit.com/r/sysadmin/comments/1t5hbop/
[1vr4p10]: https://www.reddit.com/r/academia/comments/1vr4p10/
[1ws9hli]: https://www.reddit.com/r/BetterOffline/comments/1ws9hli/

## Hackathons: overdone versus memorable

- **Who posts:** students and early-career developers, mostly from India and the US, plus a few organisers and judges.
- **How often:** 83 hackathon titles from 2025–2026 in the sample, 26 of them mentioning AI tools, wrappers or vibe coding.
- **Intensity:** high: 1,207, 705, 401 and 322 points for the main "state of hackathons" threads.

What participants say is overdone:

- AI wrappers and chat front ends: "the competition is basically for who's paying for a better AI subscription", with non-technical teams "spinning up entire full stack applications with voice agents, chatbots and knowledge base RAGs" (31 Aug 2026, 1,207 points, 206 comments). The top reply (612 points): "no one's judged on maintainability or quality" ([Very saddened at the current state of hackathons][1w3dnsh]).
- "everyone that's called up for an award is an AI wrapper thats built by prompting AI (mostly Claude)" (21 Apr 2026, 401 points); pre-AI projects were "Lots of crud app with cool front end for things that already exists" ([How Were Hackathons Like Before The Major AI Boom?][1srdyz1]). "90% of ideas are just simple AI wrappers, the other 10% are some app to (buy/sell/find something(aggregators))" (12 Mar 2025, 322 points) ([Hackathons are DUMB][1j9m90u]).
- "hackathons are just claude code contests now" (221 points) ([now non-programmers are joining hackathons too][1vw7sqp]); "now everyone has working prototype made by claude or gpt...all u need is a god level presentation skill" ([Are hackathons becoming more about AI prompting?][1xbcajc]). Organisers are told to "level the playing field in some way so it isn't pay to win" (143 points) ([AI has eliminated hackathons][1x3wdrh]).
- Some feel juries reward polish over substance: only two of eight finalist teams built "without using AIs", and the jury "undervalue technically superior solutions" (13 Jun 2026, 89 points, 68 comments) ([Vibecoders flooded hackathons?][1u4psjk]).

What participants say wins or is remembered:

- Talking to judges first and doing one thing well: a team "spent the first 2 hours just talking to the judges informally before building anything"; they showed "a working prototype that did one thing perfectly. they won by a mile" (24 Mar 2026) ([smartest hackathon strategy][1s2di3z]). A six-time winner's rule: "You don't need a minimum viable product, you need a minimum presentable product" ([I've won at 6 hackathons][1mq2mv5]).
- Real hardware and offline resilience: an on-site winner built offline messaging over a BLE mesh, "sending text, images, voice notes, location, sos alerts" (22 Apr 2026, 203 points) ([Won my first offline Hackathon Finals][1ssn0mi]).
- Security is noticed: at one hackathon a participant found the sponsor's API "never checked if that token has access to other people's agent" and presented it (2 Nov 2026, 258 points) ([ended up hacking all of the participant's AI agents][1xlknio]).
- Judging opacity hurts trust in online events: a participant asked "Were the demos watched? How many submissions were reviewed?" despite a published rubric weighting technical execution 30%, reliability and evaluation 25%, usefulness 20%, originality 15% and demo clarity 10% (15 Sep 2026) ([I stayed up until 5:30 AM for this hackathon][1wh5vrv]).

**Inference:** a chatbot or RAG front end over campus documents is the most crowded shape at 2026 hackathons; entries are remembered for a narrow problem tied to what the judges said they want, a live demo that does one thing reliably, and something physical or offline that a prompt alone could not produce.

[1j9m90u]: https://www.reddit.com/r/csMajors/comments/1j9m90u/
[1mq2mv5]: https://www.reddit.com/r/hackathon/comments/1mq2mv5/
[1s2di3z]: https://www.reddit.com/r/hackathon/comments/1s2di3z/
[1srdyz1]: https://www.reddit.com/r/csMajors/comments/1srdyz1/
[1ssn0mi]: https://www.reddit.com/r/hackathon/comments/1ssn0mi/
[1u4psjk]: https://www.reddit.com/r/hackathon/comments/1u4psjk/
[1vw7sqp]: https://www.reddit.com/r/csMajors/comments/1vw7sqp/
[1w3dnsh]: https://www.reddit.com/r/cscareerquestions/comments/1w3dnsh/
[1wh5vrv]: https://www.reddit.com/r/hackathon/comments/1wh5vrv/
[1x3wdrh]: https://www.reddit.com/r/csMajors/comments/1x3wdrh/
[1xbcajc]: https://www.reddit.com/r/hackathon/comments/1xbcajc/
[1xlknio]: https://www.reddit.com/r/developersIndia/comments/1xlknio/

## Signals

### Themes ranked by frequency and intensity

**Inference:** frequency and intensity are each scored 1–3 as judgements from the counts and engagement above, not measurements; the rank is their product.

| Rank | Theme                                                      | Frequency | Intensity | Score | Scope                      |
| ---- | ---------------------------------------------------------- | --------- | --------- | ----- | -------------------------- |
| 1    | Haze, heat and flash floods disrupting study               | 3         | 3         | 9     | Malaysia; APU clubs closed |
| 1    | Chatbot and AI-agent fatigue in support and teaching       | 3         | 3         | 9     | Global                     |
| 1    | Lecturer attendance policing and email load                | 3         | 3         | 9     | Global (US-heavy)          |
| 4    | International-student visa pipeline (EMGS, 80% rule)       | 3         | 2         | 6     | Malaysia; many APU cases   |
| 4    | APU bursary, admissions and residence replies              | 2         | 3         | 6     | APU                        |
| 4    | Information scattered for new and prospective students     | 3         | 2         | 6     | APU                        |
| 4    | Hackathons crowded with AI wrappers                        | 2         | 3         | 6     | Global                     |
| 4    | Automations that stick are boring; silent failures         | 3         | 2         | 6     | Global                     |
| 4    | Presence and CO2 sensor reliability and cost               | 3         | 2         | 6     | Global (hobbyist)          |
| 10   | Campus Wi-Fi and filtering                                 | 2         | 2         | 4     | APU and Malaysia           |
| 10   | Lifts, laundry and deposits (campus and residences)        | 2         | 2         | 4     | APU                        |
| 10   | Helpdesk password and Wi-Fi tickets, intake login failures | 2         | 2         | 4     | Global; APU intake         |
| 10   | Survey respondents for final-year projects                 | 2         | 2         | 4     | Malaysia                   |
| 14   | Commute: shuttle, LRT Bukit Jalil, traffic                 | 2         | 1         | 2     | APU and Klang Valley       |
| 14   | Facilities follow-ups, approvals, proof of work            | 2         | 1         | 2     | Global                     |
| 16   | BMS alarm floods and occupancy-control scepticism          | 1         | 1         | 1     | Global                     |

**Inference:** the strongest APU-specific evidence is the chain from bursary delays to Moodle locks to attendance to visa renewal, which joins the two highest APU and Malaysia themes; the strongest Malaysia-specific evidence is the 2026 haze, whose engagement exceeds every other topic in this study.

### Unmet needs

**Inference:** each line names a need the posts show is unmet; none is a product proposal.

- **One view of attendance standing against the 80% visa rule (APU and Malaysia).** Students cannot see their semester average, do not know whether the rule is per module or per semester, and only learn of Moodle or bursary blocks after attendance is lost.
- **Air-quality and weather information that drives class decisions (Malaysia).** During the 2026 haze, schools had API thresholds while universities had none; students and lecturers saw delayed official readings and ad hoc switches to online classes.
- **Status visibility for admin requests (APU).** Payments, deposits, admissions and accommodation forms vanish into email and WhatsApp with no status, and replies take weeks.
- **A single, current source for incoming students (APU).** Shuttle times, break dates, schedules, clubs, accommodation and visa steps are answered piecemeal on Reddit, Instagram and agents, and some questions get no answer at all.
- **Reliable visa progress expectations (Malaysia).** Students compare EMGS percentages with strangers because the official tracker shows no reason for a stall and universities give fixed late-arrival limits.
- **Fewer repeat tickets at intake (global, APU-relevant).** Password resets, first logins and Wi-Fi dominate university helpdesks at semester start; staff prefer self-service to chatbots.
- **Automations that fail loudly (global).** Builders keep simple scheduled flows with human review and add their own checks, because runs that "finish green" still lose data.
- **Trustworthy low-cost sensing (global).** Hobbyists and BMS staff distrust cheap presence and eCO2 sensors and extra control variables; credible pilots need proven hardware and simple thresholds.

## See also

- [Hackathon brief](/docs/BRIEF.md) and [hackathon context](/docs/CONTEXT.md): rules, tracks, judging lens and decisions so far.
- [APU public documents](/docs/research/apu-public-documents.md): what APU itself publishes about its services and systems.
- [IoT and network](/docs/research/iot-and-network.md): sensor and connectivity options, including the real-versus-simulated data rules.
- [Public data sources](/docs/research/public-data-sources.md): live feeds such as air quality and weather.
- [Judging and pitching](/docs/research/judging-and-pitching.md) and [past winners](/docs/research/past-winners.md): what judges reward and which idea types are crowded.

[1h0u08i]: https://www.reddit.com/r/malaysia/comments/1h0u08i/
[1l4ub3h]: https://www.reddit.com/r/malaysiauni/comments/1l4ub3h/
[1m3mxwi]: https://www.reddit.com/r/malaysiauni/comments/1m3mxwi/
[1mrn8qj]: https://www.reddit.com/r/malaysiauni/comments/1mrn8qj/
[1nsp664]: https://www.reddit.com/r/malaysiauni/comments/1nsp664/
[1qxe918]: https://www.reddit.com/r/malaysiauni/comments/1qxe918/
[1wtpinc]: https://www.reddit.com/r/automation/comments/1wtpinc/
