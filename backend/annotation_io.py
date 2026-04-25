"""Annotation I/O for YOLO segmentation and COCO JSON formats."""
from __future__ import annotations
import json
import os
from pathlib import Path

from .models import Annotation


def detect_format(dataset_path: str) -> str:
    """Detect annotation format: 'yolo' or 'coco'."""
    p = Path(dataset_path)

    # Check for COCO JSON
    for candidate in ["annotations.json", "instances.json", "_annotations.coco.json"]:
        if (p / candidate).exists():
            return "coco"
    # Check annotations subfolder
    ann_dir = p / "annotations"
    if ann_dir.exists():
        for f in ann_dir.iterdir():
            if f.suffix == ".json":
                return "coco"

    # Check for YOLO txt files alongside images (recursively)
    image_extensions = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff"}
    for f in p.rglob("*"):
        if f.is_file() and f.suffix.lower() in image_extensions:
            txt_path = f.with_suffix(".txt")
            if txt_path.exists():
                return "yolo"

    # Check labels/ subfolder (common YOLO structure)
    labels_dir = p / "labels"
    if labels_dir.exists():
        try:
            next(labels_dir.rglob("*.txt"))
            return "yolo"
        except StopIteration:
            pass

    # Default to yolo if nothing found (new dataset)
    return "yolo"


def find_images(dataset_path: str) -> list[str]:
    """Find all image files in the dataset directory."""
    image_extensions = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff"}
    p = Path(dataset_path)

    images = []
    # Check for images/ subfolder first
    img_dir = p / "images"
    search_dir = img_dir if img_dir.exists() else p

    # recursively search for images
    for f in sorted(search_dir.rglob("*")):
        if f.is_file() and f.suffix.lower() in image_extensions:
            # Return relative path as a string (e.g. "train/image.jpg")
            images.append(str(f.relative_to(search_dir)))

    return images


def get_image_dir(dataset_path: str) -> Path:
    """Get the directory where images are stored."""
    p = Path(dataset_path)
    img_dir = p / "images"
    return img_dir if img_dir.exists() else p


def get_labels_dir(dataset_path: str) -> Path:
    """Get/create the directory where YOLO label files are stored."""
    p = Path(dataset_path)
    img_dir = p / "images"
    if img_dir.exists():
        labels_dir = p / "labels"
        labels_dir.mkdir(exist_ok=True)
        return labels_dir
    return p


# ─── YOLO Format ────────────────────────────────────────────────────────────

def load_yolo_annotations(
    dataset_path: str, image_name: str, img_w: int, img_h: int
) -> list[Annotation]:
    """Load YOLO segmentation annotations (normalized → pixel coords)."""
    labels_dir = get_labels_dir(dataset_path)
    txt_name = Path(image_name).with_suffix(".txt")
    txt_path = labels_dir / txt_name

    if not txt_path.exists():
        return []

    annotations = []
    with open(txt_path, "r") as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) < 7:  # class_id + at least 3 points (6 coords)
                continue

            class_id = int(parts[0])
            coords = list(map(float, parts[1:]))

            # Convert normalized → pixel coordinates
            polygon = []
            for i in range(0, len(coords), 2):
                x = coords[i] * img_w
                y = coords[i + 1] * img_h
                polygon.append([x, y])

            annotations.append(Annotation(class_id=class_id, polygon=polygon))

    return annotations


def save_yolo_annotations(
    dataset_path: str,
    image_name: str,
    annotations: list[Annotation],
    img_w: int,
    img_h: int,
) -> None:
    """Save YOLO segmentation annotations (pixel → normalized coords)."""
    labels_dir = get_labels_dir(dataset_path)
    txt_name = Path(image_name).with_suffix(".txt")
    txt_path = labels_dir / txt_name
    txt_path.parent.mkdir(parents=True, exist_ok=True)

    with open(txt_path, "w") as f:
        for ann in annotations:
            parts = [str(ann.class_id)]
            for point in ann.polygon:
                nx = point[0] / img_w
                ny = point[1] / img_h
                # Clamp to [0, 1]
                nx = max(0.0, min(1.0, nx))
                ny = max(0.0, min(1.0, ny))
                parts.append(f"{nx:.6f}")
                parts.append(f"{ny:.6f}")
            f.write(" ".join(parts) + "\n")


# ─── COCO Format ────────────────────────────────────────────────────────────

def _find_coco_json(dataset_path: str) -> Path | None:
    """Find the COCO annotation JSON file."""
    p = Path(dataset_path)
    for candidate in ["annotations.json", "instances.json", "_annotations.coco.json"]:
        if (p / candidate).exists():
            return p / candidate
    ann_dir = p / "annotations"
    if ann_dir.exists():
        for f in ann_dir.iterdir():
            if f.suffix == ".json":
                return f
    return None


def _load_coco_data(dataset_path: str) -> dict | None:
    """Load and cache the full COCO JSON."""
    json_path = _find_coco_json(dataset_path)
    if json_path is None:
        return None
    with open(json_path, "r") as f:
        return json.load(f)


