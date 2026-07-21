# Ward Boundary GeoJSON Files

Place city ward/district boundary GeoJSON files here for map overlay rendering.

## Expected files

| File | Source | Description |
|---|---|---|
| `delhi_wards.geojson` | data.gov.in / OCHA HDX | Delhi's 272 wards |
| `delhi_districts.geojson` | data.gov.in | Delhi's 11 revenue districts |

## How to obtain

**Delhi wards (free):**
- OCHA HDX: https://data.humdata.org/dataset/india-administrative-level-0-3-boundaries
- data.gov.in: https://data.gov.in (search "Delhi ward boundary")

## Format expected

Standard GeoJSON FeatureCollection where each Feature has:
- `geometry`: Polygon or MultiPolygon
- `properties.ward_name`: Ward name string
- `properties.district`: District name string

## Usage in frontend

```js
// In Map.jsx — add a GeoJSON layer
import delhiWards from '../../data/ward_boundaries/delhi_wards.geojson'
import { GeoJSON } from 'react-leaflet'

<GeoJSON
  data={delhiWards}
  style={{ color: '#475569', weight: 1, fillOpacity: 0.05 }}
/>
```

These files are intentionally not committed to git (they can be large).
Add them locally before running the app if you want ward boundary overlays.
