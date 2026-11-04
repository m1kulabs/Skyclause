# Rules and guarantees

Public rules, provider guarantees, platform behaviours and one set of feed measurements that shape the off-campus problems of APU students, each re-checked against its primary source on 5 November 2026. Quotes are short; follow the link for the full text, and the APU pages stay APU's (see [Terms of use and robots.txt](/docs/research/apu.md#terms-of-use-and-robotstxt)).

Contents:

1. [How this was checked](#how-this-was-checked)
1. [APU rules](#apu-rules)
   1. [Extenuating circumstances for IT or network failure](#extenuating-circumstances-for-it-or-network-failure)
   1. [Student pass renewal](#student-pass-renewal)
   1. [APResidence prepaid smart meters](#apresidence-prepaid-smart-meters)
   1. [Off-campus residences: website and KB disagree](#off-campus-residences-website-and-kb-disagree)
   1. [Bursary payment channels and payee names](#bursary-payment-channels-and-payee-names)
   1. [Research ethics forms for final-year students](#research-ethics-forms-for-final-year-students)
1. [Providers and government](#providers-and-government)
   1. [Unifi Promise](#unifi-promise)
   1. [MCMC complaints for telco and broadband issues](#mcmc-complaints-for-telco-and-broadband-issues)
   1. [Semak Mule and NSRC 997](#semak-mule-and-nsrc-997)
   1. [EMGS processing target](#emgs-processing-target)
1. [Platform behaviours](#platform-behaviours)
   1. [GitHub disables scheduled workflows](#github-disables-scheduled-workflows)
   1. [Tailscale Funnel and the client address](#tailscale-funnel-and-the-client-address)
   1. [Setting alarms from a phone without a person](#setting-alarms-from-a-phone-without-a-person)
1. [APSpace timetable feed measurements](#apspace-timetable-feed-measurements)
1. [Not verified](#not-verified)
1. [See also](#see-also)

## How this was checked

- **Method:** every page was opened on 5 November 2026 (MYT) and the quoted wording copied from it. APU's knowledge base (`kb.apu.edu.my`, which redirects to `apiit.atlassian.net`, see [APU Knowledge Base on Confluence](/docs/research/apu.md#apu-knowledge-base-on-confluence)) was also read through its anonymous Confluence REST API, which gives each page's creation date and last version date. Page-body text is quoted from the rendered page.
- **Dates:** the KB pages show "Updated Jan 09" style labels with no year. The year comes from the REST `version.when` field and is given as "last edited".
- **Labels:** **Inference** marks a conclusion no source states outright.

## APU rules

### Extenuating circumstances for IT or network failure

- **Evidence for a network failure:** "evidence of the network issue with appropriate time stamp and screen shots must be provided along with any related engagement with the concerned lecturer or invigilation staff, without which the claim will be rejected" ([What happens when IT equipment fails?][kb_it], published 21 December 2022, never edited since; checked 5 November 2026).
- **Many systems down at a deadline:** "If a significant number of computers were out of action for several hours then this might form the basis for granting a short extension to the assignment deadline. You should request the Technical Assistant to countersign your claim" (same page).
- **Own laptop failure:** evidence "of having the equipment repaired/enhanced at a service/repair outlet, during the assessment period", else "the claim being rejected" (same page).
- **Window:** "must be submitted no more than 3 days after the extenuating circumstances occurred" ([How do I submit EC?][kb_ec], last edited 9 January 2026; checked 5 November 2026).
- **Route:** "You can submit EC Online from the following link – e-Forms", also reached by "APSpace > More > e-Forms"; log in with APKey and "Select EC Submission from the list of forms" (same page). Uploads accept ".pdf, .jpg, .png, docx, or .doc", and a hard copy goes to a counter "when the university requires" one.
- **Inference:** the 3-day clock runs from the event, not from the day the student notices a lost deadline, so an outage log with timestamps has to exist before the claim does.

### Student pass renewal

All from [Student Visa / Pass][kb_visa] (last edited 3 August 2026; checked 5 November 2026).

- **Timing:** renew "three (3) months before it expires"; the university emails a notice three months before expiry; "It is the responsibility of the student to monitor the expiry date".
- **Special pass fee:** "Special Pass payment (RM154) if submission of renewal documents is done less than four (4) weeks from the expiry date".
- **Fee tiers:** the renewal fee rises with lateness. For a 7 to 12 month renewal the table reads RM1,240 at twelve weeks or more before expiry, up to RM1,580 at less than seven but no later than six weeks.
- **Overstay:** "Immigration will impose a penalty ranging from RM1, 000 – RM5, 000 depending on the duration of your overstay"; failing to renew on time "will result in deregistration of your studentship".
- **Passport validity:** "Passport must have a minimum eighteen (18) months validity".
- **Conditions:** attendance "should not fall below 80% each semester", "a minimum of CGPA 2.00", and no overdue fees ("may not be accepted if you have overdue fees").
- **Outside Malaysia:** a pass expired "more than 90 days" bars re-entry.
- **Endorsement time:** "normally takes around three (3) months".

### APResidence prepaid smart meters

- **Top-up thresholds:** top up "before the balance reaches" 30 kWh (single), 54 kWh (twin sharing), 107 kWh (quad sharing) or 57 kWh (common area or living hall at off-campus residences); the minimums "are estimated (based on normal energy usage) to last for 3 days before reaching zero (and resulting in energy disruption)" ([How to Top-Up Prepaid Smart Meter][kb_meter], last edited 17 September 2026; checked 5 November 2026).
- **Mechanics from the same page:** presets run from RM10 to RM200; payment by APCard or APay; the dashboard refreshes "several times throughout the day" and shows a "Last Connected" time; "Top-up credits are non-refundable once successfully processed".
- **Initial top-up:** off-campus residences (City of Green, Harmony, M Vertica, Maple, Bloomsvale) are on a "Pay as you use" basis, and "New tenants pay RM 100 (USD 25) initial top-up" ([APU Residence Policies][kb_policy], published 11 February 2026; checked 5 November 2026). Rooms at the satellite campus are "Inclusive of utilities".
- **Tenancy terms on the same page:** a "MINIMUM PERIOD OF 4 (FOUR) MONTHS", with "FORFEITURE OF THE DEPOSIT IN FULL" otherwise; booking needs "2 months' deposit" and one month's rent in advance.

### Off-campus residences: website and KB disagree

- **Website:** the [APU Off-Campus Residence page][apu_res] links seven residences: City of Green, Harmony, D'IVO, M Vertica, Kuchai Sentral, Maple and Bloomsvale. It says "a number of apartment buildings close to the campus" and prices D'IVO and Kuchai Sentral rooms (checked 5 November 2026).
- **KB:** "There are 5 off-campus residence locations: City of Green (COG), Harmony (HM), M Vertica (MV), Maple (MP), and Bloomsvale (ABV)" ([APU Off-Campus Residence with Shuttle Service][kb_res], last edited 11 February 2026; checked 5 November 2026). Its monthly range is RM550 to RM1,760 for those five.
- **Inference:** the KB page is older than the website's list, which has gained D'IVO and Kuchai Sentral; neither page says so. Use the website list for "which buildings APU manages" and the KB for fees and the meter rules, and say which one a number came from.

### Bursary payment channels and payee names

From the [Bursary page][bursary] (checked 5 November 2026):

- **Bank transfer:** "Pay directly from your online banking platform to our accounts at either Maybank or CIMB", payees "ASIA PACIFIC UNIVERSITY SDN BHD" (APU fees) and "APIIT SDN BHD" (APIIT fees), with the student ID, NRIC or passport number as the reference. Proof goes to `bursary@apu.edu.my`.
- **Other channels:** JomPAY "at Internet and Mobile Banking"; FPX through the online payment system after an APSpace login (Malaysian banks only); Flywire for international payments ("Visit apu-my.flywire.com"); cash at the Bursary Office on Level 3; a crossed cheque or Banker's Draft made payable to the same two names.
- **Hosts the page links:** `onlinepayment.sites.apiit.edu.my` (FPX), `apu-my.flywire.com` and `payment.flywire.com` (Flywire), `bursary@apu.edu.my`. It does not name `onlinepayment.apu.edu.my`.
- **Not on the page:** any warning about fake payment requests. **Inference:** a payment request is legitimate only if the payee name, channel and host match this page, so the page can serve as an allowlist. The page is the only source for that list; APU's staff were not asked.

### Research ethics forms for final-year students

- **System:** "Head over to FYPPGBank System using this link" and "click on Sign in with Microsoft"; then "Click on Ethics Form" in the sidebar and choose "Fast Track Form" ([FYPPGBank Ethics Form Menu Guideline][kb_ethics], version 9, last edited 1 October 2026; checked 5 November 2026).
- **Fast Track conditions:** all answers on "Participant Confidentiality" must be Yes, and all on "Nature of Research" and "Target Participants" must be No, "or you shall receive a prompt to switch to full track Form".
- **After submission:** the form shows "Pending Approval"; the student can cancel or edit while it is pending.

## Providers and government

### Unifi Promise

All from the [Unifi Promise page][unifi] (checked 5 November 2026).

- **Eligibility:** "only applicable for Unifi broadband packages with speeds of 100Mbps and above".
- **Guarantee:** the main text says Unifi will "restore your connectivity within 24 hours of the creation of an official downtime report"; the FAQ starts the clock "from the time an official complaint or trouble ticket is made". The page does not reconcile the two wordings, so the ticket time is the safe start.
- **Compensation and time limit:** "a billing rebate will be issued, redeemable via MyUnifi app within 30 days"; the FAQ names "a bill rebate of RM50". "Rebates that have expired are considered void and will not be reissued", and they cannot be turned into cash.
- **How to report:** try EasyFix, then a report is created or Live Chat is offered; or use the MyUnifi Support page. A reply of "Y" to a Unifi Cares WhatsApp alert confirms the fault and "Report will be auto-created & report number will be shared".
- **Limits:** proactive alerts are "not sent" if the failure is already reported or the downtime affects multiple customers in the area; if the fault is in the customer's own equipment or premises "the existing On-Site Support Charges will be imposed".
- **Inference:** a student must have a ticket time on record to start the 24 hours, and the page gives no way to claim without one.

### MCMC complaints for telco and broadband issues

- **Route:** complaints go through the MCMC Consumer Redress Portal at `aduan.mcmc.gov.my`, or "Call:1800-188-030"; walk-in and `aduan@cfm.my` also work ([CFM FAQ on the MCMC Redress Portal][cfm_faq], January 2025 upload; checked 5 November 2026). CFM runs MCMC's contact centre.
- **Provider first:** the form asks for "any steps you've already taken", and "Complainant is required to provide the complaint ID / reference number / ticket number issued by the service provider" (same FAQ).
- **Timing:** "no strict time limit to lodge a complaint"; the provider's resolution is updated on the portal "within 30 working days", and most complaints are "addressed within 15 to 30 working days" (same FAQ). If the answer is unsatisfactory or late, CFM evaluates it.
- **Not accepted:** "anonymous complaints are not accepted", and filing is "free of charge" (same FAQ).
- **Inference:** a fault ticket's reference number is needed twice, once for the Unifi rebate and once for MCMC, so the ticket should be kept with timestamps.

### Semak Mule and NSRC 997

- **What Semak Mule checks:** from a news article, the portal "verifies bank account numbers and phone numbers, but also company names" reported in scam cases ([Sinar Daily, 25 August 2025][sinar]; checked 5 November 2026). The portal itself, [semakmule.rmp.gov.my][semakmule], returned only its title to my fetch, so its own wording is not quoted.
- **What it does not tell you:** "Even if no report appears, police caution that scammers may use fresh or stolen details" ([Sinar Daily][sinar]); "the absence of a report does not guarantee that the transaction is safe", and the portal "does not show any personal or case-specific information" ([ABM page, a copy of a RinggitPlus article of 6 November 2025][abm]; checked 5 November 2026).
- **Database size:** "over 299,000 bank accounts, 233,000 phone numbers, and 7,800 company names" as of late 2025 (same ABM copy).
- **NSRC 997 hours:** "Daily (24 hours)" ([MyGovernment NSRC 997 hotline][nsrc], "Updated date: 31/7/2026"; checked 5 November 2026). The August 2025 Sinar Daily article says "open daily 8am–8pm", which is the older schedule.
- **What 997 does:** calling lets the authorities "block bank accounts and financial transactions"; the page says to report "within 24 hours of discovering that you have been scammed" and still to contact the bank and file a police report.
- **Inference:** Semak Mule is a list of past reports, not a check that a payee belongs to APU; 997 is for money already sent. Neither says whether a payee is APU's.

### EMGS processing target

- **Published target:** under "How long does the Student Pass application process take?", "The client charter is 14 working days for a complete application" ([EMGS FAQ][emgs]; checked 5 November 2026).
- **Status updates:** the application form page says "Please check your email regularly for updates on your application status" (same site).
- **Inference:** the target covers a complete application, not the whole renewal cycle the APU page puts at "around three (3) months" ([Student Visa / Pass][kb_visa]); the two numbers should not be compared as if they measured the same thing.

## Platform behaviours

### GitHub disables scheduled workflows

- **Rules:** "In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days" and "When a public repository is forked, scheduled workflows are disabled by default" ([GitHub: disable and enable workflows][gh_disable]; checked 5 November 2026).
- **Measurement on the most-forked APU timetable sync:** on 5 November 2026 the GitHub REST API listed the original repository and its 40 forks. 1 had an active schedule (67 runs, last 30 October 2026, success); 34 were `disabled_inactivity` (including the original), 3 were `disabled_fork`, and 3 had no workflow file. 7 of the 41 had any recorded run. Method: `gh api` for each repository's workflows and the latest run; the repository is described under [Who already uses the timetable feed](/docs/research/apu.md#who-already-uses-the-timetable-feed).
- **Inference:** a student-built sync that nobody touches goes silent without telling anyone; the docs promise no warning.

### Tailscale Funnel and the client address

- **Docs are silent:** "Funnel traffic, which is publicly available, does not include identity headers"; the page does not mention `X-Forwarded-For` ([Tailscale serve headers][ts_headers]; checked 5 November 2026).
- **Source file:** in `ipn/ipnlocal/serve.go` at commit [`e19eb27`][ts_serve] (committed 2 November 2026 21:42 UTC), the handler for Funnel ingress reads the `Tailscale-Ingress-Src` header ("want ip:port"; the comment says "srcAddr represents the source AddrPort and not that of the ingressPeer"). The reverse proxy then runs `r.Out.Header.Set("X-Forwarded-For", c.SrcAddr.Addr().String())`, which overwrites any value the client sent, and sets `Tailscale-Funnel-Request` to `?1` for Funnel requests.
- **What this does not show:** a live request. **Inference:** a service behind `tailscale funnel` should see the visitor's IP address (without the port) in `X-Forwarded-For`; confirm with a request from mobile data before relying on it. Funnel setup is in [Public HTTPS without a card](/docs/research/phones-and-pi.md#public-https-without-a-card).

### Setting alarms from a phone without a person

- **Android intent:** `ACTION_SET_ALARM` "Activates an existing alarm or creates a new one" and "always enables the alarm"; `EXTRA_SKIP_UI`, "If true, the application is asked to bypass any intermediate UI" ([AlarmClock reference][android_alarm]; checked 5 November 2026). "Asked" matters: the clock app decides. The caller needs the `SET_ALARM` permission for related actions, and `ACTION_DISMISS_ALARM` prompts the user if more than one active alarm matches.
- **Tasker:** the Set Alarm action sets "a new alarm in the default alarm clock application", and "If Confirm is not checked no user interaction will be required"; "on some devices, setting the alarm too close to the current time may result in the alarm being set for the next day" ([Tasker Set Alarm][tasker]; checked 5 November 2026).
- **Automate:** the Alarm add block "adds an alarm in the default Clock app" and continues at once; Android supports only minute precision ([Automate Alarm add][automate]; checked 5 November 2026). The page says nothing about prompts.
- **iOS actions:** Apple's page names "Create Alarm, Toggle Alarm, Get All Alarms, and Start Timer" as Shortcuts actions, listed as newly supported on macOS in the iOS 16.1 notes ([Shortcuts what's new][ios_new]; checked 5 November 2026). A community guide reports that deleting alarms without a prompt needs "Allow Deleting Without Confirmation" on iOS 18 ([Home Assistant community][ha_alarm]; checked 5 November 2026).
- **Personal automations:** which triggers run without a prompt is already recorded in [iOS Shortcuts personal automations](/docs/research/phones-and-pi.md#ios-shortcuts-personal-automations); Android apps are under [Android automation apps and Termux](/docs/research/phones-and-pi.md#android-automation-apps-and-termux).
- **Inference:** an Android phone can have an alarm created with no tap if the clock app honours `EXTRA_SKIP_UI` or Tasker is used with Confirm off; on iOS, creating and toggling alarms are documented actions, but no page I opened says they run without a prompt inside an automation.

## APSpace timetable feed measurements

Measurements made on 5 November 2026 (about 06:03 MYT). The feed itself is described in [APSpace timetable feed](/docs/research/apu.md#apspace-timetable-feed). The numbers below contain no lecturer names or other personal data.

- **Method:** one `GET` of the public `weektimetable` file (1,138,362 bytes, gzip; `Last-Modified` 28 October 2026 01:39:49 GMT, same ETag as in the feed section). Lecturer fields were dropped in memory on load. The file holds 31,606 rows and 9,854 distinct sessions for 26 October to 22 November 2026. The three small scripts count rows by intake, date and first start time. An earlier run the same morning gave identical figures.
- **First in-person class start varies within a week:** 953 intake-groups have three or more in-person days from 2 to 6 November. For them the gap between the earliest and latest daily first start has a median of 315 minutes (25th percentile 270, 75th percentile 420); 96% differ by 2 hours or more and none starts at the same time every day. "In person" excludes rooms and modules marked online.
- **No sessions on 8 and 9 November:** the feed has no sessions on either date, and 10 to 13 November have 309 to 390 sessions a day, against about 500 to 570 on ordinary weekdays in the weeks either side.
- **Intakes affected by the 9 November holiday:** 449 intakes have sessions in the week of 9 November, and 437 of them have sessions on a Monday of 2 or 16 November. **Inference:** those 437 lose a Monday on 9 November. The holiday is Deepavali (Sunday 8 November) with a Monday replacement day in Kuala Lumpur, per secondary listings such as [Wego][wego]; I did not find a government gazette to confirm it, and the feed does not label the empty days.
- **Week-to-week first starts, measured again at about 06:11 MYT** (feed unchanged, same ETag): comparing each intake-group's first in-person start on the same weekday of consecutive teaching weeks, 26 October against 2 November kept 97.1% of 3,935 weekday slots the same (10.3% of 845 intake-groups had any change), while 2 November against 16 November, across the week of 9 November, changed 87.7% of 4,181 slots (76.9% moved, 5.9% gained a class, 4.9% lost one) in 99.8% of 855 intake-groups. Module sets were as stable across that gap as between ordinary weeks (574 of 859 identical), so **Inference:** classes were re-slotted rather than replaced. Over 26 October to 22 November, each intake-group has a median of 6 distinct first in-person start times (maximum 11, across 1,155 intake-groups).
- **Intakes with no classes 9 to 15 November:** 466 intakes have sessions in the weeks of 26 October, 2 November and 16 November but none from 9 to 15 November. **Inference:** a scheduled week break; no source states it.

## Not verified

- **Unifi Promise "total loss only", and exclusions of customer-premises faults and force majeure:** stated by a news site on the earlier guarantee, not by the current page ([SoyaCincau, 2021][soya]). Dropped.
- **Rebate "needs a record that you reported":** a social post, not the page. The page's own wording is above.
- **MCMC advice to "call 100" and wait about 15 working days before filing:** from a Reddit thread and a third-party wiki. The CFM FAQ states no required wait. Dropped.
- **MCMC's own reply that a customer should go to the provider first:** an X post whose page returned HTTP 402 to my fetch; the wording came only from a search snippet. Dropped in favour of the CFM FAQ.
- **Semak Mule's own wording** on what "No Records Found" means: the portal returned only its title; only the two secondary pages above were readable.
- **Whether iOS runs Toggle Alarm unattended inside a Run Immediately automation:** no page I opened says so (the community guide covers deletion, and Apple's page lists only the action names).
- **Android background launch limits** for alarm intents on recent Android versions, and iOS 26 or 27 behaviour for any alarm action: not opened.
- **Whether `X-Forwarded-For` carries a real mobile-network address in a live Funnel request:** the source says so; a live test was not run.
- **EMGS Hub push notifications per application stage:** not opened.
- **The off-campus residences' Wi-Fi filtering** and the APResidence power-status dots: not part of the pages re-read here.

## See also

- [APU's public documents, data, and systems](/docs/research/apu.md): the knowledge base, the feed and its terms
- [Phones and Raspberry Pi](/docs/research/phones-and-pi.md): iOS Shortcuts, Android automation, public HTTPS from a Pi
- [Gemini Enterprise](/docs/research/gemini-enterprise.md): connectors, approval gates and limits
- [Public data sources](/docs/research/data-sources.md): live public APIs and datasets
- [Project conventions](/docs/references/project-conventions.md): the real-data rule

[kb_it]: https://apiit.atlassian.net/wiki/spaces/AA/pages/2229272659
[kb_ec]: https://apiit.atlassian.net/wiki/spaces/AA/pages/221152223/How+do+I+submit+EC
[kb_visa]: https://apiit.atlassian.net/wiki/spaces/VISA/pages/221087912
[kb_meter]: https://apiit.atlassian.net/wiki/spaces/AC/pages/4045996076
[kb_policy]: https://apiit.atlassian.net/wiki/spaces/AC/pages/3777691664
[kb_res]: https://apiit.atlassian.net/wiki/spaces/AC/pages/3777986570
[apu_res]: https://www.apu.edu.my/apu-off-campus-residence
[bursary]: https://www.apu.edu.my/bursary-details
[kb_ethics]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/2748055553/FYPPGBank+Ethics+Form+Menu+Guideline
[unifi]: https://unifi.com.my/unifipromise
[cfm_faq]: https://cfm.my/wp-content/uploads/2025/01/Frequently-Asked-Questions-CCMD.pdf
[sinar]: https://www.sinardaily.my/article/729740/focus/deep-dive/semakmule-gets-an-upgrade-how-to-use-scam-checking-portal-to-stay-safe-online
[semakmule]: https://semakmule.rmp.gov.my/
[abm]: https://www.abm.org.my/safe-online-banking/scam-alerts/do-you-know-you-can-check-suspicious-accounts-online/
[nsrc]: https://www.malaysia.gov.my/en/categories/safety-and-community/cybersecurity/nsrc-997-hotline
[emgs]: https://educationmalaysia.gov.my/get-in-touch/faq
[gh_disable]: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows
[ts_headers]: https://tailscale.com/s/serve-headers
[ts_serve]: https://github.com/tailscale/tailscale/blob/e19eb275ea21790aac94be1a5eddcd20ebb40a35/ipn/ipnlocal/serve.go
[android_alarm]: https://developer.android.com/reference/android/provider/AlarmClock
[tasker]: https://tasker.joaoapps.com/userguide/en/help/ah_set_alarm.html
[automate]: https://llamalab.com/automate/doc/block/alarm_add.html
[ios_new]: https://support.apple.com/en-us/101583
[ha_alarm]: https://community.home-assistant.io/t/sync-home-assistant-alarm-clock-to-iphone-alarms-using-shortcuts-ios-18/805595
[wego]: https://blog.wego.com/deepavali-2026-malaysia-travel-plan/
[soya]: https://soyacincau.com/2021/11/30/tm-unifi-service-guarantee-users-rebate-if-service-not-restored-in-24-hours/
