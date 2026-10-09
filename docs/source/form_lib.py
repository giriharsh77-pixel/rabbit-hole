"""Building blocks for the fillable evaluation pack (reportlab platypus + AcroForm).

Every widget is a Flowable that registers a real PDF form field at its drawn position, so
widgets can sit inside tables and flow across pages. Field names must be unique per document;
`uniq()` enforces that so a typo can never silently merge two fields.
"""
from __future__ import annotations

import os
import sys

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import simpleSplit
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import registerFontFamily, stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Flowable, Frame, KeepTogether, PageBreak, PageTemplate,
                                Paragraph, Spacer, Table, TableStyle)

# ── reportlab fix: radio / circle appearance streams ────────────────────────────
# AcroForm.circleArcStream scales the radius by size/20 *again*, so circles are only correct at exactly 20 pt;
# our 9–10 pt radios came out as a small circle in the corner. Same Bézier maths without the extra scaling.
from reportlab.pdfbase import acroform as _acroform  # noqa: E402
from reportlab.lib.rl_accel import fp_str as _fp  # noqa: E402


def _circle_arc_stream(size, r, arcs=(0, 1, 2, 3), rotated=False):
    out = []
    h = _fp(size * 0.5)
    k = 0.55231 * r
    cp, rr = _fp(k), _fp(r)
    out.append(('0.7071 0.7071 -0.7071 0.7071' if rotated else '1 0 0 1') + f' {h} {h} cm')
    if 0 in arcs:
        if len(out) == 1:
            out.append(f'{rr} 0 m')
        out.append(f'{rr} {cp} {cp} {rr} 0 {rr} c')
    if 1 in arcs:
        if len(out) == 1:
            out.append(f'0 {rr} m')
        out.append(f'-{cp} {rr} -{rr} {cp} -{rr} 0 c')
    if 2 in arcs:
        if len(out) == 1:
            out.append(f'-{rr} 0 m')
        out.append(f'-{rr} -{cp} -{cp} -{rr} 0 -{rr} c')
    if 3 in arcs:
        if len(out) == 1:
            out.append(f'0 -{rr} m')
        out.append(f'{cp} -{rr} {rr} -{cp} {rr} 0 c')
    return '\n'.join(out)


_acroform.AcroForm.circleArcStream = staticmethod(_circle_arc_stream)

# ── palette (matches the report) ────────────────────────────────────────────────
INK = colors.HexColor('#16161a')
INK2 = colors.HexColor('#4f4f59')
INK3 = colors.HexColor('#85858f')
ACCENT = colors.HexColor('#d63a0b')
SOFT = colors.HexColor('#fdeee8')
LINE = colors.HexColor('#cfcbc2')
PAPER2 = colors.HexColor('#f3f1ec')
DARK = colors.HexColor('#0b0b0d')
FIELD_FILL = colors.HexColor('#f3f7fd')
FIELD_BORDER = colors.HexColor('#7f93b5')

PAGE_W, PAGE_H = 210 * mm, 297 * mm
MARGIN_X = 14 * mm
CONTENT_W = PAGE_W - 2 * MARGIN_X

# ── fonts ───────────────────────────────────────────────────────────────────────
_FONT_DIRS = [
    '/System/Library/Fonts/Supplemental/',
    '/Library/Fonts/',
    os.path.expanduser('~/Library/Fonts/'),
    'C:/Windows/Fonts/',
    '/usr/share/fonts/truetype/msttcorefonts/',
    '/usr/share/fonts/truetype/liberation/',
    '/usr/share/fonts/truetype/dejavu/',
]
_FAMILIES = [
    ('Arial.ttf', 'Arial Bold.ttf', 'Arial Italic.ttf', 'Arial Bold Italic.ttf'),
    ('arial.ttf', 'arialbd.ttf', 'ariali.ttf', 'arialbi.ttf'),
    ('LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf', 'LiberationSans-Italic.ttf', 'LiberationSans-BoldItalic.ttf'),
    ('DejaVuSans.ttf', 'DejaVuSans-Bold.ttf', 'DejaVuSans-Oblique.ttf', 'DejaVuSans-BoldOblique.ttf'),
]
F, FB, FI, FBI = 'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'
UNICODE_FONT = False


