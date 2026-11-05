# IoT and network

How a student team in Kuala Lumpur can deliver a genuine IoT and network component for the "When Cloud, IoT, and Network Converge" theme in one week, possibly without hardware, under the repo's real-data-only rule. Covers Google Cloud's IoT architecture after Cloud IoT Core, ways to get a real sensor signal, protocols and connectivity, pitfalls, what the team's own devices can sense, run, and serve with nobody at APU, and where replayed data sits against the rule. The general sections were researched on 3 November 2026; [the team's devices](#the-teams-devices) were researched on 5 November 2026 from vendor docs, specs, official repos, and benchmarks that state their method. **Inference** marks conclusions no source states outright.

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
1.  [The team's devices](#the-teams-devices)
    1.  [Phones beyond the browser](#phones-beyond-the-browser)
        1.  [Home Assistant Companion app](#home-assistant-companion-app)
        1.  [Android automation apps and Termux](#android-automation-apps-and-termux)
        1.  [Location and sensor-streaming apps](#location-and-sensor-streaming-apps)
        1.  [iOS Shortcuts personal automations](#ios-shortcuts-personal-automations)
        1.  [Android background limits](#android-background-limits)
        1.  [Web pages and PWAs left running](#web-pages-and-pwas-left-running)
        1.  [Which phone setups survive for days](#which-phone-setups-survive-for-days)
    1.  [Pi 5 as a sensor](#pi-5-as-a-sensor)
        1.  [Wi-Fi radio and monitor mode](#wi-fi-radio-and-monitor-mode)
        1.  [BLE advertisement scanning](#ble-advertisement-scanning)
        1.  [Power, undervoltage, and the RTC](#power-undervoltage-and-the-rtc)
        1.  [Temperature and throttling](#temperature-and-throttling)
        1.  [Microphone and camera](#microphone-and-camera)
    1.  [Pi 5 as an edge computer](#pi-5-as-an-edge-computer)
        1.  [Speech to text](#speech-to-text)
        1.  [Small language models](#small-language-models)
        1.  [Object detection](#object-detection)
        1.  [Memory and heat budget](#memory-and-heat-budget)
    1.  [Pi 5 as a network probe or server](#pi-5-as-a-network-probe-or-server)
        1.  [Globalping probe](#globalping-probe)
        1.  [RIPE Atlas software probe](#ripe-atlas-software-probe)
        1.  [Latency logging](#latency-logging)
        1.  [Public HTTPS without a card](#public-https-without-a-card)
        1.  [Fit with Gemini Enterprise custom MCP](#fit-with-gemini-enterprise-custom-mcp)
    1.  [Phone, Pi, and cloud paths](#phone-pi-and-cloud-paths)
        1.  [Phone to Pi on the home network](#phone-to-pi-on-the-home-network)
        1.  [Pi to Apps Script and Sheets](#pi-to-apps-script-and-sheets)
        1.  [Pi to Supabase Free](#pi-to-supabase-free)
        1.  [Where each path enters Gemini Enterprise](#where-each-path-enters-gemini-enterprise)
    1.  [Keeping it alive unattended](#keeping-it-alive-unattended)
        1.  [Services and watchdogs](#services-and-watchdogs)
        1.  [Network and remote access](#network-and-remote-access)
        1.  [Power cuts and SD cards](#power-cuts-and-sd-cards)
        1.  [Updates during the event](#updates-during-the-event)
        1.  [What kills home deployments](#what-kills-home-deployments)
    1.  [Platform behaviours](#platform-behaviours)
        1.  [GitHub disables scheduled workflows](#github-disables-scheduled-workflows)
        1.  [Tailscale Funnel and the client address](#tailscale-funnel-and-the-client-address)
        1.  [Setting alarms from a phone without a person](#setting-alarms-from-a-phone-without-a-person)
    1.  [Capability matrix](#capability-matrix)
1.  [Real versus simulated data](#real-versus-simulated-data)
1.  [Takeaways for this hackathon](#takeaways-for-this-hackathon)
1.  [Not verified](#not-verified)
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

Downstream of Pub/Sub, Google documents these pieces (product choice and free tiers are in [Google tools](/docs/research/google-cloud.md)):

- **BigQuery without code:** a BigQuery subscription "writes messages to an existing BigQuery table as they are received", at-least-once, with no subscriber client; Dataflow is recommended only for windowing or complex transforms ([BigQuery subscriptions]).
- **Cloud Run:** push subscriptions deliver each message as an HTTPS POST and "work well with ... Cloud Run" ([push subscriptions]). Cloud Run also serves WebSockets "with no additional configuration", up to a 60-minute request timeout and 1,000 concurrent connections per instance, but instances don't share state, so Google suggests Firestore real-time updates or Memorystore Redis to fan out to clients ([Cloud Run WebSockets]).
- **Gemini on the stream:** the Pub/Sub AI Inference single message transform sends each message to a model, including Gemini, and attaches the inference to the message; Google says "We strongly recommend using Subscription SMTs rather than Topic SMTs for AI Inference", and each inference must finish within 60 seconds. The page doesn't state a launch stage ([AI Inference SMT]).
- **Server timestamps:** every Pub/Sub message carries `publishTime`, "populated by the server when it receives the `topics.publish` call" ([PubsubMessage]), which gives a measurable device-to-cloud latency if the device also stamps its readings.

[BigQuery subscriptions]: https://docs.cloud.google.com/pubsub/docs/bigquery
[push subscriptions]: https://docs.cloud.google.com/pubsub/docs/push

## Getting a real sensor signal

### Phone and laptop sensors in the browser

Support below is from MDN's [browser-compat-data] as of its 2 November 2026 commit. Geolocation, camera and microphone, Generic Sensor, Web Bluetooth, and Web NFC work only over HTTPS (a secure context) and behind a permission prompt or user gesture. Chrome on iOS uses Apple's WKWebView, and the Web Bluetooth group notes "no implementation planned in the Chromium codebase" for iOS ([Web Bluetooth status]).

| API (what it reads)                                                | Chrome / Edge / Android                   | Firefox       | Safari (macOS, iOS)     |
| ------------------------------------------------------------------ | ----------------------------------------- | ------------- | ----------------------- |
| [Geolocation] (position)                                           | Yes                                       | Yes           | Yes                     |
| [DeviceOrientation] and DeviceMotion (tilt, acceleration)          | Yes                                       | Yes           | Yes; iOS needs a prompt |
| [getUserMedia] (camera, microphone)                                | Yes                                       | Yes           | Yes                     |
| [Generic Sensor API] Accelerometer, Gyroscope                      | Chrome 67+                                | No            | No                      |
| Generic Sensor AmbientLightSensor, Magnetometer                    | Behind a flag                             | No            | No                      |
| [Web Bluetooth] (BLE GATT devices)                                 | Yes (Linux behind a flag)                 | No            | No                      |
| [Web NFC] (NDEF tags)                                              | Chrome for Android 89+ only               | No            | No                      |
| [Battery Status API][BatteryManager BCD] (battery level, charging) | Chrome 38+, including Android and WebView | Removed in 52 | Never shipped           |

- The Battery Status row (`navigator.getBattery()`) is from browser-compat-data on 5 November 2026. Because Safari has never shipped it, iPhones can't read battery from a page ([BatteryManager BCD]).
- iOS Safari exposes `DeviceOrientationEvent.requestPermission()`, which must be granted before orientation events arrive (browser-compat-data lists it from iOS Safari 14.5).
- Web Bluetooth connects to standard GATT services such as Battery, Heart Rate, and Health Thermometer after a user picks the device in a chooser; scanning for nearby advertisements (`requestLEScan`) is "still incomplete" ([Web Bluetooth]) and needs the `#enable-experimental-web-platform-features` flag ([Web Bluetooth status]).
- Web NFC reads and writes NDEF tags only, and "the web page must be visible when the user touches an NFC tag" ([Web NFC]).
- MDN warns that a sensor interface existing "does not tell you whether that API is connected to a real hardware sensor" ([Generic Sensor API]), so feature detection alone isn't proof of a signal.
- **Microphone levels** (checked 5 November 2026): a user can deny the microphone prompt or leave it unanswered ([getUserMedia]), so build an explicit unsupported or permission-denied state, with no invented reading. Automatic gain control and noise suppression can alter readings, and the actual settings and capabilities vary by track and device ([getSettings], [getCapabilities]). Relative levels on one phone are not calibrated dBA, comparable cross-phone measurements, a nuisance violation, or medical evidence.
- Inference: a phone is the one sensor every teammate already has, with zero lead time; geolocation, motion, camera, and microphone work on both Android and iPhone, while Generic Sensor, Web Bluetooth, and Web NFC would exclude iPhone users and judges.

[browser-compat-data]: https://github.com/mdn/browser-compat-data
[Web Bluetooth status]: https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md
[Geolocation]: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
[DeviceOrientation]: https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent
[getUserMedia]: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
[getSettings]: https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getSettings
[getCapabilities]: https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getCapabilities
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
- **The team's Pi 5:** what it can scan of nearby Wi-Fi and Bluetooth is in [Wi-Fi radio and monitor mode](#wi-fi-radio-and-monitor-mode) and [BLE advertisement scanning](#ble-advertisement-scanning).
- Collecting device identifiers raises privacy questions; see [judging and pitching](/docs/research/judging.md).

[ESP32 sniffer mode]: https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-guides/wifi-driver/wifi-modes.html
[Android MAC randomization]: https://source.android.com/docs/core/connect/wifi-mac-randomization-behavior
[Apple private address]: https://support.apple.com/en-us/102509
[APU campus facilities]: https://www.apu.edu.my/campus-facilities

### Live public sensor feeds

Real-time public feeds exist in these categories: air quality, weather and rainfall, river and flood water levels, public transport vehicle positions, and road traffic. Specific sources, endpoints, and licences are catalogued in [public data sources](/docs/research/data-sources.md).

## The network part in practice

### Protocols

- **MQTT:** "a Client Server publish/subscribe messaging transport protocol ... light weight, open, simple", designed for constrained M2M and IoT use; MQTT 5.0 has been an OASIS Standard since 7 March 2019 ([MQTT 5.0]). It defines QoS 0, 1, and 2 (at most, at least, and exactly once), retained messages so "a new non-shared subscriber will receive the most recent state", a Will Message the server publishes when a connection "is not closed normally", and session expiry.
- **MQTT over WebSockets:** the same spec defines WebSocket transport (section 6), which is how a browser page can act as an MQTT client ([MQTT 5.0]); a Mosquitto broker on the team's Pi can serve it (see [Phone to Pi on the home network](#phone-to-pi-on-the-home-network)).
- **HTTP(S):** the simplest device path into Google Cloud; Pub/Sub's REST API and Cloud Run endpoints both take HTTPS ([Direct to Pub/Sub]).
- **WebSockets:** standardised in [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455); on Cloud Run, connections last at most 60 minutes and clients must reconnect ([Cloud Run WebSockets]).
- **CoAP:** "a specialized web transfer protocol for use with constrained nodes and constrained (e.g., low-power, lossy) networks", request/response over UDP, designed to map to HTTP ([RFC 7252](https://www.rfc-editor.org/rfc/rfc7252)). On Google Cloud it appears only as something "some platforms also offer" ([IoT platform]).
- **LoRaWAN:** see [LoRaWAN and The Things Network in Kuala Lumpur](#lorawan-and-the-things-network-in-kuala-lumpur).

### Managed MQTT brokers

Google has no managed MQTT service; the broker comes from a partner or is self-hosted ([Standalone MQTT broker]). Free options as of 3 November 2026:

- **EMQX Serverless:** free each month 1 million session minutes, 1 GB traffic, and 1 million rule actions ([EMQX pricing docs]); up to 1,000 connections, 1 MB message size, and "Basic (3 connectors)" for data integration ([EMQX pricing]). EMQX documents a Google Pub/Sub connector, but neither page confirms it is among the Serverless connectors.
- **HiveMQ:** the current [HiveMQ pricing] page lists no free cloud tier. Its free option is Lab, a self-hosted package with 25 connections, 25 messages per second, and a 30-day licence renewable at no charge; Cloud Starter has a 15-day trial. Older HiveMQ material describes a free 100-connection "Serverless" cloud plan; the current pricing page doesn't list it, and whether it still exists wasn't verified.
- **Self-hosted:** run a broker on Compute Engine or GKE ([Standalone MQTT broker]), or Mosquitto on the team's Pi for its home network ([Phone to Pi on the home network](#phone-to-pi-on-the-home-network)).

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
- In the cloud, the Pub/Sub AI Inference SMT can call Gemini per message ([AI Inference SMT]); Gemini options are compared in [Google tools](/docs/research/google-cloud.md).
- Inference: a split that is easy to show is thresholding or event detection on the device or in the browser, sending only events and summaries, with Gemini interpreting them in the cloud.
- What the team's Pi 5 can run at the edge is in [Pi 5 as an edge computer](#pi-5-as-an-edge-computer).

### Offline and intermittent links

- MQTT's QoS 1 and 2, session expiry, retained messages, and Will Messages exist to cope with dropped connections and to signal a device going offline ([MQTT 5.0]).
- Firestore caches writes offline and syncs them on reconnect ("last write wins" for the same document); offline persistence is on by default on Android and Apple but "disabled by default" on the web ([Firestore offline]).
- Cloud Run WebSocket clients "should handle reconnecting to the server if the request times out or the server disconnects" ([Cloud Run WebSockets]).
- Keeping the team's Pi and phones reporting through dropped Wi-Fi, power cuts, and app kills is in [Keeping it alive unattended](#keeping-it-alive-unattended).

[Firestore offline]: https://firebase.google.com/docs/firestore/manage-data/enable-offline

### What a judge can see of the network

Submissions are assessed asynchronously from the repo, the PDF deck, and a demo link, plus the README, video, and Gemini Enterprise app access NTT DATA asked for, with only the top five pitching live ([brief](/docs/BRIEF.md#submission-requirements)). Inference, not sourced: a network is invisible unless the demo makes it visible. Things a live dashboard can show from the documented features above:

- End-to-end latency per reading: device timestamp against Pub/Sub `publishTime` ([PubsubMessage]).
- A device going offline and back: the broker's Will Message or a retained online/offline status, with buffered readings arriving after reconnect.
- The path itself: an architecture diagram that names each hop and protocol, matched to live logs or a message viewer.
- **What a measurement shows** (checked 5 November 2026): WebRTC statistics describe an actual peer connection and vary by statistic and browser ([RTCStatsReport]). A short HTTPS upload test is only evidence about that request to that endpoint; it does not establish Zoom or Teams call quality, and a second phone's reading cannot certify a presenting laptop's microphone.

[RTCStatsReport]: https://developer.mozilla.org/en-US/docs/Web/API/RTCStatsReport

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

## The team's devices

What the team's only devices, Android phones, iPhones, and one Raspberry Pi 5 (8 GB) at a team member's home with no add-on sensors, can really sense, run, and serve with nobody at APU, and how their readings reach Gemini Enterprise without a payment card. It builds on the general sections above and on [Gemini Enterprise](/docs/research/gemini-enterprise.md) (connectors, custom MCP, live-data paths), and links to them rather than repeating them. Researched on 5 November 2026.

A camera module, external microphone, environmental probe, smart plug, UPS, and extra radios are not assured. Phone microphones and sensors are usable only after checking the actual devices, and browser background capture is not assumed reliable (see [Web pages and PWAs left running](#web-pages-and-pwas-left-running)).

### Phones beyond the browser

Browser sensor support is tabulated in [Phone and laptop sensors in the browser](#phone-and-laptop-sensors-in-the-browser). Everything below is an existing app from Google Play, the App Store, or F-Droid, so the team writes no native app.

#### Home Assistant Companion app

- **Needs a server, which the Pi can be:** the official install page lists "Raspberry Pi 5 or Raspberry Pi 4 with power supply" and an image per board, with "a card that provides at least 32 GB", ideally "Application Class 2" ([HA on Raspberry Pi]). The page describes flashing Home Assistant OS to the card; running Home Assistant in Docker beside other Pi services wasn't checked.
- **Android cadence:** "All sensors update during a periodic 15-minute interval", with a temporary foreground notification "to prevent the Android system from halting the worker". A setting offers **Fast While Charging**, where "updates will only come in every minute only while the device is charging"; "After changing this option you will need to restart the app" ([HA sensors]).
- **Android defaults:** "most are disabled with the exception of the `battery_level`, `battery_state`, `charger_type`" and any granted during onboarding ([HA sensors]).
- **Android sensors** ([HA sensors]):
  - **Battery:** state, charger type, and charging update on plug and unplug; health, level, power, and temperature update with any other sensor update.
  - **Wi-Fi:** connection (SSID), BSSID, frequency, link speed, signal strength, IP addresses, hotspot state; they "update when a network state change has been detected" and need background or fine location permission.
  - **Bluetooth:** the number of connected devices, updated "as soon as the bluetooth state of the device changes"; a **BLE transmitter** that broadcasts an iBeacon "every second" at a battery cost, and a beacon monitor that scans for iBeacons.
  - **Activity and sleep:** only in the Play Store build. Activity states are `in_vehicle`, `on_bicycle`, `on_foot`, `running`, `still`, `tilting`, `walking`, `unknown`; "Sleep Segment updates about once a day and Sleep Confidence will update about every 10 minutes", via Google's Sleep API.
  - **Motion and environment:** steps since reboot, light, pressure, and proximity, all on the normal interval; some phones report proximity only as `near` or `far`.
  - **Phone state:** next alarm ("as soon as the next alarm is scheduled"), last notification (special permission plus an allow list), app standby bucket, Doze with an `ignoring_battery_optimizations` attribute, last reboot, public IP, storage.
  - **Cellular:** data network type and signal in dBm, which "Due to power saving ... may not always be current", plus carrier name, MCC, and MNC.
- **Android location:** background updates "typically between 1-3 minutes"; high-accuracy mode polls GPS every 5 seconds by default and drains the battery ([HA location]).
- **iOS sensors:** battery level and state (with a Low Power Mode attribute), SSID, BSSID, connection type with coarse cellular technology (`4G`, `3G`, `2G`), activity, steps, distance, floors, barometric pressure in hPa, carrier, geocoded location, storage, and Focus. Wi-Fi signal, light, proximity, BLE transmitter, next alarm, and notification sensors are Android only ([HA sensors]).
- **iOS cadence:** sensors update on location changes, in the foreground, "in the background at a rate determined by iOS", or from a shortcut or push ([HA sensors]); the FAQ says background updates are "heavily throttled to protect battery life" and tied to location, so location must be "Allow Always" ([HA FAQ]). Significant-change updates arrive on a new cell tower, a connection change, or after "a significant amount of time has passed (usually a couple hours)" ([HA location]).
- **Reaching the server:** on the home network at `http://homeassistant.local:8123`. From outside, the docs offer Home Assistant Cloud or port forwarding, and "If your ISP doesn't give you a public IPv4 address you're down to basically only two solutions": call the ISP or use Home Assistant Cloud ([HA networking]). The service is now "Home Assistant Link", US$6.50 a month with a 31-day free trial ([Nabu Casa pricing]). **Inference:** Tailscale on the phones (see [Network and remote access](#network-and-remote-access)) is a free alternative; not tested with the Companion app.

[HA location]: https://companion.home-assistant.io/docs/core/location
[HA networking]: https://companion.home-assistant.io/docs/troubleshooting/networking
[Nabu Casa pricing]: https://www.nabucasa.com/pricing/

#### Android automation apps and Termux

- **Tasker:** RM19.99 on Google Play in Malaysia with a "7 day trial" ([Tasker on Play]). Its HTTP Request action can "Perform any HTTP request of any type" ([Tasker HTTP Request]). States include battery level, power, Wi-Fi connected (SSID and MAC), Wi-Fi near ("only available for apps with the location permission", [Tasker Wifi Near]), cell near, and signal strength; Bluetooth is detected only "when a connection or disconnection is made" ([Tasker BT Connected]).
- **MacroDroid:** free and ad-supported, "up to 5 macros", with "over 120 triggers" including battery, light, proximity, Bluetooth, Wi-Fi, and webhooks ([MacroDroid on Play]). Its HTTP request action wasn't confirmed on a MacroDroid page.
- **Automate:** the free edition's "single limitation" is "a maximum of 30 running blocks" ([Automate premium]); its HTTP request block sends GET, or POST "when a body is supplied" ([Automate HTTP block]). The vendor lists "Repeatedly checking ('polling') state at a timed interval" as a battery-draining mistake ([Automate FAQ]).
- **Termux:** the Play build of Termux has only `termux-battery-status`, `termux-job-scheduler`, and `termux-microphone-record` built in, and "The `Termux:API` app is not yet available" there ([Termux on Play]). The Wi-Fi, cell, sensor, and location commands need Termux and Termux:API both from F-Droid ([Termux:API]); "Do not attempt to mix them together" ([Termux README]).
  - Commands include `termux-wifi-connectioninfo`, `termux-wifi-scaninfo` ("information about the last wifi scan"), `termux-telephony-cellinfo` (primary and neighbouring cells), `termux-sensor`, `termux-location`, and `termux-microphone-record` ([Termux:API scripts]).
  - `termux-job-scheduler` notes "since Android N, the minimum period is 900,000ms (15 minutes)" ([Termux:API scripts]); `termux-wake-lock` stops Android going "into deep sleep" ([termux-wake-lock]).
  - Termux warns: "Android OS will kill any (phantom) processes greater than 32 (limit is for all apps combined) and also kill any processes using excessive CPU" on Android 12+ ([Termux README]).
- **Wi-Fi scans from any app are throttled:** on Android 9 and later, "Each foreground app can scan four times in a 2-minute period" and "All background apps combined can scan one time in a 30-minute period" ([Android Wi-Fi scanning]).

[Tasker on Play]: https://play.google.com/store/apps/details?id=net.dinglisch.android.taskerm&hl=en&gl=MY
[Tasker HTTP Request]: https://tasker.joaoapps.com/userguide/en/help/ah_http_request.html
[Tasker Wifi Near]: https://tasker.joaoapps.com/userguide/en/help/sh_wifi_near.html
[Tasker BT Connected]: https://tasker.joaoapps.com/userguide/en/help/sh_bt_connect.html
[MacroDroid on Play]: https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid&hl=en&gl=MY
[Automate premium]: https://llamalab.com/automate/doc/premium.html
[Automate HTTP block]: https://llamalab.com/automate/doc/block/http_request.html
[Automate FAQ]: https://llamalab.com/automate/doc/faq.html
[Termux on Play]: https://github.com/termux-play-store
[Termux:API]: https://github.com/termux/termux-api#readme
[Termux:API scripts]: https://github.com/termux/termux-api-package/tree/master/scripts
[termux-wake-lock]: https://wiki.termux.com/wiki/Termux-wake-lock

#### Location and sensor-streaming apps

- **OwnTracks** (iOS and Android) posts JSON to "a privately configured HTTP endpoint" or publishes to MQTT, with "exactly the same JSON payload formats" ([OwnTracks HTTP]).
  - Modes: significant-change mode "reports significant location changes only (>500m and at most once every 5 minutes)" and lets the app run in the background; move mode reports every set distance or interval and is recommended "while charging or during moves only" ([OwnTracks location]).
  - Fields: battery level `batt`, battery status `bs` (unplugged, charging, full), connectivity `conn` (Wi-Fi or mobile), SSID and BSSID (iOS only), barometric pressure (iOS only), and a `t: p` ping "issued randomly by background task", whose interval is configurable on Android ([OwnTracks JSON]).
  - Android: "The ongoing notification is required to run in the background", messages "may only be sent in batched intervals", and on some vendors' phones it "might be killed even though it behaves according to the official Android background execution limits" ([OwnTracks Android]).
- **Sensor Logger** streams "All supported sensors during a recording ... in JSON, once every configurable batch period" by HTTP POST or MQTT ([Sensor Logger push]); MQTT push is a paid Plus feature ([Sensor Logger tiers]). Sensors include battery level and state, light (Android only), "Nearby WiFi Networks (Android Only)", barometer, microphone loudness, "Nearby Bluetooth Beacons", network, GPS, pedometer, and activity ([Sensor Logger README]). Background recording needs location "Always Allow" and Android battery "Unrestricted"; for "the highest level of guarantee" the developer says keep the screen on with the app in front; the free tier allows 10 recordings ([Sensor Logger help]).
- **phyphox** (RWTH Aachen) serves a REST API on the local network, for example `http://192.168.0.42:8080/get`, on port 80 on iPhones ([phyphox remote]), and experiments can push by HTTP or MQTT ([phyphox network]). It runs in the foreground only: background capture "is not something that phyphox can offer anytime soon" ([phyphox background]).

[OwnTracks HTTP]: https://owntracks.org/booklet/tech/http/
[OwnTracks Android]: https://owntracks.org/booklet/features/android/
[Sensor Logger push]: https://github.com/tszheichoi/awesome-sensor-logger/blob/main/PUSHING.md
[Sensor Logger tiers]: https://www.tszheichoi.com/sensor-logger-pricing-tiers
[Sensor Logger help]: https://www.tszheichoi.com/sensorloggerhelp
[phyphox network]: https://phyphox.org/docs/file-format/network-connections/
[phyphox background]: https://phyphox.org/forums/showthread.php?tid=2222

#### iOS Shortcuts personal automations

- **Triggers that can run without asking:** "Time of Day, Alarm, Sleep, Arrive, Leave, CarPlay, Email, Message, Transaction, Wi-Fi, Bluetooth, Apple Watch Workout, NFC, App, Airplane Mode, Do Not Disturb, Low Power Mode, Battery Level, Charger, Sound Recognition"; only "Before I Commute" cannot ([Shortcuts run without asking]). Apple's current guide is for iOS 27, where "Some personal automations can run without asking you for confirmation"; its steps go through **Privacy** → **Allow Running When Locked**, and "You also may need to set individual actions to run automatically" ([Shortcuts automations]).
- **Default is a prompt:** otherwise "you'll receive a notification asking you to run the automation", and automations are per device ([Shortcuts intro]).
- **No interval trigger:** Time of Day repeats only Daily, Weekly, or Monthly ([Shortcuts event triggers]). Battery Level offers "Equals", "Rises Above", "Falls Below"; Charger "Is Connected", "Is Disconnected"; Wi-Fi fires on joining a chosen or any network ([Shortcuts setting triggers]).
- **Sending data:** Get Contents of URL with POST adds a request body for "JSON, a Form, or a File" ([Shortcuts API request]). Apple warns that many requests in a short period "may lead to usage overages", and "OAuth 2 ... is currently not supported" ([Shortcuts API limits]).
- **Network details:** iOS 17 added "channel number, hardware MAC address, and rate information" to Get Network Details ([iOS 17 Shortcuts]); Apple doesn't document its full output.
- **Apps on iOS in the background:** "the system suspends the execution of most apps shortly after they move to the background" and "can terminate apps at any time" ([iOS background location]). Significant-change monitoring relaunches a terminated app, at most "once every five minutes" after a 500 m move ([significant location change]).
- **Inference:** an iPhone can't produce a fixed-interval time series without the app in front. It can report events (charger plugged or unplugged, battery crossing a level, joining Wi-Fi, arriving, leaving, alarm, waking) and readings at a set of fixed daily times, each one a separate Time of Day automation.

[Shortcuts run without asking]: https://support.apple.com/guide/shortcuts/enable-or-disable-a-personal-automation-apd602971e63/9.0/ios/26
[Shortcuts automations]: https://support.apple.com/guide/shortcuts/add-automations-apdfbdbd7123/ios
[Shortcuts intro]: https://support.apple.com/guide/shortcuts/intro-to-personal-automation-apd690170742/9.0/ios/26
[Shortcuts event triggers]: https://support.apple.com/guide/shortcuts/event-triggers-apd932ff833f/9.0/ios/26
[Shortcuts API request]: https://support.apple.com/guide/shortcuts/request-your-first-api-apd58d46713f/ios
[Shortcuts API limits]: https://support.apple.com/guide/shortcuts/api-limitations-apd891a6c84e/ios
[iOS 17 Shortcuts]: https://support.apple.com/en-us/111098
[iOS background location]: https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background
[significant location change]: https://developer.apple.com/documentation/corelocation/cllocationmanager/startmonitoringsignificantlocationchanges()

#### Android background limits

- **Doze:** an unplugged, stationary phone with the screen off enters Doze, which "prevents apps from accessing the network and defers their jobs, syncs, and standard alarms"; it "Ignores wake locks", "Doesn't perform Wi-Fi scans", and stops JobScheduler, so "WorkManager tasks don't run". On moving the phone, turning on the screen, or "connecting a charger, the system exits Doze" ([Doze]).
- **Standby buckets:** the bucket "determines how frequently the app's jobs run"; in the Restricted bucket jobs run "once per day in a 10-minute batched session", and "Every manufacturer can set their own criteria" for bucket assignment. Apps on the Doze exemption list are exempt from bucket limits ([standby buckets]).
- **Foreground services:** apps targeting Android 15 get "a total of 6 hours in a 24-hour period" for `dataSync` services ([FGS timeout]).
- **Vendor killers:** "Android manufacturers listed below prefer battery life over proper functionality of your apps"; Xiaomi, Samsung, OnePlus, and Huawei score worst ([dontkillmyapp]). On Samsung, "After 3 days any unused app will not be able to start from background", and "Even disabling the system battery restrictions does not save the app from being killed" ([dontkillmyapp Samsung]). Pixel phones have "the lowest chance of something going wrong" ([dontkillmyapp Google]).
- **Home Assistant's checklist:** turn off battery optimisation, disable vendor power saving, and allow unrestricted data ([HA FAQ]).

[Doze]: https://developer.android.com/training/monitoring-device-state/doze-standby
[standby buckets]: https://developer.android.com/topic/performance/appstandby
[FGS timeout]: https://developer.android.com/develop/background-work/services/fgs/timeout
[dontkillmyapp Samsung]: https://dontkillmyapp.com/samsung
[dontkillmyapp Google]: https://dontkillmyapp.com/google

#### Web pages and PWAs left running

Support data is from MDN's browser-compat-data on 5 November 2026.

- **Hidden tabs:** after a page "has been hidden for more than 5 minutes", Chrome checks its chained timers "once per minute" ([timer throttling]); browsers may also "suspend pages or discard them entirely" ([page lifecycle]).
- **Periodic Background Sync:** only after the app is installed and launched as an app, and "a periodicsync event won't be fired at all unless the engagement score is greater than zero" ([periodic sync]). Chrome 80+ only; not Firefox, Safari, or Android WebView ([PeriodicSyncManager BCD]). One-off Background Sync is Chrome 49+ only ([SyncManager BCD]).
- **Screen Wake Lock:** Chrome 84, Firefox 126, Safari 16.4; on iOS, home-screen web apps get it only from 18.4 ([WakeLock BCD]).
- **Battery Status API:** see [Phone and laptop sensors in the browser](#phone-and-laptop-sensors-in-the-browser).
- **Web push on iOS:** home-screen web apps since iOS 16.4, with permission asked "in response to direct user interaction" ([iOS web push]).
- **Inference:** a page only keeps reporting while it is visible: a phone on a charger with the page in front and a wake lock held. Locking the screen, switching apps, or an OS update stops it.

[timer throttling]: https://developer.chrome.com/blog/timer-throttling-in-chrome-88
[page lifecycle]: https://developer.chrome.com/docs/web-platform/page-lifecycle-api
[periodic sync]: https://developer.chrome.com/docs/capabilities/periodic-background-sync
[PeriodicSyncManager BCD]: https://github.com/mdn/browser-compat-data/blob/main/api/PeriodicSyncManager.json
[SyncManager BCD]: https://github.com/mdn/browser-compat-data/blob/main/api/SyncManager.json
[WakeLock BCD]: https://github.com/mdn/browser-compat-data/blob/main/api/WakeLock.json
[iOS web push]: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/

#### Which phone setups survive for days

No vendor promises multi-day unattended running. The last column is **Inference** from the limits above.

| Setup                                         | OS      | Cadence                               | What stops it                                |
| --------------------------------------------- | ------- | ------------------------------------- | -------------------------------------------- |
| HA Companion, Fast While Charging, on charger | Android | 1 min; Wi-Fi and battery on change    | Vendor killers; battery optimisation left on |
| HA Companion                                  | iOS     | Set by iOS, tied to location          | iOS throttling; location not "Always"        |
| OwnTracks, significant or move mode           | Both    | ≥500 m and ≤ once per 5 min, or timed | Vendor killers; notification dismissed       |
| Tasker or Automate profiles                   | Android | On state change                       | Doze when unplugged; polling drains battery  |
| Termux (F-Droid) with wake lock               | Android | Script loop; jobs ≥15 min             | Phantom process killer on Android 12+        |
| Shortcuts personal automations                | iOS     | Events and fixed daily times          | No interval trigger; per-action prompts      |
| Browser page with wake lock, in front         | Both    | Any                                   | Screen lock, app switch, tab discard         |
| Sensor Logger recording                       | Both    | Batch period                          | Free tier caps recordings; background kills  |

### Pi 5 as a sensor

#### Wi-Fi radio and monitor mode

- **Radio:** the Infineon CYW43455 "provides dual-band 802.11ac Wi-Fi and Bluetooth 5.0 with Bluetooth Low-Energy (BLE)", the same chip as Pi 4 ([Pi 5 launch]); the product brief lists the same ([Pi 5 brief]).
- **No monitor mode on stock Raspberry Pi OS:**
  - nexmon's table has a row for the Pi 5 firmware (`7_45_234`, "Raspberry Pi B3+/B4/5") with no tick under monitor mode; only older firmware rows labelled Pi 3B+ and 4 have it, and nexmon supports kernels up to 5.15 ([nexmon]).
  - A nexmon maintainer wrote "Kernel 6.6 is not supported yet" in 2024 ([nexmon kernel 6.6]); Raspberry Pi OS now ships 6.12 kernels ([llama.cpp on Arm] records `6.12.93+rpt-rpi-2712`).
  - Kali packages nexmon tested on "Raspberry Pi 5 (64-bit)", on Kali images only, and calls injection "not always stable" ([Kali nexmon]).
- **What works:** a managed-mode scan, `iw dev wlan0 scan` ([iw docs]), prints each access point's BSSID, frequency, signal in dBm, and last-seen time; iw's source warns "Do NOT screenscrape this tool, we don't consider its output stable" ([iw source]).
- **Inference:** the Pi sees access points and their signal strength, not phones; phone probe requests need monitor mode.

[nexmon kernel 6.6]: https://github.com/seemoo-lab/nexmon/issues/599
[Kali nexmon]: https://www.kali.org/blog/raspberry-pi-wi-fi-glow-up/
[iw source]: https://git.kernel.org/pub/scm/linux/kernel/git/jberg/iw.git/plain/iw.c

#### BLE advertisement scanning

- **Passive scanning:** BlueZ's advertisement monitor API is marked `[experimental]` and supports only `or_patterns` ([BlueZ AdvertisementMonitor]); the Python library bleak says "passive scanning on Linux requires BlueZ >= 5.56 with --experimental enabled and Linux kernel >= 5.10" ([bleak BlueZ manager]). Ordinary discovery (`bluetoothctl` `scan le`) needs no such flag; BlueZ says its purpose "is to find devices that are advertising with their discoverable flag set" ([bluetoothctl]), and the `duplicate-data` option "Disables duplicate detection of advertisement data" so repeat advertisements are reported ([bluetoothctl scan]).
- **Address rotation:** the Core spec's recommended maximum time between private address changes is 15 minutes ([Core 6.1 GAP]); Android phones "MUST" rotate within 15 minutes at intervals "randomized between 5 and 15 minutes" ([Android 16 CDD]); Apple says only that it changes the address "on a frequent basis" ([Apple Bluetooth security]). The Bluetooth SIG notes even 15-minute rotation can stay "predictable" and introduced randomised updates in Core 6.1 ([randomized RPA]).
- **Inference:** the Pi can count distinct BLE advertisers and their signal strength within a window of a few minutes. That counts devices, not people: one person carries a phone, watch, and earbuds; TVs and trackers advertise too; one phone becomes a new address after each rotation. Label any such count as a device-activity index.
- **Inference:** a team member's Android phone running the HA Companion BLE transmitter ([HA sensors]) broadcasts an iBeacon every second; its beacon identifier, unlike the Bluetooth address, should stay fixed, so the Pi can recognise the team's own phones at home across address changes.

[BlueZ AdvertisementMonitor]: https://github.com/bluez/bluez/blob/master/doc/org.bluez.AdvertisementMonitor.rst
[bleak BlueZ manager]: https://github.com/hbldh/bleak/blob/develop/bleak/backends/bluezdbus/manager.py
[bluetoothctl]: https://github.com/bluez/bluez/blob/master/doc/bluetoothctl.rst
[bluetoothctl scan]: https://github.com/bluez/bluez/blob/master/doc/bluetoothctl-scan.rst
[Android 16 CDD]: https://source.android.com/docs/compatibility/16/android-16-cdd
[Apple Bluetooth security]: https://support.apple.com/guide/security/bluetooth-security-sec82597d97e/web
[randomized RPA]: https://www.bluetooth.com/blog/enhancing-device-privacy-and-energy-efficiency-with-bluetooth-randomized-rpa-updates/

#### Power, undervoltage, and the RTC

- **Supply:** Raspberry Pi recommends its 27 W USB-C supply; the Pi 5 wants 5 A, and on a 3 A supply USB peripherals are limited to 600 mA instead of 1.6 A ([Pi power supplies]).
- **Undervoltage:** detected "if the supply voltage drops below 4.63 V (±5%)", which adds a kernel log entry ([Pi power supplies]).
- **`vcgencmd get_throttled`** ([vcgencmd], [Raspberry Pi OS utilities]): bits 0–3 are current state (undervoltage, Arm frequency capped, throttled, soft temperature limit); bits 16–19 mean the same has occurred since boot. For example, `0x50000` means undervoltage and throttling have occurred.
- **`vcgencmd pmic_read_adc`:** on Pi 5, the current and voltage of each PMIC rail plus the supply voltage `EXT5V_V`; "These readings don't include USB current" ([vcgencmd]).
- **Temperature:** `vcgencmd measure_temp` returns the SoC temperature and `measure_temp pmic` the PMIC's ([vcgencmd]). The temperature and the throttling flags describe the Pi's own hardware state, not room temperature or household energy use ([Raspberry Pi OS utilities]).
- **Reset reason:** the device tree's `power_reset` field ("Raspberry Pi 5 only") has bits for over voltage, under voltage, over temperature, enable signal, and watchdog ([config reference]); there is no "power removed" reason.
- **Power returning:** "When you plug your Raspberry Pi into power for the first time, it will automatically turn on" ([power button]). `WAIT_FOR_POWER_BUTTON` defaults to `0`, and only if it and `POWER_OFF_ON_HALT` are both `1` does it wait for the button "instead of booting immediately after power-loss" ([EEPROM config]).
- **RTC:** the Pi 5 "includes an RTC module", which "can be battery powered through the J5 (BAT) connector"; it "is still usable even when there's no backup battery attached", and battery charging "is disabled by default" ([Pi RTC]). The official battery is a rechargeable ML2020 ([RTC battery]), which gate G3 rules out buying.
- **Inference:** the Pi can't observe a home power cut while it happens. After it reboots, the gap between the previous boot's last journal entry and the new boot, plus `power_reset`, tells an outage from a watchdog or undervoltage reset. Without an RTC battery the clock is wrong until network time syncs, so readings shouldn't be stamped before that.

[power button]: https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/raspberry-pi/power-button.adoc
[Pi RTC]: https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/raspberry-pi/rtc.adoc
[RTC battery]: https://www.raspberrypi.com/products/rtc-battery/
[Raspberry Pi OS utilities]: https://www.raspberrypi.com/documentation/computers/os.html#vcgencmd

#### Temperature and throttling

- **Thresholds:** "When the core temperature is between 80°C and 85°C, the Arm cores will be progressively throttled back. If the temperature reaches 85°C, both the Arm cores and the GPU will be throttled back"; "heatsinks are not necessary to prevent overheating damage" ([frequency management]).
- **Raspberry Pi's measurements** (4 October 2023, `stress --cpu 4`, open air on a lab bench, ambient not stated): a bare board idles "around 65°C" and under load "climbs to and then remains stable just above the 85°C thermal limit", throttling from 2.4 GHz to 1.5 GHz; with the Active Cooler it settles near 60°C; with only its heatsink it throttles after about 200 seconds ([Pi 5 cooling]).
- **Their advice:** "For normal use adding cooling is optional", but "passive cooling is probably going to be insufficient thermal management for heavy loads" ([Pi 5 cooling]). The rated ambient operating range is 0–70°C ([Pi 5 brief]).
- **Inference:** a Malaysian room is warmer than a lab bench, so any sustained four-core job will run throttled. The SoC temperature tracks load more than room temperature; logging it with `get_throttled` shows throttling as data.

[frequency management]: https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/raspberry-pi/frequency-management.adoc
[Pi 5 cooling]: https://www.raspberrypi.com/news/heating-and-cooling-raspberry-pi-5/

#### Microphone and camera

- **USB microphone (only if already owned):** `arecord -l` lists capture devices, and `--max-file-time 3600 --use-strftime` writes a new file every hour ([arecord]).
- **USB webcam (only if already owned):** Raspberry Pi documents `fswebcam` for still images ([Pi webcams]). The board's two MIPI connectors need a camera module ([Pi 5 brief]).
- **A phone as the Pi's camera and mic:** the Android app IP Webcam streams video "inside WiFi network without internet access" to VLC or a browser, with audio in wav, opus, and AAC, motion detection, and sensor data ([IP Webcam]); its stream URLs aren't in a primary doc, so read them from the app. phyphox exposes a phone's sensors to the Pi the same way while in front ([phyphox remote]).

[arecord]: https://github.com/alsa-project/alsa-utils/blob/master/aplay/aplay.1
[Pi webcams]: https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/accessories/camera/webcams.adoc
[IP Webcam]: https://play.google.com/store/apps/details?id=com.pas.webcam&hl=en

### Pi 5 as an edge computer

The CPU is a "2.4GHz quad-core 64-bit Arm Cortex-A76" with LPDDR4X-4267 memory ([Pi 5 brief]), "2–3×" a Pi 4 ([Pi 5 launch]). Most benchmarks below don't state cooling; with no fan (gate G3), treat them as upper bounds. Raspberry Pi's Hailo NPU boards, the AI HAT+ and AI HAT+ 2, must be bought ([Pi AI accessories]).

[Pi AI accessories]: https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/ai/getting-started.adoc

#### Speech to text

| Model (whisper.cpp, F16, 4 threads) | Encode per 30 s window | Decode | RAM     |
| ----------------------------------- | ---------------------- | ------ | ------- |
| tiny                                | 1.1 s                  | 184 ms | ~273 MB |
| base                                | 2.5 s                  | 347 ms | ~388 MB |
| small                               | 8.3 s                  | 963 ms | ~852 MB |
| medium                              | 26.5 s                 | n/a    | ~2.1 GB |

- **Method:** whisper.cpp's `bench` on a Pi 5 "with the active cooler", Bookworm, NEON, November 2023 build ([whisper.cpp Pi 5 bench]); a second run the same day without stated cooling gave tiny 1.2 s, base 2.9 s, small 9.6 s ([whisper.cpp Pi 5 bench 2]). RAM is from the README ([whisper.cpp]). No newer Pi 5 rows were found.
- **Moonshine:** measured from the end of a phrase to text returned, Moonshine Tiny Streaming took 237 ms and Small Streaming 527 ms on a Pi 5, against 5.9 s and 10.4 s for Whisper Tiny and Small through faster-whisper ([Moonshine vs Whisper]); Moonshine says its Pi 5 columns predate a build fix and "read pessimistically" ([Moonshine benchmarks]). Malay support wasn't checked.
- **Inference:** whisper tiny and base transcribe recorded audio several times faster than real time; small is about three times faster on a cooled board, less when throttled.

[whisper.cpp Pi 5 bench 2]: https://github.com/ggml-org/whisper.cpp/issues/89#issuecomment-1792461133
[whisper.cpp]: https://github.com/ggml-org/whisper.cpp
[Moonshine vs Whisper]: https://github.com/moonshine-ai/moonshine/blob/main/docs/moonshine-vs-whisper.md
[Moonshine benchmarks]: https://github.com/moonshine-ai/moonshine/blob/main/docs/using/benchmarks.md

#### Small language models

| Model and quantisation   | Runtime, threads   | Generation         | Source               |
| ------------------------ | ------------------ | ------------------ | -------------------- |
| Qwen2.5 0.5B Q4_0        | llama.cpp, 2 and 4 | 33.8 and 27.3 t/s  | [llama.cpp on Arm]   |
| Llama 3.2 3B Q4_K_M      | llama.cpp, 4       | 4.61 t/s, 13.9 W   | [Geerling Pi 5 8 GB] |
| Llama 3.1 8B Q4_K_S      | llama.cpp, 4       | 1.99 t/s           | [Geerling Pi 5 8 GB] |
| Gemma 4 E2B (Pi 5 16 GB) | LiteRT-LM, CPU     | 8 t/s, 1.5 GB peak | [LiteRT-LM]          |

- **Method notes:** the Qwen run (October 2026, Pi 5 2 GB, `llama-bench -p 512 -n 128 -r 5`, `throttled=0x0` before and after) also measured prompt processing at 290 t/s on 4 threads ([llama.cpp on Arm]). The Llama runs (November 2024, Pi 5 8 GB, `llama-cli -n 50 -t 4`, cooling not stated) failed to run a 13B model on 8 GB ([Geerling Pi 5 8 GB]). Google's Gemma 4 E2B row gives 7.8 s to first token and no prompt length or quantisation ([LiteRT-LM]).
- **Memory-bound:** across quantisations of one model on a Pi 5, "The product of model file size and throughput stayed between 9.76 and 10.55 GB/s" ([llama.cpp bandwidth]). Google lists about 2.9 GB to load Gemma 4 E2B at Q4_0 and 4.5 GB for E4B, before the context window ([Gemma 4 memory]).
- **Gemma 3 1B and 4B:** no primary Pi 5 benchmark was found. **Inference** from the bandwidth rule: a 1B model at Q4 (about 0.8 GB) would generate about 12 tokens a second and a 4B at Q4 (about 2.5–3 GB) about 3–4 on a cool board; planning figures, not measurements.
- **Power:** a Pi 5 running `llama-bench` drew "around 10.5W" sustained, against an idle "2.7-3W" ([Geerling Pi 5 16 GB power]).

[LiteRT-LM]: https://developers.google.com/edge/litert-lm/overview
[llama.cpp bandwidth]: https://github.com/ggml-org/llama.cpp/issues/26484
[Gemma 4 memory]: https://ai.google.dev/gemma/docs/core
[Geerling Pi 5 16 GB power]: https://github.com/geerlingguy/ai-benchmarks/issues/47

#### Object detection

- Ultralytics' Raspberry Pi guide now benchmarks YOLO26 "on a Raspberry Pi 5 at FP32 precision with the default input image size of 640", CPU only, cooling not stated, Ultralytics 8.4.108 ([Ultralytics Pi guide]).
- YOLO26n per image: NCNN 67 ms, MNN 92 ms, OpenVINO 105 ms, LiteRT 123 ms, ONNX 126 ms, PyTorch 299 ms; YOLO26s on NCNN 173 ms. The only remaining YOLO11n figure is ONNX at 147 ms. "NCNN delivers the best inference performance on Raspberry Pi devices" ([Ultralytics Pi guide]).
- **Inference:** about 15 frames a second of model time for YOLO26n, ample for a frame every few seconds from a USB webcam or a phone stream, which is the only camera available.

#### Memory and heat budget

- **Inference:** 8 GB holds the OS, a 1–4B model at Q4, whisper small, and YOLO26n at once, but they share the same four cores and roughly 10 GB/s of memory bandwidth, so running them together slows each.
- **Inference:** with no fan, short bursts (transcribe a clip, classify a frame, summarise a log) suit the Pi; continuous inference sits at the 80–85°C throttle point ([Temperature and throttling](#temperature-and-throttling)). Heavy reasoning belongs to Gemini in the cloud.

### Pi 5 as a network probe or server

#### Globalping probe

- **Hosting:** one Docker container that "works on both x86 and ARM architectures", suited to "a Raspberry Pi lying around"; it "doesn't open ports on your device or accepts any incoming connections", and `--restart=always` is in the documented command ([Globalping probe]).
- **Adoption and credits:** an adoption token links the probe to an account; hosts "receive 150 credits per day for each probe", and "Credits have no expiration" ([Globalping]).
- **Hosting rules:** "You may run only one probe per public IPv4 address or IPv6 `/64` prefix"; probes that can't be located, or that route through "anonymous proxies, Tor exit nodes, or VPN services", are dropped; "We block private IP addresses as targets"; the container itself isn't auto-updated, only its code ([Globalping probe]).
- **API limits:** anonymous "250 free tests/hour", signed in "500 free tests/hour", each extra test one credit; types are "ping, traceroute, MTR, DNS resolve, and HTTP" ([Globalping API]). "A test is defined as a successful measurement the platform runs from one probe" ([Globalping]).
- **Choosing probes:** a `magic` field fuzzy-matches country, city, ASN (`AS123`), tags, and network; "Probes don't expose unique IDs", but a measurement's ID can be reused to hit the same probes; results are "typically available for up to six months" ([Globalping API]). An adopted probe can be targeted directly through a custom user tag such as `u-your-custom-tag` ([Globalping own probe]).
- **Official MCP server:** `https://mcp.globalping.dev/mcp`, Streamable HTTP, OAuth or API tokens, with tools for each test type and `getMeasurement` by ID ([Globalping MCP]).
- **Gemini Enterprise:** the preview connector "lets you search your Globalping measurements" ([Globalping connector]; more in [Gemini Enterprise](/docs/research/gemini-enterprise.md#network-measurements-through-globalping)).
- **Inference:** the public API has no "list my measurements" endpoint, so how the connector finds "your" measurements is undocumented; create measurements under the team's account and keep their IDs, and test the connector before designing around it. An adopted Pi probe gives a real Malaysian home-broadband vantage point; if the ISP puts the home behind carrier-grade NAT shared with another probe host, the one-probe-per-IPv4 rule could refuse it (not verified).

[Globalping]: https://github.com/jsdelivr/globalping
[Globalping API]: https://api.globalping.io/v1/spec.yaml
[Globalping own probe]: https://blog.globalping.io/host-probe-on-truenas/
[Globalping MCP]: https://github.com/jsdelivr/globalping-mcp-server
[Globalping connector]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/globalping

#### RIPE Atlas software probe

- Binary packages exist for the "`arm64` variant of Raspberry Pi OS 12 / 13"; the probe's public key is registered at `atlas.ripe.net/register/swprobe`; it uses TCP ports 2023 and 8080 internally; since release 5080 it no longer auto-updates ([RIPE Atlas probe]).
- "software probes can only be set up as 'public probes'" ([RIPE Atlas software probes]). A connected probe earns 15 credits a minute, "roughly 21,600 credits every 24 hours", and new users can claim 50,000 credits once ([RIPE Atlas credits]). Results are fetched with "No authentication required" ([RIPE Atlas results API]).
- **Inference:** Gemini Enterprise has no RIPE Atlas connector, so its results need their own path (a sheet, Supabase, or MCP). The approval time after registering wasn't verified.

[RIPE Atlas software probes]: https://atlas.ripe.net/docs/howtos/software-probes/
[RIPE Atlas credits]: https://atlas.ripe.net/docs/getting-started/credits.html
[RIPE Atlas results API]: https://atlas.ripe.net/docs/apis/rest-api-reference/measurements/measurements_results/

#### Latency logging

- SmokePing "does not stand alone": it needs RRDtool and FPing, with "fping must be installed setuid root" ([SmokePing install]); Debian packages it for bookworm and trixie ([SmokePing in Debian]).
- **Inference:** SmokePing keeps its graphs on the Pi behind a web server. A systemd timer that runs `ping` against the home router and public targets each minute and posts the results to a sheet or Supabase puts the same data where a connector can read it, and separates "home Wi-Fi down" from "ISP down".

[SmokePing in Debian]: https://qa.debian.org/madison.php?package=smokeping&text=on

#### Public HTTPS without a card

| Option                      | Hostname                       | Limits                                               | Streaming                                 |
| --------------------------- | ------------------------------ | ---------------------------------------------------- | ----------------------------------------- |
| Cloudflare Quick Tunnel     | Random, new on every start     | 200 in-flight requests; "no uptime guarantee"        | "do not support Server-Sent Events (SSE)" |
| Cloudflare named tunnel     | A domain you add to Cloudflare | 125 s Proxy Read Timeout, then 524                   | Buffered unless `text/event-stream`       |
| Tailscale Funnel (Personal) | `<device>.<tailnet>.ts.net`    | Ports 443, 8443, 10000; unpublished bandwidth limits | No official statement; user-reported bugs |
| ngrok Free                  | One fixed `*.ngrok-free.app`   | 1 GB out and 20,000 HTTP requests a month            | Not checked                               |

- **Cloudflare:** Quick Tunnels need no account or domain and are "for testing and development"; "The hostname changes each time you create a Quick Tunnel" ([Quick Tunnels]). Named tunnels need "A domain on Cloudflare" ([named tunnels]) and keep "four long-lived connections to two Cloudflare data centers" ([Cloudflare Tunnel]). The Proxy Read Timeout is 125 seconds and the idle timeout 900 seconds ([Cloudflare limits]); tunnel traffic "is buffered by default unless the origin server includes the `Content-Type: text/event-stream` response header" ([tunnel buffering]). Whether the Free plan asks for a card wasn't verified.
- **Cloudflare without a domain (untested):** Workers get a free `workers.dev` subdomain ([workers.dev]), free Workers allow 100,000 requests a day ([Workers limits]), and Workers VPC, "available for free to all Workers plans" in beta, can reach a service through a Cloudflare Tunnel ([Workers VPC]).
- **Tailscale Funnel:** "available for all plans"; "Funnel can only use DNS names in your tailnet's domain", "can only listen on ports 443, 8443, and 10000", and "Traffic sent over a Funnel is subject to non-configurable bandwidth limits"; it needs MagicDNS, HTTPS certificates, and a `funnel` node attribute ([Funnel]). Certificates come from Let's Encrypt, and machine names are "published in the public ledger" ([Tailscale HTTPS]). With `--bg`, "When you reboot the device ... Funnel will automatically resume" ([Funnel CLI]). The Personal plan is "$0 Free forever" for up to 6 users ([Tailscale pricing]). Users have reported a streamed response being cut ([Funnel stream issue]) and Funnel stopping after a control-plane reconnect until `tailscaled` restarts ([Funnel reconnect issue]).
- **ngrok:** the dev domain "doesn't change when you restart the agent", and "Free endpoints have no timeout"; the free plan allows 4,000 requests a minute and 3 online endpoints. Its interstitial page affects "HTML browser traffic" only, and API clients skip it with an `ngrok-skip-browser-warning` header ([ngrok free limits]). The pricing page ties card verification only to TCP endpoints ([ngrok pricing]).

[named tunnels]: https://developers.cloudflare.com/tunnel/get-started/
[Cloudflare Tunnel]: https://developers.cloudflare.com/tunnel/
[Cloudflare limits]: https://developers.cloudflare.com/fundamentals/reference/connection-limits/
[tunnel buffering]: https://developers.cloudflare.com/tunnel/troubleshooting/
[workers.dev]: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
[Workers limits]: https://developers.cloudflare.com/workers/platform/limits/
[Workers VPC]: https://developers.cloudflare.com/workers-vpc/
[Tailscale HTTPS]: https://tailscale.com/kb/1153/enabling-https
[Funnel CLI]: https://tailscale.com/docs/reference/tailscale-cli/funnel
[Funnel stream issue]: https://github.com/tailscale/tailscale/issues/21894
[ngrok free limits]: https://ngrok.com/docs/pricing-limits/free-plan-limits
[ngrok pricing]: https://ngrok.com/pricing

#### Fit with Gemini Enterprise custom MCP

- **Requirements:** Streamable HTTP only, a URL with "a TLS certificate signed by a publicly trusted Certificate Authority", OAuth 2.0 or no auth, and an organisation policy that blocks MCP data stores by default ([Gemini Enterprise](/docs/research/gemini-enterprise.md#requirements-and-registration)).
- **The current MCP revision, 2026-07-28,** "changed the behavior of Streamable HTTP": it removed the GET stream endpoint and protocol-level sessions. Every message is a POST; for a request the server "MUST return either `Content-Type: application/json` ... or `Content-Type: text/event-stream`"; every POST carries an `MCP-Protocol-Version` header, and `Mcp-Method` and `Mcp-Name` headers are "REQUIRED for compliance"; servers "SHOULD include the `X-Accel-Buffering: no` header" on SSE ([Streamable HTTP 2026-07-28]). Revisions 2025-03-26 to 2025-11-25 used an `Mcp-Session-Id` header, a GET stream, and `Last-Event-ID` resumption ([Streamable HTTP 2025-11-25]).
- **Not documented:** which MCP revision Gemini Enterprise's client speaks.
- **Inference:** a Pi MCP server that answers every call with `application/json` within a few seconds, and accepts both the old session-based and the new header-based clients, passes cleanly through a named Cloudflare tunnel, Tailscale Funnel, or ngrok. A Quick Tunnel's new hostname on every restart breaks the registered URL. Of the no-card, no-domain options, Funnel gives the stable hostname and trusted certificate the store needs; it is still behind the custom MCP preview and its organisation policy.
- **Inference:** a no-auth MCP URL is open to anyone who finds it, and Funnel names appear in public certificate logs, so expose only read-only tools or use OAuth.

[Streamable HTTP 2026-07-28]: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
[Streamable HTTP 2025-11-25]: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports

### Phone, Pi, and cloud paths

#### Phone to Pi on the home network

- **MQTT:** Mosquitto 2.0 binds to loopback only when no listener is configured, and "allow_anonymous now defaults to false" ([Mosquitto 2.0]); a listener can speak `websockets` ("MQTT tunnelled over WebSockets") for browser clients ([mosquitto.conf]). OwnTracks and phyphox publish MQTT for free; Sensor Logger's MQTT push is paid (see [Location and sensor-streaming apps](#location-and-sensor-streaming-apps)).
- **HTTP:** Tasker, Automate, OwnTracks (HTTP mode), Sensor Logger, and Shortcuts can POST to a server on the Pi. **Inference:** app requests aren't bound by browser mixed-content rules; whether iOS allows Shortcuts to POST to a plain-HTTP LAN address wasn't checked.
- **From a browser page:** an HTTPS page's `fetch()` to plain HTTP is mixed content, and requests "are blocked if the URL's host is an IP address"; loopback is exempt ([mixed content]). Chrome 142+ exempts requests to a private IP literal after the user grants a local network access permission ([Local Network Access]). Safari and Firefox weren't checked.
- **Bluetooth:** see the iBeacon inference in [BLE advertisement scanning](#ble-advertisement-scanning).
- **Pi pulling from phones:** phyphox's REST API and IP Webcam's streams, both with the app in front.
- **Stable address:** Pi-hole's docs ask for "a static IP address ... (a DHCP reservation is just fine)" ([Pi-hole prerequisites]); **Inference:** the same applies to any Pi that phones post to by IP.

[Mosquitto 2.0]: https://mosquitto.org/documentation/migrating-to-2-0/
[mosquitto.conf]: https://mosquitto.org/man/mosquitto-conf-5.html
[mixed content]: https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content
[Local Network Access]: https://developer.chrome.com/blog/local-network-access
[Pi-hole prerequisites]: https://docs.pi-hole.net/main/prerequisites/

#### Pi to Apps Script and Sheets

The path and its limits are in [Gemini Enterprise](/docs/research/gemini-enterprise.md#phone-or-board-to-google-sheets); new findings:

- **Follow the redirect:** returned content "is redirected to a one-time URL at script.googleusercontent.com", so clients must follow redirects; "For the curl command-line utility, add the flag -L" ([Apps Script content]).
- **Trigger quota:** the triggers guide lists simple-trigger restrictions, including trigger quota limits, then says "These restrictions don't apply to doGet(e) or doPost(e)" ([Apps Script triggers]). **Inference:** a reading POSTed every minute doesn't spend the 90 minutes a day of trigger runtime that consumer accounts get ([Apps Script quotas]); a time-driven trigger in the same project still does.
- **Other limits:** 6 minutes per execution, 30 simultaneous executions per user, and 20,000 URL Fetch calls a day on consumer accounts, resetting "24 hours after the first request" ([Apps Script quotas]).
- **Concurrent appends:** `LockService.getScriptLock()` "prevents any user from concurrently running a section of code", acquired with `tryLock` or `waitLock` ([LockService]).
- **Sheet size:** "Up to 20 million cells or 100MB" ([Sheets limits]). **Inference:** one 10-column row a minute for four days is about 58,000 cells.

[Apps Script content]: https://developers.google.com/apps-script/guides/content
[Apps Script quotas]: https://developers.google.com/apps-script/guides/services/quotas
[LockService]: https://developers.google.com/apps-script/reference/lock/lock-service
[Sheets limits]: https://support.google.com/drive/answer/37603

#### Pi to Supabase Free

- **Writes:** PostgREST at `https://<project_ref>.supabase.co/rest/v1/` ([Supabase REST]). "Supabase is deprecating the anon and service_role keys by the end of 2026", so devices use the publishable key (`sb_publishable_...`), which "only reaches what Row Level Security allows" ([Supabase keys]); "Enable RLS on every table" and add an insert policy `with check` ([Supabase RLS]).
- **Pausing:** "If a Free project gets too little database activity over a week, Supabase pauses it", and "sending real requests from your app" counts as activity ([Supabase pausing FAQ]); a warning email comes about a week before, and a paused project can be restored for a year ([Supabase pausing]). The Free plan includes "Unlimited API requests" ([Supabase pricing]).
- Whether sign-up asks for a card wasn't verified.

[Supabase REST]: https://supabase.com/docs/guides/api
[Supabase keys]: https://supabase.com/docs/guides/api/api-keys
[Supabase RLS]: https://supabase.com/docs/guides/database/postgres/row-level-security
[Supabase pausing]: https://supabase.com/docs/guides/platform/free-project-pausing
[Supabase pricing]: https://supabase.com/pricing

#### Where each path enters Gemini Enterprise

Connector stages and blockers are in [Gemini Enterprise](/docs/research/gemini-enterprise.md#comparison-of-live-data-paths).

- **Sheet:** Drive connector and Sheets actions (GA), Workspace accounts only.
- **Supabase:** Supabase connector (preview), with an Execute SQL action.
- **Globalping:** Globalping connector (preview), read-only, for measurements made under the team's account, including from its own adopted probe.
- **Pi-hosted MCP:** custom MCP data store (preview, organisation policy) through a tunnel ([Fit with Gemini Enterprise custom MCP](#fit-with-gemini-enterprise-custom-mcp)).
- **Starting a workflow:** workflows have no webhook trigger; event triggers poll Drive, Gmail, Calendar, and other connectors every 5–10 minutes ([Gemini Enterprise](/docs/research/gemini-enterprise.md#triggers-and-schedules)). **Inference:** a Pi alert can start one by having `doPost` create a Drive file or send a Gmail message.

### Keeping it alive unattended

#### Services and watchdogs

- **Restart:** `Restart=` defaults to `no` ([systemd.service]); units that hit the start limit "are not attempted to be restarted anymore" ([systemd.unit]), and the default limit is 5 starts in 10 seconds ([systemd-system.conf]). Setting `StartLimitIntervalSec=0` disables the limit ([systemd.unit]).
- **Service watchdog:** with `WatchdogSec=`, a service that stops sending `WATCHDOG=1` is "terminated with SIGABRT" and restarted under `Restart=always` or `on-watchdog` ([systemd.service]).
- **Hardware watchdog:** a non-zero `RuntimeWatchdogSec=` programs `/dev/watchdog0` "to automatically reboot the system if it is not contacted within the specified timeout" ([systemd-system.conf]). **Inference** from the Pi kernel's `bcm2835_wdt` driver constants: the hardware maximum is about 15 seconds, so use about 10 ([bcm2835_wdt]).
- **Containers:** Globalping's documented command uses Docker's `--restart=always` ([Globalping probe]).

[systemd.service]: https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html
[systemd-system.conf]: https://www.freedesktop.org/software/systemd/man/latest/systemd-system.conf.html
[bcm2835_wdt]: https://github.com/raspberrypi/linux/blob/rpi-6.12.y/drivers/watchdog/bcm2835_wdt.c

#### Network and remote access

- **Wi-Fi:** NetworkManager's `802-11-wireless.powersave` value `2` disables power saving, and `connection.autoconnect-retries` "Zero means forever" (default 4) ([nmcli settings]). Home Assistant calls Ethernet "more reliable and highly recommended" ([HA on Raspberry Pi]).
- **Raspberry Pi Connect:** screen sharing and a remote shell, through a relay when no direct connection is possible; the personal account is free but "provides a single user" ([Pi Connect]).
- **Tailscale SSH:** "available for all plans" ([Tailscale SSH]), so all teammates on a free Personal tailnet (up to 6 users, [Tailscale pricing]) can reach the Pi and the phones.

[nmcli settings]: https://networkmanager.dev/docs/api/latest/nm-settings-nmcli.html
[Pi Connect]: https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/services/connect/introduction.adoc
[Tailscale SSH]: https://tailscale.com/kb/1193/tailscale-ssh

#### Power cuts and SD cards

- **Reboot:** a Pi 5 on default EEPROM settings boots by itself when power returns ([EEPROM config]).
- **Corruption:** Raspberry Pi's white paper says "power dropouts can cause storage corruption", that SD flash "has a limited write cycle lifetime", and that failure "is usually indicated by random file corruptions"; it gives a `Storage=volatile` journald drop-in and warns that it "discards all logs on reboot" ([resilient file system], [journald.conf]).
- **Overlay file system:** `raspi-config` → Performance Options → Overlay File System makes changes "lost when your Raspberry Pi reboots or powers off" ([overlay file system]). **Inference:** with it on, buffered readings and logs vanish on a power cut, so send data off the Pi promptly.

[journald.conf]: https://www.freedesktop.org/software/systemd/man/latest/journald.conf.html
[overlay file system]: https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/configuration/performance.adoc

#### Updates during the event

- `unattended-upgrades` upstream defaults cover Debian origins and leave `Automatic-Reboot` "false" ([unattended-upgrades defaults]); Raspberry Pi says `rpi-update` "is only appropriate for developers and testers" ([Pi updating]).
- **Inference:** an upgrade can still restart a service mid-assessment; freeze updates from 10 to 14 November. Whether Raspberry Pi OS enables `unattended-upgrades` by default wasn't checked.

[unattended-upgrades defaults]: https://github.com/mvo5/unattended-upgrades/blob/master/data/50unattended-upgrades.Debian
[Pi updating]: https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/os/updating.adoc

#### What kills home deployments

In the maintainers' own words:

- **Power:** "Low quality power supplies can corrupt storage or cause unpredictable behaviour" ([Pi power supplies]); "Mobile chargers may not be suitable" and computer USB ports "must not be used" ([HA on Raspberry Pi]).
- **Storage:** "power dropouts can cause storage corruption" ([resilient file system]).
- **Restart loops:** units that reach the start limit "are not attempted to be restarted anymore" ([systemd.unit]).
- **Phones:** "No location history is usually caused by limited background access for the Home Assistant app, or the Android system killing the app" ([HA FAQ]); vendors "prefer battery life over proper functionality of your apps" ([dontkillmyapp]); "Android OS will kill any (phantom) processes greater than 32" ([Termux README]); iOS background updates are "heavily throttled" ([HA FAQ]).
- **Tunnels:** "Quick Tunnels have no uptime guarantee" ([Quick Tunnels]); Funnel can stop "after control-plane reconnect until tailscaled restart" (user report, [Funnel reconnect issue]).
- **Agent credentials:** scheduled Gemini Enterprise workflows run on credentials that "expire every 14 days" ([Gemini Enterprise](/docs/research/gemini-enterprise.md#what-runs-without-anyone-signed-in)).

### Platform behaviours

Platform behaviours that decide whether a phone or Pi job keeps running unattended, each checked against its primary source on 5 November 2026.

#### GitHub disables scheduled workflows

- **Rules:** "In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days" and "When a public repository is forked, scheduled workflows are disabled by default" ([GitHub: disable and enable workflows][gh_disable]; checked 5 November 2026).
- **Measurement on the most-forked APU timetable sync:** on 5 November 2026 the GitHub REST API listed the original repository and its 40 forks. 1 had an active schedule (67 runs, last 30 October 2026, success); 34 were `disabled_inactivity` (including the original), 3 were `disabled_fork`, and 3 had no workflow file. 7 of the 41 had any recorded run. Method: `gh api` for each repository's workflows and the latest run; the repository is described under [Who already uses the timetable feed](/docs/research/apu.md#who-already-uses-the-timetable-feed).
- **Inference:** a student-built sync that nobody touches goes silent without telling anyone; the docs promise no warning.

#### Tailscale Funnel and the client address

- **Docs are silent:** "Funnel traffic, which is publicly available, does not include identity headers"; the page does not mention `X-Forwarded-For` ([Tailscale serve headers][ts_headers]; checked 5 November 2026).
- **Source file:** in `ipn/ipnlocal/serve.go` at commit [`e19eb27`][ts_serve] (committed 2 November 2026 21:42 UTC), the handler for Funnel ingress reads the `Tailscale-Ingress-Src` header ("want ip:port"; the comment says "srcAddr represents the source AddrPort and not that of the ingressPeer"). The reverse proxy then runs `r.Out.Header.Set("X-Forwarded-For", c.SrcAddr.Addr().String())`, which overwrites any value the client sent, and sets `Tailscale-Funnel-Request` to `?1` for Funnel requests.
- **What this does not show:** a live request. **Inference:** a service behind `tailscale funnel` should see the visitor's IP address (without the port) in `X-Forwarded-For`; confirm with a request from mobile data before relying on it. Funnel setup is in [Public HTTPS without a card](/docs/research/iot-and-network.md#public-https-without-a-card).

#### Setting alarms from a phone without a person

- **Android intent:** `ACTION_SET_ALARM` "Activates an existing alarm or creates a new one" and "always enables the alarm"; `EXTRA_SKIP_UI`, "If true, the application is asked to bypass any intermediate UI" ([AlarmClock reference][android_alarm]; checked 5 November 2026). "Asked" matters: the clock app decides. The caller needs the `SET_ALARM` permission for related actions, and `ACTION_DISMISS_ALARM` prompts the user if more than one active alarm matches.
- **Tasker:** the Set Alarm action sets "a new alarm in the default alarm clock application", and "If Confirm is not checked no user interaction will be required"; "on some devices, setting the alarm too close to the current time may result in the alarm being set for the next day" ([Tasker Set Alarm][tasker]; checked 5 November 2026).
- **Automate:** the Alarm add block "adds an alarm in the default Clock app" and continues at once; Android supports only minute precision ([Automate Alarm add][automate]; checked 5 November 2026). The page says nothing about prompts.
- **iOS actions:** Apple's page names "Create Alarm, Toggle Alarm, Get All Alarms, and Start Timer" as Shortcuts actions, listed as newly supported on macOS in the iOS 16.1 notes ([Shortcuts what's new][ios_new]; checked 5 November 2026). A community guide reports that deleting alarms without a prompt needs "Allow Deleting Without Confirmation" on iOS 18 ([Home Assistant community][ha_alarm]; checked 5 November 2026).
- **Personal automations:** which triggers run without a prompt is already recorded in [iOS Shortcuts personal automations](/docs/research/iot-and-network.md#ios-shortcuts-personal-automations); Android apps are under [Android automation apps and Termux](/docs/research/iot-and-network.md#android-automation-apps-and-termux).
- **Inference:** an Android phone can have an alarm created with no tap if the clock app honours `EXTRA_SKIP_UI` or Tasker is used with Confirm off; on iOS, creating and toggling alarms are documented actions, but no page I opened says they run without a prompt inside an automation.

### Capability matrix

"Unattended" means running 11–14 November with nobody touching the device; entries marked _inf._ are **Inference** from the cited limits.

| Signal or job                     | Device           | Route                            | Unattended?                       | Source                       |
| --------------------------------- | ---------------- | -------------------------------- | --------------------------------- | ---------------------------- |
| Battery level, charging           | Android          | HA Companion → HA on Pi          | Yes on a charger, _inf._          | [HA sensors]                 |
| Battery level, charging           | iPhone           | Shortcuts trigger → Apps Script  | Events only                       | [Shortcuts setting triggers] |
| Battery level, charging           | Browser          | Battery Status API               | Chrome only, page in front        | [BatteryManager BCD]         |
| Wi-Fi SSID, BSSID, signal         | Android          | HA Companion                     | Yes, on change                    | [HA sensors]                 |
| Wi-Fi SSID, BSSID                 | iPhone           | HA Companion or OwnTracks        | Location-driven                   | [OwnTracks JSON]             |
| Nearby Wi-Fi access points        | Android          | Termux:API or Sensor Logger      | 1 scan per 30 min in background   | [Android Wi-Fi scanning]     |
| Nearby Wi-Fi access points        | Pi               | `iw dev wlan0 scan`              | Yes                               | [iw docs]                    |
| Phone probe requests              | Pi               | Monitor mode                     | No, unsupported on stock OS       | [nexmon]                     |
| Nearby BLE advertisers            | Pi               | BlueZ or bleak                   | Yes; devices, not people          | [Core 6.1 GAP]               |
| Team phone presence               | Android → Pi     | HA BLE transmitter → Pi scan     | Yes, _inf._                       | [HA sensors]                 |
| Cell type, signal dBm             | Android          | HA Companion or Termux:API       | Yes, "may not always be current"  | [HA sensors]                 |
| Activity, sleep confidence        | Android          | HA Companion (Play build)        | ~10 min sleep confidence          | [HA sensors]                 |
| Steps, pressure, light            | Android          | HA Companion                     | 15 min, 1 min charging            | [HA sensors]                 |
| Location                          | Both             | OwnTracks HTTP or MQTT           | ≥500 m, ≤ once per 5 min          | [OwnTracks location]         |
| Undervoltage, throttling          | Pi               | `vcgencmd get_throttled`         | Yes                               | [vcgencmd]                   |
| Supply voltage, rail currents     | Pi               | `vcgencmd pmic_read_adc`         | Yes                               | [vcgencmd]                   |
| SoC temperature                   | Pi               | `vcgencmd measure_temp`          | Yes; not room temperature, _inf._ | [vcgencmd]                   |
| Home power cut                    | Pi               | Boot gap in the journal          | After the fact, _inf._            | [config reference]           |
| Home internet latency and outages | Pi               | `ping` timer → Sheet or Supabase | Yes, _inf._                       | [SmokePing install]          |
| Globalping probe                  | Pi               | Docker → Globalping connector    | Yes                               | [Globalping probe]           |
| RIPE Atlas probe                  | Pi               | Package → public results API     | Yes; no Gemini connector          | [RIPE Atlas probe]           |
| Sound clips, transcripts          | Pi + USB mic     | `arecord` → whisper.cpp          | Bursts; throttles without fan     | [whisper.cpp Pi 5 bench]     |
| Local LLM summary                 | Pi               | llama.cpp, 1–3B Q4               | Bursts; ~4.6 t/s at 3B            | [Geerling Pi 5 8 GB]         |
| Object detection                  | Pi + phone video | IP Webcam → YOLO26n NCNN         | ~67 ms per frame                  | [Ultralytics Pi guide]       |
| Custom MCP server                 | Pi               | Tailscale Funnel or named tunnel | Yes with health checks, _inf._    | [Funnel]                     |
| One reading a minute to a sheet   | Pi or phone app  | HTTPS → Apps Script `doPost`     | Yes, _inf._                       | [Apps Script triggers]       |
| Readings to Postgres              | Pi or phone app  | HTTPS → Supabase REST            | Yes; keeps project awake          | [Supabase pausing FAQ]       |
| Ambient sound level               | Phone            | Sensor Logger loudness           | Recording session, background     | [Sensor Logger README]       |

## Real versus simulated data

The repo rule says: "Use real public data, such as live public APIs or published datasets, never demo, mock, placeholder, seed, or sample data, even temporarily. If the source fails, show the error, with no fallback, cached copy, or default value. If no public source fits, ask the user." It adds that "test doubles in tests are fine" ([project conventions](/docs/references/project-conventions.md)). The hackathon's own rules say nothing about data provenance ([brief](/docs/BRIEF.md)).

How the rule's wording maps onto each case. The cases the wording left open were decided by the user on 3 November 2026. On 4 November 2026 the user also allowed mock GPS, which the wording forbids outside tests. [Context](/docs/CONTEXT.md#decisions-so-far) records the rulings.

| Case                                                   | Data is real? | Wording that applies                     | Status                                        |
| ------------------------------------------------------ | ------------- | ---------------------------------------- | --------------------------------------------- |
| Live public sensor feed through the pipeline           | Yes           | "live public APIs"                       | Covered: allowed                              |
| Synthetic or random readings in the app                | No            | "never demo, mock ... sample data"       | Covered: forbidden                            |
| Recorded or synthetic readings in automated tests only | Either        | "test doubles in tests are fine"         | Covered: allowed                              |
| Recorded data shown when the live source fails         | Yes           | "no fallback, cached copy"               | Covered: forbidden                            |
| Live readings from the team's own phone or board       | Yes           | Real, but not a "public" source          | Decided: allowed                              |
| Published real dataset replayed as if streaming        | Yes           | "published datasets"; replay shifts time | Decided: allowed                              |
| Team-recorded real sensor log, replayed                | Yes           | Not public unless the team publishes it  | Decided: allowed if published with provenance |
| Video of the live system, labelled with capture date   | Yes           | Rule doesn't address videos              | Decided: allowed                              |
| Video that stands in for live access                   | Yes           | Rule doesn't address videos              | Decided: forbidden                            |
| Mock GPS positions in tests and the recorded demo      | No            | "never demo, mock"                       | Decided: allowed, no label needed             |

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
- **Evidence:** with nothing added, the Pi 5 reads its own supply voltage, undervoltage, throttling, and temperature, scans nearby access points and BLE advertisers, and can host a Globalping or RIPE Atlas probe from a home connection. **Inference:** the Pi's strongest real signals are about the network and its own power, not the room: home-broadband latency and outages, and a public measurement vantage point in Malaysia.
- **Evidence:** the Pi 5's Wi-Fi has no monitor mode on Raspberry Pi OS, and phones rotate BLE addresses every 5–15 minutes. **Inference:** don't promise people counting or crowd density; a BLE count is a device-activity index at best.
- **Evidence:** HA Companion on Android reports every minute while charging; iOS has no interval trigger and throttles background apps. **Inference:** Android phones on chargers are the time-series sensors; iPhones contribute events (charger, battery level, Wi-Fi join, arrive and leave) and fixed-time readings.
- **Evidence:** Doze stops background work on unplugged phones, and dontkillmyapp scores Samsung and Xiaomi among the worst. **Inference:** set up each phone with battery optimisation off and vendor sleep options disabled, keep it plugged in, and report HA's `doze` and `app_standby_bucket` sensors so a silenced phone shows up as data.
- **Evidence:** on the CPU, whisper base encodes a 30-second window in about 2.5 seconds, Llama 3.2 3B generates 4.6 tokens a second, and YOLO26n takes 67 ms a frame, mostly on cooled or unstated setups; a bare board throttles under sustained load. **Inference:** edge AI on the Pi works for bursts that turn raw audio or video into events locally, so raw media never leaves the home; leave reasoning to Gemini.
- **Evidence:** Quick Tunnels drop SSE and change hostname on every start; Tailscale Funnel gives a stable `ts.net` hostname with a Let's Encrypt certificate on the free plan; ngrok Free allows 20,000 requests a month. **Inference:** Funnel is the no-card, no-domain way to put a Pi-hosted MCP server in front of Gemini Enterprise, if the organisers have lifted the custom MCP policy.
- **Evidence:** MCP revision 2026-07-28 removed sessions and the GET stream, and Gemini Enterprise doesn't say which revision it speaks. **Inference:** answer with plain JSON and support both styles.
- **Evidence:** `doPost` isn't subject to the trigger restrictions, Apps Script redirects responses, and a sheet holds 20 million cells. **Inference:** one reading a minute from the Pi into a sheet fits easily; clients must follow redirects.
- **Evidence:** Globalping's public API reads measurements only by ID, while the Gemini Enterprise connector "searches your measurements". **Inference:** test the Globalping connector against the team's own measurements before building on it.
- **Evidence:** systemd stops restarting after 5 starts in 10 seconds by default, NetworkManager stops autoconnecting after 4 tries by default, and power dropouts corrupt SD cards. **Inference:** before 10 November, set `Restart=always` with `StartLimitIntervalSec=0`, a hardware watchdog, Wi-Fi power saving off with unlimited retries (or Ethernet), the 27 W supply, Tailscale SSH for every teammate, frozen updates, and data sent off the Pi as it's read.
- **Decided (3 November 2026):** team-owned live sensors, replayed published datasets, team-recorded logs published with provenance, and a labelled video recorded from the live system are allowed; a video that stands in for live access is not ([Real versus simulated data](#real-versus-simulated-data)).

## Not verified

- Gemini Enterprise: which MCP revision its client speaks, and how its Globalping connector lists "your" measurements.
- Whether the Cloudflare Free plan, Supabase Free, or a RIPE Atlas account asks for a payment card; RIPE Atlas software-probe approval time.
- Tailscale Funnel's bandwidth limits and official streaming behaviour; Workers VPC with `workers.dev` as an MCP front.
- Malaysian home ISPs' use of carrier-grade NAT (only 2021 press found), and so whether a home Globalping probe shares its IPv4 with another.
- Gemma 3 1B and 4B on a Pi 5 with a stated method; whisper.cpp Pi 5 results newer than 2023; cooling in most benchmarks.
- Apple's documented outputs of Get Network Details, Get Battery Level, and Get Current Location; whether Shortcuts can POST to a plain-HTTP LAN address; a reported iOS 26 change to significant-location relaunches (forum thread not opened).
- MacroDroid's HTTP request action on a MacroDroid page; IP Webcam's stream URLs; Moonshine's Malay support.
- Whether BlueZ discovery reports BLE advertisers that don't set the discoverable flag, which decides how many phones and wearables a Pi scan sees.
- Raspberry Pi engineers' own statement on Pi 5 monitor mode; whether Raspberry Pi OS enables `unattended-upgrades` by default; running Home Assistant in Docker alongside other Pi services.
- **Whether iOS runs Toggle Alarm unattended inside a Run Immediately automation:** no page I opened says so (the community guide covers deletion, and Apple's page lists only the action names).
- **Android background launch limits** for alarm intents on recent Android versions, and iOS 26 or 27 behaviour for any alarm action: not opened.
- **Whether `X-Forwarded-For` carries a real mobile-network address in a live Funnel request:** the source says so; a live test was not run.

## See also

- [Brief](/docs/BRIEF.md): theme, tracks, dates, and submission format.
- [Google tools](/docs/research/google-cloud.md): Google AI and Cloud products, free tiers, credits, and [which services need a card](/docs/research/google-cloud.md#paths-that-need-no-payment-card).
- [Gemini Enterprise](/docs/research/gemini-enterprise.md): triggers, approvals, connectors, custom MCP, and live-data paths.
- [Public data sources](/docs/research/data-sources.md): live public sensor feeds and datasets per track.
- [Judging and pitching](/docs/research/judging.md): rubrics, async packaging, and privacy.
- [Past winners](/docs/research/winners.md): comparable IoT hackathon projects.
- [Context](/docs/CONTEXT.md#decisions-so-far): which kinds of device data the real-data rule allows.
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
[HA on Raspberry Pi]: https://www.home-assistant.io/installation/raspberrypi
[HA sensors]: https://companion.home-assistant.io/docs/core/sensors
[HA FAQ]: https://companion.home-assistant.io/docs/troubleshooting/faqs
[Termux README]: https://github.com/termux/termux-app#readme
[Android Wi-Fi scanning]: https://developer.android.com/develop/connectivity/wifi/wifi-scan
[OwnTracks location]: https://owntracks.org/booklet/features/location/
[OwnTracks JSON]: https://owntracks.org/booklet/tech/json/
[Sensor Logger README]: https://github.com/tszheichoi/awesome-sensor-logger#readme
[phyphox remote]: https://phyphox.org/docs/remote-interface/
[Shortcuts setting triggers]: https://support.apple.com/guide/shortcuts/setting-triggers-apde31e9638b/9.0/ios/26
[dontkillmyapp]: https://dontkillmyapp.com/
[BatteryManager BCD]: https://github.com/mdn/browser-compat-data/blob/main/api/BatteryManager.json
[Pi 5 launch]: https://www.raspberrypi.com/news/introducing-raspberry-pi-5/
[Pi 5 brief]: https://datasheets.raspberrypi.com/rpi5/raspberry-pi-5-product-brief.pdf
[nexmon]: https://github.com/seemoo-lab/nexmon
[llama.cpp on Arm]: https://github.com/ggml-org/llama.cpp/discussions/30069
[iw docs]: https://wireless.docs.kernel.org/en/latest/en/users/documentation/iw.html
[Core 6.1 GAP]: https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core-61/out/en/host/generic-access-profile.html
[Pi power supplies]: https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/raspberry-pi/power-supplies.adoc
[vcgencmd]: https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/os/graphics-utilities.adoc
[config reference]: https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/configuration/reference.adoc
[EEPROM config]: https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/raspberry-pi/eeprom-bootloader.adoc
[whisper.cpp Pi 5 bench]: https://github.com/ggml-org/whisper.cpp/issues/89#issuecomment-1791848356
[Geerling Pi 5 8 GB]: https://github.com/geerlingguy/ai-benchmarks/issues/1
[Ultralytics Pi guide]: https://docs.ultralytics.com/guides/raspberry-pi/
[Globalping probe]: https://github.com/jsdelivr/globalping-probe
[RIPE Atlas probe]: https://github.com/RIPE-NCC/ripe-atlas-software-probe
[SmokePing install]: https://oss.oetiker.ch/smokeping/doc/smokeping_install.en.html
[Quick Tunnels]: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
[Funnel]: https://tailscale.com/kb/1223/funnel
[Tailscale pricing]: https://tailscale.com/pricing
[Funnel reconnect issue]: https://github.com/tailscale/tailscale/issues/21114
[Apps Script triggers]: https://developers.google.com/apps-script/guides/triggers
[Supabase pausing FAQ]: https://supabase.com/kb/faqs/platform/free-project-pausing
[systemd.unit]: https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html
[resilient file system]: https://pip.raspberrypi.com/documents/RP-003610-WP
[gh_disable]: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows
[ts_headers]: https://tailscale.com/s/serve-headers
[ts_serve]: https://github.com/tailscale/tailscale/blob/e19eb275ea21790aac94be1a5eddcd20ebb40a35/ipn/ipnlocal/serve.go
[android_alarm]: https://developer.android.com/reference/android/provider/AlarmClock
[tasker]: https://tasker.joaoapps.com/userguide/en/help/ah_set_alarm.html
[automate]: https://llamalab.com/automate/doc/block/alarm_add.html
[ios_new]: https://support.apple.com/en-us/101583
[ha_alarm]: https://community.home-assistant.io/t/sync-home-assistant-alarm-clock-to-iphone-alarms-using-shortcuts-ios-18/805595
