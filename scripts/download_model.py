"""Download SAM2 model checkpoint from Hugging Face."""
import argparse
import os
import sys
import urllib.request
from pathlib import Path


CHECKPOINTS = {
    "tiny": {
        "url": "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt",
        "filename": "sam2.1_hiera_tiny.pt",
        "size_mb": 156,
    },
    "small": {
        "url": "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_small.pt",
        "filename": "sam2.1_hiera_small.pt",
        "size_mb": 184,
    },
    "large": {
        "url": "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt",
        "filename": "sam2.1_hiera_large.pt",
        "size_mb": 898,
    },
}


def download_with_progress(url: str, dest: str, expected_mb: int):
    """Download a file with a progress bar."""
    print(f"Downloading to: {dest}")
    print(f"Expected size: ~{expected_mb} MB")

    def reporthook(block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            percent = min(100, downloaded * 100 / total_size)
            mb_done = downloaded / (1024 * 1024)
            mb_total = total_size / (1024 * 1024)
            bar_len = 40
            filled = int(bar_len * percent / 100)
            bar = "█" * filled + "░" * (bar_len - filled)
            sys.stdout.write(
                f"\r  [{bar}] {percent:5.1f}% ({mb_done:.1f}/{mb_total:.1f} MB)"
            )
            sys.stdout.flush()

    urllib.request.urlretrieve(url, dest, reporthook)
    print("\n  ✓ Download complete!")


def main():
    parser = argparse.ArgumentParser(description="Download SAM2 model checkpoint")
    parser.add_argument(
        "--size",
        choices=["tiny", "small", "large"],
        default="large",
        help="Model size to download (default: large)",
    )
    parser.add_argument(
        "--output-dir",
        default="backend/models",
        help="Output directory (default: backend/models)",
    )
    args = parser.parse_args()

    ckpt = CHECKPOINTS[args.size]
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    dest = output_dir / ckpt["filename"]

    if dest.exists():
        existing_mb = dest.stat().st_size / (1024 * 1024)
        print(f"Checkpoint already exists: {dest} ({existing_mb:.1f} MB)")
        resp = input("Re-download? [y/N]: ").strip().lower()
        if resp != "y":
            print("Skipping download.")
            return

    print(f"\n{'='*60}")
    print(f"  SAM2.1 Model Download — {args.size.upper()}")
    print(f"{'='*60}\n")

    download_with_progress(ckpt["url"], str(dest), ckpt["size_mb"])

    final_mb = dest.stat().st_size / (1024 * 1024)
    print(f"\n  Saved: {dest} ({final_mb:.1f} MB)")
    print(f"  Ready to use with the label cleansing tool!\n")


if __name__ == "__main__":
    main()
