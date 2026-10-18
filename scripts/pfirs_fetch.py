#!/usr/bin/env python3
"""Fetch planned/approved prescribed burns from CARB PFIRS's public map page and write GeoJSON.

PFIRS (https://ssl.arb.ca.gov/pfirs/) publishes each ignition on its public map page as inline
JavaScript (marker position + info-window HTML). CARB does not allow browsers on other sites to
read that page, so this runs on a schedule (GitHub Actions) and publishes data/pfirs_burns.geojson
via GitHub Pages, which the CA Prescribed Fire Planner maps and tools read.

Usage: pfirs_fetch.py [out.geojson] [--days-back N] [--days-ahead N] [--html saved_page.html]
"""
import argparse, datetime as dt, html, json, re, sys, urllib.parse, urllib.request
from zoneinfo import ZoneInfo

URL = "https://ssl.arb.ca.gov/pfirs/index.php"
TZ = ZoneInfo("America/Los_Angeles")
UA = "CA-Prescribed-Fire-Planner/1.0 (+https://github.com/shelikes2run/ca-rx-planner)"

MARKER = re.compile(r"var latLng=new google\.maps\.LatLng\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\);(.*?)(?=var latLng=new google\.maps\.LatLng|\Z)", re.S)
ICON = re.compile(r'url:\s*"images/([a-z_]+)\.png"')
PROJ = re.compile(r"var projectTab(\d+)='(.*?)';", re.S)
ACT = re.compile(r"var activityTab\d+='(.*?)';", re.S)
H1 = re.compile(r"<h1>(.*?)</h1>", re.S)
ROW = re.compile(r"<td[^>]*>\s*([^<:]+):\s*</td>\s*<td[^>]*>(.*?)</td>", re.S)
ICON_AGENCY = {"nps": "NPS", "usfs": "USFS", "blm": "BLM", "usfws": "USFWS", "calfire": "CAL FIRE", "caparks": "CA Parks",
               "ctc": "Tahoe Conservancy", "local_fire": "Local Fire", "local_nonfire": "Local Non-Fire", "private": "Private"}


def text(s):
    return html.unescape(re.sub(r"<[^>]+>", " ", s or "")).replace("\xa0", " ").strip()


def fields(fragment):
    return {text(k): text(v) for k, v in ROW.findall(fragment or "")}


def parse_dt(s, fmt):
    try:
        return dt.datetime.strptime(s.strip(), fmt).replace(tzinfo=TZ).isoformat()
    except (ValueError, AttributeError):
        return None


def num(s):
    try:
        return float(str(s).replace(",", ""))
    except (TypeError, ValueError):
        return None


def parse(page):
    feats = []
    for lat, lon, body in MARKER.findall(page):
        p = PROJ.search(body)
        if not p:
            continue
        pid, proj = p.group(1), p.group(2)
        a = ACT.search(body)
        pf, af = fields(proj), fields(a.group(1) if a else "")
        icon = (ICON.search(body) or [None, None])[1] if ICON.search(body) else None
        name_m = H1.search(proj)
        burn_date = parse_dt(pf.get("Date", ""), "%B %d, %Y")
        feats.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(float(lon), 6), round(float(lat), 6)]},
            "properties": {
                "pfirs_id": pid,
                "name": text(name_m.group(1)) if name_m else None,
                "burn_date": burn_date[:10] if burn_date else None,
                "agency": pf.get("Managing Agency") or None,
                "agency_group": ICON_AGENCY.get(icon, icon),
                "burn_type": pf.get("Burn Type") or None,
                "acres": num(pf.get("Acres")),
                "piles": num(pf.get("Piles")),
                "status": pf.get("Status") or None,
                "planned_on": parse_dt(af.get("Planned On", ""), "%a %b %d, %Y @ %I:%M %p"),
                "approved_on": parse_dt(af.get("Approved On", ""), "%a %b %d, %Y @ %I:%M %p"),
            }})
    # PFIRS can repeat a project once per day in a date range; keep one feature per id + date
    seen, out = set(), []
    for f in feats:
        k = (f["properties"]["pfirs_id"], f["properties"]["burn_date"])
        if k not in seen:
            seen.add(k); out.append(f)
    return out


def fetch(start, end):
    data = urllib.parse.urlencode({"show": "1", "viewby": "1", "date_begin": start.strftime("%m/%d/%Y"),
                                   "date_end": end.strftime("%m/%d/%Y"), "submit": "View"}).encode()
    req = urllib.request.Request(URL, data=data, headers={"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("out", nargs="?", default="data/pfirs_burns.geojson")
    ap.add_argument("--days-back", type=int, default=1)
    ap.add_argument("--days-ahead", type=int, default=7)
    ap.add_argument("--html", help="parse a saved page instead of fetching (testing)")
    a = ap.parse_args(argv)
    today = dt.datetime.now(TZ).date()
    start, end = today - dt.timedelta(days=a.days_back), today + dt.timedelta(days=a.days_ahead)
    page = open(a.html, encoding="utf-8").read() if a.html else fetch(start, end)
    feats = parse(page)
    if not a.html and "google.maps" not in page:
        sys.exit("PFIRS page did not contain the map script; not overwriting output")
    fc = {"type": "FeatureCollection",
          "metadata": {"source": "CARB PFIRS public map page", "source_url": URL + "?submit=Map+Page",
                       "date_begin": start.isoformat(), "date_end": end.isoformat(), "count": len(feats),
                       "note": "Planned and approved ignitions as published by PFIRS. Status can change through the day; confirm in PFIRS."},
          "features": sorted(feats, key=lambda f: (f["properties"]["burn_date"] or "", f["properties"]["name"] or ""))}
    with open(a.out, "w", encoding="utf-8") as fh:
        json.dump(fc, fh, indent=1)
    print(f"{len(feats)} burns {start}..{end} -> {a.out}")


if __name__ == "__main__":
    main()
