"""Pydantic models for API request/response schemas."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class PointPrompt(BaseModel):
    x: float
    y: float
    label: int  # 1 = positive (foreground), 0 = negative (background)


class SAMRequest(BaseModel):
    image_name: str
    points: List[PointPrompt]
    multimask: bool = True


class PolygonData(BaseModel):
    points: List[List[float]]  # [[x,y], [x,y], ...]


class SAMResponse(BaseModel):
    masks: List[PolygonData]  # Multiple candidate masks
    scores: List[float]


class Annotation(BaseModel):
    class_id: int
    polygon: List[List[float]]  # [[x,y], ...] in pixel coords


class AnnotationFile(BaseModel):
    image_name: str
    annotations: List[Annotation]
    image_width: int
    image_height: int


class DatasetLoadRequest(BaseModel):
    path: str


class DatasetInfo(BaseModel):
    path: str
    images: List[str]
    classes: List[str]
    format: str  # "yolo" or "coco"
    total_images: int


class ClassUpdateRequest(BaseModel):
    classes: List[str]


class StatusResponse(BaseModel):
    model_loaded: bool
    device: str
    model_size: str
    current_image: Optional[str] = None
