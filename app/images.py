"""Retain original uploads; use normalized derivatives for safe, consistent SVGs."""
import base64
import hashlib
from io import BytesIO
from pathlib import Path
import secrets
import sqlite3
import warnings

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

from app import db

MAX_UPLOAD = 12 * 1024 * 1024
MAX_PIXELS = 25_000_000


def upload(database, directory, owner, content, filename):
    if not content or len(content) > MAX_UPLOAD:
        raise HTTPException(413, 'Choose an image smaller than 12 MB.')
    checksum = hashlib.sha256(content).hexdigest()
    with db.connect(database) as connection:
        existing = connection.execute('SELECT * FROM images WHERE owner_hash=? AND sha256=?', (owner, checksum)).fetchone()
        if existing:
            return public_image(existing)
        count = connection.execute('SELECT count(*) FROM images WHERE owner_hash=?', (owner,)).fetchone()[0]
        if count >= 30:
            raise HTTPException(422, 'This card already has 30 image uploads. Reuse an existing image or ask your teacher for help.')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as source:
                if source.format not in {'JPEG', 'PNG', 'WEBP'} or getattr(source, 'n_frames', 1) != 1:
                    raise HTTPException(422, 'Use a single JPG, PNG, or WebP image. Convert HEIC/HEIF to JPG first.')
                if min(source.size) < 16:
                    raise HTTPException(422, 'Choose an image at least 16 pixels wide and tall.')
                if source.width * source.height > MAX_PIXELS:
                    raise HTTPException(422, 'Choose an image with 25 megapixels or fewer.')
                normalized = ImageOps.exif_transpose(source).convert('RGBA')
                width, height = normalized.size
                normalized.thumbnail((2400, 2400), Image.Resampling.LANCZOS)
                flattened = Image.new('RGB', normalized.size, 'white')
                flattened.paste(normalized, mask=normalized.getchannel('A'))
                derivative = BytesIO()
                flattened.save(derivative, format='JPEG', quality=92)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(422, 'This image could not be decoded safely. Try a smaller JPG or PNG.')
    identifier = secrets.token_hex(16)
    original, preview = f'{identifier}.original', f'{identifier}.jpg'
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    # Random server names, never paths supplied by the client.
    try:
        with db.connect(database) as connection:
            connection.execute('BEGIN IMMEDIATE')
            existing = connection.execute('SELECT * FROM images WHERE owner_hash=? AND sha256=?', (owner, checksum)).fetchone()
            if existing:
                return public_image(existing)
            if connection.execute('SELECT count(*) FROM images WHERE owner_hash=?', (owner,)).fetchone()[0] >= 30:
                raise HTTPException(422, 'This card has reached its image upload limit.')
            (directory / original).write_bytes(content)
            (directory / preview).write_bytes(derivative.getvalue())
            connection.execute('INSERT INTO images(id,owner_hash,sha256,filename,original_path,preview_path,width,height) VALUES(?,?,?,?,?,?,?,?)',
                               (identifier, owner, checksum, filename[:200], original, preview, width, height))
            row = connection.execute('SELECT * FROM images WHERE id=?', (identifier,)).fetchone()
    except (OSError, sqlite3.Error):
        # Remove only this attempt's newly generated files on failure.
        (directory / original).unlink(missing_ok=True)
        (directory / preview).unlink(missing_ok=True)
        raise HTTPException(503, 'The image could not be stored. Check server disk space and try again.')
    return public_image(row)


def public_image(row):
    return {'id': row['id'], 'filename': row['filename'], 'width': row['width'], 'height': row['height']}


def crop_box(width, height, crop, ratio):
    crop_width = min(width, height * ratio) / crop.zoom
    crop_height = crop_width / ratio
    left, top = (width - crop_width) * crop.x, (height - crop_height) * crop.y
    return left, top, left + crop_width, top + crop_height


def render_image(row, directory, crop, frame, for_print=False, black_and_white=False):
    """Use one crop calculation for preview pixels and effective print resolution."""
    ratio = frame[2] / frame[3]
    source_width, source_height = row['width'], row['height']
    if crop.rotation in (90, 270):
        source_width, source_height = source_height, source_width
    full_box = crop_box(source_width, source_height, crop, ratio)
    dpi = round((full_box[2] - full_box[0]) / (frame[2] / 72))
    try:
        with Image.open(Path(directory) / row['original_path' if for_print else 'preview_path']) as source:
            if for_print:
                normalized = ImageOps.exif_transpose(source).convert('RGBA')
                source = Image.new('RGB', normalized.size, 'white')
                source.paste(normalized, mask=normalized.getchannel('A'))
            rotated = source.rotate(-crop.rotation, expand=True)
            box = crop_box(*rotated.size, crop, ratio)
            rendered = rotated.crop(box)
            max_width = max(1000, round(frame[2] / 72 * 600)) if for_print else 1000
            rendered.thumbnail((max_width, round(max_width / ratio)), Image.Resampling.LANCZOS)
            if black_and_white:
                rendered = ImageOps.grayscale(rendered).convert('RGB')
            buffer = BytesIO()
            rendered.save(buffer, format='JPEG', quality=92)
    except (OSError, ValueError):
        raise HTTPException(503, 'The stored image is unavailable. Ask the teacher to check the server files.')
    return {'data_uri': 'data:image/jpeg;base64,' + base64.b64encode(buffer.getvalue()).decode(),
            'dpi': dpi, 'warning': f'This crop is about {dpi} DPI and may look blurry in print.' if dpi < 150 else None}


