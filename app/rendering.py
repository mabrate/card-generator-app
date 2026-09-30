"""Canonical point-based SVG, with the same glyph geometry for fitting and drawing.

Glyph outlines avoid browser font substitution and preserve physical geometry for
future PDF placement. No automatic type scaling, ellipses, or content rewriting.
"""
from functools import lru_cache
from html import escape
import math
import re

from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen

from app.config import ROOT


class Font:
    def __init__(self, name):
        self.font = TTFont(ROOT / "app" / "assets" / "fonts" / f"LiberationSans-{name}.ttf")
        self.glyphs = self.font.getGlyphSet()
        self.cmap = self.font.getBestCmap()
        self.units = self.font["head"].unitsPerEm

    @lru_cache(maxsize=8192)
    def glyph(self, char):
        name = self.cmap.get(ord(char), ".notdef")
        glyph = self.glyphs[name]
        pen = SVGPathPen(self.glyphs)
        glyph.draw(pen)
        bounds = BoundsPen(self.glyphs)
        glyph.draw(bounds)
        return glyph.width, pen.getCommands(), bounds.bounds

    def measure(self, text, size):
        advance, left, right, low, high = 0, 0, 0, 0, 0
        for char in text:
            width, _, bounds = self.glyph(char)
            if bounds:
                left = min(left, advance + bounds[0])
                right = max(right, advance + bounds[2])
                low, high = min(low, bounds[1]), max(high, bounds[3])
            advance += width
        scale = size / self.units
        return (max(right, advance) - left) * scale, left * scale, low * scale, high * scale


@lru_cache(maxsize=3)
def font_for(style):
    return Font({"regular": "Regular", "bold": "Bold", "italic": "Italic"}[style])


def wrap(text, font, size, width):
    """Wrap without changing font size. Explicit newlines consume a line."""
    lines = []
    for paragraph in text.split("\n"):
        line = ""
        for token in re.findall(r"\S+|[^\S\n]+", paragraph):
            candidate = line + token
            if line and font.measure(candidate, size)[0] > width:
                lines.append(line.rstrip())
                line = ""
                token = token.lstrip()
            for char in token:
                if line and font.measure(line + char, size)[0] > width:
                    lines.append(line.rstrip())
                    line = ""
                line += char
        lines.append(line.rstrip())
    return lines


