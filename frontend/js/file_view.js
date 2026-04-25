/**
 * FileViewManager — Manages the annotated files modal and box selection.
 */
class FileViewManager {
    constructor(app) {
        this.app = app;
        
        // Modal elements
        this.modal = document.getElementById('fileview-modal');
        this.grid = document.getElementById('fv-grid');
        this.container = document.getElementById('fv-grid-container');
        this.selectionBox = document.getElementById('fv-selection-box');
        
        // Buttons
        this.btnOpen = document.getElementById('btn-fileview');
        this.btnClose = document.getElementById('fv-btn-close');
        this.btnDelete = document.getElementById('fv-btn-delete');
        
        // State
        this.annotatedImages = [];
        this.selectedImages = new Set();
        this.isSelecting = false;
        this.startPos = { x: 0, y: 0 };
        this.scrollOnStart = 0;

        this._initEvents();
    }

    _initEvents() {
        this.btnOpen.addEventListener('click', () => this.open());
        this.btnClose.addEventListener('click', () => this.close());
        
        this.btnDelete.addEventListener('click', async () => {
            if (this.selectedImages.size === 0) return;
            if (confirm(`Are you sure you want to delete annotations for ${this.selectedImages.size} image(s)?`)) {
                await this.deleteSelected();
            }
        });

        // Box selection logic
        this.container.addEventListener('mousedown', (e) => this._onMouseDown(e));
        window.addEventListener('mousemove', (e) => this._onMouseMove(e));
        window.addEventListener('mouseup', (e) => this._onMouseUp(e));
    }

    async open() {
        if (!this.app.dataset) return;
        
        this.modal.classList.remove('hidden');
        this.selectedImages.clear();
        this._updateDeleteButton();
        this.grid.innerHTML = '<div style="grid-column: 1/-1; padding: 20px; text-align: center; color: var(--text-muted);">Loading annotated files...</div>';
        
        try {
            const res = await API._fetch('/dataset/annotated_images');
            const data = await res.json();
            this.annotatedImages = data.annotated_images || [];
            this.render();
        } catch (err) {
            console.error('Failed to load annotated images', err);
            this.grid.innerHTML = '<div style="grid-column: 1/-1; padding: 20px; text-align: center; color: var(--danger);">Error loading files.</div>';
        }
    }

    close() {
        this.modal.classList.add('hidden');
    }