def register_fonts() -> None:
    """Register a Unicode family (Arial / Liberation / DejaVu); fall back to core Helvetica."""
    global F, FB, FI, FBI, UNICODE_FONT
    for family in _FAMILIES:
        for d in _FONT_DIRS:
            paths = [os.path.join(d, n) for n in family]
            if all(os.path.exists(p) for p in paths):
                for name, p in zip(('RH', 'RH-Bold', 'RH-Italic', 'RH-BoldItalic'), paths):
                    pdfmetrics.registerFont(TTFont(name, p))
                registerFontFamily('RH', normal='RH', bold='RH-Bold', italic='RH-Italic', boldItalic='RH-BoldItalic')
                F, FB, FI, FBI = 'RH', 'RH-Bold', 'RH-Italic', 'RH-BoldItalic'
                UNICODE_FONT = True
                return
    print('warning: no Unicode TTF family found — using Helvetica; some symbols will be simplified', file=sys.stderr)


def txt(s: str) -> str:
    """Simplify symbols the core fonts cannot draw (only matters without a Unicode family)."""
    if UNICODE_FONT:
        return s
    table = {'≥': '>=', '≤': '<=', '→': '->', '←': '<-', '×': 'x', '—': '-', '–': '-', '·': '-', '“': '"', '”': '"', '’': "'", '↗': '', '≈': '~', '•': '-'}
    for k, v in table.items():
        s = s.replace(k, v)
    return s


def ascii_val(s: str) -> str:
    """Prefilled values live in core-Helvetica form fields, which cannot draw Unicode."""
    table = {'≥': '>=', '≤': '<=', '→': '->', '←': '<-', '×': 'x', '—': '-', '–': '-', '·': '-', '“': '"', '”': '"', '’': "'", '‘': "'", '≈': '~', '•': '-', '↗': ''}
    for k, v in table.items():
        s = s.replace(k, v)
    return s.encode('ascii', 'replace').decode('ascii')


def styles() -> dict[str, ParagraphStyle]:
    base = dict(fontName=F, textColor=INK, leading=11.2, fontSize=8.4)
    return {
        'body': ParagraphStyle('body', **base, spaceAfter=2),
        'small': ParagraphStyle('small', **{**base, 'fontSize': 7.4, 'leading': 9.6, 'textColor': INK2}),
        'tiny': ParagraphStyle('tiny', **{**base, 'fontSize': 6.8, 'leading': 8.6, 'textColor': INK3}),
        'cell': ParagraphStyle('cell', **{**base, 'fontSize': 7.8, 'leading': 10}),
        'cellb': ParagraphStyle('cellb', **{**base, 'fontName': FB, 'fontSize': 7.8, 'leading': 10}),
        'label': ParagraphStyle('label', **{**base, 'fontName': FB, 'fontSize': 7.2, 'leading': 9, 'textColor': INK2}),
        'h2': ParagraphStyle('h2', **{**base, 'fontName': FB, 'fontSize': 10.4, 'leading': 13, 'spaceBefore': 5, 'spaceAfter': 3}),
        'h3': ParagraphStyle('h3', **{**base, 'fontName': FB, 'fontSize': 9, 'leading': 11.5, 'spaceBefore': 3, 'spaceAfter': 2}),
        'ital': ParagraphStyle('ital', **{**base, 'fontName': FI, 'fontSize': 7.8, 'leading': 10, 'textColor': INK2}),
        'bullet': ParagraphStyle('bullet', **{**base, 'fontSize': 7.8, 'leading': 10, 'leftIndent': 8, 'bulletIndent': 0, 'spaceAfter': 0.6}),
        'center': ParagraphStyle('center', **{**base, 'fontSize': 7.4, 'leading': 9, 'alignment': 1}),
        'tinyc': ParagraphStyle('tinyc', **{**base, 'fontSize': 6.4, 'leading': 7.6, 'textColor': INK2, 'alignment': 1}),
        'centerb': ParagraphStyle('centerb', **{**base, 'fontName': FB, 'fontSize': 7.4, 'leading': 9, 'alignment': 1}),
    }


S: dict[str, ParagraphStyle] = {}


def P(text: str, style: str = 'body') -> Paragraph:
    return Paragraph(txt(text), S[style])


def bullets(items: list[str], style: str = 'bullet') -> list[Paragraph]:
    return [Paragraph(txt(i), S[style], bulletText='•' if UNICODE_FONT else '-') for i in items]


