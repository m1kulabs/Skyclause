# Everyday signals on Reddit and other platforms

What Malaysian and APU students, people living alone, renters and home-automation builders say in public posts about everyday life away from campus: utility outages, loneliness, group work, scams, housing, check-in and mesh-chat apps, and which phone and Raspberry Pi tools people keep using. It extends [social research](/docs/research/social.md) without repeating its threads: none of the 188 Reddit threads read here appear there. Everything was collected on 5 November 2026: 188 Reddit threads read in full (1,859 top-level comments) from 2,097 unique posts screened, plus 9 Lowyat.NET threads, 4 Hacker News threads, 193 Bluesky posts, 117 TikTok results, 4 Product Hunt searches, 14 Google Play listings, 12 GitHub repositories and the public sizes of the hackathon Discord and the GDG on Campus APU chapter. Posters are labelled by role, never by name; engagement figures (points, comments, likes, plays) are as each platform returned them on the day. Interpretations are labelled **Inference**.

Contents:

1.  [Method](#method)
    1.  [Access routes](#access-routes)
    1.  [Query log and counts](#query-log-and-counts)
    1.  [Errors and limits](#errors-and-limits)
1.  [Signals](#signals)
    1.  [Theme ranking](#theme-ranking)
    1.  [Water, power and home internet outages](#water-power-and-home-internet-outages)
    1.  [Loneliness and finding people](#loneliness-and-finding-people)
    1.  [Group assignments and free riders](#group-assignments-and-free-riders)
    1.  [Scams aimed at students](#scams-aimed-at-students)
    1.  [Living alone and check-in apps](#living-alone-and-check-in-apps)
    1.  [Off-campus housing, deposits and housemates](#off-campus-housing-deposits-and-housemates)
    1.  [Offline mesh messaging during shutdowns and disasters](#offline-mesh-messaging-during-shutdowns-and-disasters)
    1.  [Internships, part-time work and money](#internships-part-time-work-and-money)
    1.  [Studying together: body doubling and study timers](#studying-together-body-doubling-and-study-timers)
    1.  [Friend location after Zenly](#friend-location-after-zenly)
    1.  [Other APU threads](#other-apu-threads)
1.  [What people keep using](#what-people-keep-using)
    1.  [Tools that survive months of use](#tools-that-survive-months-of-use)
    1.  [What gets abandoned and why](#what-gets-abandoned-and-why)
1.  [Reaching APU students remotely](#reaching-apu-students-remotely)
    1.  [Communities found](#communities-found)
    1.  [What recruiting looks like there](#what-recruiting-looks-like-there)
    1.  [How a remote team could use them](#how-a-remote-team-could-use-them)
1.  [Unmet needs (Inference)](#unmet-needs-inference)
1.  [Disconfirming signals and gaps](#disconfirming-signals-and-gaps)
1.  [See also](#see-also)

## Method

All collection ran on 5 November 2026 from this machine, without any Reddit, Facebook, TikTok or Discord account. API keys were read from the environment and never written to any file.

### Access routes

- **Reddit discovery:** the Brave Search API with `site:reddit.com` queries (104 queries in all, most with a freshness window starting 1 January 2024 or later), plus Reddit's own RSS search (`/r/<sub>/search.rss`, 21 queries, up to 100 posts each). RSS reported `x-ratelimit-remaining: 0` after every call, which held the run to roughly one request a minute.
- **Reddit threads:** the ScrapeCreators `/v1/reddit/post/comments` endpoint for 188 threads, which returns the post with its score and comment count and up to about 25 top-level comments with their scores. Reply trees were not expanded, so every quoted comment is top-level. Subreddit sizes came from `/v1/reddit/subreddit/details`.
- **Lowyat.NET:** 8 Brave `site:forum.lowyat.net` queries from 1 January 2025, then each topic's `/all` page fetched with `curl` and parsed (9 threads, 496 posts).
- **Hacker News:** the Algolia API (`hn.algolia.com/api/v1/search`, 10 story queries after 1 January 2024) and `/api/v1/items` for 4 threads; top-level comments were ranked by reply count, because HN hides comment scores.
- **Bluesky:** the project account against `bsky.social`, `app.bsky.feed.searchPosts` with `sort=top` and `since=2025-01-01`, 8 queries.
- **TikTok:** ScrapeCreators `/v1/tiktok/search/keyword` (4 queries, `date_posted=this-year`, 117 results) and `/v1/tiktok/video/comments` for 2 videos. Links use the handle-free `tiktok.com/@/video/<id>` form.
- **Product Hunt:** 4 Brave `site:producthunt.com` queries; listings were not opened.
- **Adoption figures:** Google Play listing pages (`gl=MY`, install band and review count) for 14 apps, and the GitHub REST API for 12 repositories (stars, last push).
- **Community sizes:** Discord's public invite endpoint (`/api/v10/invites/<code>?with_counts=true`) for the hackathon server, the `members_count` field on the GDG on Campus APU chapter page, and follower counts shown in Brave result snippets for Facebook and Instagram pages (not verified on the pages, which need a login).
- **News checks:** the BBC article on the "Are You Dead?" app through Jina Reader, and bitchat download claims through Tavily search of news and Wikipedia.

### Query log and counts

| Angle                                    | Discovery queries                                                                                                                       | Threads read in full |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Phone and Pi tools people keep using     | 20 Brave: r/raspberry_pi, r/homeassistant, r/selfhosted, r/androidapps, r/tasker, r/shortcuts, Pi-hole, power-outage and ISP monitoring | 30 Reddit            |
| Viral consumer apps                      | 20 Brave: "Are You Dead", Demumu, Snug, bitchat, Zenly, Life360, Focusmate, YPT, scam blockers, outage maps                             | 35 Reddit, 4 HN      |
| Malaysian life away from campus          | 28 Brave (r/malaysia, r/malaysiauni, r/malaysians, r/MalaysianPF, r/college) and 11 RSS                                                 | 73 Reddit, 9 Lowyat  |
| APU-specific                             | 16 Brave and 5 RSS (`APU` in r/malaysiauni, newest, top and most-commented, past year)                                                  | 32 Reddit            |
| Where APU students gather, and surveying | 8 Brave (Discord, Telegram, WhatsApp, Facebook, SRC, GDGoC) and 5 RSS (`discord`, `whatsapp group`, `telegram`, `survey`)               | 18 Reddit            |

- Brave returned 1,905 results holding 1,364 Reddit thread IDs; RSS returned 752. After merging, 2,097 unique posts were screened by title and snippet.
- The 188 threads read are 122 from 2026, 49 from 2025 and 16 from 2024 (one deleted post has no date); 131 have 10 or more comments and 60 have 100 or more points. By subreddit: r/malaysiauni 82, r/malaysia 42, r/homeassistant 12, r/raspberry_pi 6, r/LivingAlone 5, r/selfhosted 5, others 36.
- The 147 thread IDs already cited in `docs/research/` were excluded before reading.

### Errors and limits

- ScrapeCreators' Reddit search endpoints (`/v1/reddit/search`, `/v1/reddit/subreddit/search`) failed with HTTP 500 and `status code not 200: 403` from upstream, so discovery moved to Brave and RSS. Reddit's own JSON endpoints still returned HTTP 403, and Exa returned no results when restricted to `reddit.com`.
- Brave results are ranked by relevance, not date or score, so the counts below are of what these queries surfaced, not of everything posted. Several high-value thread titles were moderator-removed or user-deleted; their comments were still readable and their titles are taken from the search snippet.
- "APU" collides with Ritsumeikan APU in Japan, AP exams, aircraft auxiliary power units, American Public University and a meme coin; all were excluded. A Telegram channel named "Apu community" (7,262 subscribers) appears to belong to the meme coin and is not counted. "Unifi" on TikTok mostly returns Ubiquiti UniFi networking gear.
- The only Play Store listing found under the Demumu name has 1K+ installs and could not be confirmed as the official app, so it is not used as adoption evidence.
- Reddit over-represents English-speaking, private-university and international students; Malay-language communities on Facebook and TikTok are under-sampled, and WhatsApp and Telegram groups cannot be searched at all. Votes are not demand estimates, and replies inside one thread are not independent samples.

## Signals

### Theme ranking

Ranked by how many threads surfaced and how strongly people reacted. "Peak" is the highest-scoring Reddit post in the theme.

| Rank | Theme                                    | Threads read                  | Peak (points) | Malaysian or APU evidence                   | Global analogues                           |
| ---- | ---------------------------------------- | ----------------------------- | ------------- | ------------------------------------------- | ------------------------------------------ |
| 1    | Water, power and home internet outages   | 21 Reddit, 7 Lowyat, 8 global | 3,017         | Strong: Selangor water, TNB, Unifi          | Kerala outage map, Whataburger map, HA     |
| 2    | Loneliness and finding people            | 25                            | 1,631         | Strong, including about 30 APU intake posts | r/InternationalStudents                    |
| 3    | Group assignments and free riders        | 11                            | 2,623         | Strong                                      | r/college                                  |
| 4    | Scams aimed at students                  | 14 Reddit, 2 Lowyat           | 182           | Strong, with national police figures        | Truecaller, Whoscall installs              |
| 5    | Living alone and check-in apps           | 12 Reddit, 2 Bluesky posts    | 565           | Indirect only                               | Strong: viral in China, Snug, many clones  |
| 6    | Off-campus housing, deposits, housemates | 19                            | 415           | Strong, with an APU November-intake wave    | None read                                  |
| 7    | Offline mesh messaging                   | 6 Reddit, 4 HN                | 2,137         | None found                                  | Strong: Nepal, Madagascar, Jamaica, Uganda |
| 8    | Internships, part-time work and money    | 11                            | 308           | Medium, including APU                       | None read                                  |
| 9    | Studying together: body doubling, timers | 6                             | 200           | Weak: one APU study-buddy post              | Medium: Focusmate, YPT                     |
| 10   | Friend location after Zenly              | 2                             | 35            | None found                                  | Weak                                       |

### Water, power and home internet outages

**Malaysia: water.**

- A Selangor Menteri Besar clip quoting "Selangor kalau tak ada air 3 hari, macam nak kiamat negara ni" ("if Selangor has no water for three days, it's like the end of the world") drew 220,156 plays and 1,689 comments on TikTok (15 September 2026) ([TikTok clip][tt-mb]); a resident's water-meter test captioned "mmg air selangor problem" drew 217,319 plays (7 September 2026) ([TikTok meter][tt-meter]).
- A call to halve shower time during the March 2026 heat drew 283 points and 90 comments; the top replies asked what data centres were cutting back (176, 110 and 78 points) ([halve shower time][1s569ix]). Johor denied that data centres caused the Pontian and Simpang Renggam disruption (19 February 2026, 23 points) ([Johor water][1r8kxy2]).
- A young Selangor resident living alone while their parents were away found the water meter removed: Air Selangor had switched to e-billing and its WhatsApp notice went to the mother's old number. The fix offered was to "Download the Air Selangor app and register your number as the owner" (25 July 2025, 15 points) ([meter removed][1m95v9p]). A Lowyat thread on the same failure after a house sale has 22 posts from 2022 to September 2025 ([Lowyat meter][ly5234207]).
- A household charged RM1.3k for water was told to "turn off the mains and see if gauge is still moving"; the cause was a float valve that had leaked "for months" (13 January 2025, 221 points) ([RM1.3k bill][1i0gctt]).
- The Air Selangor app has 1M+ Play installs; its 2.0 release drew complaints that it needs Android 11 and "won't even launch" (December 2024, 4 points) ([Air Selangor app][1hgvlax]).

**Malaysia: power.**

- A blackout that made TRX office workers walk down from the 106th floor drew 3,017 points and 239 comments (16 October 2025) ([TRX blackout][1o7xwpf]).
- A fire at the Kangkar Tebrau main intake substation cut power around Johor Jaya on 16 October 2026 (216 points); one worker wrote they were "in the middle of important urgent work" when power went and was sent home with the PC (44 points) ([JB substation][1x7ebvi]). A Lowyat thread logged 19 posts in 83 minutes that evening, one recalling a Bangi substation failure that "fried my motherboard when the power fluctuates" ([Lowyat JB blackout][ly5580384]).
- A power outage between Awan Besar and Sri Petaling stations disrupted the Ampang/Sri Petaling LRT line, which serves Bukit Jalil, at school-out time on 2 April 2026, so "many people have to grab or call their relative" (57 points) ([LRT outage][1sab6h6]).
- An emergency department in Perak resuscitated a patient by phone torch during a blackout (24 May 2026, 2,078 points, 162 comments) ([ED blackout][1tlwo3r]); cable thieves filmed in Subang Jaya drew 885 points, and a commenter wrote cable stealing is "increasing day by day" (81 points) ([SS18 cable theft][1s0zpi8]).
- Bills: a terrace-house owner on a steady 700–900 kWh a month saw bills jump from RM300–400 to RM600+ from May 2026; replies blamed monthly fuel-surcharge (AFA) adjustments (114 points) and suggested "buy a device to measure it yourself" (20 points) (14 July 2026, 211 points, 122 comments) ([TNB spike][1uvz6g0]). A Lowyat thread on the Prime Minister's meeting about TNB bills reached 60 posts in a day (16–17 September 2026) ([Lowyat TNB bills][ly5577228]). The myTNB app has 5M+ Play installs.
- Heat makes this worse: "Last night sleep like im in oven" (64 points) under a 38 °C heatwave post (30 March 2026, 142 points) ([heatwave][1s7hoar]); "water blowing fans are useless" in humid air (203 points) (May 2025, 118 points) ([cool room][1kvp46h]).

**Malaysia: home internet.**

- A Lowyat member paying RM136 a month wrote that "almost every week will have outage that would last randomly from half an hour to entire day. call support as usual, make report, but no permanent fix", adding that every other provider also rides TM's network (82 posts, 2–10 December 2025) ([Lowyat leaving Unifi][ly5547965]).
- Escalation advice in "Anyway to sue TM Unifi?" (5 October 2025, 59 points): a class action (69), report to MCMC with "all your evidence and timeline" (43 and 34), and "Call 100 to follow up every day. They have a 24-hour service restoration guarantee" (10) ([sue TM][1nylu8m]).
- A thread on packet loss (19 December 2025, 90 points) says a TM technician called "30% packet loss for international routing" acceptable (12 points) and Sarawak users see "30-70% packet loss" (18 points) ([packet loss][1pqqyau]).
- Smaller reports repeat the timing: drops "for the past 3 nights" (11 March 2025, 18 points) ([Unifi down][1j8w79t]); Kelantan drops "around 8:30pm ... for about 1-2 hours", three times in a week (30 November 2025) ([Kelantan][1pahpti]); "Every year February sure got cable fault" (25 May 2026, 17 points) ([Unifi horrible][1tn1sjh]). A status bot on Bluesky posted "Unifi is reportedly down for some users right now" on 4 November 2026 ([Bluesky status][bsky-unifi]).
- Workarounds: dual-WAN routers with 5G failover after a six-hour office outage (Lowyat, July 2025) ([Lowyat failover][ly5530028]); a Maxis "backup dongle" that turned out to be activated only after the customer reports an outage (16 October 2026, 46 points) ([Maxis dongle][1x7c08r]); Starlink where Unifi refused to lay cable to a kampung (Lowyat, 201 posts, April–June 2026) ([Lowyat Starlink][ly5562743]). MyUnifi has 1M+ Play installs and 199K reviews.

**Global analogues.**

- A Kerala developer built a PIN-code "downdetector" for power cuts because, when the fan stops, the first thought is "Inippo ente veettil mathram aano, atho naattil motham poyo?" (roughly "is it only my house, or the whole area?"), and people otherwise walk to the balcony to check a neighbour's light or WhatsApp a neighbour (25 April 2026, 320 points, 41 comments). Replies asked how to report power coming back (8) and noted one PIN code spans several feeders (22) ([Kerala tracker][1svl6je]).
- Houston residents used the Whataburger app's open-or-closed map as a power-outage map after a hurricane (10 July 2024, 1,965 points) ([Whataburger map][1dzuaq8]). A generic crowd-sourced outage site drew the reply "the last thing I'd think about doing during a blackout is to report it to a random site" ([outage tracker][1jf76g7]).
- Home builders detect outages at a parent's house by pinging the router, a UPS with NUT on a Raspberry Pi (31 points), or "a cheap mobile phone" running the Home Assistant app and left plugged in (8 points) (22 January 2026, 65 comments) ([parents' outage][1qk5pto]); another thread's answer to an SMS outage alarm was to "get a cheap tablet" that messages when it switches to battery (16 February 2026, 55 comments) ([outage alert][1r6mu0f]).
- People log their ISP to prove outages: Speedtest Tracker on a Pi touchscreen so that when someone yells "Is the internet down?!" the answer is a glance (5 April 2025, 139 points) ([ISP's lies][1jrscd2]); Smokeping, Speedtest Tracker and Uptime Kuma for a bad ISP (March 2025) ([ISP logging][1jjr3km]).

[tt-mb]: https://www.tiktok.com/@/video/7685699794513317140
[tt-meter]: https://www.tiktok.com/@/video/7682722384423521544
[1s569ix]: https://www.reddit.com/r/malaysia/comments/1s569ix/
[1r8kxy2]: https://www.reddit.com/r/malaysia/comments/1r8kxy2/
[1m95v9p]: https://www.reddit.com/r/malaysians/comments/1m95v9p/
[ly5234207]: https://forum.lowyat.net/topic/5234207/all
[1i0gctt]: https://www.reddit.com/r/malaysia/comments/1i0gctt/
[1hgvlax]: https://www.reddit.com/r/malaysia/comments/1hgvlax/
[1o7xwpf]: https://www.reddit.com/r/malaysia/comments/1o7xwpf/
[1x7ebvi]: https://www.reddit.com/r/malaysia/comments/1x7ebvi/
[ly5580384]: https://forum.lowyat.net/topic/5580384/all
[1sab6h6]: https://www.reddit.com/r/malaysia/comments/1sab6h6/
[1tlwo3r]: https://www.reddit.com/r/malaysia/comments/1tlwo3r/
[1s0zpi8]: https://www.reddit.com/r/malaysia/comments/1s0zpi8/
[1uvz6g0]: https://www.reddit.com/r/malaysia/comments/1uvz6g0/
[ly5577228]: https://forum.lowyat.net/topic/5577228/all
[1s7hoar]: https://www.reddit.com/r/malaysia/comments/1s7hoar/
[1kvp46h]: https://www.reddit.com/r/malaysia/comments/1kvp46h/
[ly5547965]: https://forum.lowyat.net/topic/5547965/all
[1nylu8m]: https://www.reddit.com/r/malaysia/comments/1nylu8m/
[1pqqyau]: https://www.reddit.com/r/malaysia/comments/1pqqyau/
[1j8w79t]: https://www.reddit.com/r/malaysia/comments/1j8w79t/
[1pahpti]: https://www.reddit.com/r/malaysia/comments/1pahpti/
[1tn1sjh]: https://www.reddit.com/r/malaysians/comments/1tn1sjh/
[bsky-unifi]: https://bsky.app/profile/statusisdown.bsky.social/post/3mzhkps46el2h
[ly5530028]: https://forum.lowyat.net/topic/5530028/all
[1x7c08r]: https://www.reddit.com/r/malaysia/comments/1x7c08r/
[ly5562743]: https://forum.lowyat.net/topic/5562743/all
[1svl6je]: https://www.reddit.com/r/Coconaad/comments/1svl6je/
[1dzuaq8]: https://www.reddit.com/r/technology/comments/1dzuaq8/
[1jf76g7]: https://www.reddit.com/r/energy/comments/1jf76g7/
[1qk5pto]: https://www.reddit.com/r/homeassistant/comments/1qk5pto/
[1r6mu0f]: https://www.reddit.com/r/homeautomation/comments/1r6mu0f/
[1jrscd2]: https://www.reddit.com/r/homeassistant/comments/1jrscd2/
[1jjr3km]: https://www.reddit.com/r/selfhosted/comments/1jjr3km/

### Loneliness and finding people

**Malaysia.**

- "Loneliness slowly catching up with me", from a 22-year-old college student eating alone, drew 1,631 points and 310 comments (19 July 2025); the top reply, from a married commenter, was "I'd say get used to being alone" (190 points) ([loneliness][1m3mqud]).
- In r/malaysiauni the theme recurs at every scale: "I wish I was a part of a cool friendgroup" (17 February 2026, 242 points, 80 comments; "Usually if u wanna have friends u have to make on the first sem or first day itself", 22 points) ([friend group][1r7294w]); "Living in Loneliness in Uni" (December 2024, 101 points) ([uni loneliness][1hhyj1v]); "No proper friends in uni" (May 2026, 83 points) ([no proper friends][1t1q47e]); "anyone here who still hasn't had real friends?" (August 2026, 42 points) ([real friends][1w2kjk8]).
- Language and ethnicity are the barrier these posts name most often. An international student at Sunway: "most nationalities stick together" and clubs are mostly one group (February 2025, 96 points) ([Sunway lonely][1ikpxlx]); a new Monash student: "EVERYONE is speaking in bahasa" (20 October 2026) ([need friends][1xajry6]); an international student at a small-town university, a month in with no friends (2 November 2026, 22 points) ([lonely asf][1xlumnr]); a Malay student who grew up English-speaking feels "very disconnected" (1 November 2026, 81 points) ([feeling lonely][1xkyu8s]). An expat in KL asked whether locals also struggle to keep friends; the top reply called Malaysian social circles "very insular" (98 points; 24 December 2025, 91 points) ([long-term friends][1puu9gb]).
- An international student who wants to travel but has no one to go with (October 2026, 19 points) was told "Malaysia is going thru haze at the moment" (16 points) ([travel alone][1x1be6j]).

**APU.**

- The RSS sample holds about 30 intake and friend-seeking titles from incoming or current APU students between July and 2 November 2026, such as "how do people actually make friends before uni even starts?" (26 October 2026). Those read drew 0–21 comments, mostly offers to DM or jokes: "want friends in apu", a September-intake accounting student (4 October 2026, 9 comments) ([want friends][1wxeuz4]); "Looking for APU friends" (February 2026) ([APU friends][1r7ufuo]); "Looking for a study buddy", a 27-year-old cybersecurity student (August 2026, 0 comments) ([study buddy][1vzv4h2]); "Any female apu students??", an incoming international foundation student (September 2026) ([female students][1wcsj4f]); "Looking for Homies", an incoming student choosing APU or UPM, whose replies were mostly jokes ([homies][1uxzs0j]); a student from another university asking to "check out the university with someone" (2 November 2026) ([new friend][1xm0w7x]). A first-semester engineering student elsewhere drew "BRO OMDS I'm also in same situation but in apu" ([anxious and lonely][1wz1o3v]).
- An incoming international student asked whether APU has "a decent freshers week"; the answer was that orientation "is more focused onto academics", with ice-breakers (August 2026, 18 comments) ([social scene][1vj478o]).

**Global analogue.** "Is every international student lonely?" (r/InternationalStudents, January 2026, 22 comments): "Yes. Same as with a lot of immigrants" ([every intl student][1qaql6g]).

- **Workarounds:** posting on Reddit, joining WhatsApp groups that strangers post (see [Communities found](#communities-found)), clubs, and "Invite yourself. Don't wait for others to call you" ([uni loneliness][1hhyj1v]).

[1m3mqud]: https://www.reddit.com/r/malaysia/comments/1m3mqud/
[1r7294w]: https://www.reddit.com/r/malaysiauni/comments/1r7294w/
[1hhyj1v]: https://www.reddit.com/r/malaysiauni/comments/1hhyj1v/
[1t1q47e]: https://www.reddit.com/r/malaysiauni/comments/1t1q47e/
[1w2kjk8]: https://www.reddit.com/r/malaysiauni/comments/1w2kjk8/
[1ikpxlx]: https://www.reddit.com/r/malaysiauni/comments/1ikpxlx/
[1xajry6]: https://www.reddit.com/r/malaysiauni/comments/1xajry6/
[1xlumnr]: https://www.reddit.com/r/malaysiauni/comments/1xlumnr/
[1xkyu8s]: https://www.reddit.com/r/malaysiauni/comments/1xkyu8s/
[1puu9gb]: https://www.reddit.com/r/malaysia/comments/1puu9gb/
[1x1be6j]: https://www.reddit.com/r/malaysiauni/comments/1x1be6j/
[1wxeuz4]: https://www.reddit.com/r/malaysiauni/comments/1wxeuz4/
[1r7ufuo]: https://www.reddit.com/r/malaysiauni/comments/1r7ufuo/
[1vzv4h2]: https://www.reddit.com/r/malaysiauni/comments/1vzv4h2/
[1wcsj4f]: https://www.reddit.com/r/malaysiauni/comments/1wcsj4f/
[1uxzs0j]: https://www.reddit.com/r/malaysiauni/comments/1uxzs0j/
[1xm0w7x]: https://www.reddit.com/r/malaysiauni/comments/1xm0w7x/
[1wz1o3v]: https://www.reddit.com/r/malaysiauni/comments/1wz1o3v/
[1vj478o]: https://www.reddit.com/r/malaysiauni/comments/1vj478o/
[1qaql6g]: https://www.reddit.com/r/InternationalStudents/comments/1qaql6g/

### Group assignments and free riders

**Malaysia.**

- A student who reported a free rider to the lecturer, who then failed the subject and confronted them, drew 2,623 points and 327 comments (15 May 2026); top reply: "freeloaders never think about all the pain and burden we've endured to complete THEIR work" (454 points) ([free rider failed][1tdvhk8]).
- Two days earlier, a student whose 25-year-old groupmate handed in "a whole paper full of AI. He didn't even delete the fricking prompt response" drew 415 points; the top advice was "keep your lecturer informed ... complete his part and let the lecturer know" (114 points) ([free rider AI][1tc5tg2]).
- "Getting sick and tired of AI-dependent people" (16 October 2026, 569 points, 70 comments): a group met four days before a proposal deadline and kept switching ideas; a public-university lecturer replied that students "cant even hold basic discussions anymore" (130 points) ([AI-dependent][1x7c3q4]).
- Exclusion is the other side: "It is so depressing when nobody wants you in group project", from a commuter student who missed the friend groups formed in residence (March 2024, 391 points, 90 comments) ([nobody wants you][1b66vul]). Other threads: a free-riding friend (January 2026, 111 points) ([still friends][1q223ff]); "Accused of being a freeloader by freeloaders" in a small class (October 2026, 76 points) ([accused][1x8vd3s]); five concurrent group assignments (June 2026) ([five assignments][1u017pe]); how to find good teammates (February 2025, 28 points) ([good teammates][1ifw5is]).

**Global analogue.** On r/college, a student with a group project due in three hours and silent teammates was told by a professor to "submit your part and let the professor know ... I'd give your group members 0" (168 points; 17 March 2026, 88 points) ([due tonight][1rvro66]); another reply set is to keep "screenshots of the document editing history" ([not contributing][1h2hmm2]).

- **Workarounds:** document everything, keep the lecturer informed early, cc the dean, never regroup with a known free rider, or do the whole thing alone.

[1tdvhk8]: https://www.reddit.com/r/malaysiauni/comments/1tdvhk8/
[1tc5tg2]: https://www.reddit.com/r/malaysiauni/comments/1tc5tg2/
[1x7c3q4]: https://www.reddit.com/r/malaysiauni/comments/1x7c3q4/
[1b66vul]: https://www.reddit.com/r/malaysiauni/comments/1b66vul/
[1q223ff]: https://www.reddit.com/r/malaysiauni/comments/1q223ff/
[1x8vd3s]: https://www.reddit.com/r/malaysiauni/comments/1x8vd3s/
[1u017pe]: https://www.reddit.com/r/malaysiauni/comments/1u017pe/
[1ifw5is]: https://www.reddit.com/r/malaysiauni/comments/1ifw5is/
[1rvro66]: https://www.reddit.com/r/college/comments/1rvro66/
[1h2hmm2]: https://www.reddit.com/r/college/comments/1h2hmm2/

### Scams aimed at students

**Malaysia: scale.** The Star (22 December 2025), reposted on Lowyat, reports Bukit Aman CCID figures for January–November 2025: 28,698 telecommunications fraud cases and RM715 million lost, with people aged 21–30 the largest victim group (8,789), ahead of ages 31–40 (6,825) ([Lowyat scam figures][ly5549923]).

**Malaysia: students.**

- A scammer posting MacBook bait in a university's WhatsApp and Discord kept returning on new accounts; a reply said it "had been goin on for abt half a year" with "auto messaging script esp in whatsapp & telegram" (6 May 2026, 151 points) ([uni group scammer][1t5bs1u]). A job ad in a university WhatsApp community asked for the student's ID and CV by DM (27 October 2026) ([job scam][1xgoqht]).
- A fake "UTM Finance" email with the university's logo and an urgent RM1,450 fee demand nearly worked; a master's researcher surveying Johor students about it drew 146 points, and replies noted "Tng is a red flag" (13 August 2026) ([fake fee email][1vnc214]).
- An international student lost RM1.5k on a "pay deposit and we will refund you" e-scooter sale (January 2026) ([scooter deposit][1qldos8]); a TikTok "side income" offer turned out to be an MLM: "Every uni student will encounter at least once" (26 points; April 2025, 182 points, 96 comments) ([TikTok MLM][1k1zvr8]).
- A student's Public Bank account was flagged and set for closure after group-assignment money for a mock business passed through it; a bank officer replied that such flows "classify as business purpose" (135 points; June 2025, 170 points) ([account flagged][1lelc1j]).
- Calls: silent calls and AI voice-cloning warnings (December 2025, 126 points; "These asshole been calling me everyday around 2pm to 4pm", 62 points) ([silent calls][1pm2tte]); a user blocking calls from numbers that all start 016-620, where a commenter has "90 blocked on my WhatsApp" (23 points) and hospital calls as the reason they cannot ignore unknown numbers (16 points) (March 2025, 135 points) ([spam numbers][1j4pjny]). On Lowyat, a Truecaller user says "Out of 10 calls per day, only 1 managed to get through" and another worries it would block an interview call (56 posts, 2023–2025) ([Lowyat spam calls][ly5405983]).
- Checking an account is slow: the police Semak Mule portal only lists accounts with a police report and "lack of timely updates" (April 2024, 53 comments) ([scam database][1ccic04]); "System isn't the most stable at times", and one account with zero reports still scammed a user (June 2025) ([Semak Mule][1l7wdb1]). A recovery guide starts with "Call 997" (December 2025, 98 points) ([scam guide][1psqigw]).
- **Tools in use:** Truecaller (1B+ Play installs), Whoscall (50M+; a commenter believes the police have a working arrangement with it) ([Truecaller vs Whoscall][1eaufa9]), and Phone by Google's spam filter.

[ly5549923]: https://forum.lowyat.net/topic/5549923/all
[1t5bs1u]: https://www.reddit.com/r/malaysiauni/comments/1t5bs1u/
[1xgoqht]: https://www.reddit.com/r/malaysiauni/comments/1xgoqht/
[1vnc214]: https://www.reddit.com/r/malaysiauni/comments/1vnc214/
[1qldos8]: https://www.reddit.com/r/malaysiauni/comments/1qldos8/
[1k1zvr8]: https://www.reddit.com/r/malaysia/comments/1k1zvr8/
[1lelc1j]: https://www.reddit.com/r/malaysia/comments/1lelc1j/
[1pm2tte]: https://www.reddit.com/r/malaysia/comments/1pm2tte/
[1j4pjny]: https://www.reddit.com/r/malaysia/comments/1j4pjny/
[ly5405983]: https://forum.lowyat.net/topic/5405983/all
[1ccic04]: https://www.reddit.com/r/malaysia/comments/1ccic04/
[1l7wdb1]: https://www.reddit.com/r/MalaysianPF/comments/1l7wdb1/
[1psqigw]: https://www.reddit.com/r/malaysia/comments/1psqigw/
[1eaufa9]: https://www.reddit.com/r/malaysia/comments/1eaufa9/

### Living alone and check-in apps

**Global: the viral case.** The BBC reports that "Are You Dead?" (Sileme in Chinese, listed abroad as Demumu) asks users to tap a button every two days and alerts an emergency contact if they do not; launched in May 2025, it became China's most downloaded paid app in January 2026 at 8 yuan, ranked in the top two paid utility apps in the US, Singapore and Hong Kong, and cost its three founders about 1,000 yuan to build. The article cites up to 200 million one-person households in China by 2030 ([BBC]).

- On r/technology (12 January 2026, 565 points) the top comment, from an older man living alone, was "I have exactly one person who occasionally reaches out" (546 points) ([r/technology Are You Dead][1qasi9a]); a Bluesky post of the FT story drew 29 likes and 16 reposts ([Bluesky FT post][bsky-ft]).
- On r/Futurology (27 January 2026, 339 points, 82 comments): "It's life alert 2.0. It solves a problem that exists" (150) against "Seems really easy to miss the check in by accident and then freak out a loved one" (134) ([Futurology check-in][1qotfn8]).
- The Snug team's AMA (14 May 2025, 468 points, 178 comments) reported 20 million check-ins and "tens of thousands" of daily users. The top questions were about data (72) and setting a weekly rather than daily interval (47); a long-time user wrote "I forgot to check in one day and the Fire Department came to my door" ([Snug AMA][1kmkcvh]). A writer recommending Snug on Bluesky drew 37 likes ([Bluesky Snug][bsky-snug]).
- On r/LivingAlone: "I'd probably forget to check in most days, thus annoying my contact" (56 points), "not available in your region" and privacy worries (January 2025, 110 points) ([check-in apps][1huowjc]); someone who "purposefully cut off all app notifications" imagined police knocking after a rest day (23 points), while another keeps a daily-contact pact with a friend who calls for a welfare check after three missed days (January 2026, 52 points) ([apps for living alone][1qe9xa5]). Pets are a repeated motive ([apps for living alone][1qe9xa5], [Snug AMA][1kmkcvh]).
- Clones followed: SoloSafe on r/iosapps (January 2026, 46 points; a commenter: "Like the 死了么 app in China") ([SoloSafe][1qrzm6u]); a lifetime-price clone on r/SideProject (3 points) ([lifetime clone][1rlasia]); "Show HN: I built the US version of 'Are You Dead?'" (3 points, 26 February 2026) ([HN clone][hn47170669]); SoloGuard (July 2026) and CheckinBee (May 2026) on Product Hunt. One builder ties the check-in to "your phone charging event" so it happens automatically ([apps for living alone][1qe9xa5], [free check-in apps][1m787em]).
- A related ask: a timer for "when my expected arrival time is and if i don't alert safe within that time frame" to call contacts (r/LivingAlone, June 2025, 37 points, 54 comments); replies pointed to Life360 and iPhone location sharing ([arrival check][1l4t5l6]).

**Malaysia (indirect).** No Malaysian thread about check-in apps surfaced. Adjacent posts: a young woman's first time living alone in KL ("Always, always, always, see the unit first", 43 points) (December 2025) ([single women KL][1pm5nyi]); a young resident living alone handling bills when the water meter was removed ([meter removed][1m95v9p]); an incoming APU student who wants "the entire unit to myself" ([studio near APU][1x70m76]).

[BBC]: https://www.bbc.com/news/articles/c3381r5nnn6o
[1qasi9a]: https://www.reddit.com/r/technology/comments/1qasi9a/
[bsky-ft]: https://bsky.app/profile/hetanshah.bsky.social/post/3mcbzh3rros2n
[1qotfn8]: https://www.reddit.com/r/Futurology/comments/1qotfn8/
[1kmkcvh]: https://www.reddit.com/r/IAmA/comments/1kmkcvh/
[bsky-snug]: https://bsky.app/profile/naomikritzer.bsky.social/post/3m2n5iz2pkk2t
[1huowjc]: https://www.reddit.com/r/LivingAlone/comments/1huowjc/
[1qe9xa5]: https://www.reddit.com/r/LivingAlone/comments/1qe9xa5/
[1qrzm6u]: https://www.reddit.com/r/iosapps/comments/1qrzm6u/
[1rlasia]: https://www.reddit.com/r/SideProject/comments/1rlasia/
[hn47170669]: https://news.ycombinator.com/item?id=47170669
[1m787em]: https://www.reddit.com/r/LivingAlone/comments/1m787em/
[1l4t5l6]: https://www.reddit.com/r/LivingAlone/comments/1l4t5l6/
[1pm5nyi]: https://www.reddit.com/r/malaysia/comments/1pm5nyi/
[1x70m76]: https://www.reddit.com/r/malaysiauni/comments/1x70m76/

### Off-campus housing, deposits and housemates

**APU: the November 2026 intake.**

- An incoming student was told on-campus dorms are "fully booked" and a transit hotel would be arranged "for 1–2 months" (15 October 2026) ([dorm full][1x6p3du]); another got an email that on-campus was unavailable ([accommodation email][1vj2fxb]).
- At least ten threads between September and October 2026 ask about Parkhill, Harmony, City of Green, One South, D'Ivo and Bayu Jalil ([off-campus][1x1i1mr], [studios][1wybxmi], [Bayu Jalil][1xguf4y], [D'Ivo][1xbawiw], [One South][1wlle2i]). Recurring facts: a Parkhill resident says the shuttle "is no longer free and you have to renew RM70 a month", with Grab at RM6–9 a ride (28 October 2026) ([Parkhill][1xhjjl2]); "Food is a major issue though" and "No food options near Parkhill" ([studio near APU][1x70m76], [off-campus][1x1i1mr]); an international student with a RM700–900 budget, still at 35% on EMGS, was pointed to Facebook Marketplace, iBilik, Mudah and a "UniLiving Malaysia" WhatsApp group (September 2026) ([last-minute room][1wdcove]). A prospective dorm resident asked about Wi-Fi, laundry, irons and kitchens and got no reply ([dorm questions][1wur76q]).

**Malaysia: deposits and agreements.**

- An international student whose landlord had not returned the deposit near the 30-day mark was told "They are purposely stalling until you leave the country" (April 2025) ([deposit stalling][1kalb11]).
- A student paid "over RM2,000 as a deposit plus an administrative fee" and only received the tenancy agreement five days later; replies called it a scam (February 2026, 32 comments) ([RM2,000 deposit][1rhc2rf]). Two months' deposit plus a RM1,000 agent fee is "market practice" in Johor and Penang (October 2025) ([agent fee][1ocbhxa]); a tenant ending a three-year lease was advised to "offset the rental deposit" against the last months (October 2026) ([deposit returned][1x461bf]); a deleted post about getting a deposit back from a landlord drew 415 points, with a reply that "threatening legal action is often the most effective way" (October 2024) ([deposit back][1fth3kq]).
- Housemates: an international student's housemate's boyfriend stayed over daily for months; the advice was "Video or take photos as proof. Only the agent has the authority" (November 2024, 116 points) ([housemate][1go5de9]). A Sudanese student reports owners refusing to rent to Africans (34 points) ([surprised][1vvwift]).
- Condo upkeep: "nobody wants to be in the JMB/MC but will have lots of things to say in the group" (49 points; April 2026, 89 points) ([condo management][1szneis]).

[1x6p3du]: https://www.reddit.com/r/malaysiauni/comments/1x6p3du/
[1vj2fxb]: https://www.reddit.com/r/malaysiauni/comments/1vj2fxb/
[1x1i1mr]: https://www.reddit.com/r/malaysiauni/comments/1x1i1mr/
[1wybxmi]: https://www.reddit.com/r/malaysiauni/comments/1wybxmi/
[1xguf4y]: https://www.reddit.com/r/malaysiauni/comments/1xguf4y/
[1xbawiw]: https://www.reddit.com/r/malaysiauni/comments/1xbawiw/
[1wlle2i]: https://www.reddit.com/r/malaysiauni/comments/1wlle2i/
[1xhjjl2]: https://www.reddit.com/r/malaysiauni/comments/1xhjjl2/
[1wdcove]: https://www.reddit.com/r/malaysiauni/comments/1wdcove/
[1wur76q]: https://www.reddit.com/r/malaysiauni/comments/1wur76q/
[1kalb11]: https://www.reddit.com/r/malaysia/comments/1kalb11/
[1rhc2rf]: https://www.reddit.com/r/malaysiauni/comments/1rhc2rf/
[1ocbhxa]: https://www.reddit.com/r/malaysia/comments/1ocbhxa/
[1x461bf]: https://www.reddit.com/r/MalaysianPF/comments/1x461bf/
[1fth3kq]: https://www.reddit.com/r/malaysia/comments/1fth3kq/
[1go5de9]: https://www.reddit.com/r/malaysia/comments/1go5de9/
[1vvwift]: https://www.reddit.com/r/malaysiauni/comments/1vvwift/
[1szneis]: https://www.reddit.com/r/malaysia/comments/1szneis/

### Offline mesh messaging during shutdowns and disasters

**Global.** Bitchat, a Bluetooth mesh chat app launched in July 2025 (HN launch thread 795 points, 424 comments) ([HN bitchat launch][hn44485342]), now has 1M+ Play installs and 37,072 GitHub stars.

- Demand spikes follow shutdowns and disasters: Indonesia and Nepal protests in September 2025, per the developer's download data ([ForkLog Nepal]); Madagascar, where protests over chronic power and water shortages ([Brave New Coin Madagascar]) brought about 70,000 downloads in a week against about 360,000 worldwide ([Wikipedia bitchat]); first place in Jamaica's App Store social-networking chart as Hurricane Melissa cut connectivity (30 October 2025) ([Decrypt Jamaica]); and "hundreds of thousands" of Android installs in Uganda before the January 2026 election ([Gizmodo Uganda]), which the developer put at over 400,000 by 5 January ([Invezz Uganda]).
- India ordered GitHub to remove it after protesters used it during shutdowns (r/privacy, 24 July 2026, 2,137 points, 218 comments; HN 543 points, 448 comments) ([r/privacy India][1v59n2u], [HN India][hn49036433]), then had it removed from Apple's India store; "pulling it off the store doesn't touch anyone who already installed it" (168 points; r/india, 3 October 2026, 710 points) ([r/india removal][1wwtrmm]).
- Day-to-day use is thin: "I installed it on day 1. Still haven't found anyone else to chat with" (29 points) ([r/technology bitchat][1ptpvk6]); "BT range is extremely short. This is more sms at a festival than a town level" (12 points, r/preppers, January 2026) ([preppers][1qa6fd9]); a festival field test's conclusion, as one reply summed it up, was "it didn't work", and another top HN reply listed "Bluetooth reliability, platform differences, getting critical mass for effective relaying" (August 2025, 105 points) ([HN festival][hn44815164]); the Gaza thread's top reply named distribution as the problem, recalling that AirDrop won in Hong Kong "because it is what so many people already had" (517 points) ([HN Gaza][hn45929358]).
- Where it works, groups are dense: a festival-goer with a medical condition who may need to leave at short notice says it "works great" for keeping in touch with a partner and friends (Waking Life, May 2026, 55 points) ([festival group][1tp2sa4]).

**Malaysia.** No Malaysian thread about bitchat or mesh chat surfaced.

[hn44485342]: https://news.ycombinator.com/item?id=44485342
[ForkLog Nepal]: https://forklog.com/en/bitchat-kept-communication-flowing-during-protests-in-indonesia-and-nepal
[Brave New Coin Madagascar]: https://bravenewcoin.com/insights/madagascar-protesters-turn-to-offline-messaging-app-as-crisis-deepens
[Wikipedia bitchat]: https://en.wikipedia.org/wiki/BitChat
[Decrypt Jamaica]: https://decrypt.co/346748/bitchat-tops-jamaica-app-charts-hurricane-melissa-cuts-connectivity
[Gizmodo Uganda]: https://gizmodo.com/jack-dorseys-bitchat-sees-downloads-spike-in-uganda-over-internet-shutdown-worries-2000706828
[Invezz Uganda]: https://www.tradingview.com/news/invezz:653fd08aa094b:0-bitchat-tops-uganda-app-stores-as-election-internet-blackout-drives-use
[1v59n2u]: https://www.reddit.com/r/privacy/comments/1v59n2u/
[hn49036433]: https://news.ycombinator.com/item?id=49036433
[1wwtrmm]: https://www.reddit.com/r/india/comments/1wwtrmm/
[1ptpvk6]: https://www.reddit.com/r/technology/comments/1ptpvk6/
[1qa6fd9]: https://www.reddit.com/r/preppers/comments/1qa6fd9/
[hn44815164]: https://news.ycombinator.com/item?id=44815164
[hn45929358]: https://news.ycombinator.com/item?id=45929358
[1tp2sa4]: https://www.reddit.com/r/wakinglifefestival/comments/1tp2sa4/

### Internships, part-time work and money

**APU.**

- A second-year APU student 11 weeks into the mandatory 16-week internship had missed a month of weekly logbooks, the industrial supervisor's signatures and meetings with the academic supervisor (14 September 2026, 20 points); replies ranged from "Just get it now, u will be fine" (31) to "I completely lied in my logbooks" because the supervisor never answered texts ([APU internship][1wfrt3n]).
- An incoming APU master's student asked how international students cover expenses under strict work rules (22 August 2026, 179 points, 46 comments) ([expenses][1vv423i]).

**Malaysia.**

- "My friend's internship just became a 'show up to sign your logbook and leave' situation" (17 May 2026, 308 points) ([logbook internship][1tfov68]); "We can't even get an internship" from international students (26 August 2026, 190 points) ([intl internships][1vyo0wh]); late applicants find "most companies will fill their intern quota by March" (June 2025, 45 points) ([internship placements][1lo2v8l]).
- Allowances: "the standard are between 400-1000 in Malaysia, 700-1200 in KV" (January 2026) ([allowance][1q6cm91]). A local student's remote internship drew a lecturer's warning (April 2026, 48 points) ([WFH internship][1sqg4tj]).
- International students say the rules are "extremely strict, so most just end up either not working, or provide freelance work (in secret)" (May 2026) ([part-time intl][1tltky3]); an international student was told RM1,000 a month excluding rent "is a lot" (53 points; July 2026, 118 points) ([how intl survive][1v1qozv]). Local students find gigs through "Telegram/WhatsApp groups, Insta stories, JobStreet" (October 2025) ([side gigs][1o4auon]).

[1wfrt3n]: https://www.reddit.com/r/malaysiauni/comments/1wfrt3n/
[1vv423i]: https://www.reddit.com/r/malaysiauni/comments/1vv423i/
[1tfov68]: https://www.reddit.com/r/malaysiauni/comments/1tfov68/
[1vyo0wh]: https://www.reddit.com/r/malaysiauni/comments/1vyo0wh/
[1lo2v8l]: https://www.reddit.com/r/malaysiauni/comments/1lo2v8l/
[1q6cm91]: https://www.reddit.com/r/malaysiauni/comments/1q6cm91/
[1sqg4tj]: https://www.reddit.com/r/malaysiauni/comments/1sqg4tj/
[1tltky3]: https://www.reddit.com/r/malaysiauni/comments/1tltky3/
[1v1qozv]: https://www.reddit.com/r/malaysiauni/comments/1v1qozv/
[1o4auon]: https://www.reddit.com/r/malaysia/comments/1o4auon/

### Studying together: body doubling and study timers

**Global.**

- "focusmate is comically effective": "you just press a button and some random person appear in a video chat and you tell each other what you wanna do for the next 25/50 mins" (r/ADHD_Programmers, February 2024, 101 points) ([Focusmate][1am72sw]); a 2026 user: "I use focusmate all the time and yes it does help" (17 points) ([Focusmate 2026][1sbwp9f]).
- On studying with others online: "I body-double with friends using Discord", while groups that need cameras and check-ins "creeps me out" (March 2026, 32 points) ([body doubling study][1rtncy9]).
- YPT (Yeolpumta) study groups drew a sceptical thread (August 2026, 200 points); defenders said it gives a "reality check" for people who think they study 12 hours but focus for 4 (8 points) and that seeing others study "pushes us to study more" ([YPT groups][1vfb4s3]). YPT has 5M+ Play installs; Forest has 10M+.

**Malaysia.** One APU study-buddy post got no replies ([study buddy][1vzv4h2]). Students also describe study information scattered across chat groups: "Scroll forever through Telegram/WhatsApp groups, Hope a senior's Google Drive link still works" (July 2025, 167 points) ([note bank][1m9lzar]); a student who kept missing hackathons was "hunting for the right WhatsApp group" and "scrolling club Instagram pages" before building a listing site (September 2026, 25 points) ([hackathon finder][1wbq5ay]).

[1am72sw]: https://www.reddit.com/r/ADHD_Programmers/comments/1am72sw/
[1sbwp9f]: https://www.reddit.com/r/ADHD/comments/1sbwp9f/
[1rtncy9]: https://www.reddit.com/r/ADHD/comments/1rtncy9/
[1vfb4s3]: https://www.reddit.com/r/JEE27tards/comments/1vfb4s3/
[1m9lzar]: https://www.reddit.com/r/malaysiauni/comments/1m9lzar/
[1wbq5ay]: https://www.reddit.com/r/malaysiauni/comments/1wbq5ay/

### Friend location after Zenly

**Global.** A former "hardcore Zenly user" spent three years after Snap closed it in early 2023 trying replacements and found Life360 "feels like you're being tracked" (March 2026, 8 points) ([Zenly ranking][1rvs9um]); a friend group wanted an app that "doesn't kill battery and doesn't make us feel like we're being tracked by our parents", and an Android user wrote "My entire friend group uses Find My and I'm just... not there" (November 2025, 35 points) ([location apps][1p76fd8]). Bump has 10M+ Play installs and Life360 100M+. No Malaysian thread surfaced.

[1rvs9um]: https://www.reddit.com/r/iosapps/comments/1rvs9um/
[1p76fd8]: https://www.reddit.com/r/apps/comments/1p76fd8/

### Other APU threads

- A final-semester international APU student must user-test with "Municipal road maintenance authorities, Smart city management professionals, Road inspection personnel" and asks how to reach them: "We weren't told about this user testing beforehand" (4 November 2026) ([FYP user testing][1xnqeru]).
- A student who missed one of only two night co-curricular classes was told the lecturer would "sort it out" and asks how long to wait (19 October 2026) ([attendance worry][1x9ipoc]); the attendance rules themselves are covered in [social research](/docs/research/social.md#attendance-moodle-locks-and-the-80-visa-rule).
- A first-year international engineering student with money trouble, four failed modules and a student pass expiring in November asked where to find a cheap doctor for a medical certificate (2 October 2026) ([cheap MC][1wvmjr9]).
- Non-resident students can use the APU gym with their card (October 2026) ([APU gym][1xasnkp]); reaching Taylor's by public transport takes a shuttle, two LRT lines and a BRT (September 2026) ([to Taylor's][1wjdrvg]); newcomers ask how the trimester calendar works ([holiday system][1p1lgsg]).
- Reputation threads continue: "they dont want to fail you", from a 2026 graduate (7 points), against "All negatives about APU are right" ([APU allegations][1xfkrul]); "Is APU really that bad?" (April 2026, 37 points) ([cashgrab][1sufodw]).

[1xnqeru]: https://www.reddit.com/r/malaysiauni/comments/1xnqeru/
[1x9ipoc]: https://www.reddit.com/r/malaysiauni/comments/1x9ipoc/
[1wvmjr9]: https://www.reddit.com/r/malaysiauni/comments/1wvmjr9/
[1xasnkp]: https://www.reddit.com/r/malaysiauni/comments/1xasnkp/
[1wjdrvg]: https://www.reddit.com/r/malaysiauni/comments/1wjdrvg/
[1p1lgsg]: https://www.reddit.com/r/malaysiauni/comments/1p1lgsg/
[1xfkrul]: https://www.reddit.com/r/malaysiauni/comments/1xfkrul/
[1sufodw]: https://www.reddit.com/r/malaysiauni/comments/1sufodw/

## What people keep using

### Tools that survive months of use

| Tool or habit                                    | Adoption evidence                                                                                       | Why it stays, in the builders' words                                                                                                                                                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pi-hole on a Pi                                  | 61,659 GitHub stars; named in all three self-hosting "actually use" threads read                        | "it just sits there doing its job. The only maintenance I've ever done is updating blocklists" (69 points) ([stayed useful][1x47etr])                                                                                                                                                  |
| Invisible Home Assistant automations             | 434 comments on "set it up once" (April 2026); 297 on daily-use automations                             | Garage opens as the bike arrives (189), lights turn orange on missile alerts (220) ([set once][1sbft0v]); "leaving home" routines (75) ([daily][1snvgmp])                                                                                                                              |
| Uptime Kuma, Speedtest Tracker, Smokeping        | Uptime Kuma 93,264 stars; Speedtest Tracker 6,056                                                       | Logging the ISP to answer "Is the internet down?!" at a glance ([ISP's lies][1jrscd2])                                                                                                                                                                                                 |
| Mealie, Paperless                                | Top two answers (365 and 226 points) to "stayed useful after the novelty wore off" (October 2026)       | "the first stop every week before meal prep"; "maintenance is basically zero" ([stayed useful][1x47etr])                                                                                                                                                                               |
| An e-ink kitchen dashboard                       | 639 points (December 2025)                                                                              | Shows basement laundry status, meal plan, electricity prices; "one of my favorite things in our home" ([e-ink dashboard][1pl628k])                                                                                                                                                     |
| Old Pis on single jobs                           | A Pi 3 at 24/7 for ten years; a first-generation Pi outside in a rabbit hutch for ten years (31 points) | One long-running job each: a GPS time server, earlier five years of server-room temperature logging ([oldest Pi][1kzgwkv]); the SD card is the expected failure (90 points) ([life expectancy][1v1fq9q])                                                                               |
| Old Android phones                               | BirdNET microphone, dashboard, white-noise night light (July 2026)                                      | A dashboard phone on a smart plug that charges by battery level (8 points) ([old Android][1ux000z])                                                                                                                                                                                    |
| Phone-state triggers in iOS Shortcuts and Tasker | 732 points and 651 comments (October 2026); 387 and 515 (December 2025)                                 | Charging at night turns the house off (95); "find my phone" by text (313); arrival at the office logs an in-office day (90) ([Shortcuts 2026][1x3340o]); alarm-off ramps lights (229) ([Shortcuts 2025][1pmc0y0]); "Face down + charging + at home + after 8:30pm" ([Tasker][1ms8qwl]) |

**Inference:** survivors run unattended, answer one question at a glance, need little upkeep, and leave the house working normally when they fail: "My smart home is setup so that if Home Assistant fails, the house still functions as a normal home" (297 points) ([smart homes better][1t75mh3]). Phone triggers that people keep are tied to physical moments (plugging in, arriving, waking), not to opening an app.

[1x47etr]: https://www.reddit.com/r/selfhosted/comments/1x47etr/
[1sbft0v]: https://www.reddit.com/r/homeassistant/comments/1sbft0v/
[1snvgmp]: https://www.reddit.com/r/homeassistant/comments/1snvgmp/
[1pl628k]: https://www.reddit.com/r/raspberry_pi/comments/1pl628k/
[1v1fq9q]: https://www.reddit.com/r/raspberry_pi/comments/1v1fq9q/
[1kzgwkv]: https://www.reddit.com/r/raspberry_pi/comments/1kzgwkv/
[1ux000z]: https://www.reddit.com/r/homeassistant/comments/1ux000z/
[1x3340o]: https://www.reddit.com/r/shortcuts/comments/1x3340o/
[1pmc0y0]: https://www.reddit.com/r/shortcuts/comments/1pmc0y0/
[1ms8qwl]: https://www.reddit.com/r/tasker/comments/1ms8qwl/
[1t75mh3]: https://www.reddit.com/r/homeassistant/comments/1t75mh3/

### What gets abandoned and why

- **Pis as general servers:** "Decommissioned my last Pi" (April 2026, 713 points, 365 comments): "Since the existence of cheap mini PC the Pi's era is over" unless you need GPIO (202), and Pis "priced itself out of the market" (72); owners still keep one for "Pi Hole at parents place" ([last Pi][1sgj0zu]).
- **Anything that needs the family to open an app:** "I'm basically the only one in my house who actually uses it ... families think in moments. Is the house locked? Did I forget something? Is it garbage day tomorrow?"; top reply: "If your interactions depend on someone using the app or web interface you kinda did a lousy job" (228 points) ([device-centric][1sj6wgd]). Dashboards decay into "WHY THE $&#! ISN'T THIS AUTOMATION RUNNING" (45 points) ([dashboard use][1nr3apl]).
- **Rigid or noisy automations:** a too-short motion timeout that switches the TV off (349), routines "solely based on time of day" (56), and "anything that sends my wife a notification" (69); the top story is a family-location dashboard that called the Google Maps API without throttling and cost US$3,500 (828 points) ([bad automations][1nffxk2]). "Having to press a button to stop something happening is much worse than having to press a button to start" (153) ([family hates][1pl2fdy]); multi-click remotes were retired as too confusing (115) ([retired][1e9h2dr]). Builders now clear notifications automatically once they stop being relevant ([notifications][1lgac80]).
- **Network-wide blocking the family notices:** Pi-hole broke school and game apps, so "I gave up and just put blocking on my own devices" (29 points; January 2026, 467 points) ([Pi-hole family][1q0sus6]).
- **Apps installed and never opened:** "sometimes I install all these extra apps and never end up using them" (67 points); Immich "never really clicked" for the poster ([daily self-hosted][1ugb4eg]).
- **Check-ins and mesh chat:** forgetting and false alarms for check-in apps ([Futurology check-in][1qotfn8]), and nobody nearby to talk to on bitchat ([r/technology bitchat][1ptpvk6]).

[1sgj0zu]: https://www.reddit.com/r/raspberry_pi/comments/1sgj0zu/
[1sj6wgd]: https://www.reddit.com/r/homeassistant/comments/1sj6wgd/
[1nr3apl]: https://www.reddit.com/r/homeassistant/comments/1nr3apl/
[1nffxk2]: https://www.reddit.com/r/homeassistant/comments/1nffxk2/
[1pl2fdy]: https://www.reddit.com/r/homeassistant/comments/1pl2fdy/
[1e9h2dr]: https://www.reddit.com/r/homeassistant/comments/1e9h2dr/
[1lgac80]: https://www.reddit.com/r/homeassistant/comments/1lgac80/
[1q0sus6]: https://www.reddit.com/r/pihole/comments/1q0sus6/
[1ugb4eg]: https://www.reddit.com/r/selfhosted/comments/1ugb4eg/

## Reaching APU students remotely

### Communities found

| Community                               | Size on 5 November 2026                                                | How open                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| r/malaysiauni                           | 63,046 weekly active users, 1,408 weekly contributions                 | Public; rules allow uni topics, ban selling and rental requests or offers; survey posts are common           |
| APU Cloud Innovation Hackathon Discord  | About 212 members, 9 online (Discord invite API)                       | Invite link on the event site; APU students only; no phone numbers or personal details in public channels    |
| GDG on Campus APU chapter               | 3,128 members on its gdg.community.dev page; 2,517 Instagram followers | Public chapter page; run by the APU Student Developer Society                                                |
| APU official Facebook page              | 130,169 followers (search snippet)                                     | Staff-run page; comments only                                                                                |
| APU Career Centre and Student Affairs   | Career Centre Instagram 8,888 followers (search snippet)               | Staff-run                                                                                                    |
| Club pages (eSports, Music, IR Society) | Not measured                                                           | Facebook pages and groups, login needed                                                                      |
| Intake WhatsApp groups                  | Not measurable                                                         | Student-made; links posted on Reddit for the September 2026 international intake ([freshers group][1wqug6h]) |
| "UniLiving Malaysia" WhatsApp group     | Not measurable                                                         | Room listings "suitable for APU student" ([last-minute room][1wdcove])                                       |
| APU-wide Discord or Telegram            | None found                                                             | Students looking for one could not find it (below)                                                           |

- There is no obvious official or unofficial APU-wide student chat. "Apu gc?" got "No not really but you'll make some or join some from people you meet in your intake" (September 2026) ([APU gc][1wcsmqr]); "Any discord for Asia pacific university?" (June 2026, 23 comments) got "can't find their discord" and, in late September, "Did you manage to find any? Im in master programe and I feel lost" ([APU Discord][1tu4rj7]); a May 2026 request for the freshers' WhatsApp link got no reply ([freshers link][1t0j6c3]). At Sunway, students say "u have to talk to the people and ask them to add you" and one "created an engineering Groupchat for my intake" ([Sunway chats][1wmutww]).
- The same groups carry spam and scams that persist for months ([uni group scammer][1t5bs1u]).
- A founder of a student social platform says that after the pandemic lockdowns "lots of events and confession pages are inactive" and "Seniors are not around to help" (October 2026) ([YouthOS][1x9ul9q]).
- **Inference:** the hackathon Discord's 212 members are far fewer than the 1k+ participants expected, so most participants are likely not reachable there.

[1wqug6h]: https://www.reddit.com/r/malaysiauni/comments/1wqug6h/
[1wcsmqr]: https://www.reddit.com/r/malaysiauni/comments/1wcsmqr/
[1tu4rj7]: https://www.reddit.com/r/malaysiauni/comments/1tu4rj7/
[1t0j6c3]: https://www.reddit.com/r/malaysiauni/comments/1t0j6c3/
[1wmutww]: https://www.reddit.com/r/malaysiauni/comments/1wmutww/
[1x9ul9q]: https://www.reddit.com/r/malaysiauni/comments/1x9ul9q/

### What recruiting looks like there

- The 100 newest r/malaysiauni posts matching "survey" span 17 October to 4 November 2026, about five a day, and 77 of their titles ask for respondents. This adds a rate to the survey-begging already noted in [social research](/docs/research/social.md#survey-respondents-for-final-year-projects).
- APU requests get almost nothing back: "I need at least 40 responders for ARS assignment" (31 October 2026, 0 comments) ([40 responders][1xk23gy]); an APU co-curricular event survey got one reply, a request to fill in another survey (October 2026) ([event survey][1x5ro7u]); an APU FYP needing 50 respondents appears to have offered a Touch 'n Go reward and drew mostly survey swaps (July 2026) ([FYP survey][1v41m82]).
- The norms are swaps and small payments: "I will be open to survey swapping" ([survey swap][1xkzw0x], [FYP swap][1xkx0ln]); RM5 per completed response, paid "around December-ish", and a broken link (3 November 2026) ([RM5 survey][1xmmwr0]); an RM50 lucky draw that commenters suspected was a scam ([RM50 draw][1vetfw7]).
- Finding interviewees outside the student body is the hardest part ([FYP user testing][1xnqeru]).

[1xk23gy]: https://www.reddit.com/r/malaysiauni/comments/1xk23gy/
[1x5ro7u]: https://www.reddit.com/r/malaysiauni/comments/1x5ro7u/
[1v41m82]: https://www.reddit.com/r/malaysiauni/comments/1v41m82/
[1xkzw0x]: https://www.reddit.com/r/malaysiauni/comments/1xkzw0x/
[1xkx0ln]: https://www.reddit.com/r/malaysiauni/comments/1xkx0ln/
[1xmmwr0]: https://www.reddit.com/r/malaysiauni/comments/1xmmwr0/
[1vetfw7]: https://www.reddit.com/r/malaysiauni/comments/1vetfw7/

### How a remote team could use them

**Inference**, from the patterns above; none of it needs APU staff.

- **Interviewees (6–8):** recruit from people who have already posted about the problem, by replying in public in their own threads (housing seekers for the November intake, friend seekers, free-rider and outage threads) and moving to a call only if they agree. A cold survey post competes with five others a day.
- **Survey:** expect to offer a swap or a small Touch 'n Go payment and to pass an attention check, since those are the local norms; post once in r/malaysiauni and, if the moderators allow it (the rules ask posts to stay relevant), once in the hackathon Discord's `#general`, where competing teams will also see it; and ask team members' own intake and club WhatsApp groups to share it.
- **Public posts as evidence:** the threads cited here are dated and scored, so they can stand in for part of the observation work when interviews run short.
- **Things to avoid:** rental offers or requests in r/malaysiauni (banned by rule 6), personal details in the Discord's public channels, and scraping private WhatsApp or Telegram groups.

## Unmet needs (Inference)

Stated as needs the posts show, without proposing products.

- **Is it just me?** Renters and students cannot tell whether a water, power or internet failure is their unit, their building or the area, or when it will return; they check neighbours' lights, WhatsApp neighbours or post "Is Unifi down?" ([Kerala tracker][1svl6je], [Unifi down][1j8w79t]).
- **Proof for escalation:** people escalating to TM or MCMC are told to bring "evidence and timeline", but repeated evening drops leave no record unless someone logs them ([sue TM][1nylu8m], [Lowyat leaving Unifi][ly5547965]).
- **Early warning on bills and leaks:** TNB fuel-surcharge spikes and hidden water leaks are noticed only when the bill arrives ([TNB spike][1uvz6g0], [RM1.3k bill][1i0gctt]).
- **Being noticed when you go quiet:** people living alone want someone to know if they stop responding, without a daily chore, false alarms or giving away their location ([Futurology check-in][1qotfn8], [Snug AMA][1kmkcvh]).
- **A way in for newcomers:** new and international APU students cannot find an APU-wide channel and post friend requests that get few replies, while loneliness posts draw some of the highest engagement in the sample ([APU Discord][1tu4rj7], [loneliness][1m3mqud]).
- **Visible contribution in group work:** effort stays invisible until the deadline, so students collect screenshots and edit histories for the lecturer ([free rider AI][1tc5tg2], [not contributing][1h2hmm2]).
- **Scam checks at the moment of contact:** students meet scams inside the same WhatsApp, Discord and email channels they use for university, and the official account check depends on prior police reports ([uni group scammer][1t5bs1u], [scam database][1ccic04]).
- **Choosing a place to live from far away:** incoming students compare condos without knowing commute cost, food nearby or how deposits are returned, and international students fear deposits held until they leave the country ([Parkhill][1xhjjl2], [deposit stalling][1kalb11]).
- **Respondents and interviewees:** students compete for the same respondents and rely on swaps ([survey swap][1xkzw0x]).

## Disconfirming signals and gaps

- **Check-in apps are a crowded clone space.** Several clones launched in 2026 with little traction (3 points on HN and r/SideProject), the BBC partly attributes Demumu's overseas ranks to Chinese users abroad, and no Malaysian thread asked for one. The strongest objection is false alarms from forgetting ([Futurology check-in][1qotfn8]).
- **Mesh chat lacks density.** Bitchat's spikes follow shutdowns and disasters that Malaysia has not had on that scale in this sample, and everyday users find no one in range ([preppers][1qa6fd9]).
- **Outages may be local or rare.** In the Lowyat "Is unifi down today?" thread several replies were simply "No issue", and one fix was restarting the router ([Lowyat Unifi down][ly5544231]); a Maxis user's fibre "has only gone down once in the 1–2 years" ([Maxis dongle][1x7c08r]); and people say the last thing they would do in a blackout is report it ([outage tracker][1jf76g7]).
- **Not everyone wants company.** "Sorry I like eating alone" (23 points) and "I rather eat alone" (18 points) sit under the top loneliness thread ([loneliness][1m3mqud]), and friend-seeking posts attract jokes ([homies][1uxzs0j]).
- **Group-work fixes run through lecturers.** Every workaround ends with the lecturer, which a team without staff help cannot arrange or test ([free rider failed][1tdvhk8]).
- **Scam and spam tools are entrenched.** Truecaller has 1B+ installs and Whoscall 50M+, and telcos now block at the network level ([Lowyat scam figures][ly5549923]).
- **Pi enthusiasm is cooling.** Many builders have moved their servers to mini PCs ([last Pi][1sgj0zu]).
- **Gaps:** no thread about online classes or online exams disrupted by home outages surfaced, despite two targeted queries; no APU-condo-specific utility thread was read; Facebook groups, WhatsApp and Telegram communities could not be searched or sized; Lowyat's Bukit Jalil condo owner threads, YouTube and Threads were not read; X was left to a separate pass.

[ly5544231]: https://forum.lowyat.net/topic/5544231/all

## See also

- [Social research](/docs/research/social.md): the earlier Reddit, X, Lowyat, Google Maps, TikTok and Hacker News evidence on campus operations.
- [Hackathon brief](/docs/BRIEF.md): rules, dates and judging outline.
- [APU research](/docs/research/apu.md): APU's public services, including shuttle pass prices.
- [Team formation channel capture](/docs/sources/discord.com/team-formation.md): the hackathon Discord's rules for contacting participants.
