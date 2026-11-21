# Ward Boundary GeoJSON Files

Place city ward/district boundary GeoJSON files here for map overlay rendering. The backend loads `{city}.geojson` for each configured city.

## Expected files

| File | Source | Description |
|---|---|---|
| `delhi.geojson` | data.gov.in / OCHA HDX | Delhi ward boundaries |
| `mumbai.geojson` | data.gov.in / OCHA HDX | Mumbai ward boundaries |
| `bengaluru.geojson` | data.gov.in / OCHA HDX | Bengaluru ward boundaries |
| `chennai.geojson` | data.gov.in / OCHA HDX | Chennai ward boundaries |
| `kolkata.geojson` | data.gov.in / OCHA HDX | Kolkata ward boundaries |

If a file is missing, the backend tries an OSM Overpass fetch and caches the generated GeoJSON. If that fails, the ward endpoint returns an empty FeatureCollection and the UI keeps station markers only.

## How to obtain

**Delhi wards (free):**
- OCHA HDX: https://data.humdata.org/dataset/india-administrative-level-0-3-boundaries
- data.gov.in: https://data.gov.in (search "Delhi ward boundary")

## Format expected

Standard GeoJSON FeatureCollection where each Feature has:
- `geometry`: Polygon or MultiPolygon
- `properties.name`: Ward name string (the OSM fallback writes `name`)
- `properties.district`: optional district name

The frontend fetches boundaries from `GET /aqi/wards/{city}?with_aqi=true`, so no static import is required. The API adds `aqi` and `risk_level` to each feature's properties using IDW over live stations.

These files are intentionally not committed to git (they can be large). Add them locally before running the app if you want ward boundary overlays without an OSM fetch.