def render_card(values, labels, theme, template, artwork=None, bleed=0, black_and_white=False):
    if black_and_white:
        theme = {**theme, 'background': '#ffffff', 'panel': '#ffffff', 'heading': '#333333', 'accent': '#444444'}
    issues, fragments, definitions, used = [], [], [], set()

    def issue(key, code, message):
        issues.append({"field": key, "code": code, "message": message})

    def text_block(key, text, label, box, size, leading, style="regular", color="#26382f", align="left", valign="top"):
        if not text:
            return
        x, y, width, height = box
        font = font_for(style)
        unsupported = sorted({char for char in text if char != "\n" and ord(char) not in font.cmap})
        if unsupported:
            issue(key, "unsupported_glyph", f"{label}: the card font cannot draw {''.join(unsupported)!r}. Use supported characters.")
        lines = wrap(text, font, size, width)
        overflow = False
        top = min((size * .92 + i * leading - font.measure(line, size)[3] for i, line in enumerate(lines)), default=0)
        bottom = max((size * .92 + i * leading - font.measure(line, size)[2] for i, line in enumerate(lines)), default=0)
        vertical_offset = 0
        if bottom - top <= height and valign != 'top':
            vertical_offset = (height - (bottom - top)) * (.5 if valign == 'middle' else 1) - top
        drawings = []
        for index, line in enumerate(lines):
            measured, left, low, high = font.measure(line, size)
            baseline = y + vertical_offset + size * 0.92 + index * leading
            if measured > width + 0.01 or baseline - high < y - 0.01 or baseline - low > y + height + 0.01:
                overflow = True
            # Keep all source text in the result metadata; only visible lines need paths.
            if index > math.ceil(height / leading):
                continue
            cursor = 0
            glyphs = []
            for char in line:
                advance, path, _ = font.glyph(char)
                glyph_id = f"glyph-{style}-{ord(char)}"
                if path:
                    if glyph_id not in used:
                        definitions.append(f'<path id="{glyph_id}" d="{path}"/>')
                        used.add(glyph_id)
                    glyphs.append(f'<use href="#{glyph_id}" transform="translate({cursor} 0)"/>')
                cursor += advance
            scale = size / font.units
            horizontal_offset = max(0, width - measured) * {"left": 0, "center": .5, "right": 1}[align]
            drawings.append(f'<g transform="translate({x-left+horizontal_offset:.4f} {baseline:.4f}) scale({scale:.8f} {-scale:.8f})">{"".join(glyphs)}</g>')
        if overflow:
            issue(key, "overflow", f"{label}: text does not fit at the fixed type size. Shorten it before saving or printing.")
        clip_id = f"clip-{key}"
        definitions.append(f'<clipPath id="{clip_id}"><rect x="{x}" y="{y}" width="{width}" height="{height}"/></clipPath>')
        fragments.append(f'<g data-field="{key}" data-font-size="{size}" role="img" aria-label="{escape(text, quote=True)}" fill="{color}" clip-path="url(#{clip_id})"><title>{escape(text)}</title>{"".join(drawings)}</g>')
        if overflow:
            fragments.append(f'<rect x="{x}" y="{y}" width="{width}" height="{height}" fill="none" stroke="#b42318" stroke-width="0.6" stroke-dasharray="2 1"/>')

    for field in template["fields"]:
        key, label = field["key"], labels.get(field["key"], field["label"])
        value = values.get(key, "")
        if field["required"] and not value.strip():
            issue(key, "required", f"{label} is required.")
        if len(value) > field["max_chars"]:
            issue(key, "character_limit", f"{label}: {len(value)} characters; the limit is {field['max_chars']}.")
        if field["label_box"] and value:
            text_block(key + "-label", label, label + " label", field["label_box"], 6, 6.7, "bold", theme["heading"])
        text_block(key, (field.get("prefix", "") + value) if value else "", label, field["box"], field["font_size"], field["line_height"], field["font"],
                   theme["heading"] if field["font"] == "bold" else ("#333333" if black_and_white else "#26382f"), field.get("text_align", "left"), field.get("vertical_align", "top"))

    x, y, width, height = template["image_box"]
    modern = template.get("version") == 2
    card_radius = min(template.get("card_radius", 5 if modern else 0), 90)
    image_radius = min(template.get("image_radius", 8.5), width / 2, height / 2)
    card_border_width = template.get("card_border_width", 1)
    image_border_width = min(template.get("image_border_width", 0), width / 2, height / 2)
    border_color = "#444444" if black_and_white else (theme["accent"] if modern else "#596359")
    background = f'<rect data-role="card-bleed" x="{-bleed}" y="{-bleed}" width="{180 + 2 * bleed}" height="{252 + 2 * bleed}" fill="{border_color}"/>' if bleed else ''
    background += f'<rect data-role="card-background" x="0" y="0" width="180" height="252" rx="{card_radius}" fill="{theme["background"]}"/>'
    if not modern:
        background += (
            f'<rect x="10" y="176" width="160" height="33" rx="3" fill="{theme["panel"]}"/>'
            f'<rect x="10" y="210" width="160" height="33" rx="3" fill="{theme["panel"]}"/>'
        )
    if artwork:
        # The placeholder is absent, including beneath the rounded image corners.
        definitions.append(f'<clipPath id="image-frame"><rect x="{x}" y="{y}" width="{width}" height="{height}" rx="{image_radius}"/></clipPath>')
        background += f'<image x="{x}" y="{y}" width="{width}" height="{height}" href="{artwork["data_uri"]}" preserveAspectRatio="none" clip-path="url(#image-frame)"/>'
    else:
        background += f'<rect data-role="image-placeholder" x="{x}" y="{y}" width="{width}" height="{height}" rx="{image_radius}" fill="{theme["panel"]}"/>'
        if not modern:
            background += f'<path d="M83 86 C81 74 105 72 100 89 C97 99 85 98 83 86 Z M83 103 L97 80" fill="none" stroke="{theme["accent"]}" stroke-width="1.5"/>'
        text_block("image-placeholder", "Organism image", "Image placeholder", [x + 4, y + height / 2, width - 8, 8], 6.2, 7.5, color=theme["heading"])
    if image_border_width:
        inset = image_border_width / 2
        background += (
            f'<rect data-role="image-border" x="{x + inset}" y="{y + inset}" width="{width - image_border_width}" height="{height - image_border_width}" '
            f'rx="{max(0, image_radius - inset)}" fill="none" stroke="{theme["accent"]}" stroke-width="{image_border_width}"/>'
        )
    definitions.append(f'<clipPath id="card-frame"><rect x="{-bleed}" y="{-bleed}" width="{180 + 2 * bleed}" height="{252 + 2 * bleed}" rx="{0 if bleed else card_radius}"/></clipPath>')
    card_border = ""
    if card_border_width:
        inset = card_border_width / 2
        card_border = (
            f'<rect data-role="card-border" x="{inset}" y="{inset}" width="{180 - card_border_width}" height="{252 - card_border_width}" '
            f'rx="{max(0, card_radius - inset)}" fill="none" stroke="{border_color}" stroke-width="{card_border_width}"/>'
        )
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{(180 + 2 * bleed) / 72}in" height="{(252 + 2 * bleed) / 72}in" viewBox="{-bleed} {-bleed} {180 + 2 * bleed} {252 + 2 * bleed}" role="img" aria-label="Card preview: {escape(values.get("common_name", values.get("title", values.get(template["fields"][0]["key"], "Untitled"))), quote=True)}">'
           f'<title>{escape(values.get("common_name", values.get("title", values.get(template["fields"][0]["key"], "Untitled card"))))}</title><defs>{"".join(definitions)}</defs><g clip-path="url(#card-frame)">{background}{"".join(fragments)}</g>{card_border}</svg>')
    return {"svg": svg, "valid": not issues, "issues": issues, "values": values, "labels": labels,
            "geometry": {"width_in": 2.5, "height_in": 3.5, "width_pt": 180, "height_pt": 252}}





