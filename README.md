# CA Prescribed Fire Planner — embedded tools

`burn_eval_ca.html` is the per-unit evaluator embedded in the **CA Prescribed Fire Planner** Experience Builder app (NIFC ArcGIS Online). It runs entirely in the browser — no server, no keys.

A user selects a fuel treatment unit on the map (or uploads a zipped shapefile, KML or GeoJSON, or types lat/lon) and enters their prescription. The page returns:

| Tab | Source | What it shows |
|---|---|---|
| 72-Hour | NWS gridded forecast (api.weather.gov) | Hourly temp, RH, 20-ft wind, gust, mixing height, transport wind, ventilation vs. Rx |
| 16-Day | Open-Meteo forecast (ECMWF/GFS blend) | Burn day / no-go for each day |
| Monthly Outlook | ECMWF SEAS5 monthly anomalies (Open-Meteo) applied to ERA5 history | Expected burn days per month for ~6 months vs. typical, with 10th–90th percentile range |
| Yearly Availability | ERA5 reanalysis (Open-Meteo), last 10/20/30 years | Burn days for every year × month, typical month, % of burn-period hours in Rx |

A **burn day** = at least *N* consecutive in-Rx hours inside the burn period (defaults 0900–1700, N = 4).

## URL parameters

| Param | Example | Notes |
|---|---|---|
| `id` | `1462687` | Object ID of a unit in the treatment layer |
| `unit` | `Big Meadow RX` | Display name |
| `svc` | FeatureServer/0 URL | Treatment layer (default: Reshape Wildfire Treatment_Index_View) |
| `lat`, `lon` | `38.93`, `-120.66` | Evaluate a point instead of a unit |
| `minT maxT minRH maxRH maxW maxG minV bpS bpE minRun` | `&maxRH=45` | Prefill the Rx |

## Smoke screening (`smoke_eval_ca.html`)

Screening-level smoke look for a unit and burn plan (date, ignition hour, duration): daytime plume cone from NWS transport winds over the burn period, nighttime drainage path traced downslope on terrain elevations, communities / schools / hospitals / mandatory Class I areas inside either zone, the unit's air district (with CARB PFIRS and Smoke Management Program links), and CAMS background PM2.5 / US AQI at the unit and downwind. Same `id`, `unit`, `svc`, `lat`, `lon` parameters as the evaluator.

## Experience Builder

Embed widget URL (By URL, connected to the treatment-unit selection):
`https://shelikes2run.github.io/ca-rx-planner/burn_eval_ca.html?unit={Name}&id={Object ID}`

Inspired by Colorado DFPC's Prescribed Fire/Weather Planner (Eloise Armour). Code written independently.
