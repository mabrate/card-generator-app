"""Seed configuration is data; the renderer knows slots, never subject labels."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "app" / "static"

THEMES = [
    {"id": "sage", "name": "Sage", "background": "#eef3e8", "heading": "#244734", "panel": "#dfe9d6", "accent": "#668256"},
    {"id": "sky", "name": "Sky", "background": "#edf3f8", "heading": "#25445f", "panel": "#dce8f2", "accent": "#6486a2"},
    {"id": "sand", "name": "Sand", "background": "#f8f2e5", "heading": "#604923", "panel": "#eee2c8", "accent": "#a38b5a"},
    {"id": "rose", "name": "Rose", "background": "#f9eef0", "heading": "#693d48", "panel": "#efdce1", "accent": "#ac7884"},
    {"id": "lavender", "name": "Lavender", "background": "#f2eef8", "heading": "#51436c", "panel": "#e5ddf0", "accent": "#8a79a5"},
    {"id": "white", "name": "White", "background": "#ffffff", "heading": "#222222", "panel": "#f7f7f7", "accent": "#555555"},
    {"id": "light-gray", "name": "Light Gray", "background": "#f1f2f3", "heading": "#25282b", "panel": "#e1e3e5", "accent": "#6b7075"},
]


def field(key, label, maximum, box, size, line_height, font="regular", label_box=None):
    return {"key": key, "label": label, "max_chars": maximum, "box": box,
            "font_size": size, "line_height": line_height, "font": font,
            "label_box": label_box, "required": key == "title"}


TEMPLATE = {
    "version": 1, "width_pt": 180, "height_pt": 252, "safe_pt": 10,
    "image_box": [10, 61, 160, 59], "themes": [t["id"] for t in THEMES],
    "fields": [
        field("title", "Common name", 48, [10, 10, 160, 26], 11.5, 12.5, "bold"),
        field("scientific_name", "Scientific name", 60, [10, 38, 160, 10], 7.5, 9, "italic"),
        field("category", "Category", 48, [10, 50, 160, 8], 6.3, 7.5, "bold"),
        field("fact_1_text", "Family", 65, [56, 123, 114, 14], 6.2, 6.7, label_box=[10, 123, 43, 14]),
        field("fact_2_text", "Ecosystem role", 65, [56, 137, 114, 14], 6.2, 6.7, label_box=[10, 137, 43, 14]),
        field("fact_3_text", "Adult size", 65, [56, 151, 114, 14], 6.2, 6.7, label_box=[10, 151, 43, 14]),
        field("intro_text", "Introduction", 65, [10, 167, 160, 8], 6.3, 7.5),
        field("section_1_text", "Adaptations", 150, [14, 185, 152, 23], 7, 7.5, label_box=[14, 177, 152, 8]),
        field("section_2_text", "Ecosystem services", 150, [14, 219, 152, 23], 7, 7.5, label_box=[14, 211, 152, 8]),
    ],
}

SAMPLE = {
    "title": "Monarch butterfly", "scientific_name": "Danaus plexippus",
    "category": "GARDEN FIELD GUIDE", "fact_1_text": "Nymphalidae",
    "fact_2_text": "Pollinator; herbivore as a caterpillar", "fact_3_text": "Wingspan: 9–10 cm",
    "intro_text": "Look closely. Every organism has a role.",
    "section_1_text": "Bright wing colors warn predators. Caterpillars feed on milkweed leaves.",
    "section_2_text": "Adults visit flowers for nectar and carry pollen between plants.",
}
