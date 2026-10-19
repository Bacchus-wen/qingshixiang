#!/usr/bin/env python3
"""List CC0 sounds on Freesound for a query (the public search page; no account or key needed).
   python3 tools/freesound-search.py "pendulum clock ticking" [pages]
Prints: id, duration, author, title, preview URL (hq mp3). Download a preview with curl, credit it in CREDITS.md."""
import re, sys, html, urllib.parse, urllib.request

q = sys.argv[1]; pages = int(sys.argv[2]) if len(sys.argv) > 2 else 1
for page in range(1, pages + 1):
    url = 'https://freesound.org/search/?' + urllib.parse.urlencode({'q': q, 'f': 'license:"Creative Commons 0"', 's': 'Rating highest first', 'page': page})
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    doc = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'replace')
    # each result is a "bw-search__result" block holding the player (data-mp3, data-duration) and the title link
    for block in doc.split('bw-search__result')[1:]:
        mp3 = re.search(r'data-mp3="([^"]+)"', block)
        dur = re.search(r'data-duration="([^"]+)"', block)
        link = re.search(r'href="/people/([^/]+)/sounds/(\d+)/"[^>]*title="([^"]*)"', block) or re.search(r'href="/people/([^/]+)/sounds/(\d+)/"[^>]*>([^<]+)<', block)
        if not (mp3 and link): continue
        user, sid, title = link.group(1), link.group(2), html.unescape(link.group(3)).strip()
        print(f'{sid:>7}  {float(dur.group(1)) if dur else 0:7.1f}s  {user:<22.22} {title[:60]:<60} {mp3.group(1).replace("-lq.mp3", "-hq.mp3")}')
