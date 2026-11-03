# IoT and network

How a student team in Kuala Lumpur can deliver a genuine IoT and network component for the "When Cloud, IoT, and Network Converge" theme in one week, possibly without hardware, under the repo's real-data-only rule. Covers Google Cloud's IoT architecture after Cloud IoT Core, ways to get a real sensor signal, protocols and connectivity, pitfalls, and where replayed data sits against the rule. Researched on 3 November 2026.

Contents:

1.  [Google Cloud IoT after Cloud IoT Core](#google-cloud-iot-after-cloud-iot-core)
    1.  [Retirement and Google's guidance](#retirement-and-googles-guidance)
    1.  [Architecture Center reference architectures](#architecture-center-reference-architectures)
    1.  [From Pub/Sub to storage and Gemini](#from-pubsub-to-storage-and-gemini)
1.  [Getting a real sensor signal](#getting-a-real-sensor-signal)
    1.  [Phone and laptop sensors in the browser](#phone-and-laptop-sensors-in-the-browser)
    1.  [Cheap boards from Malaysian retailers](#cheap-boards-from-malaysian-retailers)
    1.  [Signals from devices that already exist](#signals-from-devices-that-already-exist)
    1.  [Live public sensor feeds](#live-public-sensor-feeds)
1.  [The network part in practice](#the-network-part-in-practice)
    1.  [Protocols](#protocols)
    1.  [Managed MQTT brokers](#managed-mqtt-brokers)
    1.  [LoRaWAN and The Things Network in Kuala Lumpur](#lorawan-and-the-things-network-in-kuala-lumpur)
    1.  [Edge versus cloud processing](#edge-versus-cloud-processing)
    1.  [Offline and intermittent links](#offline-and-intermittent-links)
    1.  [What a judge can see of the network](#what-a-judge-can-see-of-the-network)
1.  [Pitfalls](#pitfalls)
    1.  [Hardware lead time](#hardware-lead-time)
    1.  [APU campus Wi-Fi](#apu-campus-wi-fi)
    1.  [Demo-day connectivity](#demo-day-connectivity)
    1.  [Device credentials](#device-credentials)
1.  [Real versus simulated data](#real-versus-simulated-data)
1.  [Takeaways for this hackathon](#takeaways-for-this-hackathon)
1.  [See also](#see-also)

## Google Cloud IoT after Cloud IoT Core

### Retirement and Google's guidance

- Cloud IoT Core was retired on 16 August 2023. Google's July 2023 [services summary] said it "will be discontinued on August 16, 2023 and is not accepting new customers", and the [.NET library page] says it is "officially deprecated, with a retirement date of August 16th 2023". Google's [python-iot](https://github.com/googleapis/python-iot) repo is archived with the note "Google Cloud IoT Core is retired as of August 2023".
- Google's only migration instruction on its own pages is "Contact your Google Cloud account team for more information" ([.NET library page]). As of 3 November 2026, `https://cloud.google.com/iot-core` returns a 301 redirect to the Architecture Center's [IoT platform architecture][IoT platform] page, which describes running a third-party IoT platform on Google Cloud.
- Partners that positioned themselves as replacements (vendor claims, not Google statements):
  - ClearBlade launched "ClearBlade IoT Core" on 15 August 2022, which it says was "reviewed and approved by Google" as a replacement, with one-click migration of server-side assets ([ClearBlade press release]).
  - EMQ Technologies calls itself "an official Google Cloud migration partner" and offers EMQX Cloud or self-managed EMQX Enterprise as targets (EMQX blog, 5 June 2023, [EMQX migration post]).

[services summary]: https://cloud.google.com/terms/services/index-20230712
[.NET library page]: https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Iot.V1/latest
[ClearBlade press release]: https://www.clearblade.com/press/clearblade-iot-core-launched-today-as-a-complete-replacement-for-google-cloud-platforms-gcps-iot-core
[EMQX migration post]: https://www.emqx.com/en/blog/why-emqx-is-your-best-google-cloud-iot-core-alternative

### Architecture Center reference architectures

The [connected device architectures overview][connected devices] lists three patterns. None of the pages showed a last-updated date.

| Pattern                  | Fits                                                   | Scale (per overview) | Fleet management |
| ------------------------ | ------------------------------------------------------ | -------------------- | ---------------- |
| [Standalone MQTT broker] | Two-way device-to-cloud and device-to-device messaging | Millions             | No               |
| [IoT platform]           | Large heterogeneous fleets needing device management   | Millions             | Yes              |
| [Direct to Pub/Sub]      | Data ingestion from a few gateways                     | Hundreds             | No               |

- **Standalone MQTT broker:** a three-instance broker cluster behind Cloud Load Balancing on Compute Engine or GKE; the broker handles device authentication itself and reaches backends through Dataflow (Apache Beam MQTT driver) or a broker plugin for Pub/Sub ([Standalone MQTT broker]).
- **IoT platform:** a partner product exposing MQTT and usually HTTPS endpoints, "Some platforms also offer CoAP", with apps connecting "through Pub/Sub, or by using the Dataflow MQTT connector" and optional direct writes to Cloud SQL, Firebase, or BigQuery ([IoT platform]).
- **Direct to Pub/Sub:** gateways publish over REST or gRPC, signing calls with a service account private key; Google says this "is only an option for deployments that have a small number of devices" ([Direct to Pub/Sub]). Pub/Sub has no MQTT endpoint in this pattern: only REST and gRPC are described.
- Not found: an Architecture Center page combining device data with Gemini. Searched the connected-devices series and the web for "Architecture Center IoT Pub/Sub BigQuery Gemini".

[connected devices]: https://docs.cloud.google.com/architecture/connected-devices

### From Pub/Sub to storage and Gemini

Downstream of Pub/Sub, Google documents these pieces (product choice and free tiers are in [Google tools](/docs/research/google-tools.md)):

- **BigQuery without code:** a BigQuery subscription "writes messages to an existing BigQuery table as they are received", at-least-once, with no subscriber client; Dataflow is recommended only for windowing or complex transforms ([BigQuery subscriptions]).
- **Cloud Run:** push subscriptions deliver each message as an HTTPS POST and "work well with ... Cloud Run" ([push subscriptions]). Cloud Run also serves WebSockets "with no additional configuration", up to a 60-minute request timeout and 1,000 concurrent connections per instance, but instances don't share state, so Google suggests Firestore real-time updates or Memorystore Redis to fan out to clients ([Cloud Run WebSockets]).
- **Gemini on the stream:** the Pub/Sub AI Inference single message transform sends each message to a model, including Gemini, and attaches the inference to the message; Google says "We strongly recommend using Subscription SMTs rather than Topic SMTs for AI Inference", and each inference must finish within 60 seconds. The page doesn't state a launch stage ([AI Inference SMT]).
- **Server timestamps:** every Pub/Sub message carries `publishTime`, "populated by the server when it receives the `topics.publish` call" ([PubsubMessage]), which gives a measurable device-to-cloud latency if the device also stamps its readings.

[BigQuery subscriptions]: https://docs.cloud.google.com/pubsub/docs/bigquery
[push subscriptions]: https://docs.cloud.google.com/pubsub/docs/push

## Getting a real sensor signal

### Phone and laptop sensors in the browser

Support below is from MDN's [browser-compat-data] as of its 2 November 2026 commit. Geolocation, camera and microphone, Generic Sensor, Web Bluetooth, and Web NFC work only over HTTPS (a secure context) and behind a permission prompt or user gesture. Chrome on iOS uses Apple's WKWebView, and the Web Bluetooth group notes "no implementation planned in the Chromium codebase" for iOS ([Web Bluetooth status]).

| API (what it reads)                                       | Chrome / Edge / Android     | Firefox | Safari (macOS, iOS)     |
| --------------------------------------------------------- | --------------------------- | ------- | ----------------------- |
| [Geolocation] (position)                                  | Yes                         | Yes     | Yes                     |
| [DeviceOrientation] and DeviceMotion (tilt, acceleration) | Yes                         | Yes     | Yes; iOS needs a prompt |
| [getUserMedia] (camera, microphone)                       | Yes                         | Yes     | Yes                     |
| [Generic Sensor API] Accelerometer, Gyroscope             | Chrome 67+                  | No      | No                      |
| Generic Sensor AmbientLightSensor, Magnetometer           | Behind a flag               | No      | No                      |
| [Web Bluetooth] (BLE GATT devices)                        | Yes (Linux behind a flag)   | No      | No                      |
| [Web NFC] (NDEF tags)                                     | Chrome for Android 89+ only | No      | No                      |

- iOS Safari exposes `DeviceOrientationEvent.requestPermission()`, which must be granted before orientation events arrive (browser-compat-data lists it from iOS Safari 14.5).
- Web Bluetooth connects to standard GATT services such as Battery, Heart Rate, and Health Thermometer after a user picks the device in a chooser; scanning for nearby advertisements (`requestLEScan`) is "still incomplete" ([Web Bluetooth]) and needs the `#enable-experimental-web-platform-features` flag ([Web Bluetooth status]).
- Web NFC reads and writes NDEF tags only, and "the web page must be visible when the user touches an NFC tag" ([Web NFC]).
- MDN warns that a sensor interface existing "does not tell you whether that API is connected to a real hardware sensor" ([Generic Sensor API]), so feature detection alone isn't proof of a signal.
- Inference: a phone is the one sensor every teammate already has, with zero lead time; geolocation, motion, camera, and microphone work on both Android and iPhone, while Generic Sensor, Web Bluetooth, and Web NFC would exclude iPhone users and judges.

[browser-compat-data]: https://github.com/mdn/browser-compat-data
[Web Bluetooth status]: https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md
[Geolocation]: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
[DeviceOrientation]: https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent
[getUserMedia]: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
[Generic Sensor API]: https://developer.mozilla.org/en-US/docs/Web/API/Sensor_APIs
[Web NFC]: https://developer.chrome.com/docs/capabilities/nfc

### Cheap boards from Malaysian retailers

Prices and stock from Cytron's Malaysian store on 3 November 2026; they change daily.

| Item                                     | Price (RM)  | Stock shown  |
| ---------------------------------------- | ----------- | ------------ |
| [Raspberry Pi Pico 2 W]                  | 31.60–39.60 | 92 available |
| Raspberry Pi Pico W ([Cytron search])    | 27.10       | Out of stock |
| [NodeMCU ESP32] (ESP32-WROOM-32E)        | 29.00       | Out of stock |
| [Maker Feather AIoT S3] (ESP32-S3)       | 83.79       | 44 available |
| [Arduino UNO R4 WiFi]                    | 151.25      | 23 available |
| [DHT22 sensor breakout] (temp, humidity) | 15.50       | 66 available |
| [Milesight UG56] LoRaWAN gateway         | 998.75      | Not shown    |

- Cytron's [ESP32 category] lists the Maker Feather AIoT S3 at RM79.80, lower than its product page; the category page doesn't show stock for most boards.
- Delivery ([Cytron delivery]): free shipping in Peninsular Malaysia from RM9.90 and under 10 kg, otherwise RM5 flat; GD Express, J&T Express, or Pos Laju in "2-3 working days" to major West Malaysian cities. Self-pickup is from the warehouse in Bukit Mertajam, Penang, or by a Lalamove or Grab rider you arrange after the "PACKED" email. The page lists no same-day or Klang Valley option.
- Other Malaysian retailers and Kuala Lumpur walk-in shops: not researched within the time box.

[Raspberry Pi Pico 2 W]: https://my.cytron.io/p-raspberry-pi-pico-2-wireless
[Cytron search]: https://my.cytron.io/search?q=raspberry-pi-pico-w
[NodeMCU ESP32]: https://my.cytron.io/p-nodemcu-esp32-with-expansion-board
[Maker Feather AIoT S3]: https://my.cytron.io/p-maker-feather-aiot-s3
[Arduino UNO R4 WiFi]: https://my.cytron.io/p-arduino-uno-r4-wifi
[DHT22 sensor breakout]: https://my.cytron.io/p-dht22-sensor-module-breakout
[ESP32 category]: https://my.cytron.io/c-esp32

### Signals from devices that already exist

- **Wi-Fi presence:** an ESP32 in sniffer mode can capture 802.11 management, data, and (if enabled) control frames, at "a great impact on the throughput" of its own connection ([ESP32 sniffer mode]). Phones defeat naive counting: Android 10+ "uses a randomized MAC address by default" ([Android MAC randomization]), and iPhones use "a different MAC address for each Wi-Fi network", rotating every two weeks on open or weakly secured networks from iOS 18 ([Apple private address]).
- **BLE devices:** Web Bluetooth can read standard GATT sensors (heart-rate straps, thermometers) from Chrome without extra hardware ([Web Bluetooth]); passive beacon scanning from a browser needs the experimental flag (see above).
- **APU campus systems:** APU's facilities page names CREDIT (Centre for Research and Development of IoT) and describes the AGRHI Hub glasshouse with "Internet of Things (IoT) sensors for climatic conditioning data" ([APU campus facilities]). Not found: any public API or data feed from these or other APU building systems; searched apu.edu.my and the web for APU smart campus, IoT lab, and sensor interfaces.
- Collecting device identifiers raises privacy questions; see [judging and pitching](/docs/research/judging-and-pitching.md).

[ESP32 sniffer mode]: https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-guides/wifi-driver/wifi-modes.html
[Android MAC randomization]: https://source.android.com/docs/core/connect/wifi-mac-randomization-behavior
[Apple private address]: https://support.apple.com/en-us/102509
[APU campus facilities]: https://www.apu.edu.my/campus-facilities

### Live public sensor feeds

Real-time public feeds exist in these categories: air quality, weather and rainfall, river and flood water levels, public transport vehicle positions, and road traffic. Specific sources, endpoints, and licences are catalogued in [public data sources](/docs/research/public-data-sources.md).

## The network part in practice

### Protocols

- **MQTT:** "a Client Server publish/subscribe messaging transport protocol ... light weight, open, simple", designed for constrained M2M and IoT use; MQTT 5.0 has been an OASIS Standard since 7 March 2019 ([MQTT 5.0]). It defines QoS 0, 1, and 2 (at most, at least, and exactly once), retained messages so "a new non-shared subscriber will receive the most recent state", a Will Message the server publishes when a connection "is not closed normally", and session expiry.
- **MQTT over WebSockets:** the same spec defines WebSocket transport (section 6), which is how a browser page can act as an MQTT client ([MQTT 5.0]).
- **HTTP(S):** the simplest device path into Google Cloud; Pub/Sub's REST API and Cloud Run endpoints both take HTTPS ([Direct to Pub/Sub]).
- **WebSockets:** standardised in [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455); on Cloud Run, connections last at most 60 minutes and clients must reconnect ([Cloud Run WebSockets]).
- **CoAP:** "a specialized web transfer protocol for use with constrained nodes and constrained (e.g., low-power, lossy) networks", request/response over UDP, designed to map to HTTP ([RFC 7252](https://www.rfc-editor.org/rfc/rfc7252)). On Google Cloud it appears only as something "some platforms also offer" ([IoT platform]).
- **LoRaWAN:** see [LoRaWAN and The Things Network in Kuala Lumpur](#lorawan-and-the-things-network-in-kuala-lumpur).

### Managed MQTT brokers

Google has no managed MQTT service; the broker comes from a partner or is self-hosted ([Standalone MQTT broker]). Free options as of 3 November 2026:

- **EMQX Serverless:** free each month 1 million session minutes, 1 GB traffic, and 1 million rule actions ([EMQX pricing docs]); up to 1,000 connections, 1 MB message size, and "Basic (3 connectors)" for data integration ([EMQX pricing]). EMQX documents a Google Pub/Sub connector, but neither page confirms it is among the Serverless connectors.
- **HiveMQ:** the current [HiveMQ pricing] page lists no free cloud tier. Its free option is Lab, a self-hosted package with 25 connections, 25 messages per second, and a 30-day licence renewable at no charge; Cloud Starter has a 15-day trial. Older HiveMQ material describes a free 100-connection "Serverless" cloud plan; the current pricing page doesn't list it, and whether it still exists wasn't verified.
- **Self-hosted:** run a broker on Compute Engine or GKE ([Standalone MQTT broker]).

[EMQX pricing docs]: https://docs.emqx.com/en/cloud/latest/price/pricing.html
[EMQX pricing]: https://www.emqx.com/en/pricing
[HiveMQ pricing]: https://www.hivemq.com/pricing/fully-managed/

### LoRaWAN and The Things Network in Kuala Lumpur

- Malaysia's frequency plan on The Things Network is AS920-923 ("AS1") ([TTN frequency plans]).
- The [TTN Kuala Lumpur community] page, on 3 November 2026, counted 96 publicly mapped gateways within about 45 km, of which 1 was online; its last posts date from 2016.
- TTN's public Sandbox limits each node to 30 seconds of uplink airtime and 10 downlinks per 24 hours ([TTN fair use]).
- Cytron's cheapest LoRaWAN gateway was RM998.75 ([Milesight UG56]).
- Inference: with one online public gateway in the area, a LoRaWAN demo would need the team's own gateway, costing about RM1,000 plus lead time, unless an APU lab already has one.

[TTN frequency plans]: https://www.thethingsnetwork.org/docs/lorawan/frequencies-by-country/
[TTN Kuala Lumpur community]: https://www.thethingsnetwork.org/community/kualalumpur/
[TTN fair use]: https://www.thethingsnetwork.org/docs/lorawan/duty-cycle/

### Edge versus cloud processing

- Google's architectures put aggregation and transformation on the edge gateway in the direct-to-Pub/Sub pattern ("the gateway plays an active role in aggregating and transforming the data") and leave analytics to the cloud ([Direct to Pub/Sub]).
- On-device ML for ESP32 is available through Espressif's [esp-tflite-micro](https://github.com/espressif/esp-tflite-micro) ("TensorFlow Lite Micro for Espressif Chipsets"), last pushed 2 November 2026.
- In the cloud, the Pub/Sub AI Inference SMT can call Gemini per message ([AI Inference SMT]); Gemini options are compared in [Google tools](/docs/research/google-tools.md).
- Inference: a split that is easy to show is thresholding or event detection on the device or in the browser, sending only events and summaries, with Gemini interpreting them in the cloud.

### Offline and intermittent links

- MQTT's QoS 1 and 2, session expiry, retained messages, and Will Messages exist to cope with dropped connections and to signal a device going offline ([MQTT 5.0]).
- Firestore caches writes offline and syncs them on reconnect ("last write wins" for the same document); offline persistence is on by default on Android and Apple but "disabled by default" on the web ([Firestore offline]).
- Cloud Run WebSocket clients "should handle reconnecting to the server if the request times out or the server disconnects" ([Cloud Run WebSockets]).

[Firestore offline]: https://firebase.google.com/docs/firestore/manage-data/enable-offline

### What a judge can see of the network

Submissions are assessed asynchronously from the repo, the PDF deck, and a demo link, plus the README, video, and Gemini Enterprise app access NTT DATA asked for, with only the top five pitching live ([brief](/docs/BRIEF.md#submission-requirements)). Inference, not sourced: a network is invisible unless the demo makes it visible. Things a live dashboard can show from the documented features above:

- End-to-end latency per reading: device timestamp against Pub/Sub `publishTime` ([PubsubMessage]).
- A device going offline and back: the broker's Will Message or a retained online/offline status, with buffered readings arriving after reconnect.
- The path itself: an architecture diagram that names each hop and protocol, matched to live logs or a message viewer.

## Pitfalls

### Hardware lead time

- Cytron quotes 2–3 working days to major West Malaysian cities, shipping from Penang ([Cytron delivery]); its homepage says "1-3 working days".
- Deepavali falls on Sunday 8 November 2026 ([2026 federal holiday table]); Monday 9 November is reported as the replacement holiday in Kuala Lumpur and Selangor (secondary: [Wego Deepavali 2026]). The prototype is due 10 November ([brief](/docs/BRIEF.md)).
- Two of the cheapest Wi-Fi boards (Pico W, NodeMCU ESP32) were out of stock on 3 November (see [the board table](#cheap-boards-from-malaysian-retailers)).
- Inference: an order placed on 4 November would likely arrive between 6 and 10 November, leaving little or no time to build on it.

[2026 federal holiday table]: https://www.kabinet.gov.my/storage/2025/08/HKA-2026.pdf
[Wego Deepavali 2026]: https://blog.wego.com/deepavali-2026-malaysia-travel-plan/

### APU campus Wi-Fi

- APU's Wi-Fi is OnBoard@APU, launched university-wide in early 2021: users pick OnBoard@APU and follow on-screen steps to enrol a device into Student@APU 2.0 or Staff@APU 2.0, with up to four devices per user at once; a fallback Student@APU network is listed for students who can't join Student@APU 2.0 ([APU library Wi-Fi page], footer dated 2023).
- Not found: whether APU's networks use a captive portal, client isolation, or allow headless IoT devices. Searched APU library, apu.edu.my, and the web.
- APU doesn't appear in the [eduroam Malaysia participants] list (checked 3 November 2026).
- If the network turns out to be WPA2-Enterprise, ESP32 boards can join it: "ESP32 supports both WPA2-Enterprise and WPA3-Enterprise" (EAP-TLS, PEAP, EAP-TTLS, EAP-FAST), in station mode only ([ESP32 Wi-Fi security]). Not verified for the Pico W or Arduino UNO R4 WiFi.
- Inference: a microcontroller can't click through a web login page or an on-screen enrolment flow, and client isolation would stop a board and a laptop on the same Wi-Fi from talking directly. Routing everything through a cloud broker or endpoint avoids depending on device-to-device traffic. APU IT Helpdesk is on 03-8992 5050 ([APU library Wi-Fi page]).

[APU library Wi-Fi page]: https://library.apu.edu.my/wifi/
[eduroam Malaysia participants]: https://mon.eduroam.my/participants/
[ESP32 Wi-Fi security]: https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-guides/wifi-security.html

### Demo-day connectivity

- The top five pitch live at the APU Auditorium on 17 November ([brief](/docs/BRIEF.md)). Not found: any information about auditorium Wi-Fi, power, or whether devices can be brought on stage.
- Inference: a phone hotspot that the device and laptop both join, set up and tested beforehand, removes the dependency on campus Wi-Fi.
- The repo rule forbids falling back to cached or recorded data if the live source fails ([project conventions](/docs/references/project-conventions.md)); see [Real versus simulated data](#real-versus-simulated-data).

### Device credentials

- Service account keys are "an exception rather than the norm"; "To bad actors, service account keys can be even more valuable than a leaked password", and a committed key must be deleted in IAM because removing it from git history isn't enough ([service account key practices]). The direct-to-Pub/Sub pattern stores such a key on each gateway ([Direct to Pub/Sub]).
- Firebase API keys restricted to Firebase services "are OK to include in code or checked-in config files", because access is enforced by Security Rules and App Check; a Gemini Developer API key "should never be included in your code or configuration files" ([Firebase API keys]).
- GitHub push protection for users is on by default and stops pushes of secrets to public repos, but repository-level push protection "is disabled by default" and needs an admin to turn it on ([GitHub push protection]).
- MQTT brokers keep their own credential stores, separate from Google Cloud IAM ([Standalone MQTT broker]).

[service account key practices]: https://docs.cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys
[Firebase API keys]: https://firebase.google.com/docs/projects/api-keys
[GitHub push protection]: https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection

## Real versus simulated data

The repo rule says: "Use real public data, such as live public APIs or published datasets, never demo, mock, placeholder, seed, or sample data, even temporarily. If the source fails, show the error, with no fallback, cached copy, or default value. If no public source fits, ask the user." It adds that "test doubles in tests are fine" ([project conventions](/docs/references/project-conventions.md)). The hackathon's own rules say nothing about data provenance ([brief](/docs/BRIEF.md)).

How the rule's wording maps onto each case. The cases the wording left open were decided by the user on 3 November 2026; [context](/docs/CONTEXT.md#decisions-so-far) records the ruling.

| Case                                                   | Data is real? | Wording that applies                     | Status                                        |
| ------------------------------------------------------ | ------------- | ---------------------------------------- | --------------------------------------------- |
| Live public sensor feed through the pipeline           | Yes           | "live public APIs"                       | Covered: allowed                              |
| Synthetic or random readings in the app                | No            | "never demo, mock ... sample data"       | Covered: forbidden                            |
| Recorded or synthetic readings in automated tests only | Either        | "test doubles in tests are fine"         | Covered: allowed                              |
| Recorded data shown when the live source fails         | Yes           | "no fallback, cached copy"               | Covered: forbidden                            |
| Live readings from the team's own phone or board       | Yes           | Real, but not a "public" source          | Decided: allowed                              |
| Published real dataset replayed as if streaming        | Yes           | "published datasets"; replay shifts time | Decided: allowed                              |
| Team-recorded real sensor log, replayed                | Yes           | Not public unless the team publishes it  | Decided: allowed if published with provenance |
| Pre-recorded demo video of a live run                  | Yes           | Rule doesn't address videos              | Decided: forbidden                            |

Questions the open cases turned on before the ruling:

- Does "real public data" require a public source, or does it mean real rather than invented, so that a team's own live sensor counts?
- Does replaying a published dataset with shifted timestamps count as simulating a live feed, even though every value is real?
- Would publishing the team's recorded log, with provenance, make it a "published dataset"?

## Takeaways for this hackathon

- **Evidence:** Google has no managed IoT service since 16 August 2023, and its old IoT Core URL now points to an Architecture Center page about partner platforms. For a handful of devices, Google's own guidance is a direct HTTPS or gRPC path into Pub/Sub. **Inference:** a genuine stack that fits in a week is device → HTTPS (Cloud Run) or a free EMQX broker → Pub/Sub → BigQuery subscription and Firestore → Gemini via the AI Inference SMT or a Cloud Run call.
- **Evidence:** geolocation, motion, camera, and microphone work in browsers on both Android and iPhone; Generic Sensor, Web Bluetooth, and Web NFC are Chromium-only and absent on iOS. **Inference:** phones as the IoT devices give a real signal with no hardware lead time, and judges can try it themselves.
- **Evidence:** Cytron ships from Penang in 2–3 working days, two cheap Wi-Fi boards were out of stock on 3 November, and Monday 9 November is reported as a holiday (secondary) before the 10 November deadline. **Inference:** order hardware on 3–4 November or design so the project doesn't depend on it.
- **Evidence:** only 1 of 96 mapped TTN gateways near Kuala Lumpur was online, and a LoRaWAN gateway costs about RM1,000. **Inference:** LoRaWAN isn't viable in a week unless an APU lab such as CREDIT lends a gateway.
- **Evidence:** OnBoard@APU uses an on-screen enrolment flow with a four-device limit, and nothing public says whether headless devices, captive portals, or client isolation apply. **Inference:** assume boards can't join campus Wi-Fi; plan on a phone hotspot and ask the APU IT Helpdesk early.
- **Evidence:** assessment is asynchronous from the repo, deck, and optional demo link. **Inference:** the "Network" part of the theme only scores if the live app and deck show it: per-reading latency from `publishTime`, an offline-and-reconnect moment, and a diagram naming each hop's protocol.
- **Evidence:** service account keys and Gemini API keys must stay out of code, Firebase web keys may be committed, and repository push protection is off by default. **Inference:** turn on push protection for the team repo and keep Wi-Fi and broker credentials in an ignored file from the first commit.
- **Decided (3 November 2026):** team-owned live sensors, replayed published datasets, and team-recorded logs published with provenance are allowed; a recorded demo video is not ([Real versus simulated data](#real-versus-simulated-data)).

## See also

- [Brief](/docs/BRIEF.md): theme, tracks, dates, and submission format.
- [Google tools](/docs/research/google-tools.md): Google AI and Cloud products, free tiers, and credits.
- [Public data sources](/docs/research/public-data-sources.md): live public sensor feeds and datasets per track.
- [Judging and pitching](/docs/research/judging-and-pitching.md): rubrics, async packaging, and privacy.
- [Past winners](/docs/research/past-winners.md): comparable IoT hackathon projects.
- [Project conventions](/docs/references/project-conventions.md): the real-public-data rule.

[Standalone MQTT broker]: https://docs.cloud.google.com/architecture/connected-devices/mqtt-broker-architecture
[IoT platform]: https://docs.cloud.google.com/architecture/connected-devices/iot-platform-product-architecture
[Direct to Pub/Sub]: https://docs.cloud.google.com/architecture/connected-devices/device-pubsub-architecture
[Cloud Run WebSockets]: https://docs.cloud.google.com/run/docs/triggering/websockets
[AI Inference SMT]: https://docs.cloud.google.com/pubsub/docs/smts/ai-inference-smt
[PubsubMessage]: https://docs.cloud.google.com/pubsub/docs/reference/rest/v1/PubsubMessage
[Web Bluetooth]: https://developer.chrome.com/docs/capabilities/bluetooth
[Milesight UG56]: https://my.cytron.io/c-gateway
[Cytron delivery]: https://my.cytron.io/delivery-information
[MQTT 5.0]: https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html
