"""FastAPI application entry point for the label cleansing tool."""
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .routes import router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Label Cleansing Tool",
    description="Segmentation annotation cleansing with SAM2",
    version="1.0.0",
)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(router)

# Serve frontend static files
frontend_dir = Path(__file__).parent.parent / "frontend"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
else:
    logger.warning(f"Frontend directory not found: {frontend_dir}")


@app.on_event("startup")
async def startup():
    import torch

    device = "CUDA" if torch.cuda.is_available() else "CPU"
    logger.info(f"Label Cleansing Tool starting | Device: {device}")
    logger.info("SAM2 model will load on first prediction request (lazy loading)")
