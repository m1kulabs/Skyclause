# Astra X signals for campus operations

Nine Malaysian X posts provide historical evidence of unfinished maintenance, inaccessible facilities, transfer friction, and campus connectivity complaints. Original post text, handles, and timestamps were retrieved from X's public syndication endpoint on 3 November 2026 after authenticated search failed. These are qualitative leads for the [hackathon brief](/docs/BRIEF.md), not measurements of present conditions or evidence that APU has the same problems.

Contents:

1.  [What the evidence supports](#what-the-evidence-supports)
1.  [Evidence grades](#evidence-grades)
1.  [Post register](#post-register)
1.  [Implications for investigation](#implications-for-investigation)
1.  [Access and query log](#access-and-query-log)
1.  [Gaps and exclusions](#gaps-and-exclusions)
1.  [Sources and retrieval](#sources-and-retrieval)

## What the evidence supports

- Repeated reporting can coexist with a reported unresolved fault. Three university-related accounts describe a fan fire after two complaints, a fallen sink after delayed attention, and helpdesk reports that rarely received attention (X01–X03). These remain the authors' allegations; no maintenance records were obtained.
- Knowing that a lift exists is insufficient for knowing whether a journey is accessible. A witness describes an unusable lift and escalator, and the operator confirms ongoing maintenance (X04–X05).
- Repair ownership itself can be uncertain. The operator corrects an earlier response and says the escalator falls outside its maintenance responsibility (X06).
- Transfer timing is a distinct problem from knowing the next departure. A commuter asks to stop having to run daily; the operator explains that the two lines have different frequencies (X07–X08).
- A photographed university slide contains complaints about Wi-Fi connection failures and electricity outages. The underlying complainants and dates are not independently verified (X09).

No source here establishes that a ticket was formally marked **closed** while the fault remained. That proposed workflow failure must be tested separately; do not present it as a finding from these posts.

## Evidence grades

- **A — Original text verified:** X's public `cdn.syndication.twimg.com` endpoint returned the post's text, author, and UTC timestamp. This verifies what the account published, not the factual truth of every allegation. It is public retrieval, not successful authenticated account access.
- **B — Original media verified, underlying claims unverified:** the original post and its attached photo were retrieved from X, but the complaints shown inside the photo lack independently verified authors, dates, or originals.
- **C — Embedded reproduction only:** a publisher preserves a tweet and permalink, while X's endpoint returns a tombstone or cannot provide the post. Such material is a discovery lead and is excluded from the nine-post register.

The sample was selected for explanatory value. Posts and replies in one conversation are correlated evidence, not independent incidents. Dates below are UTC; all nine posts are historical.

## Post register

| ID  | Original post and verified date                                                                    | Role and grade                              | Concise paraphrase                                                                                                                                                                   | Limit or implication                                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X01 | [@ArepAshari, 12 May 2022, 04:44 UTC](https://x.com/ArepAshari/status/1524611364110491648)         | Complaint reporting a residence incident; A | Says a fan above a bed caught fire after two complaints had failed to obtain a repair; tags Universiti Malaya and education officials.                                               | A clear repeated-report narrative. The post does not expose ticket records or prove prior closure. A [contemporary report][um-fan] identifies the room as his sister's and reports later repair and relocation.     |
| X02 | [@idayu3112, 13 May 2022, 10:01 UTC](https://x.com/idayu3112/status/1525053586727505920)           | Personal experience in a reply; A           | Says attention came after a week, a sink fell and broke while residents were away, and management objected to reporting that the sink was about to fall rather than had fallen.      | Suggests investigating how precursor faults are classified and escalated. The specific institution is not established by this reply; do not assign it to UM.                                                        |
| X03 | [@nurinlattechoc, 15 May 2022, 08:10 UTC](https://x.com/nurinlattechoc/status/1525750466512322560) | Campus complaint; A                         | Explicitly describes UM facilities, says helpdesk reports rarely receive attention, and describes poor fan function and uncomfortable room ventilation.                              | Supports a service-follow-through research question. It is one account's experience, not a measured response rate.                                                                                                  |
| X04 | [@xXpearlyXx, 18 May 2022, 07:05 UTC](https://x.com/xXpearlyXx/status/1526821246708555781)         | Witness complaint; A                        | Says Ampang Park's lift and escalator have been broken since the previous year and describes a disabled man having to climb stairs.                                                  | Historical evidence that an outage can invalidate an otherwise accessible route. It does not establish the station's current condition.                                                                             |
| X05 | [@askrapidkl, 18 May 2022, 07:41 UTC](https://x.com/askrapidkl/status/1526830222108426241)         | Operator reply to X04; A                    | Confirms the lift is still under maintenance and directs customers to counter staff for help.                                                                                        | Confirms acknowledged unavailability at that time. Acknowledgement and an offer of assistance do not establish restored independent access.                                                                         |
| X06 | [@askrapidkl, 10 November 2021, 07:12 UTC](https://x.com/askrapidkl/status/1458331642653597696)    | Operator ownership correction; A            | Apologises for its previous reply and, after checking, says the escalator is outside Rapid KL's maintenance responsibility.                                                          | Strong source for ambiguous ownership and a corrected handoff. The [contemporary account][sri-rampai] locates the issue near Sri Rampai; the verified post itself does not name the station.                        |
| X07 | [@payottt, 15 December 2022, 14:30 UTC](https://x.com/payottt/status/1603397185055473664)          | Commuter complaint; A                       | Asks for better timing because running every day is tiring; attaches a video.                                                                                                        | The [contemporary report][mrt-transfer] identifies an MRT transfer. The video was not independently analysed in this research, so the post does not provide a measured missed-transfer rate.                        |
| X08 | [@askrapidkl, 16 December 2022, 01:31 UTC](https://x.com/askrapidkl/status/1603563373891051520)    | Operator reply to X07; A                    | Says the Kajang and Putrajaya lines operate at different frequencies and cannot be coordinated at that time.                                                                         | Corroborates a real operational constraint behind the complaint. It does not establish today's timetable or imply a student team can change dispatch.                                                               |
| X09 | [@x_keju, 2 October 2024, 02:59 UTC](https://x.com/x_keju/status/1841311958093681139)              | Photograph of a campus presentation; B      | Shares a UiTM-branded slide headed “Contoh Posting Negatif”. The inspected photo includes posts complaining of repeated Wi-Fi connection failures and recurrent electricity outages. | Evidence of publicly displayed complaints, not direct verification of each student's experience. Handles are obscured and the photo does not establish the campus, slide date, or surrounding presentation context. |

## Implications for investigation

**Inference — Recovery should be evidenced separately from acknowledgement.** X01–X05 motivate asking residents and facilities staff how they distinguish receiving a report, assigning it, completing work, and confirming the facility is usable again. A useful outcome measure is elapsed time until restored function, supported by a real observation or reading. These posts do not establish that an automated sensor can diagnose the fault or authorise a repair.

**Inference — Access information needs scope and freshness.** X04–X06 motivate a narrowly scoped status record that identifies the affected route or facility, the responsible owner, when the status was checked, and whether recovery has been verified. A missing or failed feed should produce “unknown”, in line with the repo's real-data rule. A status tool must not promise safe passage based only on a maintenance ticket.

**Inference — Transfer usefulness should be measured at the journey level.** X07–X08 suggest testing whether an alert helps a commuter decide when to leave and which connection is feasible. They do not justify claiming that a new bus tracker solves the problem, or that live APU shuttle telemetry is available.

**Inference — Connectivity complaints are leads for direct measurement.** X09 could motivate collecting consented measurements on the team's own devices and distinguishing inability to join a network from poor internet performance. It gives no basis for estimating APU outage frequency, identifying root causes, or inspecting campus infrastructure without authorisation.

## Access and query log

All requests were read-only. No posting, messaging, following, account changes, or account-identity lookup occurred. Environment checks printed only whether `X_AUTH_TOKEN`, `X_CT0`, and `X_BEARER_TOKEN` were present; their values were not printed or saved. Cookies existed only in process memory and were sent only to X.

| Step | Query or access path                                                                                                                                                                                                                                             | Result                                                                                                                                                                                                                                                                                          |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Indexed searches including `site:x.com APU bus "late"`, `site:x.com Malaysia "campus" "wifi"`, `site:x.com "APU" "lift"`, and Malaysian university washing-machine searches                                                                                      | No qualifying exact APU complaint located. Some searches returned unrelated material.                                                                                                                                                                                                           |
| 2    | Twikit `search_tweet`, query `"APU" (bus OR shuttle OR wifi OR lift)`, product `Latest`, count 20, with environment cookies loaded in memory                                                                                                                     | Default Python 3.15 failed during dependency import with a missing `co_lnotab` attribute. Retried with Python 3.12; client failed with `Couldn't get KEY_BYTE indices` before returning search results. This is a client/parser failure, not evidence that the account credentials are invalid. |
| 3    | Authenticated GET to `https://x.com/i/api/1.1/search/tweets.json` with the same query, environment bearer header, `auth_token`, and `ct0`                                                                                                                        | HTTP 403, empty body. No authenticated search results obtained; the response gives no diagnostic reason.                                                                                                                                                                                        |
| 4    | Broader indexed searches: `RapidKL bus waiting twitter complaint`, `Malaysia university wifi students twitter complaint`, `Malaysia lift broken wheelchair twitter post`, `"xXpearlyXx" "Ampang" twitter`, and `Malaysia student laundry machine broken Twitter` | Located contemporary reports containing original tweet permalinks. Those links were followed before choosing evidence.                                                                                                                                                                          |
| 5    | Direct X/Twitter links through the web reader                                                                                                                                                                                                                    | Returned HTTP 403. A separate unauthenticated HTML request returned a page shell, which was not treated as verified post content.                                                                                                                                                               |
| 6    | Public GET to `https://cdn.syndication.twimg.com/tweet-result?id=<post-id>&token=1&lang=en`                                                                                                                                                                      | Returned `Tweet` objects for all nine registered posts. `token=1` is a literal public endpoint parameter, not an account credential. Selected public text, author, date, and media URLs were retained in session notes.                                                                         |
| 7    | X09 photo fetched directly from `pbs.twimg.com` and inspected                                                                                                                                                                                                    | Confirmed the visible Wi-Fi and electricity complaints and the obscured handles. The underlying posts were not recovered.                                                                                                                                                                       |

Discovery through a publisher is distinguished from verification through X. No external search provider received the account cookies. The investigation did not retry account mutations, solve a login challenge, or infer permission to access private content.

## Gaps and exclusions

- **APU:** no qualifying APU-specific X complaint was verified. The sampled campuses and transport incidents must not be relabelled as APU findings.
- **Bus uncertainty:** an April 2022 bus-boarding complaint by `@azlanalanlan`, post `1512690438842445826`, was found through a contemporary report, but the public endpoint returned `TweetTombstone`. It is excluded from the register. The useful transport evidence here concerns rail transfers, not a verified APU bus-delay pattern.
- **Long-running repair:** `@MuzamilIdris` post `1458046132114784257`, reproduced in the [Sri Rampai report][sri-rampai], also returned `TweetTombstone`. X06 verifies the operator's ownership correction; this research does not independently verify the original author's five-year duration claim.
- **Laundry:** searches found unrelated commercial listings, product proposals, news, and non-X anecdotes, but no qualifying firsthand Malaysian campus laundry-outage X post. Laundry remains unsupported by this X sample.
- **Closure without repair:** no ticket history or explicit closed-status evidence was obtained. Report-to-recovery gaps and formal premature ticket closure are separate claims.
- **Promotion:** none of the registered posts markets a product. X05, X06, and X08 are operator statements, not customer complaints; X09 is a photographed compilation, not nine additional independent sources.
- **Age and representativeness:** eight posts date from 2021–2022 and one from 2024. They establish historical failure modes and research questions, not current prevalence, willingness to adopt, or population-level demand.

## Sources and retrieval

Each register link is the original X permalink. For primary retrieval, substitute its numeric post ID in the [public syndication request for X01](https://cdn.syndication.twimg.com/tweet-result?id=1524611364110491648&token=1&lang=en). The [original X09 image](https://pbs.twimg.com/media/GY2nUX5a8AAbiI1.jpg) was inspected directly. Public retrieval may change or become unavailable; author allegations remain unverified even when the text is retrievable.

The following contemporary articles were used to discover originals and provide the specifically labelled surrounding context, not to manufacture missing post text:

- [TRP: UM residence fan reports and subsequent response][um-fan].
- [Wau Post: Ampang Park lift and escalator complaints][ampang-park].
- [Vocket: operator response to the Ampang Park complaint][ampang-reply].
- [Wau Post: Sri Rampai escalator ownership dispute][sri-rampai].
- [Vocket: MRT transfer complaint and operator replies][mrt-transfer].
- [Hype: UiTM presentation photo and uncertain context][uitm-slide].

[um-fan]: https://www.therakyatpost.com/news/2022/05/15/watch-um-student-reported-faulty-fan-to-management-twice-it-finally-caught-fire/
[ampang-park]: https://waupost.com/man-with-crutches-had-to-use-stairs-at-ampang-park-lrt-station-as-lift-remains-broken-since-2021/
[ampang-reply]: https://thevocket.com/lebih-setahun-lif-rosak-respon-tidak-masuk-akal-rapidkl-terhadap-golongan-oku-buat-netizen-berang/
[sri-rampai]: https://waupost.com/escalator-leading-to-sri-rampai-lrt-is-still-broken-after-5-years-now-rapidkl-says-its-dbkls-problem/
[mrt-transfer]: https://thevocket.com/rapid-kl-tambah-tempoh-masa-berhenti-untuk-elak-penumpang-berlari-semasa-tukar-tren-mrt/
[uitm-slide]: https://hype.my/uitm-called-out-for-petty-behaviour-after-publicly-shaming-students-for-complaining/
