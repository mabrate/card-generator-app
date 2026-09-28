"""Read-only fixture previews. This is deliberately separate from future imports."""
import csv
from app.config import ROOT, SAMPLE


def examples():
    result = [{"id": "field-guide-sample", "name": "Field guide · Monarch butterfly", "values": SAMPLE, "labels": {}, "copies": 1}]
    with (ROOT / "demo" / "source" / "campus-food-web-cards.csv").open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            keys = ["title", "scientific_name", "category", "intro_text"]
            keys += [f"fact_{n}_text" for n in range(1, 4)] + [f"section_{n}_text" for n in range(1, 3)]
            values = {key: row[key] for key in keys}
            labels = {key: row[key.replace("_text", "_label")] for key in keys if key.startswith(("fact_", "section_"))}
            result.append({"id": row["card_id"], "name": "Campus Food Web · " + row["title"], "values": values,
                           "labels": labels, "copies": int(row["copies"]), "kind": row["card_kind"]})
    return result

