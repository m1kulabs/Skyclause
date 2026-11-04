# Phones and Raspberry Pi 5

What the team's only devices, Android phones, iPhones, and one Raspberry Pi 5 (8 GB) at a team member's home with no add-on sensors, can really sense, run, and serve with nobody at APU, and how their readings reach Gemini Enterprise without a payment card. It adds to [IoT and network](/docs/research/iot-and-network.md) (browser sensor APIs, boards, protocols, brokers) and [Gemini Enterprise](/docs/research/gemini-enterprise.md) (connectors, custom MCP, live-data paths), and links to them rather than repeating them. Researched on 5 November 2026 from vendor docs, specs, official repos, and benchmarks that state their method; **Inference** marks conclusions no source states outright.

Contents:

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
1.  [Capability matrix](#capability-matrix)
1.  [Takeaways for this hackathon](#takeaways-for-this-hackathon)
1.  [Not verified](#not-verified)
1.  [See also](#see-also)

## Phones beyond the browser

Browser sensor support is tabulated in [IoT and network](/docs/research/iot-and-network.md#phone-and-laptop-sensors-in-the-browser). Everything below is an existing app from Google Play, the App Store, or F-Droid, so the team writes no native app.

### Home Assistant Companion app

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

### Android automation apps and Termux

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

### Location and sensor-streaming apps

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

### iOS Shortcuts personal automations

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

### Android background limits

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

### Web pages and PWAs left running

Support data is from MDN's browser-compat-data on 5 November 2026.

- **Hidden tabs:** after a page "has been hidden for more than 5 minutes", Chrome checks its chained timers "once per minute" ([timer throttling]); browsers may also "suspend pages or discard them entirely" ([page lifecycle]).
- **Periodic Background Sync:** only after the app is installed and launched as an app, and "a periodicsync event won't be fired at all unless the engagement score is greater than zero" ([periodic sync]). Chrome 80+ only; not Firefox, Safari, or Android WebView ([PeriodicSyncManager BCD]). One-off Background Sync is Chrome 49+ only ([SyncManager BCD]).
- **Screen Wake Lock:** Chrome 84, Firefox 126, Safari 16.4; on iOS, home-screen web apps get it only from 18.4 ([WakeLock BCD]).
- **Battery Status API** (`navigator.getBattery()`): Chrome 38+ including Android and WebView; Firefox removed it in version 52; Safari has never shipped it, so iPhones can't read battery from a page ([BatteryManager BCD]).
- **Web push on iOS:** home-screen web apps since iOS 16.4, with permission asked "in response to direct user interaction" ([iOS web push]).
- **Inference:** a page only keeps reporting while it is visible: a phone on a charger with the page in front and a wake lock held. Locking the screen, switching apps, or an OS update stops it.

[timer throttling]: https://developer.chrome.com/blog/timer-throttling-in-chrome-88
[page lifecycle]: https://developer.chrome.com/docs/web-platform/page-lifecycle-api
[periodic sync]: https://developer.chrome.com/docs/capabilities/periodic-background-sync
[PeriodicSyncManager BCD]: https://github.com/mdn/browser-compat-data/blob/main/api/PeriodicSyncManager.json
[SyncManager BCD]: https://github.com/mdn/browser-compat-data/blob/main/api/SyncManager.json
[WakeLock BCD]: https://github.com/mdn/browser-compat-data/blob/main/api/WakeLock.json
[iOS web push]: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/

### Which phone setups survive for days

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

## Pi 5 as a sensor

### Wi-Fi radio and monitor mode

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

### BLE advertisement scanning

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

### Power, undervoltage, and the RTC

- **Supply:** Raspberry Pi recommends its 27 W USB-C supply; the Pi 5 wants 5 A, and on a 3 A supply USB peripherals are limited to 600 mA instead of 1.6 A ([Pi power supplies]).
- **Undervoltage:** detected "if the supply voltage drops below 4.63 V (±5%)", which adds a kernel log entry ([Pi power supplies]).
- **`vcgencmd get_throttled`** ([vcgencmd]): bits 0–3 are current state (undervoltage, Arm frequency capped, throttled, soft temperature limit); bits 16–19 mean the same has occurred since boot. For example, `0x50000` means undervoltage and throttling have occurred.
- **`vcgencmd pmic_read_adc`:** on Pi 5, the current and voltage of each PMIC rail plus the supply voltage `EXT5V_V`; "These readings don't include USB current" ([vcgencmd]).
- **Temperature:** `vcgencmd measure_temp` returns the SoC temperature and `measure_temp pmic` the PMIC's ([vcgencmd]).
- **Reset reason:** the device tree's `power_reset` field ("Raspberry Pi 5 only") has bits for over voltage, under voltage, over temperature, enable signal, and watchdog ([config reference]); there is no "power removed" reason.
- **Power returning:** "When you plug your Raspberry Pi into power for the first time, it will automatically turn on" ([power button]). `WAIT_FOR_POWER_BUTTON` defaults to `0`, and only if it and `POWER_OFF_ON_HALT` are both `1` does it wait for the button "instead of booting immediately after power-loss" ([EEPROM config]).
- **RTC:** the Pi 5 "includes an RTC module", which "can be battery powered through the J5 (BAT) connector"; it "is still usable even when there's no backup battery attached", and battery charging "is disabled by default" ([Pi RTC]). The official battery is a rechargeable ML2020 ([RTC battery]), which gate G3 rules out buying.
- **Inference:** the Pi can't observe a home power cut while it happens. After it reboots, the gap between the previous boot's last journal entry and the new boot, plus `power_reset`, tells an outage from a watchdog or undervoltage reset. Without an RTC battery the clock is wrong until network time syncs, so readings shouldn't be stamped before that.

[power button]: https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/raspberry-pi/power-button.adoc
[Pi RTC]: https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/raspberry-pi/rtc.adoc
[RTC battery]: https://www.raspberrypi.com/products/rtc-battery/

### Temperature and throttling

- **Thresholds:** "When the core temperature is between 80°C and 85°C, the Arm cores will be progressively throttled back. If the temperature reaches 85°C, both the Arm cores and the GPU will be throttled back"; "heatsinks are not necessary to prevent overheating damage" ([frequency management]).
- **Raspberry Pi's measurements** (4 October 2023, `stress --cpu 4`, open air on a lab bench, ambient not stated): a bare board idles "around 65°C" and under load "climbs to and then remains stable just above the 85°C thermal limit", throttling from 2.4 GHz to 1.5 GHz; with the Active Cooler it settles near 60°C; with only its heatsink it throttles after about 200 seconds ([Pi 5 cooling]).
- **Their advice:** "For normal use adding cooling is optional", but "passive cooling is probably going to be insufficient thermal management for heavy loads" ([Pi 5 cooling]). The rated ambient operating range is 0–70°C ([Pi 5 brief]).
- **Inference:** a Malaysian room is warmer than a lab bench, so any sustained four-core job will run throttled. The SoC temperature tracks load more than room temperature, so it isn't a room thermometer; logging it with `get_throttled` shows throttling as data.

[frequency management]: https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/raspberry-pi/frequency-management.adoc
[Pi 5 cooling]: https://www.raspberrypi.com/news/heating-and-cooling-raspberry-pi-5/

### Microphone and camera

- **USB microphone (only if already owned):** `arecord -l` lists capture devices, and `--max-file-time 3600 --use-strftime` writes a new file every hour ([arecord]).
- **USB webcam (only if already owned):** Raspberry Pi documents `fswebcam` for still images ([Pi webcams]). The board's two MIPI connectors need a camera module ([Pi 5 brief]).
- **A phone as the Pi's camera and mic:** the Android app IP Webcam streams video "inside WiFi network without internet access" to VLC or a browser, with audio in wav, opus, and AAC, motion detection, and sensor data ([IP Webcam]); its stream URLs aren't in a primary doc, so read them from the app. phyphox exposes a phone's sensors to the Pi the same way while in front ([phyphox remote]).

[arecord]: https://github.com/alsa-project/alsa-utils/blob/master/aplay/aplay.1
[Pi webcams]: https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/accessories/camera/webcams.adoc
[IP Webcam]: https://play.google.com/store/apps/details?id=com.pas.webcam&hl=en

## Pi 5 as an edge computer

The CPU is a "2.4GHz quad-core 64-bit Arm Cortex-A76" with LPDDR4X-4267 memory ([Pi 5 brief]), "2–3×" a Pi 4 ([Pi 5 launch]). Most benchmarks below don't state cooling; with no fan (gate G3), treat them as upper bounds. Raspberry Pi's Hailo NPU boards, the AI HAT+ and AI HAT+ 2, must be bought ([Pi AI accessories]).

[Pi AI accessories]: https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/ai/getting-started.adoc

### Speech to text

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

### Small language models

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

### Object detection

- Ultralytics' Raspberry Pi guide now benchmarks YOLO26 "on a Raspberry Pi 5 at FP32 precision with the default input image size of 640", CPU only, cooling not stated, Ultralytics 8.4.108 ([Ultralytics Pi guide]).
- YOLO26n per image: NCNN 67 ms, MNN 92 ms, OpenVINO 105 ms, LiteRT 123 ms, ONNX 126 ms, PyTorch 299 ms; YOLO26s on NCNN 173 ms. The only remaining YOLO11n figure is ONNX at 147 ms. "NCNN delivers the best inference performance on Raspberry Pi devices" ([Ultralytics Pi guide]).
- **Inference:** about 15 frames a second of model time for YOLO26n, ample for a frame every few seconds from a USB webcam or a phone stream, which is the only camera available.

### Memory and heat budget

- **Inference:** 8 GB holds the OS, a 1–4B model at Q4, whisper small, and YOLO26n at once, but they share the same four cores and roughly 10 GB/s of memory bandwidth, so running them together slows each.
- **Inference:** with no fan, short bursts (transcribe a clip, classify a frame, summarise a log) suit the Pi; continuous inference sits at the 80–85°C throttle point ([Temperature and throttling](#temperature-and-throttling)). Heavy reasoning belongs to Gemini in the cloud.

## Pi 5 as a network probe or server

### Globalping probe

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

### RIPE Atlas software probe

- Binary packages exist for the "`arm64` variant of Raspberry Pi OS 12 / 13"; the probe's public key is registered at `atlas.ripe.net/register/swprobe`; it uses TCP ports 2023 and 8080 internally; since release 5080 it no longer auto-updates ([RIPE Atlas probe]).
- "software probes can only be set up as 'public probes'" ([RIPE Atlas software probes]). A connected probe earns 15 credits a minute, "roughly 21,600 credits every 24 hours", and new users can claim 50,000 credits once ([RIPE Atlas credits]). Results are fetched with "No authentication required" ([RIPE Atlas results API]).
- **Inference:** Gemini Enterprise has no RIPE Atlas connector, so its results need their own path (a sheet, Supabase, or MCP). The approval time after registering wasn't verified.

[RIPE Atlas software probes]: https://atlas.ripe.net/docs/howtos/software-probes/
[RIPE Atlas credits]: https://atlas.ripe.net/docs/getting-started/credits.html
[RIPE Atlas results API]: https://atlas.ripe.net/docs/apis/rest-api-reference/measurements/measurements_results/

### Latency logging

- SmokePing "does not stand alone": it needs RRDtool and FPing, with "fping must be installed setuid root" ([SmokePing install]); Debian packages it for bookworm and trixie ([SmokePing in Debian]).
- **Inference:** SmokePing keeps its graphs on the Pi behind a web server. A systemd timer that runs `ping` against the home router and public targets each minute and posts the results to a sheet or Supabase puts the same data where a connector can read it, and separates "home Wi-Fi down" from "ISP down".

[SmokePing in Debian]: https://qa.debian.org/madison.php?package=smokeping&text=on

### Public HTTPS without a card

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

### Fit with Gemini Enterprise custom MCP

- **Requirements:** Streamable HTTP only, a URL with "a TLS certificate signed by a publicly trusted Certificate Authority", OAuth 2.0 or no auth, and an organisation policy that blocks MCP data stores by default ([Gemini Enterprise](/docs/research/gemini-enterprise.md#requirements-and-registration)).
- **The current MCP revision, 2026-07-28,** "changed the behavior of Streamable HTTP": it removed the GET stream endpoint and protocol-level sessions. Every message is a POST; for a request the server "MUST return either `Content-Type: application/json` ... or `Content-Type: text/event-stream`"; every POST carries an `MCP-Protocol-Version` header, and `Mcp-Method` and `Mcp-Name` headers are "REQUIRED for compliance"; servers "SHOULD include the `X-Accel-Buffering: no` header" on SSE ([Streamable HTTP 2026-07-28]). Revisions 2025-03-26 to 2025-11-25 used an `Mcp-Session-Id` header, a GET stream, and `Last-Event-ID` resumption ([Streamable HTTP 2025-11-25]).
- **Not documented:** which MCP revision Gemini Enterprise's client speaks.
- **Inference:** a Pi MCP server that answers every call with `application/json` within a few seconds, and accepts both the old session-based and the new header-based clients, passes cleanly through a named Cloudflare tunnel, Tailscale Funnel, or ngrok. A Quick Tunnel's new hostname on every restart breaks the registered URL. Of the no-card, no-domain options, Funnel gives the stable hostname and trusted certificate the store needs; it is still behind the custom MCP preview and its organisation policy.
- **Inference:** a no-auth MCP URL is open to anyone who finds it, and Funnel names appear in public certificate logs, so expose only read-only tools or use OAuth.

[Streamable HTTP 2026-07-28]: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
[Streamable HTTP 2025-11-25]: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports

## Phone, Pi, and cloud paths

### Phone to Pi on the home network

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

### Pi to Apps Script and Sheets

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

### Pi to Supabase Free

- **Writes:** PostgREST at `https://<project_ref>.supabase.co/rest/v1/` ([Supabase REST]). "Supabase is deprecating the anon and service_role keys by the end of 2026", so devices use the publishable key (`sb_publishable_...`), which "only reaches what Row Level Security allows" ([Supabase keys]); "Enable RLS on every table" and add an insert policy `with check` ([Supabase RLS]).
- **Pausing:** "If a Free project gets too little database activity over a week, Supabase pauses it", and "sending real requests from your app" counts as activity ([Supabase pausing FAQ]); a warning email comes about a week before, and a paused project can be restored for a year ([Supabase pausing]). The Free plan includes "Unlimited API requests" ([Supabase pricing]).
- Whether sign-up asks for a card wasn't verified.

[Supabase REST]: https://supabase.com/docs/guides/api
[Supabase keys]: https://supabase.com/docs/guides/api/api-keys
[Supabase RLS]: https://supabase.com/docs/guides/database/postgres/row-level-security
[Supabase pausing]: https://supabase.com/docs/guides/platform/free-project-pausing
[Supabase pricing]: https://supabase.com/pricing

### Where each path enters Gemini Enterprise

Connector stages and blockers are in [Gemini Enterprise](/docs/research/gemini-enterprise.md#comparison-of-live-data-paths).

- **Sheet:** Drive connector and Sheets actions (GA), Workspace accounts only.
- **Supabase:** Supabase connector (preview), with an Execute SQL action.
- **Globalping:** Globalping connector (preview), read-only, for measurements made under the team's account, including from its own adopted probe.
- **Pi-hosted MCP:** custom MCP data store (preview, organisation policy) through a tunnel ([Fit with Gemini Enterprise custom MCP](#fit-with-gemini-enterprise-custom-mcp)).
- **Starting a workflow:** workflows have no webhook trigger; event triggers poll Drive, Gmail, Calendar, and other connectors every 5–10 minutes ([Gemini Enterprise](/docs/research/gemini-enterprise.md#triggers-and-schedules)). **Inference:** a Pi alert can start one by having `doPost` create a Drive file or send a Gmail message.

## Keeping it alive unattended

### Services and watchdogs

- **Restart:** `Restart=` defaults to `no` ([systemd.service]); units that hit the start limit "are not attempted to be restarted anymore" ([systemd.unit]), and the default limit is 5 starts in 10 seconds ([systemd-system.conf]). Setting `StartLimitIntervalSec=0` disables the limit ([systemd.unit]).
- **Service watchdog:** with `WatchdogSec=`, a service that stops sending `WATCHDOG=1` is "terminated with SIGABRT" and restarted under `Restart=always` or `on-watchdog` ([systemd.service]).
- **Hardware watchdog:** a non-zero `RuntimeWatchdogSec=` programs `/dev/watchdog0` "to automatically reboot the system if it is not contacted within the specified timeout" ([systemd-system.conf]). **Inference** from the Pi kernel's `bcm2835_wdt` driver constants: the hardware maximum is about 15 seconds, so use about 10 ([bcm2835_wdt]).
- **Containers:** Globalping's documented command uses Docker's `--restart=always` ([Globalping probe]).

[systemd.service]: https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html
[systemd-system.conf]: https://www.freedesktop.org/software/systemd/man/latest/systemd-system.conf.html
[bcm2835_wdt]: https://github.com/raspberrypi/linux/blob/rpi-6.12.y/drivers/watchdog/bcm2835_wdt.c

### Network and remote access

- **Wi-Fi:** NetworkManager's `802-11-wireless.powersave` value `2` disables power saving, and `connection.autoconnect-retries` "Zero means forever" (default 4) ([nmcli settings]). Home Assistant calls Ethernet "more reliable and highly recommended" ([HA on Raspberry Pi]).
- **Raspberry Pi Connect:** screen sharing and a remote shell, through a relay when no direct connection is possible; the personal account is free but "provides a single user" ([Pi Connect]).
- **Tailscale SSH:** "available for all plans" ([Tailscale SSH]), so all teammates on a free Personal tailnet (up to 6 users, [Tailscale pricing]) can reach the Pi and the phones.

[nmcli settings]: https://networkmanager.dev/docs/api/latest/nm-settings-nmcli.html
[Pi Connect]: https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/services/connect/introduction.adoc
[Tailscale SSH]: https://tailscale.com/kb/1193/tailscale-ssh

### Power cuts and SD cards

- **Reboot:** a Pi 5 on default EEPROM settings boots by itself when power returns ([EEPROM config]).
- **Corruption:** Raspberry Pi's white paper says "power dropouts can cause storage corruption", that SD flash "has a limited write cycle lifetime", and that failure "is usually indicated by random file corruptions"; it gives a `Storage=volatile` journald drop-in and warns that it "discards all logs on reboot" ([resilient file system], [journald.conf]).
- **Overlay file system:** `raspi-config` → Performance Options → Overlay File System makes changes "lost when your Raspberry Pi reboots or powers off" ([overlay file system]). **Inference:** with it on, buffered readings and logs vanish on a power cut, so send data off the Pi promptly.

[journald.conf]: https://www.freedesktop.org/software/systemd/man/latest/journald.conf.html
[overlay file system]: https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/configuration/performance.adoc

### Updates during the event

- `unattended-upgrades` upstream defaults cover Debian origins and leave `Automatic-Reboot` "false" ([unattended-upgrades defaults]); Raspberry Pi says `rpi-update` "is only appropriate for developers and testers" ([Pi updating]).
- **Inference:** an upgrade can still restart a service mid-assessment; freeze updates from 10 to 14 November. Whether Raspberry Pi OS enables `unattended-upgrades` by default wasn't checked.

[unattended-upgrades defaults]: https://github.com/mvo5/unattended-upgrades/blob/master/data/50unattended-upgrades.Debian
[Pi updating]: https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/os/updating.adoc

### What kills home deployments

In the maintainers' own words:

- **Power:** "Low quality power supplies can corrupt storage or cause unpredictable behaviour" ([Pi power supplies]); "Mobile chargers may not be suitable" and computer USB ports "must not be used" ([HA on Raspberry Pi]).
- **Storage:** "power dropouts can cause storage corruption" ([resilient file system]).
- **Restart loops:** units that reach the start limit "are not attempted to be restarted anymore" ([systemd.unit]).
- **Phones:** "No location history is usually caused by limited background access for the Home Assistant app, or the Android system killing the app" ([HA FAQ]); vendors "prefer battery life over proper functionality of your apps" ([dontkillmyapp]); "Android OS will kill any (phantom) processes greater than 32" ([Termux README]); iOS background updates are "heavily throttled" ([HA FAQ]).
- **Tunnels:** "Quick Tunnels have no uptime guarantee" ([Quick Tunnels]); Funnel can stop "after control-plane reconnect until tailscaled restart" (user report, [Funnel reconnect issue]).
- **Agent credentials:** scheduled Gemini Enterprise workflows run on credentials that "expire every 14 days" ([Gemini Enterprise](/docs/research/gemini-enterprise.md#what-runs-without-anyone-signed-in)).

## Capability matrix

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

## Takeaways for this hackathon

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

## See also

- [IoT and network](/docs/research/iot-and-network.md): browser sensor APIs, boards, protocols, MQTT brokers, and what a judge can see of the network.
- [Gemini Enterprise](/docs/research/gemini-enterprise.md): triggers, approvals, connectors, custom MCP, and live-data paths.
- [Google Cloud](/docs/research/google-cloud.md#paths-that-need-no-payment-card): which Google services need a card.
- [Context](/docs/CONTEXT.md#decisions-so-far): which kinds of device data the real-data rule allows.
- [Project conventions](/docs/references/project-conventions.md): the real-data rule.

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
