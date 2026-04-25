"""SAM2 model wrapper for point-prompted segmentation."""
from __future__ import annotations
import logging
from pathlib import Path

import cv2
import numpy as np
import torch

logger = logging.getLogger(__name__)


class SAMPredictor:
    """Wraps SAM2 model for image segmentation with point prompts."""

    def __init__(self, checkpoint_dir: str = "backend/models"):
        self.checkpoint_dir = Path(checkpoint_dir)
        self.model = None
        self.predictor = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._current_image_path: str | None = None
        self._model_size = "large"

    @property
    def is_loaded(self) -> bool:
        return self.predictor is not None

    def load_model(self) -> None:
        """Load SAM2 model. Call once at startup or on first use."""
        if self.is_loaded:
            logger.info("SAM2 model already loaded")
            return

        logger.info(f"Loading SAM2 model on {self.device}...")

        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor

        checkpoint = self.checkpoint_dir / "sam2.1_hiera_large.pt"
        model_cfg = "configs/sam2.1/sam2.1_hiera_l.yaml"

        if not checkpoint.exists():
            raise FileNotFoundError(
                f"SAM2 checkpoint not found at {checkpoint}. "
                f"Run: python scripts/download_model.py --size large"
            )

        self.model = build_sam2(model_cfg, str(checkpoint), device=self.device)
        self.predictor = SAM2ImagePredictor(self.model)
        logger.info(f"SAM2 large model loaded on {self.device}")

    def set_image(self, image_path: str) -> tuple[int, int]:
        """Set current image for prediction. Returns (width, height).

        Caches the image embedding — skips if same image is already set.
        """
        if not self.is_loaded:
            self.load_model()

        if self._current_image_path == image_path:
            # Already embedded, return cached dimensions
            img = cv2.imread(image_path)
            h, w = img.shape[:2]
            return w, h

        logger.info(f"Setting image: {image_path}")
        img = cv2.imread(image_path)
        if img is None:
            raise FileNotFoundError(f"Cannot read image: {image_path}")

        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        self.predictor.set_image(img_rgb)
        self._current_image_path = image_path

        h, w = img.shape[:2]
        return w, h

    def predict(
        self,
        points: list[tuple[float, float]],
        labels: list[int],
        multimask: bool = True,
    ) -> tuple[list[list[list[float]]], list[float]]:
        """Run point-prompted segmentation.

        Args:
            points: List of (x, y) coordinates in pixel space.
            labels: List of labels (1=positive, 0=negative).
            multimask: If True, return multiple candidate masks.

        Returns:
            (polygons, scores) where polygons is a list of polygon point lists
            and scores is the confidence for each mask.
        """
        if not self.is_loaded:
            raise RuntimeError("Model not loaded. Call load_model() first.")
        if self._current_image_path is None:
            raise RuntimeError("No image set. Call set_image() first.")

        point_coords = np.array(points, dtype=np.float32)
        point_labels = np.array(labels, dtype=np.int32)

        masks, scores, logits = self.predictor.predict(
            point_coords=point_coords,
            point_labels=point_labels,
            multimask_output=multimask,
        )

        # Convert binary masks to polygons
        all_polygons = []
        all_scores = []

        for mask, score in zip(masks, scores):
            polys = self._mask_to_polygons(mask)
            if polys:
                # Take the largest polygon (main object)
                largest = max(polys, key=lambda p: len(p))
                all_polygons.append(largest)
                all_scores.append(float(score))

        return all_polygons, all_scores

    def _mask_to_polygons(
        self, mask: np.ndarray, simplify_tolerance: float = 2.0
    ) -> list[list[list[float]]]:
        """Convert a binary mask to polygon points using contour detection.

        Args:
            mask: Binary mask (H, W) with True/False or 0/1 values.
            simplify_tolerance: Epsilon for contour approximation (Douglas-Peucker).
                               Higher = fewer points, lower = more accurate.

        Returns:
            List of polygons, each is [[x, y], [x, y], ...]
        """
        mask_uint8 = (mask.astype(np.uint8)) * 255
        contours, _ = cv2.findContours(
            mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        polygons = []
        for contour in contours:
            # Simplify contour
            epsilon = simplify_tolerance
            approx = cv2.approxPolyDP(contour, epsilon, True)

            if len(approx) < 3:
                continue

            points = []
            for pt in approx:
                x, y = pt[0]
                points.append([float(x), float(y)])

            polygons.append(points)

        return polygons
