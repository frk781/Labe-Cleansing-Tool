# Label Cleansing Tool
Because ı was sick of Roboflow crashing out
A web-based annotation editor for cleaning segmentation labels in YOLO and COCO datasets, assisted by SAM2 point prompts.

The project provides:
- FastAPI backend for dataset loading, annotation I/O, and SAM2 inference
- Browser frontend for polygon editing and class management
- Utility scripts for dataset conversion, augmentation, cleanup, and model download

## Features

- Load a dataset from a local filesystem path
- Auto-detect annotation format: YOLO segmentation or COCO JSON
- View and edit polygon masks per image
- Use SAM2 with positive/negative clicks to propose masks
- Accept candidate masks and assign classes quickly
- Manage class names and save updates
- Undo/redo editing actions and keyboard-driven navigation

## Repository Structure

- backend: FastAPI app, SAM2 wrapper, and annotation format handlers
- frontend: static HTML/CSS/JS annotation UI
- scripts: helper scripts for model download and data preparation
- test_dataset: small sample dataset for quick testing

## Requirements

- Linux (tested), macOS, or Windows (WSL recommended for best parity)
- Python 3.10+
- CUDA-capable GPU recommended for SAM2 speed (CPU also works, slower)

## Setup

From the repository root:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

Optional (only needed for augmentation script):

```bash
pip install albumentations
```

## SAM2 Model

This app expects a SAM2 checkpoint in backend/models.

If needed, download a model:

```bash
python scripts/download_model.py --size large
```

Supported sizes:
- tiny
- small
- large

## Run the App

From the repository root:

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Then open:
- http://127.0.0.1:8000

The frontend is served by FastAPI from the frontend directory.

## Dataset Layout

### YOLO segmentation (common)

Expected patterns:
- images can be in dataset_root/images/... or directly in dataset_root
- labels are read from dataset_root/labels/... when images folder exists
- otherwise labels are expected next to images
- classes from classes.txt (or data.yaml fallback)

Example:

```text
dataset_root/
  images/
    train/
      img_001.jpg
  labels/
    train/
      img_001.txt
  classes.txt
```

### COCO

Accepted JSON names include:
- annotations.json
- instances.json
- _annotations.coco.json
- or any JSON file inside dataset_root/annotations

## How to Use

1. Start the server.
2. Open the app in your browser.
3. Enter dataset path and click Load Dataset.
4. Select a class in the sidebar.
5. In SAM mode:
   - Left click: positive point (foreground)
   - Right click: negative point (background)
   - Tab: cycle mask candidates
   - Enter: accept selected mask
6. Edit polygons with Select/Edit tools.
7. Save annotations with Ctrl+S (or Save button).

## Keyboard Shortcuts

- S: SAM tool
- V: Select tool
- E: Edit tool
- Ctrl+S: Save annotations
- Ctrl+Z: Undo
- Ctrl+Shift+Z: Redo
- A / Left / Up: previous image
- D / Right / Down: next image
- Tab (SAM mode): cycle SAM mask candidate
- Alt+Tab: cycle active class
- Enter (SAM mode): accept SAM mask
- Delete / Backspace: delete selected polygon
- Esc: cancel SAM preview or delete selected polygon
- Number keys 0-9: assign class (selected polygon) and set active class

## API Overview

Base prefix: /api

Main endpoints:
- POST /dataset/load
- GET /dataset/images/{image_name}
- GET /annotations/{image_name}
- POST /annotations/{image_name}
- POST /sam/predict
- GET /sam/status
- GET /classes
- PUT /classes

## Utility Scripts

- scripts/download_model.py: download SAM2 checkpoint
- scripts/convert_coco_to_yolo_seg.py: convert selected COCO data to YOLO labels
- scripts/augment_yolo_seg.py: deterministic horizontal/vertical augmentation for YOLO segmentation labels
- scripts/cleanup_yolo.py: cleanup helper for a specific local dataset layout

Note: conversion/cleanup/augmentation scripts currently include hardcoded local paths. Adjust paths before use.

## Troubleshooting

- SAM checkpoint missing:
  - Run download script and ensure file exists in backend/models.
- Slow inference:
  - Verify CUDA is available (torch.cuda.is_available()).
- Dataset fails to load:
  - Check path exists and contains images.
- No labels appearing:
  - Confirm label file paths match detected format and image names.

## License

No license file is currently included in this repository. Add one if you plan to distribute publicly.
