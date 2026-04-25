import json
import os
import shutil

def convert_dataset():
    input_dir = '/home/frk/train'
    json_path = os.path.join(input_dir, '_annotations.coco.json')
    
    output_dir = '/home/frk/yolo_dataset'
    images_dir = os.path.join(output_dir, 'images', 'train')
    labels_dir = os.path.join(output_dir, 'labels', 'train')
    
    os.makedirs(images_dir, exist_ok=True)
    os.makedirs(labels_dir, exist_ok=True)
    
    with open(json_path, 'r') as f:
        data = json.load(f)
        
    images = data['images']
    # Sort images by file name so we get a deterministic order
    images.sort(key=lambda x: x['file_name'])
    
    # Take the first 260 and last 50
    selected_images = images[:260] + images[-50:] if len(images) > 310 else images
    print(f"Total images in dataset: {len(images)}")
    print(f"Selected images count: {len(selected_images)}")
    
    # Store annotations by image_id
    image_to_annotations = {img['id']: [] for img in selected_images}
    valid_image_ids = set(image_to_annotations.keys())
    
    for ann in data['annotations']:
        if ann['image_id'] in valid_image_ids:
            image_to_annotations[ann['image_id']].append(ann)
            
    # Class mapping
    coco_cat_id_to_name = {c['id']: c['name'] for c in data['categories']}
    name_to_yolo_id = {
        'electric': 0,
        'bandaid': 1,
        'bandage': 2,
        'warning': 3,
        'nutbolt': 4,
        'pill': 5
    }
    
    coco_to_yolo = {}
    for cid, cname in coco_cat_id_to_name.items():
        if cname in name_to_yolo_id:
            coco_to_yolo[cid] = name_to_yolo_id[cname]
            
    # Write yaml config
    yaml_content = """path: {}
train: images/train
val: images/train  # change as necessary if validation split created

names:
  0: electric_link
  1: bandaid_link
  2: basket_redcross_segment_link
  3: basket_warning_segment_link
  4: nutbolt_link
  5: pill_link
""".format(output_dir)
    with open(os.path.join(output_dir, 'data.yaml'), 'w') as f:
        f.write(yaml_content)
        
    print("Converting labels and copying images...")
    
    for img in selected_images:
        img_id = img['id']
        filename = img['file_name']
        img_width = img['width']
        img_height = img['height']
        
        # Copy image file
        src_image = os.path.join(input_dir, filename)
        dst_image = os.path.join(images_dir, filename)
        if os.path.exists(src_image):
            shutil.copy2(src_image, dst_image)
        else:
            print(f"Warning: Image file not found: {filename}")
            continue
            
        # Write label file
        txt_filename = os.path.splitext(filename)[0] + '.txt'
        txt_path = os.path.join(labels_dir, txt_filename)
        
        anns = image_to_annotations[img_id]
        
        with open(txt_path, 'w') as f:
            for ann in anns:
                cid = ann['category_id']
                if cid not in coco_to_yolo:
                    continue  # skip irrelevant categories (like octagonv1)
                    
                yolo_cid = coco_to_yolo[cid]
                
                # Check for segmentation
                if 'segmentation' in ann and isinstance(ann['segmentation'], list):
                    for poly in ann['segmentation']:
                        if len(poly) < 6:
                            continue
                        
                        coords = []
                        for i in range(0, len(poly), 2):
                            x = poly[i] / img_width
                            y = poly[i+1] / img_height
                            # Clip values to [0.0, 1.0] just in case
                            x = max(0.0, min(1.0, x))
                            y = max(0.0, min(1.0, y))
                            coords.append(f"{x:.6f} {y:.6f}")
                            
                        f.write(f"{yolo_cid} " + " ".join(coords) + "\n")
                elif 'bbox' in ann:
                    # Fallback to bbox if segment is missing
                    x_min, y_min, w, h = ann['bbox']
                    x_center = (x_min + w / 2.0) / img_width
                    y_center = (y_min + h / 2.0) / img_height
                    w_norm = w / img_width
                    h_norm = h / img_height
                    
                    x_center = max(0.0, min(1.0, x_center))
                    y_center = max(0.0, min(1.0, y_center))
                    w_norm = max(0.0, min(1.0, w_norm))
                    h_norm = max(0.0, min(1.0, h_norm))
                    
                    f.write(f"{yolo_cid} {x_center:.6f} {y_center:.6f} {w_norm:.6f} {h_norm:.6f}\n")

    print(f"Conversion finished successfully! Dataset saved at {output_dir}")

if __name__ == '__main__':
    convert_dataset()
