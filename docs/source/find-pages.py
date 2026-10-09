#!/usr/bin/env python3
"""find-pages.py <pdf> '<json [[id, title], ...]>'  ->  {"id": page_number, ...}

Reads the PDF outline (bookmarks Chrome builds from the headings) so the table of
contents in make-report.mjs gets real page numbers. Requires: pip install pypdf
"""
import json
import sys

from pypdf import PdfReader

pdf, chapters = sys.argv[1], json.loads(sys.argv[2])
reader = PdfReader(pdf)


def top_level(outline):
    for item in outline:
        if isinstance(item, list):
            continue  # nested (h2+) entries are not chapters
        yield item


found = {}
for item in top_level(reader.outline):
    page = reader.get_destination_page_number(item) + 1
    title = " ".join(item.title.split())
    for cid, ctitle in chapters:
        if cid not in found and ctitle in title:
            found[cid] = page
print(json.dumps(found))
