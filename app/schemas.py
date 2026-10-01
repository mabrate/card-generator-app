from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator


def safe_text(value):
    if any(ord(c) < 32 and c != '\n' or 0xD800 <= ord(c) <= 0xDFFF or ord(c) in (0xFFFE, 0xFFFF) for c in value):
        raise ValueError('Text contains unsupported control characters.')
    return value


class Model(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class Crop(Model):
    x: float = Field(default=.5, ge=0, le=1)
    y: float = Field(default=.5, ge=0, le=1)
    zoom: float = Field(default=1, ge=1, le=4)
    rotation: Literal[0, 90, 180, 270] = 0


class Preview(Model):
    values: dict[str, str] = Field(max_length=12)
    labels: dict[str, str] = Field(default_factory=dict, max_length=5)
    theme: str = Field(default='sage', max_length=30)
    project_id: str = Field(default='field-guide', max_length=64)
    image_id: str | None = Field(default=None, max_length=64)
    crop: Crop = Field(default_factory=Crop)

    @field_validator('values', 'labels')
    @classmethod
    def bounded_text(cls, values):
        for key, value in values.items():
            if len(key) > 50 or len(value) > 2000:
                raise ValueError('A preview field is too large (maximum 2,000 characters).')
            safe_text(value)
        return values


class CardWrite(Preview):
    student_name: str = Field(default='', max_length=80)
    class_name: str = Field(default='', max_length=40)
    expected_version: int = Field(ge=0)
    project_version: int = Field(ge=1)
    mutation_id: str = Field(pattern=r'^[a-zA-Z0-9_-]{16,80}$')
    action: Literal['save', 'submit'] = 'save'
    copies: int | None = Field(default=None, ge=1, le=999)

    @field_validator('student_name', 'class_name')
    @classmethod
    def identity(cls, value):
        return safe_text(value).strip()


class Review(Model):
    expected_version: int = Field(ge=1)
    action: Literal['approve', 'revision', 'delete']
    note: str = Field(default='', max_length=1000)

    @field_validator('note')
    @classmethod
    def note_text(cls, value):
        return safe_text(value).strip()


class FieldSettings(Model):
    key: str = Field(max_length=50)
    label: str = Field(min_length=1, max_length=60)
    instructions: str = Field(default='', max_length=600)
    example: str = Field(default='', max_length=300)
    required: bool
    max_chars: int = Field(ge=1, le=2000)

    @field_validator('label', 'instructions', 'example')
    @classmethod
    def text(cls, value):
        return safe_text(value)


class ImportIdentity(Model):
    expected_version: int = Field(ge=1)
    student_name: str | None = Field(default=None, max_length=80)
    class_name: str | None = Field(default=None, max_length=40)

    @field_validator('student_name', 'class_name')
    @classmethod
    def identity(cls, value):
        return safe_text(value).strip() if value is not None else None


class ProjectDelete(Model):
    expected_version: int = Field(ge=1)


class ProjectWrite(Model):
    title: str = Field(min_length=1, max_length=100)
    instructions: str = Field(default='', max_length=2000)
    fields: list[FieldSettings] = Field(min_length=1, max_length=12)
    themes: list[str] = Field(min_length=1, max_length=7)
    expected_version: int = Field(ge=0)

    @field_validator('title', 'instructions')
    @classmethod
    def text(cls, value):
        return safe_text(value).strip()

