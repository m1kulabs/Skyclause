# Public data sources

Which real, public, currently live datasets and APIs could power a prototype in each of the three tracks, with relevance to APU at Technology Park Malaysia (TPM), Bukit Jalil, Kuala Lumpur. A source is marked live only if a real request returned current data on 3 November 2026 (10:13–10:50 MYT), or on 5 November 2026 (22:20–22:41 MYT) for Google Maps Platform, BigQuery, OpenAQ, WAQI, and Semantic Scholar; raw responses are kept outside the repo. Researched on 3 November 2026 and rechecked on 5 November 2026. APU's own timetable feed and public documents are in [APU's public documents, data, and systems](/docs/research/apu.md#apspace-timetable-feed).

Contents:

1.  [How to read this catalogue](#how-to-read-this-catalogue)
    1.  [Shared notes on the data.gov.my API](#shared-notes-on-the-datagovmy-api)
1.  [Smart Campus & Student Experience](#smart-campus--student-experience)
    1.  [Bus and train positions (GTFS Realtime)](#bus-and-train-positions-gtfs-realtime)
    1.  [Routes and stops near APU (GTFS Static)](#routes-and-stops-near-apu-gtfs-static)
    1.  [OpenStreetMap via Overpass](#openstreetmap-via-overpass)
    1.  [Google Maps Platform](#google-maps-platform)
    1.  [Weather forecasts for campus](#weather-forecasts-for-campus)
    1.  [APU's own public information](#apus-own-public-information)
1.  [Intelligent Automation & Digital Transformation](#intelligent-automation--digital-transformation)
    1.  [MET Malaysia warnings](#met-malaysia-warnings)
    1.  [River level at LRT Bukit Jalil (Public Infobanjir)](#river-level-at-lrt-bukit-jalil-public-infobanjir)
    1.  [DOE APIMS air pollutant index](#doe-apims-air-pollutant-index)
    1.  [Other air-quality feeds](#other-air-quality-feeds)
    1.  [Open-Meteo air-quality and flood models](#open-meteo-air-quality-and-flood-models)
1.  [Data-Driven Research & Intelligent Decision Making](#data-driven-research--intelligent-decision-making)
    1.  [Rapid Rail origin-destination ridership](#rapid-rail-origin-destination-ridership)
    1.  [data.gov.my catalogue and OpenDOSM](#datagovmy-catalogue-and-opendosm)
    1.  [Higher-education statistics (MOHE)](#higher-education-statistics-mohe)
    1.  [OpenAlex](#openalex)
    1.  [Crossref, Semantic Scholar, and arXiv](#crossref-semantic-scholar-and-arxiv)
    1.  [BigQuery public datasets](#bigquery-public-datasets)
    1.  [Earth Engine](#earth-engine)
1.  [Top picks](#top-picks)
1.  [Takeaways for this hackathon](#takeaways-for-this-hackathon)
1.  [See also](#see-also)

## How to read this catalogue

- **Status:** "Live" means a request on the check date returned data stamped that day. "Key needed" means the endpoint answered but refused without a key.
- **Sensor feed:** yes when the values come from physical sensors or transponders and refresh at least hourly. Models, forecasts, and daily aggregates count as no.
- **APU reference point:** the OpenStreetMap campus polygon, [way 944352525][osm_apu_way], centred at 3.0559, 101.6997. All distances below are straight-line from that point.
- Each source is filed under the track it fits best; most also serve the other two.

### Shared notes on the data.gov.my API

These apply to every data.gov.my endpoint below (GTFS, weather, data catalogue, OpenDOSM).

- **Auth:** none. "The Open API does not require an API token" ([rate limit page][dgm_rate]).
- **Rate limit:** 4 requests per minute for each API (Data Catalogue, OpenDOSM, Weather, GTFS Static, GTFS Realtime); excess requests get `429 Too Many Requests` ([rate limit page][dgm_rate]). Responses carried no rate-limit headers, and none of my roughly 20 requests got a 429.
- **Licence:** CC BY 4.0 for the platform's data ([FAQ][dgm_faq]), restated on the GTFS and weather pages. [CC BY 4.0][cc_by] permits commercial use with attribution.
- **Gotcha:** paths without a trailing slash return `301` with an HTML body (e.g. `/gtfs-realtime/vehicle-position/ktmb` → `/ktmb/`); use `curl -L` or add the slash.

## Smart Campus & Student Experience

### Bus and train positions (GTFS Realtime)

- **Offers:** live vehicle positions for Rapid Bus KL, Rapid Bus MRT feeder, Rapid Penang, KTMB, and BAS.MY buses in nine cities. Only vehicle positions so far: trip updates and service alerts are "in our pipeline for 2026", and `rapid-rail-kl` "does not yet have stable realtime feeds" ([GTFS Realtime docs][dgm_gtfsr]).
- **Access:** `https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana/?category=rapid-bus-kl` (also `rapid-bus-mrtfeeder`, `rapid-bus-penang`) and `.../vehicle-position/ktmb/`. No key; 4 requests per minute.
- **Terms:** CC BY 4.0 ([GTFS Realtime docs][dgm_gtfsr]).
- **Updates and sensor:** every 30 seconds ([GTFS Realtime docs][dgm_gtfsr]). Sensor feed: yes, GPS transponders on vehicles.
- **Live, 10:13 MYT:** GTFS-rt 2.0 protobuf `FeedMessage`; each entity carries `trip.route_id`, `trip.trip_id`, `vehicle.id` (the plate), `position` (lat, lon, speed), and a timestamp. Rapid Bus KL had 98 vehicles on 46 routes, MRT feeder 114 vehicles on 77 routes, KTMB 13 trains; header timestamps were about 12 seconds old. Decoding needs a GTFS-rt protobuf library (I used the `gtfs-realtime-bindings` Python package).
- The docs warn that bus GPS occasionally places vehicles outside the service area (validator error E028), and that Rapid Penang trip IDs need prefix matching against the static feed ([GTFS Realtime docs][dgm_gtfsr]).

### Routes and stops near APU (GTFS Static)

- **Offers:** GTFS ZIPs (agency, routes, trips, stops, stop_times, shapes, frequencies, calendar) for `rapid-rail-kl`, `rapid-bus-kl`, `rapid-bus-mrtfeeder`, `rapid-bus-penang`, KTMB, and BAS.MY ([GTFS Static docs][dgm_gtfss]).
- **Access:** `https://api.data.gov.my/gtfs-static/prasarana/?category=<category>` and `.../gtfs-static/ktmb/`. No key; 4 requests per minute.
- **Terms:** CC BY 4.0 ([GTFS Static docs][dgm_gtfss]).
- **Updates and sensor:** KTMB daily at 00:01; Prasarana and BAS.MY "as required"; the docs suggest refreshing daily at 4am ([GTFS Static docs][dgm_gtfss]). Sensor feed: no.
- **Live:** ZIP sizes were 79 KB (rail), 1.7 MB (Rapid Bus KL), 2.0 MB (MRT feeder), and 46 KB (KTMB). The rail calendar runs to 31 December 2026; the MRT feeder calendar runs 3 November – 6 December 2026.
- **APU relevance:** stop `SP17,BUKIT JALIL` (LRT Sri Petaling line) is about 880 m from campus. In the Rapid Bus KL feed, the only route serving stops within 500 m is `route_id` `T5800` (short name `T580`), "Stesen LRT Awan Besar ~ TPM via Stesen LRT Bukit Jalil", at `KL2009 TPM CARPARK` (about 360 m) and `KL1540 ASTRO TPM` (about 400 m). OpenStreetMap also maps a route relation "T563: MRT Serdang Raya Utara ↺ Bukit Jalil & TPM", but route `T563` did not appear in either downloaded bus feed.

### OpenStreetMap via Overpass

- **Offers:** OSM features (buildings, roads, stops, amenities) queried with Overpass QL; Nominatim does geocoding.
- **Access:** `https://overpass-api.de/api/interpreter` (POST `data=<query>`). No key. The main instance is fine below 10,000 queries and 1 GB per day ([Overpass API wiki][overpass_wiki]). OSMF tile and service policies require a valid identifying User-Agent and forbid bulk scraping of tiles ([tile usage policy][osmf_tiles]).
- **Terms:** ODbL. You must credit "OpenStreetMap contributors", and derived databases you distribute must stay under the same licence ([copyright page][osm_copyright]). Commercial use is allowed under those terms.
- **Updates and sensor:** continuous community edits; the `osm_base` timestamp in responses was within a minute of the request. Sensor feed: no.
- **Live, what exists at APU:** the campus polygon is tagged `amenity=university`, `short_name=APU`, `internet_access=yes`, with a Wikidata link. Inside it OSM has only one building (`building=university`, `building:levels=10`), six service roads, two lift gates, and a parking entrance. There are no named blocks, rooms, indoor mapping, or amenities. A bus stop named "Asia Pacific University" (node 11637406443) sits about 140 m from the centroid. The surrounding TPM box (3.045–3.065 N, 101.690–101.712 E) holds 842 named features, including 28 bus stops, 20 restaurants, 12 convenience shops, six cafés, LRT Bukit Jalil, and the IMU campus.
- **Caveats:** a Nominatim search for "Asia Pacific University of Technology and Innovation" returned a different OSM building, labelled "(FBM)", about 1.9 km away in Seri Kembangan, so look up by way ID instead. One regex `around` query timed out after 78 s; bounding-box queries finished in 33–51 s, so cache the results.

[osmf_tiles]: https://operations.osmfoundation.org/policies/tiles/
[osm_copyright]: https://www.openstreetmap.org/copyright

### Google Maps Platform

- **Offers:** Places, Routes, Maps, plus environment APIs. The Air Quality API covers Malaysia, using the DOE index (`mys_doe`) as the default local AQI ([Air Quality coverage][gaq_cov]). The Weather API covers Malaysia for current conditions, daily and hourly forecasts, and history, but not public alerts ([Weather coverage][gw_cov]).
- **Access:** API key on a Cloud project with billing. Pricing is pay-as-you-go per SKU, with 10,000 free calls a month per Essentials SKU, 5,000 per Pro SKU, and 1,000 per Enterprise SKU ([billing overview][gmp_billing]).
- **Terms:** Places content must not be pre-fetched, cached, or stored beyond the allowed exceptions (the `place_id` is exempt). Places results shown on a map must be on a Google Map, with Google attribution ([Places policies][places_policies]). Commercial use is the normal paid model.
- **Terms, Air Quality API:** checked on 5 November 2026 against the terms for billing accounts outside the EEA. Google Maps Content may not be cached "except as expressly permitted under the Maps Service Specific Terms" ([Terms of Service][gmp_tos]). Those terms, last modified 28 October 2026, let current conditions and hourly forecasts be cached for one hour, and historic values for a location and time range "until the Agreement is terminated". They also limit use to air-quality routing and "environmental risk indices and correlational research" ([Service Specific Terms][gmp_sst]). When the agreement ends, all content from the services must be deleted, and Google may end it for convenience on 30 days' notice ([Terms of Service][gmp_tos]).
- **Terms, Weather API:** checked on the same day against the same terms. Current conditions, hourly forecasts, and public alerts may be cached for one hour, daily forecasts for 24 hours, hourly history for 240 hours, and today's forecast for 30 days. The data must not recreate a Google product, such as a weather app whose primary purpose is weather information ([Service Specific Terms][gmp_sst]).
- **Terms, ledger evidence:** neither API's readings can be kept as append-only, indefinite ledger evidence (inference): Skyclause's `reading` table is append-only ([TRD entities and keys](/docs/TRD.md#entities-and-keys)) and kept for the life of the project ([PRD NFR-14](/docs/PRD.md#non-functional-requirements)). Only Air Quality history has no fixed expiry, and it too must be deleted when the Maps agreement ends.
- **Updates and sensor:** Air Quality values are hourly on a 500 × 500 m grid, with 30 days of history and 96 hours of forecast ([Air Quality overview][gaq_overview]); Weather current conditions are stamped at request time. Sensor feed: the Air Quality index is derived, and its overview page doesn't name its inputs. At APU its `mys_doe` value for 22:00 MYT on 5 November (54) was below that hour's readings at the three nearest DOE stations (DOE APIMS, fetched 22:26 MYT: Cheras 66, Putrajaya 62, Petaling Jaya 56), so it isn't simply the nearest station's reading (inference).
- **Live, Places API (New):** checked at 22:20 MYT on 5 November 2026, after the Places, Air Quality, and Weather APIs were enabled on the team's `skyclause` Cloud project; the earlier `403 SERVICE_DISABLED` came from another project's key. Requests were centred on 3.0553, 101.7006. `places:searchText` for "Asia Pacific University of Technology and Innovation" returned one place, `{id, displayName: {text: "Asia Pacific University of Technology & Innovation (APU)"}, formattedAddress: "Jalan Teknologi 5, Taman Teknologi Malaysia, 57000 Kuala Lumpur, ...", location, types: ["university", ...]}`, about 130 m from the OSM centroid. `places:searchNearby` for transit types within 1 km returned 10 places, including `KL2009 TPM Carpark` (about 360 m), `KL1540 Astro TPM` (about 400 m), and Bukit Jalil LRT station (about 880 m), the same stops as in GTFS Static. Responses carry only the fields named in the `X-Goog-FieldMask` header.
- **Live, Air Quality API:** `currentConditions:lookup` returned `{dateTime: "2026-11-05T14:00:00Z", regionCode: "my", indexes: [{code: "uaqi", aqi: 58, category, dominantPollutant}, {code: "mys_doe", displayName: "API (MY)", aqi: 54, category: "Moderate air quality", dominantPollutant: "pm25"}], pollutants: [{code, concentration: {value, units}}, ...]}` for CO, NO2, O3, PM10, PM2.5, and SO2, with the local index and pollutants requested in `extraComputations`. `history:lookup`, asked for the local index only, returned `indexes` per hour in `hoursInfo[]`.
- **Live, Weather API:** `currentConditions:lookup` returned `{currentTime, timeZone: {id: "Asia/Kuala_Lumpur"}, weatherCondition: {type: "CLOUDY", description}, temperature: {degrees: 24.8, unit: "CELSIUS"}, relativeHumidity: 95, precipitation: {probability: {type: "RAIN", percent: 20}, qpf}, thunderstormProbability: 50, wind, cloudCover, currentConditionsHistory: {maxTemperature, minTemperature, qpf}, ...}`, with 9.93 mm of rain over the past 24 hours ([current conditions][gw_current]). `forecast/hours:lookup`, `forecast/days:lookup`, and `history/hours:lookup` returned `forecastHours[]`, `forecastDays[]` (each with `daytimeForecast` and `nighttimeForecast`; 5 November's daytime was "Heavy thunderstorm" at `thunderstormProbability` 70), and `historyHours[]`, paged with `nextPageToken`. `publicAlerts:lookup` returned `404 NOT_FOUND` "Information is not supported for this location", matching the coverage page.

[gaq_cov]: https://developers.google.com/maps/documentation/air-quality/coverage
[gw_cov]: https://developers.google.com/maps/documentation/weather/coverage
[gmp_billing]: https://developers.google.com/maps/billing-and-pricing/overview
[places_policies]: https://developers.google.com/maps/documentation/places/web-service/policies
[gmp_tos]: https://cloud.google.com/maps-platform/terms
[gmp_sst]: https://cloud.google.com/maps-platform/terms/maps-service-terms
[gaq_overview]: https://developers.google.com/maps/documentation/air-quality/overview
[gw_current]: https://developers.google.com/maps/documentation/weather/current-conditions

### Weather forecasts for campus

MET Malaysia via data.gov.my:

- **Offers:** a 7-day general forecast by location (state, district, town), plus warnings and earthquake reports; data provided by MET Malaysia ([Weather API docs][dgm_weather]).
- **Access:** `https://api.data.gov.my/weather/forecast/?contains=Kuala%20Lumpur@location__location_name`. No key; 4 requests per minute.
- **Terms:** CC BY 4.0 ([Weather API docs][dgm_weather]).
- **Updates and sensor:** the forecast is updated daily ([Weather API docs][dgm_weather]). Sensor feed: no.
- **Live:** a JSON array of `{location: {location_id: "Ds058", location_name: "Kuala Lumpur"}, date, morning_forecast, afternoon_forecast, night_forecast, summary_forecast, summary_when, min_temp, max_temp}`, with rows to 9 November. Forecast text is in Malay, e.g. "Ribut petir di beberapa tempat".

Open-Meteo:

- **Offers:** model-based current and hourly weather at any coordinate.
- **Access:** `https://api.open-meteo.com/v1/forecast?latitude=3.0559&longitude=101.6997&current=...`. No key.
- **Terms:** the free API is non-commercial only: under 10,000 calls a day, 5,000 an hour, and 600 a minute, with data under CC BY 4.0 ([terms][om_terms]). Commercial use needs a subscription to the customer API ([pricing][om_pricing]).
- **Updates and sensor:** current values come in 15-minute steps. Sensor feed: no (model output).
- **Live, 10:15 MYT:** `{latitude, longitude, elevation, current_units, current: {time, temperature_2m: 29.0, relative_humidity_2m: 74, precipitation: 0.0, weather_code: 2, wind_speed_10m: 3.0}, hourly: {...}}`. The grid point it snapped to was about 2.6 km west of campus.

[om_pricing]: https://open-meteo.com/en/pricing

### APU's own public information

- **No public API or open-data portal found.** I searched APU's public site and found none. Its `sitemap.xml` lists 342 URLs on `new.apu.edu.my`, 138 of them course pages, plus `/research`, `/campus`, and `/campus-facilities`, with no API or open-data entry. I didn't access APSpace or any login-gated portal.
- **Public identifiers that do exist:**
  - [ROR 03c52a632][ror_apu]: active, Kuala Lumpur, aliases APIIT and APU, last modified 22 September 2026.
  - [OpenAlex I181397559][oa_apu]: covered under [OpenAlex](#openalex).
  - [Wikidata Q4806454][wd_apu]: its coordinates (3.0481, 101.6925) are about 1.2 km from the OSM campus, and its official website property still points to `ucti.edu.my`.
  - The [OSM campus polygon][osm_apu_way].
- **Open-source code:** the APIIT Education Group's GitHub organisation `ctiteam` publishes the [APSpace mobile app source][apspace_repo]. It was last pushed 5 January 2023, and GitHub shows no recognised licence. I didn't use the backends it calls.

[ror_apu]: https://ror.org/03c52a632
[wd_apu]: https://www.wikidata.org/wiki/Q4806454
[apspace_repo]: https://github.com/ctiteam/apspace

## Intelligent Automation & Digital Transformation

These feeds suit "connecting devices with useful actions": thresholds and warnings that can trigger alerts or workflows.

### MET Malaysia warnings

- **Offers:** live weather warnings (thunderstorm, strong wind and rough seas, heavy rain, and others) and earthquake reports ([Weather API docs][dgm_weather]).
- **Access:** `https://api.data.gov.my/weather/warning/` and `.../weather/warning/earthquake/`. No key; 4 requests per minute.
- **Terms:** CC BY 4.0.
- **Updates and sensor:** "when required" ([Weather API docs][dgm_weather]). Sensor feed: no (official bulletins).
- **Live:** objects shaped `{warning_issue: {issued, title_bm, title_en}, valid_from, valid_to, heading_en, text_en, ...}`. Today's included a "Strong Winds and Rough Seas Warning" issued 2026-11-03T10:00 and a "Thunderstorms Warning" valid from 05:00. The earthquake endpoint with `limit=3` returned 2023 records first, so add sorting or date filters for recent events.

### River level at LRT Bukit Jalil (Public Infobanjir)

- **Offers:** telemetry water levels and rainfall for every state, with four threshold levels per station. The official site title is "Laman Web Rasmi Public Infobanjir".
- **Access:** HTML tables only, at `https://publicinfobanjir.water.gov.my/waterleveldata/Wilayah%20Persekutuan%20Kuala%20Lumpur` (also `/rainfalldata/<state>`). No key. I found no documented API, rate limit, or terms page, so using it means parsing HTML server-side.
- **Terms:** not found; I searched the home page and its footer.
- **Updates and sensor:** rows showed 15-minute timestamps. Sensor feed: yes (telemetry stations).
- **Live, APU relevance:** station `0232901WL` "SG. KUYOH DI LRT BUKIT JALIL" read 26.37 m at 03/11/2026 10:15. Its thresholds are Normal 28.00, Waspada (alert) 31.15, Amaran (warning) 32.05, and Bahaya (danger) 33.05. Each row lists station ID, name, district, basin, sub-basin, last update, level, and the four thresholds. Some KL stations showed `-9,999.00`, which looks like a missing-value marker (inference).

### DOE APIMS air pollutant index

- **Offers:** the hourly official Air Pollutant Index for 68 continuous monitoring stations, published on the public [APIMS portal][apims_portal] (no login).
- **Access:** undocumented JSON endpoints behind the portal: `https://eqms.doe.gov.my/api3/publicportalapims/mapcaqm` (all stations, latest reading) and `.../apitablehourly?stateid=<n>&datetime=<epoch>` (hourly history), as used in the open-source [aircheck][aircheck] script. No key. CORS allows only `https://eqmp.doe.gov.my`, so fetch server-side. I found no published rate limit or terms.
- **Terms:** not found. The endpoint is undocumented and could change without notice (inference).
- **Updates and sensor:** hourly. Sensor feed: yes (DOE monitoring stations).
- **Live, 10:00 MYT readings:** `{data: [{STATION_ID, STATION_LOCATION, STATE_NAME, LATITUDE, LONGITUDE, API, PARAM_SYMBOL, CLASS, RECORD_DT}, ...]}` with 68 stations. The nearest to APU was `CA16W` Cheras, KL (about 5.9 km), at API 62 "Moderate"; Petaling Jaya and Putrajaya were 13–16 km away.

[aircheck]: https://github.com/najwanhamidi/aircheck

### Other air-quality feeds

- **OpenAQ v3:** key needed. Without one, `api.openaq.org/v3/locations` returned `401` "Unauthorized. A valid API key must be provided in the X-API-Key header" on 3 and 5 November. The free tier allows 60 requests a minute and 2,000 an hour ([rate limits][openaq_limits]). Its terms require attribution to OpenAQ and to the original sources, allow downloads only through official methods, and bar using the hosted API to build services that substantially duplicate it ([terms][openaq_terms]). I couldn't check its Malaysian coverage without a key, and the old OpenAQ table in BigQuery has no Malaysian rows ([BigQuery public datasets](#bigquery-public-datasets)). Sensor feed: yes (aggregated stations).
- **WAQI (aqicn.org):** key needed. Without a token, `api.waqi.info/feed/geo:...` returned `{"status":"error","data":"Invalid key"}` (HTTP 200) on 3 and 5 November. The default quota is 1,000 requests a minute. The data "can not be redistributed as cached or archived data", and attribution to WAQI and the originating EPA is mandatory ([API terms][waqi_tos]). The no-archive rule rules out storing its history. Sensor feed: yes.
- **Sensor.Community:** live, no key. `https://data.sensor.community/airrohr/v1/filter/area=3.0559,101.6997,25` returns the last 5 minutes of readings within 25 km ([API list][sc_apis]). It found one PMS5003 particulate sensor, about 14 km north of campus, reporting `P1`/`P2` (PM10/PM2.5) at 02:25 UTC. Data is under the DB Contents License per the [site footer][sc_airrohr]. Sensor feed: yes, but sparse near APU.

[openaq_limits]: https://docs.openaq.org/using-the-api/rate-limits
[openaq_terms]: https://docs.openaq.org/about/terms
[waqi_tos]: https://aqicn.org/api/tos/
[sc_apis]: https://github.com/opendata-stuttgart/meta/wiki/EN-APIs
[sc_airrohr]: https://sensor.community/en/sensors/airrohr/

### Open-Meteo air-quality and flood models

- **Air quality:** `https://air-quality-api.open-meteo.com/v1/air-quality?...&current=pm10,pm2_5,us_aqi`. No key. It returned PM2.5 26.3 µg/m³ and US AQI 85 for 10:00 MYT. The source is the 45 km CAMS global forecast for Malaysia ([docs][om_aq]). Sensor feed: no (model).
- **Flood:** `https://flood-api.open-meteo.com/v1/flood?...&daily=river_discharge`. No key. It returned simulated discharge of 2.32 m³/s for 3 November, from GloFAS at 5 km resolution ([docs][om_flood]). Sensor feed: no (model).
- **Terms:** the same as Open-Meteo weather: non-commercial free tier, CC BY 4.0 ([terms][om_terms]).

[om_aq]: https://open-meteo.com/en/docs/air-quality-api
[om_flood]: https://open-meteo.com/en/docs/flood-api

## Data-Driven Research & Intelligent Decision Making

### Rapid Rail origin-destination ridership

- **Offers:** daily station-to-station ridership for the whole Rapid Rail network in the Klang Valley, "derived from anonymous transactional data generated by Rapid's tap-in-tap-out system" (dataset metadata in [datagovmy-meta][dgm_meta]).
- **Access:** yearly files `https://storage.data.gov.my/transportation/rail/rapidrail_2026_daily.parquet` (5.3 MB) or `.csv` (314 MB), with editions 2023–2026. No key. The dataset is flagged `exclude_openapi`, so it is served from storage rather than the API.
- **Terms:** CC BY 4.0 ([FAQ][dgm_faq]).
- **Updates and sensor:** daily. The metadata showed data as of 2026-11-01 23:59, with the next update due 2026-11-03 22:00. Sensor feed: no as published (a daily aggregate of gate taps).
- **Live, APU relevance:** columns `origin, destination, date, ridership`, with 5,293,275 rows from 1 January to 1 November 2026. Trips starting at `SP17` Bukit Jalil were 3,256 (28 Oct), 3,085 (29 Oct), 3,321 (30 Oct), 4,201 (31 Oct), and 5,016 (1 Nov). Each side also has an `A0: All Stations` row that already totals the others, so exclude it when summing, or every count doubles (rechecked 4 Nov 2026).

### data.gov.my catalogue and OpenDOSM

- **Offers:** the [datagovmy-meta][dgm_meta] repo holds 354 dataset metadata files, each listing frequency, source agency, coverage dates, and download links. Track-relevant IDs include `lecturers_uni`, `ridership_headline`, `ridership_ktmb_daily`, `air_pollution` (monthly, national, 2017–2024), `water_pollution_basin`, `electricity_consumption`, `hh_access_internet`, `cellular_subscribers`, `pricecatcher`, `population_district`, and `crime_district`. OpenDOSM serves DOSM statistics, which you can browse in the [OpenDOSM catalogue][opendosm_cat].
- **Access:** `https://api.data.gov.my/data-catalogue/?id=<id>` and `https://api.data.gov.my/opendosm/?id=<id>` ([OpenDOSM API docs][dgm_opendosm]); also direct `storage.data.gov.my` CSV/parquet links. No key; 4 requests per minute.
- **Terms:** CC BY 4.0 ([FAQ][dgm_faq]).
- **Updates and sensor:** varies by dataset (daily to yearly). Sensor feed: no.
- **Live:** `data-catalogue?id=fuelprice` returned rows like `{date, ron95, ron97, diesel, series_type, ...}`; `opendosm?id=cpi_core` returned `{date, index, division}`.

[opendosm_cat]: https://open.dosm.gov.my/data-catalogue
[dgm_opendosm]: https://developer.data.gov.my/static-api/opendosm

### Higher-education statistics (MOHE)

- **Statistik Pendidikan Tinggi 2025:** chapter PDFs in the [MOHE 2025 statistics folder][mohe_2025], covering macro data, public universities, private HEIs (IPTS), polytechnics, community colleges, students abroad, and one further chapter. Live: the IPTS chapter downloaded (1.3 MB PDF). Its tables aggregate intake, enrolment, and output by institution status and field. A text search for "Asia Pacific" and "APU" found no match, so APU isn't broken out. The format is PDF only, so extraction is manual. Updates yearly. I didn't check the licence.
- **MOHE [Data Terbuka][mohe_open] page:** links to legacy `data.gov.my/data/ms_MY/dataset/...` pages, such as public-university graduate counts. The one I tried returned `403` today.
- **data.gov.my `lecturers_uni`:** from MOHE; yearly, 2014–2025; fields `date, state, university, citizenship, sex, staff`; public universities only ([metadata][dgm_meta]). Live: the CSV at `storage.data.gov.my/education/lecturers_uni.csv` downloaded, with rows to 2025. APU, a private university, isn't covered.

[mohe_2025]: https://www.mohe.gov.my/muat-turun/statistik/2025-1-1
[mohe_open]: https://www.mohe.gov.my/perkongsian-data/data-terbuka

### OpenAlex

- **Offers:** works, authors, institutions, topics, and citations; APU is institution `I181397559`.
- **Access:** `https://api.openalex.org/works?filter=authorships.institutions.id:I181397559&group_by=publication_year`. A key is optional. Without one, requests share "one free daily budget ($0.10)" per IP address (response notice); a free key gives $1 a day ([pricing][oa_pricing]). The per-second limit is 10 requests without a key and 30 with one ([rate limits][oa_limits]). I observed costs of $0.001 for a search and $0.0001 for a filter or `group_by`.
- **Terms:** the data is CC0 ([about][oa_about]), so it is free for commercial use and attribution isn't required.
- **Updates and sensor:** the APU record was updated 2026-11-02. Sensor feed: no.
- **Live, APU relevance:** the institution record lists 3,741 works and 41,527 citations, and the works filter returns 3,711 works. By year: 2024 had 702, 2025 had 574, and 2026 has 606 so far. 1,844 are open access and 1,867 aren't. Top primary topics for 2024–2026: Smart Agriculture and AI (58), Technology Adoption and User Behaviour (52), Artificial Intelligence in Healthcare (37), Tourism (31), Environmental Sustainability in Business (27), and Network Security and Intrusion Detection (22).
- **Caveat:** of the 13 APU works with an arXiv location, the oldest are 2013–2014 silicon spin-qubit papers, which look like affiliation misattribution (inference).

[oa_pricing]: https://openalex.org/pricing
[oa_limits]: https://developers.openalex.org/how-to-use-the-api/rate-limits-and-authentication
[oa_about]: https://openalex.org/about

### Crossref, Semantic Scholar, and arXiv

- **Crossref:** live, no key. The documented limits are: public pool 5 requests/s with concurrency 1, "polite" pool (with a `mailto`) 10/s with concurrency 3, and Plus 150/s ([access docs][crossref_access]). Today's public-pool response headers said 1 request per 1 s with concurrency 1. `query.affiliation=Asia Pacific University...` returned 23.8 million fuzzy-ranked hits, so it can't isolate APU; get DOIs from OpenAlex and enrich them via Crossref instead. Terms: metadata is "reusable without restriction" except abstracts ([metadata retrieval][crossref_meta]).
- **Semantic Scholar:** key needed in practice. Keyless `paper/search` requests returned `429` "Too Many Requests" twice on 3 November and four times out of four on 5 November. On 5 November, one of three single-paper lookups (`paper/arXiv:<id>`) answered, with `{paperId, title, year, citationCount}`, and the other two got `429`. Unauthenticated users share a pool of 1,000 requests/s; keys start at 1 request/s ([API page][s2_api]). Its licence requires attribution to "Semantic Scholar" ([API licence][s2_license]).
- **arXiv:** live, no key. The limit is one request every 3 seconds on a single connection; metadata is CC0, while e-prints stay under their holders' copyright ([terms of use][arxiv_tou]). Searches for "Asia Pacific University of Technology" and "APU Malaysia" returned 0 results; arXiv search doesn't index affiliations (inference), so OpenAlex is the better route to APU's arXiv papers.

[crossref_access]: https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/
[crossref_meta]: https://www.crossref.org/documentation/retrieve-metadata/
[s2_api]: https://www.semanticscholar.org/product/api
[s2_license]: https://www.semanticscholar.org/product/api/license
[arxiv_tou]: https://info.arxiv.org/help/api/tou.html

### BigQuery public datasets

- **Offers:** datasets hosted in the `bigquery-public-data` project, queried with SQL ([public datasets][bq_public]).
- **Access:** any Cloud project. The first 1 TB processed each month is free, and there's no SLA ([public datasets][bq_public]). The sandbox needs no billing account but caps storage at 10 GiB lifetime, expires tables after 60 days, and doesn't support streaming data ([sandbox][bq_sandbox]). The sandbox's lack of streaming matters for an IoT pipeline; see [Google Cloud](/docs/research/google-cloud.md).
- **Terms:** per dataset.
- **Malaysian coverage, checked 22:21–22:41 MYT on 5 November 2026 from the team's `skyclause` Cloud project:** no weather or air-quality dataset I checked (`ghcn_d`, `noaa_gsod`, `openaq`) has current rows for the Klang Valley. Overture's `place` table does cover the campus; I checked `geo_openstreetmap` for freshness only.
  - `ghcn_d` (NOAA daily station records) was refreshed on 5 November, but its two Klang Valley stations, `MYM00048647` Subang (Sultan Abdul Aziz Shah, about 18.7 km) and `MYM00048650` KLIA (about 34.5 km), stop on 24 August 2025, with `PRCP`, `TMAX`, `TMIN`, and `TAVG`. Of 16 Malaysian stations, only Mersing has 2026 rows, and only temperatures.
  - `noaa_gsod` has no 2026 table; `gsod2025` ends on 28 August 2025, with Subang and KLIA to 24 August.
  - `openaq.global_air_quality` was last modified on 23 June 2022 and has no Malaysian rows.
  - `geo_openstreetmap`'s newest tables were last modified on 11 November 2022.
  - `overture_maps` carries the release label `2026-10-21_0` and was refreshed on 22 October 2026. A 300 m `ST_DWITHIN` query on `place` around the OSM centroid returned 16 rows of `{id, names.primary, basic_category, confidence, operating_status, sources[].dataset}`. Every row's sources are `meta` and `Overture`, and none has an `operating_status`. The rows include "Asia Pacific University of Technology & Innovation - APU" (`college_university`, confidence 0.99, about 140 m), "APU Library" (`library`, about 60 m), "Nelson's APU" (`cafe`), and "AWS Cloud Club at Asia Pacific University". Some look misplaced (inference): "The Fullerton Hotel Singapore", "Stadium Bukit Jalil", and a community hall in Taman Seri Gombak all fall inside the circle. The query was estimated at up to 13.7 GB but billed 19 MB, because the table is clustered by geometry; a 300 m query on `building` was estimated at 498 GB, so I didn't run it.

[bq_public]: https://cloud.google.com/bigquery/public-data
[bq_sandbox]: https://cloud.google.com/bigquery/docs/sandbox

### Earth Engine

- **Offers:** a satellite and geospatial catalogue with server-side analysis.
- **Access:** a Cloud project registered for commercial or noncommercial use ([access guide][ee_access]); free for noncommercial research and education ([noncommercial][ee_noncom]).
- **Terms:** per dataset. The STAC entries list Dynamic World as `CC-BY-4.0` and Sentinel-5P NO2 as `proprietary`.
- **Live (catalogue only):** the public STAC entries are fetchable without a key. [Sentinel-5P NRTI NO2][ee_s5p] runs to 2026-11-02T23:52Z; [Dynamic World V1][ee_dw] land cover runs to 2026-11-02. I didn't run a query, because that needs a registered project. Sensor feed: satellite remote sensing, not IoT.

[ee_noncom]: https://earthengine.google.com/noncommercial/
[ee_s5p]: https://storage.googleapis.com/earthengine-stac/catalog/COPERNICUS/COPERNICUS_S5P_NRTI_L3_NO2.json
[ee_dw]: https://storage.googleapis.com/earthengine-stac/catalog/GOOGLE/GOOGLE_DYNAMICWORLD_V1.json

## Top picks

| Pick                                      | Track      | Sensor feed | Why it fits                                                              |
| ----------------------------------------- | ---------- | ----------- | ------------------------------------------------------------------------ |
| [GTFS Realtime][dgm_gtfsr] (Rapid Bus KL) | Campus     | Yes, 30 s   | Live buses incl. T580 to TPM; no key; CC BY 4.0                          |
| [Public Infobanjir][pib_kl] Sg. Kuyoh     | Automation | Yes, 15 min | Gauge named for LRT Bukit Jalil (0.9 km from campus); four thresholds    |
| [DOE APIMS][apims_portal]                 | Automation | Yes, hourly | Official API index, 68 stations; Cheras 5.9 km; server-side fetch only   |
| [MET warnings and forecast][dgm_weather]  | Automation | No          | Official KL forecast and warnings; no key; CC BY 4.0                     |
| [Rapid Rail OD ridership][dgm_meta]       | Research   | No, daily   | Real gate-tap flows for Bukit Jalil SP17, 2023–yesterday                 |
| [OpenAlex][oa_apu]                        | Research   | No          | APU institution ID, 3.7k works, topics; CC0                              |
| [GTFS Static][dgm_gtfss]                  | Campus     | No          | Stops, routes, shapes to join with realtime positions                    |
| [OpenStreetMap / Overpass][overpass_wiki] | Campus     | No          | Campus polygon, stops, nearby food and services; interior is unmapped    |
| [Open-Meteo][om_terms]                    | All        | No, model   | Keyless hourly weather and AQ at campus coordinates; non-commercial only |
| [Earth Engine][ee_access]                 | Research   | Satellite   | NO2 and land cover over Klang Valley; needs registered Cloud project     |

[pib_kl]: https://publicinfobanjir.water.gov.my/waterleveldata/Wilayah%20Persekutuan%20Kuala%20Lumpur

## Takeaways for this hackathon

- **Evidence:** keyless, CC BY 4.0, sensor-style feeds near APU exist today: bus GPS every 30 s, the Sungai Kuyoh river gauge at LRT Bukit Jalil every 15 min, and DOE air-quality stations hourly. **Inference:** they give a credible "IoT senses the world" signal without hardware, but should sit beside any team sensor rather than replace it; see [iot-and-network.md](/docs/research/iot-and-network.md).
- **Evidence:** data.gov.my documents 4 requests per minute per API, and APIMS blocks browser CORS. **Inference:** poll each feed from one Cloud Run or Cloud Functions job, store each snapshot with its source timestamp, and serve the app from that store. This adds a visible cloud-and-network layer and keeps the app inside the rate limits during async judging. Under the repo rule, when a poll fails the app must show that feed's error rather than the last snapshot ([project conventions](/docs/references/project-conventions.md)).
- **Evidence:** WAQI forbids redistributing cached or archived data, and the Open-Meteo free tier is non-commercial. **Inference:** prefer data.gov.my, APIMS, and OpenAlex for anything you store or might commercialise, and put an attributions list in the README.
- **Evidence:** APU documents no API or open data, though APSpace's timetable is a public, undocumented feed ([APSpace timetable feed](/docs/research/apu.md#apspace-timetable-feed)), and OSM has almost nothing inside the campus. **Inference:** a Smart Campus build will rely on surrounding public data (transport, weather, flood, air) plus whatever the team collects itself. Mapping campus blocks in OSM is a real, cheap contribution the team could show.
- **Evidence:** OpenAlex returns APU's 3.7k works with topic groupings for a fraction of a cent per call, and Rapid Rail OD data covers Bukit Jalil daily. **Inference:** these are the strongest bases for the Data-Driven Research track (research-trend or resource-forecasting dashboards in BigQuery or Data Studio, formerly Looker Studio, with Gemini summaries).
- **Evidence:** MOHE statistics are aggregate PDFs with no APU-level rows, and `lecturers_uni` covers public universities only. **Inference:** avoid pitches that promise APU-specific student analytics from public data; that data isn't public.
- **Evidence:** on the team's `skyclause` Cloud project, Google's Air Quality and Weather APIs returned hourly values at APU's coordinates, including the `mys_doe` index and thunderstorm probability, but Google's Weather API has no alerts for Malaysia. Their terms allow caching for one hour to 30 days, except Air Quality history, which must be deleted when the Maps agreement ends, and limit Air Quality data to routing, environmental risk indices, and correlational research. In BigQuery, the Klang Valley GHCN and GSOD stations stop in August 2025, and the OpenAQ table has no Malaysian rows. **Inference:** MET warnings stay the warnings source, and for Bukit Jalil BigQuery is a place to load the polled feeds rather than a source of them. Neither Google API's readings can be kept as append-only, indefinite ledger evidence, so at most they could show live values at campus coordinates beside APIMS and MET. Air Quality's permitted uses may not cover even that. Weather's bar on products whose primary purpose is weather information likely doesn't bite, since Skyclause's purpose is calls for windows ([Google Maps Platform](#google-maps-platform)).

## See also

- [Hackathon brief](/docs/BRIEF.md)
- [Google Cloud](/docs/research/google-cloud.md): Cloud and AI products, free tiers, BigQuery sandbox
- [IoT and network](/docs/research/iot-and-network.md): sensors, protocols, and ingestion architecture
- [Judging](/docs/research/judging.md): packaging, privacy, and attribution in the deck
- [Past winners](/docs/research/winners.md): what similar teams built

[dgm_rate]: https://developer.data.gov.my/rate-limit
[dgm_faq]: https://developer.data.gov.my/faq
[cc_by]: https://creativecommons.org/licenses/by/4.0/
[osm_apu_way]: https://www.openstreetmap.org/way/944352525
[dgm_gtfsr]: https://developer.data.gov.my/realtime-api/gtfs-realtime
[dgm_gtfss]: https://developer.data.gov.my/realtime-api/gtfs-static
[overpass_wiki]: https://wiki.openstreetmap.org/wiki/Overpass_API
[dgm_weather]: https://developer.data.gov.my/realtime-api/weather
[om_terms]: https://open-meteo.com/en/terms
[oa_apu]: https://openalex.org/I181397559
[apims_portal]: https://eqms.doe.gov.my/APIMS/main
[dgm_meta]: https://github.com/data-gov-my/datagovmy-meta
[ee_access]: https://developers.google.com/earth-engine/guides/access
