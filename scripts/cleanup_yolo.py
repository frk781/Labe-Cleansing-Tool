import os
from pathlib import Path

def cleanup():
    images_dir = Path("/home/frk/yolo_dataset/images/train")
    labels_dir = Path("/home/frk/yolo_dataset/labels/train")
    
    if not images_dir.exists():
        print("Images directory not found.")
        return
        
    # Get all jpg files and sort them alphabetically
    images = sorted(list(images_dir.glob("*.jpg")))
    
    print(f"Total images found: {len(images)}")
    
    # We want to keep the first 260, delete the rest
    to_delete = images[260:]
    
    print(f"Images to delete: {len(to_delete)}")
    
    deleted_count = 0
    for img_path in to_delete:
        # Delete image
        try:
            img_path.unlink()
            deleted_count += 1
        except Exception as e:
            print(f"Error deleting {img_path}: {e}")
            
        # Delete corresponding label txt if exists
        txt_path = labels_dir / img_path.with_suffix('.txt').name
        if txt_path.exists():
            try:
                txt_path.unlink()
            except Exception as e:
                print(f"Error deleting {txt_path}: {e}")
                
    print(f"Successfully deleted {deleted_count} images and their labels.")

if __name__ == '__main__':
    cleanup()
