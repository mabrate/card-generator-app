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
    text_align: Literal['left', 'center', 'right'] = 'left'
    vertical_align: Literal['top', 'middle', 'bottom'] = 'top'

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
    themes: list[str] = Field(min_length=1, max_length=7)
    instructions: str = Field(default='', max_length=2000)

    @model_validator(mode='after')
    def geometry(self):
        check_box(self.image_box)
        keys = [f.key for f in self.fields]
        if len(set(keys)) != len(keys) or set(keys) & {'card_id', 'copies', 'card_kind', 'theme', 'image_filename', 'student_name', 'class_name', 'image'}:
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
                  image_box=[13.32, 63, 153.36, 106.56],
                  themes=['white', 'light-gray', 'sage', 'sky', 'sand', 'rose', 'lavender']).model_dump()



def layout_presets():
    """Original classroom layouts inspired by familiar card categories."""
    styles = [
        ('organism', 'Field guide', default_layout()),
    ]

    def make(specs, image_box):
        fields = [LayoutField(key=key, label=label, box=box, font_size=size,
                              line_height=size * 1.15, font=font, max_chars=limit,
                              required=index == 0, text_align=align,
                              instructions='Write concise text and check the preview.').model_dump()
                  for index, (key, label, box, size, font, limit, align) in enumerate(specs)]
        return Layout(fields=fields, image_box=image_box, themes=default_layout()['themes'],
                      image_radius=0, image_border_width=1).model_dump()

    styles.extend([
        ('playing', 'Classic playing card', make([
            ('rank', 'Rank / value', [14, 12, 40, 27], 20, 'bold', 3, 'left'),
            ('suit', 'Suit / symbol name', [14, 42, 152, 17], 12, 'regular', 20, 'center'),
            ('caption', 'Center caption', [14, 191, 152, 20], 12, 'bold', 32, 'center'),
            ('bottom_rank', 'Bottom rank / value', [126, 215, 40, 27], 20, 'bold', 3, 'right'),
        ], [37, 66, 106, 116])),
        ('creature', 'Creature trading card', make([
            ('name', 'Name', [12, 12, 112, 20], 12, 'bold', 45, 'left'),
            ('health', 'Health / points', [128, 12, 40, 20], 10, 'bold', 12, 'right'),
            ('type', 'Type / category', [12, 139, 156, 13], 8, 'italic', 60, 'left'),
            ('ability', 'Ability', [12, 158, 156, 34], 8, 'regular', 180, 'left'),
            ('action', 'Action / attack', [12, 198, 156, 29], 8, 'regular', 140, 'left'),
            ('stats', 'Weakness / cost', [12, 233, 156, 10], 6, 'regular', 75, 'center'),
        ], [12, 37, 156, 96])),
        ('spell', 'Spell and strategy card', make([
            ('name', 'Name', [12, 12, 119, 20], 11, 'bold', 50, 'left'),
            ('cost', 'Cost', [135, 12, 33, 20], 10, 'bold', 10, 'right'),
            ('type', 'Type / category', [12, 140, 156, 13], 8, 'bold', 60, 'left'),
            ('rules', 'Rules / effect', [12, 159, 156, 48], 8, 'regular', 270, 'left'),
            ('flavor', 'Flavor text', [12, 213, 116, 29], 7, 'italic', 130, 'left'),
            ('power', 'Power', [134, 222, 34, 20], 10, 'bold', 10, 'right'),
        ], [12, 37, 156, 97])),
        ('sports', 'Sports / profile card', make([
            ('name', 'Name', [12, 12, 156, 22], 13, 'bold', 45, 'center'),
            ('team', 'Team / group', [12, 169, 156, 14], 9, 'bold', 60, 'center'),
            ('role', 'Position / role', [12, 188, 156, 13], 8, 'italic', 65, 'center'),
            ('stats', 'Stats', [12, 207, 156, 15], 8, 'bold', 75, 'center'),
            ('bio', 'Short profile', [12, 228, 156, 16], 6.5, 'regular', 120, 'left'),
        ], [12, 40, 156, 123])),
    ])
    presets = []
    for key, title, template in styles:
        for suffix, label, radius in [('square', 'square corners', 0), ('rounded', '3 mm corners', 3 * 72 / 25.4)]:
            layout = copy.deepcopy(template)
            layout['card_radius'] = radius
            presets.append({'id': key + '-' + suffix, 'title': title + ' · ' + label, 'template': layout})
    return presets
