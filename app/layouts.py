"""Teacher-authored geometry, validated before it reaches the shared renderer."""
import copy
from typing import Literal
from pydantic import Field, field_validator, model_validator
from app.schemas import Model, FieldSettings, safe_text


class LayoutField(FieldSettings):
    key: str = Field(pattern=r'^[a-z][a-z0-9_]{0,49}$')
    box: list[float] = Field(min_length=4, max_length=4)
    label_box: list[float] | None = None
    font_size: float = Field(ge=5, le=30)
    line_height: float = Field(ge=5, le=40)
    font: Literal['regular', 'bold', 'italic'] = 'regular'
    prefix: str = Field(default='', max_length=60)

    @field_validator('prefix')
    @classmethod
    def prefix_text(cls, value):
        return safe_text(value)

    @model_validator(mode='after')
    def geometry(self):
        check_box(self.box)
        if self.label_box is not None:
            check_box(self.label_box)
        if self.line_height < self.font_size:
            raise ValueError('Line height must be at least the font size.')
        return self


def check_box(box):
    import math
    if len(box) != 4 or not all(math.isfinite(x) for x in box):
        raise ValueError('A box needs four finite point measurements.')
    x, y, w, h = box
    if x < 4 or y < 4 or w < 8 or h < 5 or x + w > 176.001 or y + h > 248.001:
        raise ValueError('Boxes must stay inside the 4-point card margin (180 × 252 pt).')


class Layout(Model):
    version: Literal[2] = 2
    width_pt: Literal[180] = 180
    height_pt: Literal[252] = 252
    safe_pt: Literal[4] = 4
    fields: list[LayoutField] = Field(min_length=1, max_length=12)
    image_box: list[float] = Field(min_length=4, max_length=4)
    card_radius: float = Field(default=5, ge=0, le=90)
    image_radius: float = Field(default=8.5, ge=0, le=90)
    card_border_width: float = Field(default=1, ge=0, le=12)
    image_border_width: float = Field(default=0, ge=0, le=12)
    themes: list[str] = Field(min_length=1, max_length=5)
    instructions: str = Field(default='', max_length=2000)

    @model_validator(mode='after')
    def geometry(self):
        check_box(self.image_box)
        keys = [f.key for f in self.fields]
        if len(set(keys)) != len(keys) or set(keys) & {'card_id', 'copies', 'card_kind', 'theme', 'image_filename'}:
            raise ValueError('Use unique field keys that are not import metadata names.')
        safe_text(self.instructions)
        return self


class LayoutWrite(Model):
    title: str = Field(min_length=1, max_length=100)
    expected_version: int = Field(ge=0)
    template: Layout

    @field_validator('title')
    @classmethod
    def title_text(cls, value):
        return safe_text(value).strip()


def default_layout():
    specs = [
        ('common_name', 'Common Name', [13.32, 9, 153.36, 21], 10, 10.5, 'bold', 80, ''),
        ('binomial_name', 'Binomial Name', [13.32, 31, 153.36, 10], 7.5, 8.5, 'italic', 80, ''),
        ('family', 'Family', [13.32, 42, 153.36, 8], 6.5, 7.5, 'regular', 60, 'Family: '),
        ('categories', 'Categories', [13.32, 51, 153.36, 9], 6.5, 7.5, 'bold', 80, ''),
        ('mechanic_1', 'Mechanic 1', [13.32, 172, 153.36, 28], 6.5, 7.2, 'regular', 240, ''),
        ('mechanic_2', 'Mechanic 2', [13.32, 202, 153.36, 28], 6.5, 7.2, 'regular', 240, ''),
        ('extra_info', 'Fun facts / extra gameplay', [13.32, 232, 153.36, 14], 5.8, 6.4, 'regular', 130, ''),
    ]
    return Layout(fields=[LayoutField(key=k, label=l, box=b, font_size=s, line_height=h, font=f,
                    max_chars=m, required=k == 'common_name', label_box=None, prefix=p,
                    instructions='Write complete, concise text. Check the preview; text is never automatically shortened.')
                    for k, l, b, s, h, f, m, p in specs],
                  image_box=[13.32, 63, 153.36, 106.56], themes=['sage', 'sky', 'sand', 'rose', 'lavender']).model_dump()