# ── field-name registry ────────────────────────────────────────────────────────
_USED: set[str] = set()
FIELD_COUNT = {'text': 0, 'check': 0, 'radio': 0, 'choice': 0}


def reset_registry() -> None:
    _USED.clear()
    for k in FIELD_COUNT:
        FIELD_COUNT[k] = 0


def uniq(name: str) -> str:
    if name in _USED:
        raise ValueError(f'duplicate form-field name: {name}')
    _USED.add(name)
    return name


# ── widgets ────────────────────────────────────────────────────────────────────
class TextBox(Flowable):
    """Single- or multi-line text field. Width defaults to the space the layout gives it."""

    def __init__(self, name: str, width: float | None = None, height: float = 6.0 * mm, multiline: bool = False,
                 value: str = '', tip: str = '', size: float = 8.2, maxlen: int = 0):
        super().__init__()
        self.name, self._w, self.height = uniq(name), width, height
        self.multiline, self.value, self.tip, self.size = multiline, ascii_val(value), tip or name.replace('_', ' '), size
        self.maxlen = maxlen or (4000 if multiline else 300)
        self.width = width or 0

    def wrap(self, aw, ah):
        self.width = self._w or aw
        return self.width, self.height

    def draw(self):
        FIELD_COUNT['text'] += 1
        value = self.value
        if self.multiline and value:
            # reportlab's appearance stream does not wrap; pre-wrap so prefilled text is fully visible in every viewer
            lines = simpleSplit(value, 'Helvetica', self.size, self.width - 7)
            if len(lines) * self.size * 1.2 > self.height - 1:
                print(f'warning: prefilled text overflows field {self.name} ({len(lines)} lines)', file=sys.stderr)
            value = '\n'.join(lines)
        self.canv.acroForm.textfield(
            name=self.name, tooltip=self.tip, value=value, x=0, y=0, width=self.width, height=self.height,
            relative=True, fontName='Helvetica', fontSize=self.size, borderColor=FIELD_BORDER, fillColor=FIELD_FILL,
            textColor=colors.black, borderWidth=0.6, borderStyle='solid', forceBorder=True,
            fieldFlags='multiline' if self.multiline else '', maxlen=self.maxlen)


class Dropdown(Flowable):
    """Combo-box with a fixed option list; first option is the placeholder."""

    def __init__(self, name: str, options: list[str], width: float = 18 * mm, height: float = 5.6 * mm, tip: str = ''):
        super().__init__()
        self.name, self.options, self.width, self.height = uniq(name), options, width, height
        self.tip = tip or name.replace('_', ' ')

    def wrap(self, aw, ah):
        return self.width, self.height

    def draw(self):
        FIELD_COUNT['choice'] += 1
        self.canv.acroForm.choice(
            name=self.name, tooltip=self.tip, value=self.options[0], options=self.options, x=0, y=0, width=self.width,
            height=self.height, relative=True, fontName='Helvetica', fontSize=8, borderColor=FIELD_BORDER,
            fillColor=FIELD_FILL, textColor=colors.black, borderWidth=0.6, forceBorder=True, fieldFlags='combo')


