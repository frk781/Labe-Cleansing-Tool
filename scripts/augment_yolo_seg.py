from pathlib import Path
import cv2
import albumentations as A


ROTATED_ARTIFACT_PATTERNS = ("aug_rot_*", "*rot_framee*")


def norm_to_px(coord, size):
    # Use size - 1 to keep flip symmetry exact at image borders.
    return coord * (size - 1) if size > 1 else 0.0


def px_to_norm(coord, size):
    return coord / (size - 1) if size > 1 else 0.0


def delete_rotated_artifacts(images_dir, labels_dir):
    deleted_count = 0
    seen_paths = set()

    for directory in (images_dir, labels_dir):
        for pattern in ROTATED_ARTIFACT_PATTERNS:
            for path in directory.glob(pattern):
                if not path.is_file() or path in seen_paths:
                    continue

                path.unlink()
                seen_paths.add(path)
                deleted_count += 1

    if deleted_count:
        print(f"Deleted {deleted_count} rotated augmentation artifacts.")


def augment_dataset():
    images_dir = Path("/home/frk/yolo_dataset/images/train")
    labels_dir = Path("/home/frk/yolo_dataset/labels/train")
    
    if not images_dir.exists():
        print(f"Images directory not found: {images_dir}")
        return

    delete_rotated_artifacts(images_dir, labels_dir)
        
    images = sorted(list(images_dir.glob("*.jpg")))
    
    # Exclude files already starting with aug_
    original_images = [img for img in images if not img.name.startswith("aug_")]
    print(f"Found {len(original_images)} original images to augment.")
    
    # Define deterministic augmentations so flips are always generated.
    keypoint_params = A.KeypointParams(format='xy', remove_invisible=False)
    augmentations = [
        ("hflip", A.Compose([A.HorizontalFlip(p=1.0)], keypoint_params=keypoint_params)),
        ("vflip", A.Compose([A.VerticalFlip(p=1.0)], keypoint_params=keypoint_params)),
    ]
    
    for img_path in original_images:
        txt_path = labels_dir / img_path.with_suffix('.txt').name
        
        # Read image
        image = cv2.imread(str(img_path))
        if image is None:
            print(f"Failed to load image: {img_path}")
            continue
            
        h, w = image.shape[:2]
        
        # Parse labels
        annotations = []
        if txt_path.exists():
            with open(txt_path, 'r') as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) == 0: continue
                    class_id = int(parts[0])
                    coords = list(map(float, parts[1:]))
                    
                    if len(coords) == 4:
                        # Convert bbox xc, yc, w, h -> 4 polygon corners
                        xc, yc, bw, bh = coords
                        xmin = xc - bw/2
                        xmax = xc + bw/2
                        ymin = yc - bh/2
                        ymax = yc + bh/2
                        poly_flat = [xmin, ymin, xmax, ymin, xmax, ymax, xmin, ymax]
                    else:
                        poly_flat = coords

                    if len(poly_flat) % 2 != 0:
                        print(f"Skipping malformed annotation in {txt_path}: {line.strip()}")
                        continue
                        
                    poly = []
                    for i in range(0, len(poly_flat), 2):
                        poly.append((norm_to_px(poly_flat[i], w), norm_to_px(poly_flat[i+1], h)))
                        
                    annotations.append({'class_id': class_id, 'poly': poly})
                    
        for aug_suffix, transform in augmentations:
            # Flatten keypoints
            flat_keypoints = []
            metadata = []
            for ann in annotations:
                start_idx = len(flat_keypoints)
                flat_keypoints.extend(ann['poly'])
                end_idx = len(flat_keypoints)
                metadata.append({'class_id': ann['class_id'], 'start': start_idx, 'end': end_idx})
                
            # Augment
            transformed = transform(image=image, keypoints=flat_keypoints)
            aug_image = transformed['image']
            aug_keypoints = transformed['keypoints']
            aug_h, aug_w = aug_image.shape[:2]
            
            # Save augmented image
            aug_img_name = f"aug_{aug_suffix}_{img_path.name}"
            aug_img_path = images_dir / aug_img_name
            cv2.imwrite(str(aug_img_path), aug_image)
            
            # Save augmented labels
            aug_txt_name = f"aug_{aug_suffix}_{txt_path.name}"
            aug_txt_path = labels_dir / aug_txt_name
            
            with open(aug_txt_path, 'w') as f:
                for meta in metadata:
                    c_id = meta['class_id']
                    kpts = aug_keypoints[meta['start']:meta['end']]
                    if len(kpts) == 0: continue
                    
                    norm_kpts = []
                    for pt in kpts:
                        nx = px_to_norm(pt[0], aug_w)
                        ny = px_to_norm(pt[1], aug_h)
                        # Clip
                        nx = max(0.0, min(1.0, nx))
                        ny = max(0.0, min(1.0, ny))
                        norm_kpts.extend([nx, ny])
                        
                    if len(norm_kpts) > 0:
                        str_coords = " ".join([f"{v:.6f}" for v in norm_kpts])
                        f.write(f"{c_id} {str_coords}\n")

    print("Augmentation finished successfully!")

if __name__ == '__main__':
    augment_dataset()