def load_coco_annotations(
    dataset_path: str, image_name: str, img_w: int, img_h: int
) -> list[Annotation]:
    """Load COCO polygon annotations for a specific image."""
    data = _load_coco_data(dataset_path)
    if data is None:
        return []

    # Find image ID
    image_id = None
    for img in data.get("images", []):
        if img["file_name"] == image_name:
            image_id = img["id"]
            break
    if image_id is None:
        return []

    # Find annotations for this image
    annotations = []
    for ann in data.get("annotations", []):
        if ann["image_id"] != image_id:
            continue
        if ann.get("iscrowd", 0) == 1:
            continue

        # Map category_id to class index
        cat_id = ann["category_id"]
        class_id = 0
        for i, cat in enumerate(data.get("categories", [])):
            if cat["id"] == cat_id:
                class_id = i
                break

        # Parse segmentation polygons (take first polygon if multiple)
        seg = ann.get("segmentation", [])
        if isinstance(seg, list) and len(seg) > 0:
            flat = seg[0]  # First polygon
            polygon = []
            for i in range(0, len(flat), 2):
                polygon.append([float(flat[i]), float(flat[i + 1])])
            annotations.append(Annotation(class_id=class_id, polygon=polygon))

    return annotations


def save_coco_annotations(
    dataset_path: str,
    image_name: str,
    annotations: list[Annotation],
    img_w: int,
    img_h: int,
) -> None:
    """Save/update COCO annotations for a specific image."""
    json_path = _find_coco_json(dataset_path)
    if json_path is None:
        # Create new COCO JSON
        json_path = Path(dataset_path) / "annotations.json"
        data = {"images": [], "annotations": [], "categories": []}
    else:
        with open(json_path, "r") as f:
            data = json.load(f)

    # Find or create image entry
    image_id = None
    for img in data["images"]:
        if img["file_name"] == image_name:
            image_id = img["id"]
            break
    if image_id is None:
        image_id = max([img["id"] for img in data["images"]], default=0) + 1
        data["images"].append(
            {
                "id": image_id,
                "file_name": image_name,
                "width": img_w,
                "height": img_h,
            }
        )

    # Remove existing annotations for this image
    data["annotations"] = [
        a for a in data["annotations"] if a["image_id"] != image_id
    ]

    # Add new annotations
    max_ann_id = max([a["id"] for a in data["annotations"]], default=0)
    for ann in annotations:
        max_ann_id += 1
        # Get category ID from class index
        cat_id = ann.class_id
        if ann.class_id < len(data.get("categories", [])):
            cat_id = data["categories"][ann.class_id]["id"]

        # Flatten polygon
        flat_polygon = []
        for pt in ann.polygon:
            flat_polygon.extend([pt[0], pt[1]])

        # Calculate bbox and area
        xs = [pt[0] for pt in ann.polygon]
        ys = [pt[1] for pt in ann.polygon]
        x_min, x_max = min(xs), max(xs)
        y_min, y_max = min(ys), max(ys)
        bbox = [x_min, y_min, x_max - x_min, y_max - y_min]
        area = bbox[2] * bbox[3]

        data["annotations"].append(
            {
                "id": max_ann_id,
                "image_id": image_id,
                "category_id": cat_id,
                "segmentation": [flat_polygon],
                "bbox": bbox,
                "area": area,
                "iscrowd": 0,
            }
        )

    with open(json_path, "w") as f:
        json.dump(data, f, indent=2)


# ─── Classes ────────────────────────────────────────────────────────────────

def load_classes(dataset_path: str, fmt: str) -> list[str]:
    """Load class names from dataset."""
    p = Path(dataset_path)

    if fmt == "yolo":
        # Try classes.txt, data.yaml, notes.json
        classes_txt = p / "classes.txt"
        if classes_txt.exists():
            with open(classes_txt, "r") as f:
                return [line.strip() for line in f if line.strip()]

        # Try data.yaml
        data_yaml = p / "data.yaml"
        if data_yaml.exists():
            import yaml

            with open(data_yaml, "r") as f:
                data = yaml.safe_load(f)
                names = data.get("names", [])
                if isinstance(names, dict):
                    return [names[k] for k in sorted(names.keys())]
                return list(names)

        return ["object"]

    elif fmt == "coco":
        data = _load_coco_data(dataset_path)
        if data and "categories" in data:
            cats = sorted(data["categories"], key=lambda c: c["id"])
            return [c["name"] for c in cats]
        return ["object"]

    return ["object"]


def save_classes(dataset_path: str, classes: list[str], fmt: str) -> None:
    """Save class names to dataset."""
    p = Path(dataset_path)

    if fmt == "yolo":
        classes_txt = p / "classes.txt"
        with open(classes_txt, "w") as f:
            for cls in classes:
                f.write(cls + "\n")

    elif fmt == "coco":
        json_path = _find_coco_json(dataset_path)
        if json_path is None:
            json_path = p / "annotations.json"
            data = {"images": [], "annotations": [], "categories": []}
        else:
            with open(json_path, "r") as f:
                data = json.load(f)

        data["categories"] = [
            {"id": i, "name": name, "supercategory": "none"}
            for i, name in enumerate(classes)
        ]

        with open(json_path, "w") as f:
            json.dump(data, f, indent=2)