    render() {
        this.grid.innerHTML = '';
        
        if (this.annotatedImages.length === 0) {
            this.grid.innerHTML = '<div style="grid-column: 1/-1; padding: 20px; text-align: center; color: var(--text-muted);">No annotated files found.</div>';
            return;
        }

        this.annotatedImages.forEach((imgName) => {
            const thumbUrl = `/api/dataset/images/${encodeURIComponent(imgName)}`;
            
            const thumbDiv = document.createElement('div');
            thumbDiv.className = 'file-thumb-container';
            thumbDiv.dataset.image = imgName;

            const imgEl = document.createElement('img');
            imgEl.src = thumbUrl;
            imgEl.loading = 'lazy';

            const overlay = document.createElement('div');
            overlay.className = 'file-thumb-overlay';

            const title = document.createElement('div');
            title.className = 'file-thumb-title';
            title.textContent = imgName;

            overlay.appendChild(title);
            thumbDiv.appendChild(imgEl);
            thumbDiv.appendChild(overlay);

            // Handle individual click selection
            thumbDiv.addEventListener('mousedown', (e) => {
                // If we click directly, wait a bit to see if it's a drag or just a click
                // But it's easier to handle this in a click event. But mousedown on container stops it.
            });
            thumbDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                if (e.ctrlKey || e.metaKey) {
                    this.toggleSelection(imgName, thumbDiv);
                } else {
                    this.clearSelection();
                    this.toggleSelection(imgName, thumbDiv);
                }
            });
            
            // Double click to open single image 
            thumbDiv.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const idx = this.app.dataset.images.indexOf(imgName);
                if (idx !== -1) {
                    this.app.loadImage(idx); // Update app
                    this.close();
                }
            });

            this.grid.appendChild(thumbDiv);
        });
    }

    toggleSelection(imgName, element) {
        if (this.selectedImages.has(imgName)) {
            this.selectedImages.delete(imgName);
            element.classList.remove('selected');
        } else {
            this.selectedImages.add(imgName);
            element.classList.add('selected');
        }
        this._updateDeleteButton();
    }

    clearSelection() {
        this.selectedImages.clear();
        this.grid.querySelectorAll('.file-thumb-container').forEach(el => {
            el.classList.remove('selected');
        });
        this._updateDeleteButton();
    }

    _updateDeleteButton() {
        this.btnDelete.disabled = this.selectedImages.size === 0;
        this.btnDelete.textContent = `Delete Selected (${this.selectedImages.size})`;
    }

    // --- Box Selection Logic ---

    _onMouseDown(e) {
        // Only start if clicking on the background container (not directly on a thumbnail button... wait, maybe start anywhere?
        // To allow dragging starting from between thumbnails, we just check if it's left click.
        if (e.button !== 0) return;
        
        // If clicking on a thumbnail directly, maybe just select it and don't drag if it was a click?
        // Actually Windows allows starting a drag from mostly anywhere on the background.
        if (e.target.closest('.file-thumb-container')) {
             return; // Let the click handler deal with individual item click
        }

        this.isSelecting = true;
        const rect = this.container.getBoundingClientRect();
        this.startPos = { 
            x: e.clientX - rect.left, 
            y: e.clientY - rect.top + this.container.scrollTop 
        };
        this.scrollOnStart = this.container.scrollTop;
        
        this.selectionBox.style.display = 'block';
        this.selectionBox.style.left = `${this.startPos.x}px`;
        this.selectionBox.style.top = `${this.startPos.y}px`;
        this.selectionBox.style.width = '0px';
        this.selectionBox.style.height = '0px';

        if (!e.ctrlKey && !e.metaKey) {
            this.clearSelection();
        }
    }

    _onMouseMove(e) {
        if (!this.isSelecting) return;
        
        const rect = this.container.getBoundingClientRect();
        const currentY = e.clientY - rect.top + this.container.scrollTop;
        const currentX = e.clientX - rect.left;

        const left = Math.min(this.startPos.x, currentX);
        const top = Math.min(this.startPos.y, currentY);
        const width = Math.abs(currentX - this.startPos.x);
        const height = Math.abs(currentY - this.startPos.y);

        this.selectionBox.style.left = `${left}px`;
        this.selectionBox.style.top = `${top}px`;
        this.selectionBox.style.width = `${width}px`;
        this.selectionBox.style.height = `${height}px`;

        this._checkIntersections({ left, top, right: left + width, bottom: top + height });
    }

    _onMouseUp(e) {
        if (!this.isSelecting) return;
        this.isSelecting = false;
        this.selectionBox.style.display = 'none';
    }

    _checkIntersections(boxRect) {
        const thumbs = this.grid.querySelectorAll('.file-thumb-container');
        const containerRect = this.container.getBoundingClientRect();

        thumbs.forEach(thumb => {
            const thumbRect = thumb.getBoundingClientRect();
            // Translate thumb rect to container absolute coords
            const tLeft = thumbRect.left - containerRect.left;
            const tTop = thumbRect.top - containerRect.top + this.container.scrollTop;
            const tRight = tLeft + thumbRect.width;
            const tBottom = tTop + thumbRect.height;

            const intersects = !(
                tLeft > boxRect.right || 
                tRight < boxRect.left || 
                tTop > boxRect.bottom || 
                tBottom < boxRect.top
            );

            const imgName = thumb.dataset.image;
            if (intersects) {
                if (!this.selectedImages.has(imgName)) {
                    this.selectedImages.add(imgName);
                    thumb.classList.add('selected');
                }
            } else {
                // If it was selected in this box drag, but now doesn't intersect...
                // Implementing a perfect toggle memory is complex, simple approach:
                // If not intersecting, maybe remove? But ruins ctrl+click adding... 
                // We'll keep it simple: just add to selection. 
            }
        });
        
        this._updateDeleteButton();
    }

    async deleteSelected() {
        const toDelete = Array.from(this.selectedImages);
        if (toDelete.length === 0) return;

        this.btnDelete.disabled = true;
        this.btnDelete.textContent = "Deleting...";

        let successCount = 0;
        for (const imgName of toDelete) {
            try {
                await API.saveAnnotations(imgName, {
                    annotations: [],
                    image_width: 0,
                    image_height: 0
                });
                successCount++;
                
                // Active image cleanup
                if (imgName === this.app.currentImage) {
                    this.app.polygonManager.polygons = [];
                    this.app.history.clear();
                    this.app.setDirty(false);
                    this.app.classesManager.renderAnnotationList();
                    this.app.canvasManager.renderOverlay();
                }
                
                // Remove from local array
                this.annotatedImages = this.annotatedImages.filter(n => n !== imgName);
            } catch (e) {
                console.error("Failed to delete", imgName, e);
            }
        }

        this.app._showToast(`Successfully cleared annotations for ${successCount} images.`, 'success');
        this.selectedImages.clear();
        this._updateDeleteButton();
        this.render(); // re-render grid
    }
}
