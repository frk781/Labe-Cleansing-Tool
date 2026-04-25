"""API route definitions for the label cleansing tool."""
import logging
from pathlib import Path

import cv2
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from . import annotation_io
from .models import (
    AnnotationFile,
    ClassUpdateRequest,
    DatasetInfo,
    DatasetLoadRequest,
    PolygonData,
    SAMRequest,
    SAMResponse,
    StatusResponse,
)
from .sam_predictor import SAMPredictor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# Global state
sam = SAMPredictor()
_dataset_state = {
    "path": None,
    "format": None,
    "classes": [],
    "images": [],
}


@router.post("/dataset/load", response_model=DatasetInfo)
async def load_dataset(req: DatasetLoadRequest):
    """Load a dataset from a filesystem path."""
    path = req.path.strip()
    p = Path(path)

    if not p.exists():
        raise HTTPException(404, f"Path does not exist: {path}")
    if not p.is_dir():
        raise HTTPException(400, f"Path is not a directory: {path}")

    fmt = annotation_io.detect_format(path)
    images = annotation_io.find_images(path)
    classes = annotation_io.load_classes(path, fmt)

    if not images:
        raise HTTPException(400, f"No images found in: {path}")

    _dataset_state["path"] = path
    _dataset_state["format"] = fmt
    _dataset_state["classes"] = classes
    _dataset_state["images"] = images

    logger.info(
        f"Loaded dataset: {path} | format={fmt} | "
        f"{len(images)} images | {len(classes)} classes"
    )

    return DatasetInfo(
        path=path,
        images=images,
        classes=classes,
        format=fmt,
        total_images=len(images),
    )


@router.get("/dataset/annotated_images")
async def get_annotated_images():
    """Return a list of image names that have annotations."""
    if not _dataset_state["path"]:
        raise HTTPException(400, "No dataset loaded")
        
    path = _dataset_state["path"]
    fmt = _dataset_state["format"]
    images = _dataset_state["images"]
    
    annotated = []
    if fmt == "yolo":
        labels_dir = annotation_io.get_labels_dir(path)
        for img in images:
            txt_path = labels_dir / Path(img).with_suffix(".txt")
            if txt_path.exists() and txt_path.stat().st_size > 0:
                annotated.append(img)
    elif fmt == "coco":
        coco_data = annotation_io._load_coco_data(path)
        if coco_data:
            img_id_to_name = {i["id"]: i["file_name"] for i in coco_data.get("images", [])}
            ann_img_ids = {a["image_id"] for a in coco_data.get("annotations", [])}
            for iid in ann_img_ids:
                name = img_id_to_name.get(iid)
                if name and name in images:
                    annotated.append(name)
                    
    return {"annotated_images": annotated}


@router.get("/dataset/images/{image_name:path}")
async def get_image(image_name: str):
    """Serve a raw image file from the dataset."""
    if not _dataset_state["path"]:
        raise HTTPException(400, "No dataset loaded")

    img_dir = annotation_io.get_image_dir(_dataset_state["path"])
    img_path = img_dir / image_name

    if not img_path.exists():
        raise HTTPException(404, f"Image not found: {image_name}")

    return FileResponse(str(img_path))





@router.get("/annotations/{image_name:path}", response_model=AnnotationFile)
async def get_annotations(image_name: str):
    """Get annotations for a specific image."""
    if not _dataset_state["path"]:
        raise HTTPException(400, "No dataset loaded")

    img_dir = annotation_io.get_image_dir(_dataset_state["path"])
    img_path = img_dir / image_name

    if not img_path.exists():
        raise HTTPException(404, f"Image not found: {image_name}")

    # Get image dimensions
    img = cv2.imread(str(img_path))
    if img is None:
        raise HTTPException(500, f"Cannot read image: {image_name}")
    h, w = img.shape[:2]

    fmt = _dataset_state["format"]
    path = _dataset_state["path"]

    if fmt == "yolo":
        anns = annotation_io.load_yolo_annotations(path, image_name, w, h)
    elif fmt == "coco":
        anns = annotation_io.load_coco_annotations(path, image_name, w, h)
    else:
        anns = []

    return AnnotationFile(
        image_name=image_name,
        annotations=anns,
        image_width=w,
        image_height=h,
    )


@router.post("/annotations/{image_name:path}")
async def save_annotations(image_name: str, body: AnnotationFile):
    """Save annotations for a specific image."""
    if not _dataset_state["path"]:
        raise HTTPException(400, "No dataset loaded")

    fmt = _dataset_state["format"]
    path = _dataset_state["path"]

    if fmt == "yolo":
        annotation_io.save_yolo_annotations(
            path, image_name, body.annotations, body.image_width, body.image_height
        )
    elif fmt == "coco":
        annotation_io.save_coco_annotations(
            path, image_name, body.annotations, body.image_width, body.image_height
        )

    logger.info(
        f"Saved {len(body.annotations)} annotations for {image_name} ({fmt})"
    )
    return {"status": "ok", "count": len(body.annotations)}


@router.post("/sam/predict", response_model=SAMResponse)
async def sam_predict(req: SAMRequest):
    """Run SAM2 point-prompted segmentation."""
    if not _dataset_state["path"]:
        raise HTTPException(400, "No dataset loaded")

    img_dir = annotation_io.get_image_dir(_dataset_state["path"])
    img_path = img_dir / req.image_name

    if not img_path.exists():
        raise HTTPException(404, f"Image not found: {req.image_name}")

    try:
        # Ensure model is loaded (lazy)
        if not sam.is_loaded:
            sam.load_model()

        # Set image (uses cache if same image)
        sam.set_image(str(img_path))

        # Build point arrays
        points = [(p.x, p.y) for p in req.points]
        labels = [p.label for p in req.points]

        # Predict
        polygons, scores = sam.predict(points, labels, multimask=req.multimask)

        masks = [PolygonData(points=poly) for poly in polygons]
        return SAMResponse(masks=masks, scores=scores)

    except FileNotFoundError as e:
        raise HTTPException(500, str(e))
    except Exception as e:
        logger.exception("SAM prediction failed")
        raise HTTPException(500, f"SAM prediction error: {str(e)}")


@router.get("/sam/status", response_model=StatusResponse)
async def sam_status():
    """Check SAM model status."""
    return StatusResponse(
        model_loaded=sam.is_loaded,
        device=sam.device,
        model_size=sam._model_size,
        current_image=sam._current_image_path,
    )


@router.put("/classes")
async def update_classes(req: ClassUpdateRequest):
    """Update the class list for the dataset."""
    if not _dataset_state["path"]:
        raise HTTPException(400, "No dataset loaded")

    annotation_io.save_classes(
        _dataset_state["path"], req.classes, _dataset_state["format"]
    )
    _dataset_state["classes"] = req.classes

    logger.info(f"Updated classes: {req.classes}")
    return {"status": "ok", "classes": req.classes}


@router.get("/classes")
async def get_classes():
    """Get current class list."""
    return {"classes": _dataset_state["classes"]}