class ChoiceRow(Flowable):
    """A row of checkboxes (independent) or radio buttons (one group) with labels; wraps to fit."""

    def __init__(self, kind: str, name: str, items: list[tuple[str, str]], size: float = 3.4 * mm, fsize: float = 7.8,
                 gap: float = 3.6 * mm, tip: str = '', font: str | None = None, spread: bool = False):
        super().__init__()
        assert kind in ('check', 'radio')
        self.kind, self.items, self.size, self.fsize, self.gap, self.spread = kind, items, size, fsize, gap, spread
        self.font = font or F
        self.group = uniq(name) if kind == 'radio' else name
        if kind == 'check':
            for key, _ in items:
                uniq(f'{name}__{key}')
        self.tip = tip or name.replace('_', ' ')
        self.lh = size + 1.5 * mm
        self._pos: list[tuple[float, int, str, str]] = []

    def wrap(self, aw, ah):
        if self.spread:  # evenly spaced, centred in equal segments, no inline labels (headings carry them)
            seg = aw / len(self.items)
            self._pos = [(i * seg + (seg - self.size) / 2, 0, key, txt(label)) for i, (key, label) in enumerate(self.items)]
            self.width, self.height = aw, self.lh
            return self.width, self.height
        x, row, self._pos = 0.0, 0, []
        for key, label in self.items:
            label = txt(label)
            w = self.size + 1.5 * mm + stringWidth(label, self.font, self.fsize)
            if x > 0 and x + w > aw:
                row, x = row + 1, 0.0
            self._pos.append((x, row, key, label))
            x += w + self.gap
        self.width = aw
        self.height = (row + 1) * self.lh
        return self.width, self.height

    def draw(self):
        c = self.canv
        for x, row, key, label in self._pos:
            y = self.height - (row + 1) * self.lh + (self.lh - self.size) / 2
            common = dict(x=x, y=y, size=self.size, relative=True, borderColor=FIELD_BORDER, fillColor=FIELD_FILL,
                          textColor=colors.black, borderWidth=0.7, forceBorder=True, tooltip=f'{self.tip}: {label or key}')
            if self.kind == 'check':
                FIELD_COUNT['check'] += 1
                c.acroForm.checkbox(name=f'{self.group}__{key}', buttonStyle='check', shape='square', fieldFlags='', **common)
            else:
                FIELD_COUNT['radio'] += 1
                c.acroForm.radio(name=self.group, value=key, selected=False, buttonStyle='circle', shape='circle',
                                 fieldFlags='noToggleToOff radio', **common)
            if not self.spread:
                c.setFont(self.font, self.fsize)
                c.setFillColor(INK)
                c.drawString(x + self.size + 1.4 * mm, y + (self.size - self.fsize * 0.72) / 2, label)


class Banner(Flowable):
    """Full-width method header; also registers a PDF outline entry + page lookup."""

    def __init__(self, key: str, letter: str, title: str, meta: str = '', sub: str = ''):
        super().__init__()
        self.key, self.letter, self.title, self.meta, self.sub = key, letter, title, meta, sub
        self.height = 13.5 * mm if sub else 11 * mm
        self.outline = (f'{letter} · {title}' if letter else title, 0)

    def wrap(self, aw, ah):
        self.width = aw
        return aw, self.height

    def draw(self):
        c, w, h = self.canv, self.width, self.height
        c.setFillColor(DARK)
        c.roundRect(0, 0, w, h, 2 * mm, stroke=0, fill=1)
        c.setFillColor(ACCENT)
        c.roundRect(2.2 * mm, h / 2 - 3.5 * mm, 7 * mm, 7 * mm, 1.6 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont(FB, 10.5)
        c.drawCentredString(5.7 * mm, h / 2 - 1.6 * mm, self.letter or '•')
        c.setFont(FB, 11.5)
        c.drawString(12 * mm, h / 2 + (0.6 * mm if self.sub else -1.5 * mm), txt(self.title))
        if self.sub:
            c.setFont(F, 7.4)
            c.setFillColor(colors.HexColor('#c8c8d0'))
            c.drawString(12 * mm, h / 2 - 3.4 * mm, txt(self.sub))
        if self.meta:
            c.setFont(F, 7.4)
            c.setFillColor(colors.HexColor('#ffb59a'))
            c.drawRightString(w - 3 * mm, h / 2 + (0.6 * mm if self.sub else -1.2 * mm), txt(self.meta))


class Rule(Flowable):
    def __init__(self, color=LINE, thickness=0.6, space=2 * mm):
        super().__init__()
        self.color, self.t, self.space = color, thickness, space

    def wrap(self, aw, ah):
        self.width = aw
        return aw, self.space * 2

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.t)
        self.canv.line(0, self.space, self.width, self.space)


# ── layout helpers ─────────────────────────────────────────────────────────────
def tbl(data, widths, style=None, repeat=0, pad=1.6 * mm, valign='TOP', **kw):
    t = Table(data, colWidths=widths, repeatRows=repeat, **kw)
    base = [('VALIGN', (0, 0), (-1, -1), valign), ('LEFTPADDING', (0, 0), (-1, -1), pad), ('RIGHTPADDING', (0, 0), (-1, -1), pad),
            ('TOPPADDING', (0, 0), (-1, -1), 1.3 * mm), ('BOTTOMPADDING', (0, 0), (-1, -1), 1.3 * mm)]
    t.setStyle(TableStyle(base + (style or [])))
    return t


