# Pain points from other social platforms

Evidence of everyday pain points from public posts on platforms other than X and Reddit: Lowyat.NET, Google Maps and job-review sites, TikTok, Instagram, Threads, YouTube, Bluesky and Hacker News. It covers APU's Bukit Jalil campus and residences, Malaysian university life, university operations staff, and what practitioners say about automation, chatbots and building IoT. Researched on 3 November 2026.

Contents:

1.  [Method](#method)
    1.  [Lowyat forum method](#lowyat-forum-method)
    1.  [Review sites method](#review-sites-method)
    1.  [Short-video and social apps method](#short-video-and-social-apps-method)
    1.  [Bluesky method](#bluesky-method)
    1.  [Hacker News method](#hacker-news-method)
    1.  [Other Malaysian communities method](#other-malaysian-communities-method)
    1.  [Coverage limits](#coverage-limits)
1.  [APU campus themes](#apu-campus-themes)
    1.  [Admin replies and handoffs](#admin-replies-and-handoffs)
    1.  [Residence upkeep and theft](#residence-upkeep-and-theft)
    1.  [Timetable churn and a compressed calendar](#timetable-churn-and-a-compressed-calendar)
    1.  [Shuttle buses and the LRT last mile](#shuttle-buses-and-the-lrt-last-mile)
    1.  [Wi-Fi, power and core platforms](#wi-fi-power-and-core-platforms)
    1.  [Lifts, stairs and crowding](#lifts-stairs-and-crowding)
    1.  [Closed-loop payments and paperwork](#closed-loop-payments-and-paperwork)
    1.  [Parking supply and safety](#parking-supply-and-safety)
    1.  [Heat, rain and flash floods](#heat-rain-and-flash-floods)
    1.  [Campus safety and emergency information](#campus-safety-and-emergency-information)
    1.  [Enquiry gaps for prospective students](#enquiry-gaps-for-prospective-students)
    1.  [Showcase technology versus basics](#showcase-technology-versus-basics)
1.  [University operations themes](#university-operations-themes)
    1.  [Lecturer and admin staff load](#lecturer-and-admin-staff-load)
    1.  [Fragile and fragmented university systems](#fragile-and-fragmented-university-systems)
1.  [Practitioner themes](#practitioner-themes)
    1.  [Automation that sticks](#automation-that-sticks)
    1.  [Chatbot fatigue](#chatbot-fatigue)
    1.  [Building and campus IoT in practice](#building-and-campus-iot-in-practice)
    1.  [What hackathon crowds are tired of](#what-hackathon-crowds-are-tired-of)
1.  [Signals](#signals)
    1.  [Ranking by frequency and intensity](#ranking-by-frequency-and-intensity)
    1.  [What people ask for](#what-people-ask-for)
    1.  [Unmet needs](#unmet-needs)
1.  [See also](#see-also)

## Method

All collection ran on 3 November 2026 against public pages and official APIs. In total about 5,000 items were scanned and a few hundred read closely; more than 100 are cited below. Posters are labelled by role; names and handles of private individuals are left out, and links to private individuals' TikTok videos use the handle-free `tiktok.com/@/video/<id>` form.

### Lowyat forum method

- Search: 14 Brave Search API queries with `site:forum.lowyat.net`, 12 of them restricted to 1 January 2024 – 3 November 2026. Queries covered APU, Asia Pacific University, Bukit Jalil, LRT Bukit Jalil, EMGS visas, university hostels, flash floods, lecturer workload, rent and Vista Komanwel.
- Browse: the first five pages of the Education Essentials board (150 topic titles), fetched directly with `curl`.
- Read: 19 threads (726 posts) parsed from HTML. Lowyat's own search needs a login and was not used.
- Yield: APU threads with real discussion are mostly 2010–2022. From 2024 onward, Lowyat contributes Bukit Jalil traffic, parking and flood threads, one APU security incident thread, one APU DBA enquiry, and general Malaysian higher-education threads. The Education board is quiet now: most 2024–2026 topics have 0–10 replies.

### Review sites method

- Google Places API (New) failed with `Requests to this API places.googleapis.com method google.maps.places.v1.Places.SearchText are blocked`, and the legacy Places API returned `REQUEST_DENIED` (legacy API not enabled).
- Bright Data's Google Maps reviews dataset failed with `Customer is not active`.
- Google Maps reviews were collected instead with the Apify actors `compass/crawler-google-places` and `compass/Google-Maps-Reviews-Scraper`, with reviewer personal data turned off.
- APU main campus place (4.4 stars, 1,924 reviews): the 300 newest plus the 332 lowest-rated reviews, 549 unique. Of these, 420 are dated 2024–2026 (27 in 2024, 71 in 2025, 322 in 2026), 213 of those have text, and 58 are 1–2 stars with text. All 420 had 0 likes and none had an owner reply.
- Residences: APU Satellite Campus Residence (3.3 stars, 35 reviews) and APU Dormitory K1 (1.8 stars, 4 reviews), 39 reviews in all. Technology Park Malaysia Business Center (150) and the Bukit Jalil LRT bus stop (5) were skimmed and are not cited.
- Staff reviews: the Jobstreet APU page served 30 reviews dated June 2019 – May 2024. Indeed returned HTTP 403 to `curl`, but Firecrawl got the page: 37 reviews, 13 visible, dated March 2020 – August 2026. EasyUni's review page held only editorial text.
- Counts per theme come from keyword tags on the 58 low-star texts, so they are approximate.
- **Inference:** 178 of the 322 reviews from 2026 have no text and 243 of the 300 newest are 5 stars, so the star average hides the complaints, which sit in the text reviews.

### Short-video and social apps method

- TikTok, via ScrapeCreators `/v1/tiktok/search/keyword`: 21 searches returned 627 results. Queries included APU lift, APU campus tour, APU hostel, APU shuttle bus, APU Wi-Fi, day in my life APU, APU apcard top up, APU parking Bukit Jalil, APU cafeteria, Bukit Jalil banjir, LRT Bukit Jalil, EMGS visa delay, university lift queue Malaysia, and private university Malaysia honest review.
- TikTok comments, via `/v1/tiktok/video/comments`: first page for 11 videos, 193 comments read out of 1,637 reported in total.
- Many "APU" hits were other things: Azusa Pacific University in the US (including a 77,995-like parking video), Ritsumeikan APU in Japan, aircraft and truck auxiliary power units, and a powerlifting federation. These were excluded.
- Instagram, via `/v2/instagram/reels/search` and `/v2/instagram/post/comments`: 2 searches returned 20 reels, mostly from APU and education agents; 52 comments read on 4 reels.
- Threads: ScrapeCreators has no keyword search for Threads. Three `site:threads.com` and `site:threads.net` Google searches via `/v1/google/search` found no APU student posts. APU's official Threads account had 0–7 likes and 0 replies on its 15 latest posts.
- YouTube: `yt-dlp` searches (4 queries, 12 results each) gave 37 unique videos. Comments were pulled with `yt-dlp --skip-download --write-comments` for 8 videos (189 comments), and 3 transcripts via ScrapeCreators `/v1/youtube/video/transcript`. YouTube comment dates are approximate, because `yt-dlp` works them out from relative times such as "1 year ago".

### Bluesky method

- Logged in with the project account against `bsky.social` and used only `app.bsky.feed.searchPosts`, with `sort=top` and `since=2024-01-01`.
- 25 queries returned 862 posts. Queries included admin burden academics, university admin emails students, marking workload university, timetabling university, Moodle, VLE university, university IT helpdesk, extension requests students, university chatbot, academic workload model, same questions students email, room booking university, eduroam, campus lifts broken, AI agents actually useful work, universiti Malaysia pensyarah, and admin staff university workload.
- The voices are mostly UK, US and EU academics. The Malay-language query returned only news bots.

### Hacker News method

- Algolia API (`hn.algolia.com/api/v1/search`), limited to posts after 1 January 2024: 26 story queries and 22 comment queries.
- Topics: AI agents in production, real examples of agents, the 95% genAI pilot failure report, Klarna's AI customer service, chatbots, smart buildings, occupancy, LoRaWAN, flood sensors, university administration, Moodle, student information systems, air-quality sensors, and hackathons.
- 12 threads were read through `/api/v1/items` (1,543 comments), ranking top-level comments by number of replies. HN does not expose comment scores.

### Other Malaysian communities method

- Cari (`site:cari.com.my`, 2 Brave queries): APU threads date from 2014–2018 only, so none are cited.
- Medium (`site:medium.com`, 1 query): no APU student posts about campus life from 2024 onward surfaced.
- APRide, a ride-matching site for verified APU students and staff, has a guide page that documents the shuttle gap and the workaround students use.
- No APU student newspaper pages with comments were found.

### Coverage limits

- Google review text tilts towards unhappy reviewers, and these platforms under-represent quiet, satisfied students.
- Lifts and queues between classes came up far less here than expected. Only one strong Instagram comment and one dorm review mention lifts.
- APU staff voices are thin after 2024. Most Jobstreet and Indeed reviews are from 2019–2023.
- Bluesky and Hacker News describe UK, US and EU universities and the global tech industry, not Malaysia.

## APU campus themes

Each theme gives who has the problem, how often it shows up in these sources, how intense it is, the workarounds in use, and cited examples. Unless stated otherwise, "low-star" means the 58 one- and two-star Google reviews of the APU main campus with text, dated 2024–2026.

### Admin replies and handoffs

- Who: current students, graduates waiting for documents or refunds, international students, parents calling in, and prospective students.
- How often: the most common topic. About 37 of the 58 low-star texts mention admin, staff, replies, email, phone or management. None of the 420 reviews dated 2024–2026 had an owner reply.
- Intensity: high. Reviewers describe a job offer at risk, refunds outstanding for months, and friends "forced to return to their home countries".
- Workarounds: repeated emails, Virtual Help Center tickets, WhatsApp messages to counsellors, and public Google reviews addressed to management as a last resort.
- Examples:
  - A graduate has waited "almost 4 months" for the degree; an internship employer is asking for it, and two weeks of emails went unanswered ([Google Maps][gm-apu], 1 star, 21 Dec 2025).
  - A graduate's library deposit refund, requested in May 2025, "has still not been processed, and my follow-up emails have largely been ignored" ([Google Maps][gm-apu], 1 star, 16 Mar 2026).
  - "When I had outstanding payments, they reply quickly. Now that I've completed everything, I get ignored." ([Google Maps][gm-apu], graduate, 1 star, 25 Mar 2026).
  - A parent asking how to make the first payment was "blind-transferred" and "passed from one department to another" ([Google Maps][gm-apu], 1 star, 16 Jun 2026).
  - Documents handed in before the deadlines were not forwarded "to the Malaysian immigration authorities", and friends had to go home ([Google Maps][gm-apu], student, 1 star, 21 Oct 2026). Another student wrote: "The Program Leader will only reply after two or three weeks—if they bother to reply at all" (1 star, 7 Sep 2025). A parent's graduation-photo complaint ended with "The admin didn't reply and close my ticket" (1 star, 15 Sep 2026).

### Residence upkeep and theft

- Who: residents of on-campus and satellite housing, many of them international students.
- How often: about 19 items from 2024–2026, across the residence pages, main-campus reviews, TikTok and YouTube. APU Satellite Campus Residence is rated 3.3 stars and APU Dormitory K1 1.8 stars; most of their reviews since 2024 are 1 star.
- Intensity: high. Reviewers report mould and illness, stolen food and clothes, power cuts and dirty water.
- Workarounds: buying a water filter, renting privately through Facebook Marketplace or Mudah, and moving to nearby condominiums such as Parkhill.
- Examples:
  - "Never consider staying in APU accommodation." This was the top comment, with 103 likes, on an EasyUni video about APU housing costs ([TikTok][tt-easyuni], 23 Jun 2025). Other comments mention staff entering rooms "to check" and "cockroaches everywhere" (12 and 10 likes).
  - In 7 months: three whole-floor power cuts, five dead sockets in a single room, yellow water twice and roof leaks twice ([Google Maps][gm-satellite], 1 star, 3 Nov 2026, translated from Chinese).
  - Theft is common, the warden made the residents' WhatsApp group admin-only, and a request for CCTV footage through the Virtual Help Center went unanswered ([Google Maps][gm-satellite], 1 star, 12 Jul 2026).
  - Mould and spiders under the mattress; "despite reporting these problems, no one came to fix anything", and then the resident was blamed for damage ([Google Maps][gm-apu], international student, 1 star, 9 Jul 2025).
  - On-campus electricity "INSTANTLY stops" if payment is slightly late, "at 4AM in the middle of the night" ([Google Maps][gm-k1], 1 star, 6 Mar 2025). A satellite resident wrote: "CCTV are all decoration which cannot be checked" ([Google Maps][gm-satellite], 1 star, 31 Aug 2024).

[gm-satellite]: https://www.google.com/maps/place/?q=place_id:ChIJ397hrxdLzDERavbkybMtkfU
[tt-easyuni]: https://www.tiktok.com/@easyuni1/video/7517644627990711557

### Timetable churn and a compressed calendar

- Who: students, especially working students and diploma-to-degree students, and lecturers who teach across overlapping intakes.
- How often: 15 of the 58 low-star texts mention timetables, schedules, exams or breaks. An Instagram comment and four Jobstreet or Indeed staff reviews raise the same calendar.
- Intensity: high. One student was marked absent after being given the wrong timetable, another says "lose my sanity", and others report exams bunched into one week.
- Workarounds: none visible. Changes reach students through lecturers' or administrators' announcements.
- Examples:
  - "The time table changes every week." Changes are "announced by the lecturers or administrators" ([Google Maps][gm-apu], diploma student, 1 star, 4 Mar 2026).
  - A student was given a timetable for another major: "I got marked absent because of this" ([Google Maps][gm-apu], 1 star, 2 Mar 2026).
  - "They pack 3–4 exams into one week" ([Google Maps][gm-apu], 2 stars, 16 Nov 2025). Year 3 engineering students get "only… 1 week break" between semesters (1 star, 11 May 2026). Another student asked on 9 Dec 2025 why there was still "no plan for holiday schedule 2026" (1 star).
  - "Lots of holidays and timetable shifts, difficult for working students" ([Google Maps][gm-apu], 2 stars, 12 Nov 2024). An Instagram commenter wrote "Timetable arrangement is horrendous" under APU's campus reel ([Instagram][ig-campus], 17 May 2024, 3 likes).
  - Staff describe the same calendar from the other side: "no semester break due to many intakes" (lecturer, 18 Nov 2019), "non-stop intake throughout the year" (lecturer, 29 Jul 2022), and "Overlapping intake can be a problem" (lecturer, 23 May 2024) ([Jobstreet][jobstreet-apu]).

### Shuttle buses and the LRT last mile

- Who: residents of off-campus APU housing such as M Vertica, commuters from LRT Bukit Jalil, and students with late classes or weekend errands.
- How often: 13 of the 58 low-star texts mention the bus, shuttle, taxi or LRT. The topic recurs in TikTok comments, and students have built a ride-matching site around the gap.
- Intensity: medium to high. Students describe being late for class "even during exam season" and paying more for e-hailing when it rains.
- Workarounds: e-hailing, the LRT, walking, and APRide, a free board for verified APU students and staff to share rides between eight fixed pickup points, coordinated over Microsoft Teams.
- Examples:
  - At M Vertica, "the bus either doesn't come, comes too early, comes too late or when on time it's always full". A later update to the same review says more shuttle times were added ([Google Maps][gm-apu], 1 star, 13 Nov 2024).
  - "Bus doesn't really adopt to peak hour stacking so expect long queue times at 8am and 5pm" ([Google Maps][gm-apu], 2 stars, 12 Nov 2024).
  - The commuter bus runs on weekdays only, and the taxi to LRT Bukit Jalil is pricey: "if it is raining, fare will increase up to 50%" ([Google Maps][gm-apu], 1 star, 25 Apr 2025). Other reviewers wrote "the bus shuttle always didn't reach in time" (1 star, 25 Jun 2026) and "Bus Service absolutely tak boleh pakai" (Malay: unusable) (1 star, 25 Sep 2026).
  - "the buses are very crowded at peak time (not sure if this is fixed or not)" ([TikTok][tt-abroadassist], comment, 28 Jul 2026).
  - APRide's guide says late classes and weekends break "the weekday shuttle rhythm", leaving rail, e-hailing and pre-arranged peer rides ([APRide][apride], 27 Aug 2026).

[apride]: https://apride.net/guides/weekend-late-class-commute

### Wi-Fi, power and core platforms

- Who: students in classrooms and residences, and anyone who depends on Moodle or APSpace.
- How often: 10 of the 58 low-star texts mention Wi-Fi, internet, systems or sockets. Residence reviews and comments add more.
- Intensity: medium to high. One resident "cant even make a whatsapp video call"; another reports Moodle and APSpace "constantly crashing".
- Workarounds: none effective. One resident was not allowed to install their own router.
- Examples:
  - "It's got the worst WiFi connection among all the universities in Malaysia. Technology and innovation without a stable internet connection" ([Google Maps][gm-apu], 1 star, 29 Oct 2026). Another reviewer wrote "Internet sucks in on campus" (1 star, 3 Sep 2026).
  - "never seen a 'tech' uni with such bad wifi. Cant even make a whatsapp video call or join a regular discord call" ([Google Maps][gm-apu], on-campus resident, 1 star, 17 Sep 2026).
  - "Moodle and APspace constantly crashing. Need for better/New servers." ([Google Maps][gm-apu], 2 stars, 18 Jun 2026).
  - Dorm Wi-Fi is "disgusting… as if in prison", with client isolation and blocked sites ([Google Maps][gm-k1], 1 star, 5 Jan 2025).
  - Classrooms have "around 50% of broken sockets" ([TikTok][tt-abroadassist], comment, 28 Jul 2026). An earlier review said "Their classrooms lack of sockets" (1 star, 16 Feb 2024).

### Lifts, stairs and crowding

- Who: students moving between classes in the multi-storey blocks, residents of the on-campus dorm, and disabled users (the last from outside APU).
- How often: low in these sources. Two lift-specific items and 7 low-star overcrowding mentions, against an Instagram lift comment that drew 18 likes on APU's own reel. Bluesky adds three posts about broken lifts at other universities.
- Intensity: high where it happens. Students describe climbing stairs to floors 8–9 and arriving late to class.
- Workarounds: taking the stairs. At other universities, people built a crowdsourced lift-status page and an email list for broken lifts.
- Examples:
  - "most of the student is climbing stairs to 8,9 floor. A block have 9 floor 15classes a floor only two lift. Lift always full" ([Instagram][ig-orientation], comment on APU's orientation reel, 27 Oct 2026, 18 likes).
  - In the on-campus dorm, "elevator buttons have been broken for at LEAST 6 months and still 0 intent to fix it" ([Google Maps][gm-k1], 1 star, 6 Mar 2025).
  - "You can barely walk on campus because of the overwhelming number of new students" ([Google Maps][gm-apu], 1 star, 2 Mar 2026). Another reviewer: "Somwtimes its too crowded and dirty, getting to places is also very confusing" (4 stars, 12 Jul 2026).
  - At another university, a student was "sick of the campus estates page not being accurate about broken lifts" and started an Instagram page for reporting them ([Bluesky][bs-lift-ig], 28 Nov 2025).
  - "the lifts are tiny and often broken and full of undergrads… I am sometimes late to class" ([Bluesky][bs-lift-late], disabled poster at another university, 2 Dec 2025, 38 likes).

[bs-lift-late]: https://bsky.app/profile/did:plc:qkdhh5qqywsxc5wpq4n2nkue/post/3m6zvvhvz2c2z

### Closed-loop payments and paperwork

- Who: every student who buys food on campus, and students paying fees.
- How often: about 8 items across reviews, Instagram and TikTok, plus two separate reviews about emailing fee receipts.
- Intensity: medium, but daily: "queue up to 10 minutes just to pay for your food".
- Workarounds: carrying cash for the top-up machine, topping up through online banking, and emailing bank receipts to Bursary. One reviewer asks whether students now eat off campus where e-wallets work.
- Examples:
  - "You can queue up to 10 minutes just to pay for your food." Cafeterias may not accept Touch 'n Go (TNG) or bank QR codes, card payments carry a surcharge, and the student card is topped up with cash or online banking ([Google Maps][gm-apu], 2 stars, 10 Apr 2026).
  - A review written as a poem, "The Top-Up Trap": "'No TNG,' the sign declares… 'No DuitNow,' the lady cries" ([Google Maps][gm-apu], 2 stars, 25 Apr 2026).
  - "You forgot to show the long queue to top up your apcard" ([TikTok][tt-apu-tour], comment on APU's official campus tour, 16 Apr 2024, 3 likes).
  - "only way to top up is cash… isn't this a tech university so why not use tng or other e wallet methods" ([Instagram][ig-campus], 17 May 2024, 3 likes).
  - Fee payers must "send the bank receipt to APU's email address"; the reviewer suggests "an attachment system in APSpace" ([Google Maps][gm-apu], 1 star, 3 Jun 2024). Another: "When u make payment still have to send the receipt to the Bursary team" (1 star, 16 Feb 2024).

[tt-apu-tour]: https://www.tiktok.com/@apumalaysia/video/7358363774417472785

### Parking supply and safety

- Who: students who drive, parents, students sitting exams, and Bukit Jalil residents on stadium event days.
- How often: about 8 review mentions since 2024, some of them positive, plus Lowyat threads on Bukit Jalil congestion and illegal parking.
- Intensity: medium overall, high in one case: an accident ending in a police summons and loss of the no-claims discount on insurance.
- Workarounds: parking around Technology Park Malaysia, with a RM100 clamp risk, and trying the MRANTI spaces, which security says are for contractors.
- Examples:
  - "The parking here is the most atrocious thing in APU." The basement's one-way layout forces drivers to reverse, which causes jams, and the fee went from RM5.50 to RM5.60 ([Google Maps][gm-apu], 2 stars, 10 Apr 2026).
  - A parent writes that after the entry and exit were swapped, the arrows and stop lines were never moved. Their daughter's crash at a blind T-junction in late January 2026 was ruled her fault, and the campus facilities, safety and welfare head deflected responsibility. Three months on, nothing had changed ([Google Maps][gm-apu], 1 star, 3 May 2026, translated from Chinese).
  - "Always lacking parking slots, especially when taking exams". Students park outside, risking "RM100 to unclamp" ([Google Maps][gm-apu], 1 star, 25 Mar 2026).
  - Season parking was withdrawn; outdoor parking costs RM4.77 a day and indoor RM5.30 ([Google Maps][gm-apu], 1 star, 3 Jun 2024).
  - Around APU: "Solve the double parking and congestion issue at muhibbah station dulu [first] then we talk" ([Lowyat][ly-bj20], 28 Oct 2026). A landlord near the stadium wrote: "when's there concert or football matches The whole bukit jalil will be damn jam" ([Lowyat][ly-oversupply], 26 Apr 2025).

[ly-oversupply]: https://forum.lowyat.net/topic/5520371/all
[ly-bj20]: https://forum.lowyat.net/topic/5581601

### Heat, rain and flash floods

- Who: commuters through LRT Bukit Jalil, students in the canteen, auditorium and bus waiting area, and anyone who relies on e-hailing when it rains.
- How often: about 6 review mentions, one viral flood video and a Lowyat flood thread.
- Intensity: medium. Students describe a "sauna" bus waiting area and flooded fare gates at the evening peak.
- Workarounds: checking forum threads for flood reports before deciding to travel, and paying surge fares.
- Examples:
  - "the university is flooded during heavy rain", and club activities displaced outdoors face weather that is "extremely hot" ([Google Maps][gm-apu], 1 star, 25 Mar 2026).
  - "Scorching hot canteen area/auditorium". The reviewer asks for fans or air-conditioning: "We're living in Malaysia, not Greenland" ([Google Maps][gm-apu], 1 star, 3 Jun 2024).
  - The bus waiting area is indoors and "the air conditioner is usually broken making the place feel like a sauna" ([Google Maps][gm-apu], 1 star, 12 Nov 2024). An Instagram commenter wrote "Campus is hot af unless u go into classes" ([Instagram][ig-campus], 17 May 2024).
  - The Bukit Jalil LRT station flooded on 6 May 2026; floodwater "flowed past the automated fare gates" during the evening peak ([TikTok][tt-says-flood], SAYS, 7 May 2026, 34,157 likes, 525 comments). Comments include "Drains all clogged".
  - A KL commuter checks the forum on rainy mornings "to see if anyone open thread show the flood" before choosing between the office and working from home ([Lowyat][ly-flood], 17 Oct 2024).

[ly-flood]: https://forum.lowyat.net/topic/5489147/all
[tt-says-flood]: https://www.tiktok.com/@saysdotcom/video/7637035932121582855

### Campus safety and emergency information

- Who: APU security and facilities staff, visiting school groups, parents, and residents.
- How often: about 8 items across Lowyat, TikTok and reviews.
- Intensity: high: an intruder, a bomb threat, a car crash and repeated theft.
- Workarounds: news spreads through TikTok and Reddit, parents ask strangers in comments to confirm rumours, and residents ask for CCTV footage.
- Examples:
  - A man with no ties to APU removed his trousers during a schools' seminar on campus. APU's chief operating officer said, as quoted in the thread: "We need to know when and how this person entered the hall" ([Lowyat][ly-seminar], 9 Feb 2026, 20 posts).
  - On a video about a bomb-threat evacuation at Monash University Malaysia, the top comment (1,265 likes) was "u got all ur news from reddit". Parents wrote "As parents we were really worried about our kids safety" and "is this true my daughter there" ([TikTok][tt-monash], 5 Jun 2026, 20,453 likes, 183 comments).
  - Others asked about rumours: "today I heard Sunway too. Idk the info legit or not, can anyone confirm?" ([TikTok][tt-monash], 10 Jun 2026).
  - Residence security: CCTV that is "decoration" and food and clothes theft, covered under [Residence upkeep and theft](#residence-upkeep-and-theft). The parking crash is covered under [Parking supply and safety](#parking-supply-and-safety).

[tt-monash]: https://www.tiktok.com/@/video/7647723804998913287
[ly-seminar]: https://forum.lowyat.net/topic/5554818/all

### Enquiry gaps for prospective students

- Who: prospective students, especially postgraduate and international applicants, and their parents.
- How often: three Open Day or counsellor complaints in 2025–2026, and dozens of repeated questions under YouTube and TikTok videos.
- Intensity: medium. Several applicants say they lost a month, or a whole visit.
- Workarounds: asking student YouTubers and agents in comments and DMs, WhatsApp counsellors, and agents' "comment EMGS" lead-generation posts.
- Examples:
  - At the Open Day on 18 April 2026, "we found no counselors available"; staff were busy with a graduation ceremony ([Google Maps][gm-apu], prospective student, 1 star, 25 Apr 2026).
  - At the 9 May 2026 Open Day, "no staff member available to handle postgraduate programme enquiries" ([Google Maps][gm-apu], 1 star, 9 May 2026).
  - A counsellor "dragged my inquiry for nearly a month" ([Google Maps][gm-apu], applicant, 2 stars, 16 Oct 2025).
  - Repeated pre-arrival questions under student videos, all with 0–2 likes: "Does the attendance renew every semester…?" ([YouTube][yt-first-year], about Jul 2026), "can you make a video about living costs?" ([YouTube][yt-worth-2025], about Jun 2026), and "Do you have to buy food or is it free in cafeteria?" ([TikTok][tt-intl-vlog], 24 May 2026).
  - A working IT professional considering a DBA "saw negative review for APU about lecturers and facilities. Im so puzzled" ([Lowyat][ly-dba], 17 Nov 2025, 3 posts).

[yt-first-year]: https://www.youtube.com/watch?v=laBhvABYTCM
[tt-intl-vlog]: https://www.tiktok.com/@/video/7623275804524334369
[ly-dba]: https://forum.lowyat.net/topic/5546503/all

### Showcase technology versus basics

- Who: current students and alumni.
- How often: 32 of the 58 low-star texts mention fees or money, and the most-liked comment found on APU's own Instagram makes this point.
- Intensity: medium, but it sets the tone: students judge new technology against broken basics.
- Workarounds: none. Students warn others off in comments.
- Examples:
  - "Instead of improving the quality of your course offerings, lecturers, classrooms, and scheduling, you choose to invest our money into dancing robots?" ([Instagram][ig-orientation], 26 Oct 2026, 107 likes). The reply "The same robots that is gonna take over their jobs" got 81 likes.
  - "because it is a tech school, I expect technology should not be an issue here. But APU, you just proved me wrong" ([Google Maps][gm-apu], 1 star, 3 Jun 2024).
  - "APU should be in number 10 bruh fcked up my life and sleep schedule" ([TikTok][tt-ranking], comment on a Malaysian private-university ranking, 27 Apr 2026, 41 likes).
  - YouTube student reviewers list the cons as fees, an isolated location ("travel at least 20 to 30 minutes"), and "six to seven modules" a semester ([YouTube][yt-worth-2025], 30 Sep 2025; [YouTube][yt-worth-2026], 4 Apr 2026).

[tt-ranking]: https://www.tiktok.com/@/video/7633146885418519826
[yt-worth-2026]: https://www.youtube.com/watch?v=SYYAlUUJ2XM

## University operations themes

### Lecturer and admin staff load

- Who: lecturers, programme leaders, academic advisors and administrative staff. The voices are mainly UK and US academics on Bluesky, plus APU staff on job-review sites.
- How often: steady across Bluesky's academic community. The APU staff reviews that complain point to teaching load, marking and the intake calendar.
- Intensity: medium to high. One academic counts a day as "5h of meetings + 7h worth of new emails"; an advisor loses 8+ hours a week.
- Workarounds: canned email replies saved as signatures, and spreadsheets and email for tracking students.
- Examples:
  - "repeatedly answering emails with the same questions from students… make all your frequent responses email signatures" ([Bluesky][bs-signatures], academic, 27 Aug 2024, 416 likes, 121 reposts).
  - "an average work day brings 5h of meetings + 7h worth of new emails" ([Bluesky][bs-emails], academic, 31 Jan 2024, 7 likes). Another academic wrote: "Cuts to admin staff have massively increased admin workload across the board" ([Bluesky][bs-cuts], 26 Feb 2026, 13 likes).
  - "sedimentation of past admin/board/leadership projects… eternal horizon of paperwork/software/reporting bloat" ([Bluesky][bs-sediment], 31 Aug 2024, 27 likes).
  - An advisor told a startup they lose "8+ hours/week just trying to answer: 'Which students are struggling?'" across PeopleSoft, Canvas and spreadsheets ([Hacker News][hn-risely], 3 Sep 2025). A higher-education IT worker replied: "tens of legacy systems that don't integrate… manual spreadsheet processes" ([Hacker News][hn-risely-legacy]).
  - At APU: "managing both classes and marking at the same is extremely difficult" (senior lecturer, 16 Nov 2023, [Jobstreet][jobstreet-apu]), and "Expect high teaching load especially new recruits, and paperwork too" (lecturer, 21 May 2023, [Indeed][indeed-apu]).

[bs-emails]: https://bsky.app/profile/did:plc:wh6w2f2s53tgyaqws22bobam/post/3kkai4mnqlc24
[bs-cuts]: https://bsky.app/profile/did:plc:eisypeozktywh4v4ziruylax/post/3mfr5eyyxmk2w
[bs-sediment]: https://bsky.app/profile/did:plc:eqgbahkj5art5neligzjeqs7/post/3l2zkgjulx725
[hn-risely]: https://news.ycombinator.com/item?id=45116859
[hn-risely-legacy]: https://news.ycombinator.com/item?id=45117145
[indeed-apu]: https://malaysia.indeed.com/cmp/Asia-Pacific-University/reviews

### Fragile and fragmented university systems

- Who: students and staff using LMS, room-booking, timetabling and helpdesk tools.
- How often: recurring jokes and complaints on Bluesky and HN in 2024–2026.
- Intensity: medium. It is daily friction, and occasionally a full outage.
- Workarounds: none beyond waiting and retrying.
- Examples:
  - "Attempting to book a room via the university room booking system. If you don't hear from me again, avenge my death." ([Bluesky][bs-roombook], 14 Nov 2024, 166 likes).
  - "I can't get a response about timetabling for new students next week" ([Bluesky][bs-timetable], lecturer, 9 Sep 2026, 19 likes).
  - "i love LOVE having to use 2FA to log into Moodle in a building with poor signal where the wifi doesn't like my phone" ([Bluesky][bs-2fa], 29 Oct 2026).
  - "The problem with Moodle is that it's terrible… Universities don't have the talent in house to do anything more than bodge solutions" ([Hacker News][hn-moodle], 26 May 2026). A student wrote that their university "uses SharePoint, classroom and moodle for various courses" ([Hacker News][hn-sharepoint], 8 Jun 2026).
  - When a data centre's power failed, Utrecht University closed: "student information system is down, system for grading doesn't work. No failover" ([Hacker News][hn-utrecht], 8 May 2026).

[bs-roombook]: https://bsky.app/profile/did:plc:5h5jfgi7vuqp4bkfogcntzep/post/3lavnfjke422h
[bs-timetable]: https://bsky.app/profile/did:plc:57xkqzxj5wafn4vfuntwdx4d/post/3mv3m6vk6mc2u
[bs-2fa]: https://bsky.app/profile/did:plc:gz3ircklkgvrqpfxfhsi7aui/post/3myzeabxtyk2r
[hn-moodle]: https://news.ycombinator.com/item?id=48286079
[hn-sharepoint]: https://news.ycombinator.com/item?id=48443587
[hn-utrecht]: https://news.ycombinator.com/item?id=48060186

## Practitioner themes

### Automation that sticks

- Who: engineers, founders and enterprise practitioners who deploy LLM agents.
- How often: a large, consistent HN discussion. The threads read here have 76–167 comments each.
- What sticks, in their words: narrow, auditable workflows with a human in the loop, back-office tasks, and personal assistants that deliver something on a schedule.
- What fails: open-ended agents, text-to-SQL demos, and tools that "just wrap an LLM".
- Examples:
  - "What you actually need in most business cases is a 100% auditable, explainable and deterministic workflow" ([Hacker News][hn-deterministic], 4 Nov 2025, 48 replies).
  - Founders quoted in the article "pointed to workflow integration, employee trust, and data privacy as the toughest challenges — not model performance" ([Hacker News][hn-blockers], 4 Nov 2025).
  - On the MIT report that 95% of genAI pilots fail (230 points, 167 comments): "Nobody actually wants half the useless tools… They are just wrapping an LLM" ([Hacker News][hn-mit-top], 18 Aug 2025, 69 replies). Another commenter noted that MIT "found the biggest ROI in back-office automation" ([Hacker News][hn-mit-roi]).
  - "Very hard to think of customer support use-cases that do not collapse into decision trees" ([Hacker News][hn-decision-trees], 7 Oct 2025). Another commenter called text-to-SQL "the 'hello world' of agentic use in enterprise environments" ([Hacker News][hn-text-sql]).
  - "don't trust AI with anything you wouldn't trust a high schooler to do" ([Hacker News][hn-highschooler], 31 Mar 2024). One builder's personal assistant that stuck "handles my events, reminders, sends me a daily agenda" ([Hacker News][hn-telegram], 31 Mar 2024).

[hn-blockers]: https://news.ycombinator.com/item?id=45808903
[hn-mit-top]: https://news.ycombinator.com/item?id=44941608
[hn-mit-roi]: https://news.ycombinator.com/item?id=44941590
[hn-decision-trees]: https://news.ycombinator.com/item?id=45498678
[hn-text-sql]: https://news.ycombinator.com/item?id=45499202
[hn-highschooler]: https://news.ycombinator.com/item?id=39886445
[hn-telegram]: https://news.ycombinator.com/item?id=39886676

### Chatbot fatigue

- Who: customers, students and academics who meet chatbots put in front of humans.
- How often: recurring. Klarna's retreat drew 257 points on HN, and Bluesky has posts with 33–69 likes on university chatbots.
- Intensity: medium. People feel misled, nobody knows the bot exists, and staff raise liability worries.
- Examples:
  - Klarna started recruiting human customer-service staff again ([Hacker News][hn-klarna], 11 May 2025, 257 points, 125 comments). One commenter wrote: "Klarna's AI bot lied to me that it was human" ([Hacker News][hn-klarna-lied]).
  - "Students in my AI & Society class were poking at our university chatbot (which I did not even know existed until last week)" ([Bluesky][bs-chatbot-class], lecturer, 23 Sep 2026, 43 likes).
  - "how many students, full time faculty and staff could be supported with the money university admins spend on useless tech like… chatbot suites" ([Bluesky][bs-chatbot-money], 22 Sep 2026, 69 likes).
  - "If a student takes their own life after conversations with a chatbot provided by their university, can the family sue the university…?" ([Bluesky][bs-chatbot-liability], 3 Oct 2026, 33 likes).

[hn-klarna]: https://news.ycombinator.com/item?id=43955374
[hn-klarna-lied]: https://news.ycombinator.com/item?id=43955980
[bs-chatbot-class]: https://bsky.app/profile/did:plc:rrjvo5jwuateqep2i7ih5ckl/post/3mw6lo6omic22
[bs-chatbot-money]: https://bsky.app/profile/did:plc:7a4j47j42ezdr3au7pxdlzjt/post/3mw44rfv5ak25
[bs-chatbot-liability]: https://bsky.app/profile/did:plc:fodyg35g25joa5rpplt4y43g/post/3mwya4m5op22d

### Building and campus IoT in practice

- Who: building-automation managers, IoT buyers and hobbyist retrofitters.
- How often: occasional but pointed HN threads.
- What they say: sensors that drive no action are pointless; vendor platforms get abandoned; low-cost retrofits beat locked-in systems.
- Examples:
  - A commercial building-automation manager asks "Do you actually do anything with the data you collect?" and says "almost all commercial BAS systems have zero IAQ sensors" ([Hacker News][hn-bas], 27 Jul 2025).
  - Cisco left LoRaWAN; commenters wrote "These gateways are barely used" and objected to "less than 2.5 years of software updates" for embedded devices ([Hacker News][hn-cisco], 2 Oct 2024, 76 points).
  - An owner replaced a six-figure bowling-centre scoring system with $1,600 of ESP32s: "I hate vendor lock-in" ([Hacker News][hn-esp32], 19 Jul 2026, 2,935 points, 352 comments). The top reply (70 replies) says there are "many opportunities to retrofit old systems of all types with modern low-cost embedded technologies".
  - At APU, the IoT-shaped pains in the reviews are prepaid electricity that cuts off at 4 AM, whole-floor outages, lift buttons left broken for months, and buses that miss peak demand. See [Residence upkeep and theft](#residence-upkeep-and-theft) and [Shuttle buses and the LRT last mile](#shuttle-buses-and-the-lrt-last-mile).

[hn-bas]: https://news.ycombinator.com/item?id=44701192
[hn-cisco]: https://news.ycombinator.com/item?id=41724974
[hn-esp32]: https://news.ycombinator.com/item?id=48968606

### What hackathon crowds are tired of

- Who: hackathon participants, judges and organisers on HN, plus APU students reacting to campus showpieces.
- How often: two large HN threads in 2025–2026 (213 and 284 points).
- What they are tired of: sponsor tools bolted on to tick a box, polished UIs over mock data, AI-coded demos narrated feature by feature, and showpieces that ignore basic needs.
- Examples:
  - "Everyone jams these into projects to check a box, and what gets built is mostly BS with zero innovation" ([Hacker News][hn-fake], 4 May 2025, 213 points, 128 comments).
  - "Hackathons turned into 'nice ui with mock data'-athons. Whoever got the best ui person on their team won" ([Hacker News][hn-mockdata], 10 Jun 2026, 26 replies).
  - "Listening to someone tell you about their AI-coded project is like listening to someone tell you a dream they had last night" ([Hacker News][hn-dream], 10 Jun 2026, 12 replies).
  - Judging styles vary: some judges pick "the coolest technical architectures", some "the best looking result", and most judge "how useful the app will be societally" ([Hacker News][hn-judges], 10 Jun 2026). A former participant wrote that hackathons "became just about integrating sponsor APIs and half-baked start-up ideas" ([Hacker News][hn-sponsor], 11 Jun 2026).
  - At APU, the 107-like "dancing robots" comment shows students are wary of showcase technology. See [Showcase technology versus basics](#showcase-technology-versus-basics).

[hn-fake]: https://news.ycombinator.com/item?id=43889502
[hn-mockdata]: https://news.ycombinator.com/item?id=48470243
[hn-dream]: https://news.ycombinator.com/item?id=48469513
[hn-judges]: https://news.ycombinator.com/item?id=48471927
[hn-sponsor]: https://news.ycombinator.com/item?id=48497054

## Signals

### Ranking by frequency and intensity

**Inference:** the scores below are my own judgement, not counts from any one source. Frequency counts independent 2024–2026 items across all platforms (3 for 10 or more, 2 for 5–9, 1 for fewer). Intensity is 3 for concrete harm (money, documents, health, safety, attendance), 2 for repeated daily friction, and 1 for annoyance. "APU-specific" means the evidence is about APU or Bukit Jalil rather than universities in general. The practitioner themes are left unscored: they describe how solutions succeed or fail, not a pain anyone has.

| Rank | Theme                                     | Frequency | Intensity | Score | APU-specific       |
| ---- | ----------------------------------------- | --------- | --------- | ----- | ------------------ |
| 1    | Admin replies and handoffs                | 3         | 3         | 9     | Yes                |
| 2    | Residence upkeep and theft                | 3         | 3         | 9     | Yes                |
| 3    | Timetable churn and a compressed calendar | 3         | 3         | 9     | Yes                |
| 4    | Shuttle buses and the LRT last mile       | 3         | 2         | 6     | Yes                |
| 5    | Wi-Fi, power and core platforms           | 3         | 2         | 6     | Yes                |
| 6    | Showcase technology versus basics         | 3         | 2         | 6     | Yes                |
| 7    | Lecturer and admin staff load             | 3         | 2         | 6     | Partly (2019–2024) |
| 8    | Campus safety and emergency information   | 2         | 3         | 6     | Partly             |
| 9    | Parking supply and safety                 | 2         | 2         | 4     | Yes                |
| 10   | Lifts, stairs and crowding                | 2         | 2         | 4     | Yes                |
| 11   | Closed-loop payments and paperwork        | 2         | 2         | 4     | Yes                |
| 12   | Heat, rain and flash floods               | 2         | 2         | 4     | Yes (Bukit Jalil)  |
| 13   | Enquiry gaps for prospective students     | 2         | 2         | 4     | Yes                |
| 14   | Fragile and fragmented university systems | 2         | 2         | 4     | No                 |
| 15   | Chatbot fatigue                           | 2         | 1         | 2     | No                 |

**Inference:** the top three APU themes share a shape: a request goes into the system (an email, a ticket, a timetable, a maintenance report) and nobody can see what happens next. The strongest APU-specific single signals are the 107-like "dancing robots" comment, the 103-like "Never consider staying in APU accommodation" comment, the 18-like two-lifts-for-nine-floors comment, and the parent's detailed parking-safety complaint.

### What people ask for

Explicit requests from posters. No source mentioned a willingness to pay; the one working student tool found, APRide, is free.

- More shuttle runs at peak times and some weekend rounds ([Google Maps][gm-apu], 25 Apr 2025 and 25 Jun 2026).
- Cafeterias that accept e-wallets and QR payments, and an end to card surcharges ([Google Maps][gm-apu], 10 and 25 Apr 2026; [Instagram][ig-campus], 17 May 2024).
- Uploading fee receipts in APSpace instead of emailing Bursary ([Google Maps][gm-apu], 3 Jun 2024).
- Fans or working air-conditioning in the canteen, auditorium and bus waiting area ([Google Maps][gm-apu], 3 Jun and 12 Nov 2024).
- Stop lines and arrows redrawn to match the new car-park layout, plus cheaper or free parking ([Google Maps][gm-apu], 3 May 2026 and 3 Jun 2024).
- "better/New servers" for Moodle and APSpace ([Google Maps][gm-apu], 18 Jun 2026).
- Counsellors for each programme at Open Days ([Google Maps][gm-apu], 9 May 2026).
- Elsewhere: canned replies for repeated student questions ([Bluesky][bs-signatures]), a crowdsourced broken-lift page ([Bluesky][bs-lift-ig]), and "auditable, explainable and deterministic" workflows ([Hacker News][hn-deterministic]).

### Unmet needs

**Inference:** needs implied by the evidence above, stated without proposing products.

- Students and parents want to know that a request was received, who owns it, and when it will be done, across admin, Bursary, residence and facilities.
- Students want to see the state of shared resources before committing: shuttle load, lift availability, cafeteria and top-up queues, and free parking.
- Students want one authoritative timetable that shows which changes affect them, instead of weekly ad-hoc announcements.
- Residents want fault reports (power, water, lifts, theft, CCTV requests) to be acknowledged, tracked and closed.
- Commuters want to hear about weather disruptions, such as flooding at LRT Bukit Jalil or rain surge pricing, before they travel.
- Lecturers and admin staff need less repeated email and less manual work across systems that don't integrate.

## See also

- [Hackathon brief](/docs/BRIEF.md)
- [Hackathon context](/docs/CONTEXT.md)
- [APU public documents](/docs/research/apu-public-documents.md)
- [IoT and network](/docs/research/iot-and-network.md)
- [Judging and pitching](/docs/research/judging-and-pitching.md)
- [Public data sources](/docs/research/public-data-sources.md)

[gm-apu]: https://www.google.com/maps/place/?q=place_id:ChIJ2SVQebtKzDERaKlLcSoYNxw
[gm-k1]: https://www.google.com/maps/place/?q=place_id:ChIJDb2EY1JLzDERxnm2m1Jkieg
[ig-orientation]: https://www.instagram.com/reel/De9BNkJAYk1/
[ig-campus]: https://www.instagram.com/reel/C50MOdjvhND/
[tt-abroadassist]: https://www.tiktok.com/@abroadassist/video/7643432056050994435
[jobstreet-apu]: https://my.jobstreet.com/companies/asia-pacific-university-168553381646759/reviews
[yt-worth-2025]: https://www.youtube.com/watch?v=23GnzKoOcOs
[bs-signatures]: https://bsky.app/profile/did:plc:hqgwrunq5xhijmgigijmx54z/post/3l2peqlqckm2i
[bs-lift-ig]: https://bsky.app/profile/did:plc:qq4fnhme7c7qabj7feunm55t/post/3m6oo4exyuc2f
[hn-deterministic]: https://news.ycombinator.com/item?id=45808878
