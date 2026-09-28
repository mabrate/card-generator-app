"""Read-only illustrated demo. Viewing examples never creates classroom records."""
import csv
from functools import lru_cache
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from PIL import Image
from app.config import ROOT, THEMES
from app.images import render_image
from app.layouts import default_layout
from app.rendering import render_card
from app.schemas import Crop

DIRECTORY = ROOT / 'demo' / 'v2'


def rows():
    with (DIRECTORY / 'campus-food-web-cards.csv').open(encoding='utf-8-sig', newline='') as source:
        return list(csv.DictReader(source))


@lru_cache(maxsize=32)
def rendered(identifier, csv_stamp, image_stamp):
    row = next((r for r in rows() if r['card_id'] == identifier), None)
    if row is None:
        raise HTTPException(404, 'Demo card not found.')
    template = default_layout()
    artwork = None
    if row['image_filename']:
        name = Path(row['image_filename']).name
        path = DIRECTORY / 'graphics' / name
        with Image.open(path) as source:
            image = {'width': source.width, 'height': source.height, 'preview_path': name}
        artwork = render_image(image, DIRECTORY / 'graphics', Crop(), template['image_box'])
    values = {f['key']: row[f['key']] for f in template['fields']}
    result = render_card(values, {}, next(t for t in THEMES if t['id'] == row['theme']), template, artwork)
    return {**result, 'copies': int(row['copies']), 'kind': row['card_kind']}


def demo_routes():
    router = APIRouter()

    @router.get('/demo')
    def page():
        return FileResponse(ROOT / 'app/static/demo.html')

    @router.get('/api/demo')
    def examples():
        return [{'id': r['card_id'], 'name': r['common_name'], 'copies': int(r['copies'])} for r in rows()]

    @router.get('/api/demo/{identifier}')
    def card(identifier: str):
        row = next((r for r in rows() if r['card_id'] == identifier), None)
        if not row:
            raise HTTPException(404, 'Demo card not found.')
        path = DIRECTORY / 'graphics' / Path(row['image_filename']).name if row['image_filename'] else None
        return rendered(identifier, (DIRECTORY / 'campus-food-web-cards.csv').stat().st_mtime_ns, path.stat().st_mtime_ns if path else 0)

    @router.get('/demo/cards.csv')
    def csv_file():
        return FileResponse(DIRECTORY / 'campus-food-web-cards.csv', filename='campus-food-web-cards.csv', media_type='text/csv')

    return router