GRID = [('GRID', (0, 0), (-1, -1), 0.4, LINE)]
HEAD = [('BACKGROUND', (0, 0), (-1, 0), PAPER2), ('LINEBELOW', (0, 0), (-1, 0), 0.9, colors.HexColor('#b9b2a3'))]


def labelled(label: str, widget, width: float, label_w: float = 30 * mm):
    """label | field"""
    return tbl([[P(label, 'label'), widget]], [label_w, width - label_w], pad=0.8 * mm, valign='MIDDLE')


def pairs(rows: list[list[tuple[str, Flowable]]], total: float = CONTENT_W, label_w: float = 27 * mm, cols: int = 2):
    """Grid of `label | field` pairs, `cols` per row."""
    each = total / cols
    data, widths = [], []
    for _ in range(cols):
        widths += [label_w, each - label_w]
    for row in rows:
        cells = []
        for label, widget in row:
            cells += [P(label, 'label'), widget]
        while len(cells) < cols * 2:
            cells += ['', '']
        data.append(cells)
    return tbl(data, widths, pad=0.9 * mm, valign='MIDDLE')


def callout(text_or_flowables, color=ACCENT, bg=colors.HexColor('#faf9f6')):
    inner = [P(text_or_flowables, 'cell')] if isinstance(text_or_flowables, str) else text_or_flowables
    t = Table([[inner]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), bg), ('LINEBEFORE', (0, 0), (0, -1), 2.2, color),
                           ('BOX', (0, 0), (-1, -1), 0.4, LINE), ('LEFTPADDING', (0, 0), (-1, -1), 3 * mm),
                           ('RIGHTPADDING', (0, 0), (-1, -1), 3 * mm), ('TOPPADDING', (0, 0), (-1, -1), 2 * mm),
                           ('BOTTOMPADDING', (0, 0), (-1, -1), 2 * mm)]))
    return t


# ── document ───────────────────────────────────────────────────────────────────
class FormDoc(BaseDocTemplate):
    def __init__(self, filename, pages_total: int | str = '?', page_map: dict | None = None, footer_note: str = '', **kw):
        super().__init__(filename, pagesize=(PAGE_W, PAGE_H), leftMargin=MARGIN_X, rightMargin=MARGIN_X,
                         topMargin=19 * mm, bottomMargin=15 * mm, **kw)
        self.pages_total, self.found, self.footer_note = pages_total, {}, footer_note
        frame = Frame(MARGIN_X, 15 * mm, CONTENT_W, PAGE_H - 34 * mm, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([PageTemplate(id='all', frames=[frame], onPage=self._decorate)])

    def _decorate(self, c, doc):
        c.saveState()
        c.setFillColor(ACCENT)
        c.roundRect(MARGIN_X, PAGE_H - 12.6 * mm, 4.2 * mm, 4.2 * mm, 1.1 * mm, stroke=0, fill=1)
        c.setFillColor(INK)
        c.setFont(FB, 8)
        c.drawString(MARGIN_X + 6 * mm, PAGE_H - 11.4 * mm, 'Rabbit Hole')
        c.setFillColor(INK3)
        c.setFont(F, 7.6)
        c.drawString(MARGIN_X + 25 * mm, PAGE_H - 11.4 * mm, txt('Heuristic & Usability Evaluation Pack'))
        c.drawRightString(PAGE_W - MARGIN_X, PAGE_H - 11.4 * mm, txt(self.footer_note))
        c.setStrokeColor(LINE)
        c.setLineWidth(0.5)
        c.line(MARGIN_X, PAGE_H - 14.2 * mm, PAGE_W - MARGIN_X, PAGE_H - 14.2 * mm)
        c.line(MARGIN_X, 12.2 * mm, PAGE_W - MARGIN_X, 12.2 * mm)
        c.setFont(F, 7)
        c.drawString(MARGIN_X, 8.4 * mm, txt('Fillable PDF · save one copy per evaluator · contains personal data only if you type it'))
        c.drawRightString(PAGE_W - MARGIN_X, 8.4 * mm, f'Page {doc.page} of {self.pages_total}')
        c.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Banner):
            self.found[flowable.key] = self.page
            self.canv.bookmarkPage(flowable.key)
            title, level = flowable.outline
            self.canv.addOutlineEntry(txt(title), flowable.key, level=level, closed=False)
