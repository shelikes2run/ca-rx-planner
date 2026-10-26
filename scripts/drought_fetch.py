#!/usr/bin/env python3
"""Fetch UCI CHRS Global Drought Monitoring and Prediction System SPI forecasts for California basins.

Source: https://drought.eng.uci.edu (Center for Hydrometeorology and Remote Sensing, UC Irvine) public API
  /api/latest-month                      -> latest observed month
  /api/basin-data?level=basin_lev05&year=Y&month=M&dataType=all&spiType=spi_3|spi_6|spi_12
                                         -> {HYBAS_ID: SPI} (observed through the latest month, AI forecast after)
Basin outlines: HydroBASINS level 5 (HydroSHEDS, hybas_na_lev05_v1c), clipped to California once and cached.

Writes data/drought_spi_forecast.geojson with, per basin, for MSDI (precipitation + soil moisture) and SPI (precipitation):
  obs_<f>3 (latest observed 3-month index), <f>3_m1..m3 (3-month index forecast 1-3 months ahead),
  <f>6_m3, <f>6_m6, <f>12_m6, <f>12_m12, and *_lbl month labels (f = msdi or spi).
"""
import io, json, os, sys, urllib.request, zipfile, datetime as dt

API = "https://drought.eng.uci.edu/api"
UA = "CA-Prescribed-Fire-Planner/1.0 (+https://github.com/shelikes2run/ca-rx-planner)"
HYBAS_ZIP = "https://data.hydrosheds.org/file/HydroBASINS/standard/hybas_na_lev05_v1c.zip"
CA_URL = ("https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query"
          "?where=STUSAB%3D%27CA%27&outFields=STUSAB&returnGeometry=true&outSR=4326&maxAllowableOffset=0.01&f=geojson")
BASINS = "data/hybas_ca_lev05.geojson"
OUT = sys.argv[1] if len(sys.argv) > 1 else "data/drought_spi_forecast.geojson"
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        b = r.read()
    return b if binary else json.loads(b)


def ca_basins():
    if os.path.exists(BASINS):
        return json.load(open(BASINS))
    import shapefile  # pyshp
    from shapely.geometry import shape, mapping
    from shapely.ops import unary_union
    ca = unary_union([shape(f["geometry"]) for f in get(CA_URL)["features"]])
    z = zipfile.ZipFile(io.BytesIO(get(HYBAS_ZIP, binary=True)))
    base = [n[:-4] for n in z.namelist() if n.endswith(".shp")][0]
    sf = shapefile.Reader(shp=io.BytesIO(z.read(base + ".shp")), shx=io.BytesIO(z.read(base + ".shx")), dbf=io.BytesIO(z.read(base + ".dbf")))
    fields = [f[0] for f in sf.fields[1:]]
    feats = []
    for sr in sf.iterShapeRecords():
        g = shape(sr.shape.__geo_interface__)
        if not g.intersects(ca):
            continue
        clip = g.intersection(ca).simplify(0.004, preserve_topology=True)
        if clip.is_empty or clip.area < 1e-5:
            continue
        a = dict(zip(fields, sr.record))
        feats.append({"type": "Feature", "properties": {"HYBAS_ID": str(a["HYBAS_ID"]), "SUB_AREA_km2": a.get("SUB_AREA")},
                      "geometry": json.loads(json.dumps(mapping(clip), default=float))})
    fc = {"type": "FeatureCollection", "features": feats}
    os.makedirs("data", exist_ok=True)
    json.dump(fc, open(BASINS, "w"), separators=(",", ":"))
    print(f"cached {len(feats)} California level-5 basins", file=sys.stderr)
    return fc


def add_months(y, m, k):
    t = (y * 12 + m - 1) + k
    return t // 12, t % 12 + 1


def spi(y, m, kind):
    j = get(f"{API}/basin-data?level=basin_lev05&year={y}&month={m}&dataType=all&spiType={kind}")
    return j.get("data") or {}


def main():
    fc = ca_basins()
    lm = get(f"{API}/latest-month")
    y0, m0 = int(lm["year"]), int(lm["month"])
    cols = {}
    # MSDI = Multivariate Standardized Drought Index (precipitation + soil moisture); SPI = precipitation only
    for fam in ("msdi", "spi"):
        cols[f"obs_{fam}3"] = (f"{fam}_3", 0)
        for k in (1, 2, 3):
            cols[f"{fam}3_m{k}"] = (f"{fam}_3", k)
        for k in (3, 6):
            cols[f"{fam}6_m{k}"] = (f"{fam}_6", k)
        for k in (6, 12):
            cols[f"{fam}12_m{k}"] = (f"{fam}_12", k)
    vals, labels = {}, {}
    for col, (kind, k) in cols.items():
        y, m = add_months(y0, m0, k)
        vals[col] = spi(y, m, kind)
        labels[col] = f"{MON[m - 1]} {y}"
    ids = {f["properties"]["HYBAS_ID"] for f in fc["features"]}
    if not any(i in vals["msdi3_m1"] for i in ids) or not any(i in vals["spi3_m1"] for i in ids):
        sys.exit("no forecast values for California basins; leaving the previous file in place")
    for f in fc["features"]:
        p = f["properties"]
        for col in cols:
            v = vals[col].get(p["HYBAS_ID"])
            p[col] = None if v is None else round(float(v), 2)
            p[col + "_lbl"] = labels[col]
    fc["metadata"] = {"source": "UC Irvine CHRS Global Drought Monitoring and Prediction System (drought.eng.uci.edu), PERSIANN satellite precipitation",
                      "latest_observed": f"{MON[m0 - 1]} {y0}", "generated": dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ"), "months": labels}
    json.dump(fc, open(OUT, "w"), separators=(",", ":"))
    print(f"wrote {OUT}: {len(fc['features'])} basins, latest observed {MON[m0 - 1]} {y0}", file=sys.stderr)


if __name__ == "__main__":
    main()
