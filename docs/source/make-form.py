#!/usr/bin/env python3
"""Builds docs/Rabbit-Hole-Heuristic-Evaluation-Form.pdf — a fillable (AcroForm) evaluation pack.

    python docs/source/make-form.py            # needs: pip install -r docs/source/requirements.txt

Two passes: the first measures pages so the method table can show real page numbers.
"""
from __future__ import annotations

import io
import json
import os
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)

import form_back as FBK  # noqa: E402
import form_front as FF  # noqa: E402
import form_lib as L  # noqa: E402

OUT = os.path.join(ROOT, 'docs', 'Rabbit-Hole-Heuristic-Evaluation-Form.pdf')
VERSION = json.load(open(os.path.join(ROOT, 'package.json')))['version']
TODAY = date.today().strftime('%d %B %Y').lstrip('0')


def story(ctx):
    return (FF.front(ctx) + FF.method_a(ctx) + FF.method_b(ctx) + FBK.method_c(ctx) + FBK.method_d(ctx) + FBK.method_e(ctx) +
            FBK.method_f(ctx) + FBK.method_g(ctx) + FBK.method_h(ctx) + FBK.consolidation(ctx) + FBK.facilitator(ctx))


def build(target, total, pm):
    L.reset_registry()
    L.S.clear()
    L.S.update(L.styles())
    doc = L.FormDoc(target, pages_total=total, footer_note=f'build {VERSION} · {TODAY}',
                    title='Rabbit Hole — Heuristic & Usability Evaluation Pack', author='Rabbit Hole project',
                    subject='Fillable usability evaluation form: heuristic evaluation, cognitive walkthrough, think-aloud, SUS, relevance and trust survey, accessibility audit, error and performance matrix, A/B plan',
                    keywords='usability, heuristic evaluation, SUS, WCAG, Rabbit Hole', creator='docs/source/make-form.py')
    doc.build(story({'pm': pm, 'version': VERSION}))
    return doc


def main():
    L.register_fonts()
    first = build(io.BytesIO(), '?', {})
    second = build(OUT, first.page, first.found)
    assert second.page == first.page, 'page count changed between passes'
    print(f'✓ {OUT}\n  pages: {second.page} · fields: {dict(L.FIELD_COUNT)} · sections: {second.found}')


if __name__ == '__main__':
    main()
