# NFR-9 in the field (#116): Core Web Vitals at p75 per route group, from the `/e` beacons #111 records as the
# histogram `skyclause.web_vitals`, and API p95 for reads and writes, server side, from the HTTP server
# histogram #114's telemetry exports. Both arrive through the Telemetry API (OTLP), so queries are PromQL with
# quoted dotted names. Cloud Monitoring has no 75th-percentile aligner, hence `histogram_quantile`.

locals {
  # web-vitals reports milliseconds, and CLS as a unitless score. Thresholds are NFR-9's.
  vitals = [
    { metric = "LCP", unit = "ms", threshold = 2500 },
    { metric = "INP", unit = "ms", threshold = 200 },
    { metric = "CLS", unit = "score", threshold = 0.1 },
    { metric = "FCP", unit = "ms", threshold = null },
    { metric = "TTFB", unit = "ms", threshold = null },
  ]

  # Reads and writes of `/v1` and `/api`; the histogram is in seconds.
  api_latency = [
    { name = "Reads (GET, HEAD)", methods = "GET|HEAD", threshold = 0.3 },
    { name = "Writes (POST, PUT, PATCH, DELETE)", methods = "POST|PUT|PATCH|DELETE", threshold = 0.8 },
  ]
}

# The JSON matches what the API stores (zero positions and empty lists left out, `targetAxis` spelled out), so
# later plans show no change.
resource "google_monitoring_dashboard" "web_vitals" {
  dashboard_json = jsonencode({
    displayName = "Web vitals p75 by route group"
    mosaicLayout = {
      columns = 48
      tiles = [for i, vital in local.vitals : merge(
        i % 2 == 0 ? {} : { xPos = 24 },
        i < 2 ? {} : { yPos = floor(i / 2) * 16 },
        {
          width  = 24
          height = 16
          widget = {
            title = "${vital.metric} p75 (${vital.unit})"
            xyChart = merge(
              {
                dataSets = [{
                  plotType        = "LINE"
                  targetAxis      = "Y1"
                  timeSeriesQuery = { prometheusQuery = "histogram_quantile(0.75, sum by (le, route_group) (rate({\"skyclause.web_vitals_bucket\", metric=\"${vital.metric}\"}[1h])))" }
                }]
              },
              vital.threshold == null ? {} : { thresholds = [{ value = vital.threshold, label = "NFR-9" }] }
            )
          }
        }
      )]
    }
  })
}

resource "google_monitoring_dashboard" "api_latency" {
  dashboard_json = jsonencode({
    displayName = "API p95 latency, server side"
    mosaicLayout = {
      columns = 48
      tiles = [for i, kind in local.api_latency : merge(i == 0 ? {} : { xPos = i * 24 }, {
        width  = 24
        height = 16
        widget = {
          title = "${kind.name} p95 (s)"
          xyChart = {
            dataSets = [{
              plotType        = "LINE"
              targetAxis      = "Y1"
              timeSeriesQuery = { prometheusQuery = "histogram_quantile(0.95, sum by (le) (rate({\"http.server.request.duration_bucket\", \"http.request.method\"=~\"${kind.methods}\", \"http.route\"=~\"/(v1|api)/.*\"}[5m])))" }
            }]
            thresholds = [{ value = kind.threshold, label = "NFR-9" }]
          }
        }
      })]
    }
  })
}
