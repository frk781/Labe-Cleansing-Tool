/**
 * App — Main application entry point and orchestrator.
 */
class App {
    constructor() {
        // Core managers
        this.canvasManager = new CanvasManager('canvas-bg', 'canvas-overlay', 'canvas-container');
        this.polygonManager = new PolygonManager(this.canvasManager);
        this.history = new HistoryManager();
        this.sam = new SAMTool(this.canvasManager, this.polygonManager, this.history);
        this.classesManager = new ClassesManager(this.polygonManager, this.sam);
        this.fileViewManager = new FileViewManager(this);
        this.toolbar = new ToolbarManager(this);

        // Dataset state
        this.dataset = null;       // DatasetInfo from API
        this.currentImage = null;  // current image filename
        this.currentIndex = -1;
        this.isDirty = false;

        // UI elements
        this._modal = document.getElementById('dataset-modal');
        this._loadBtn = document.getElementById('load-dataset-btn');
        this._pathInput = document.getElementById('dataset-path-input');
        this._loadError = document.getElementById('load-error');
        this._appEl = document.getElementById('app');
        this._imageCounter = document.getElementById('image-counter');
        this._imageTotal = document.getElementById('image-total');
        this._imageList = document.getElementById('image-list');
        this._statusFile = document.getElementById('status-file');
        this._statusDirty = document.getElementById('status-dirty');

        this._init();
    }

    /* ─── Initialization ──────────────────────────────────── */

    _init() {
        // Modal: load dataset
        this._loadBtn.addEventListener('click', () => this._loadDataset());
        this._pathInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._loadDataset();
        });

        // Canvas overlay rendering: draw polygons + SAM preview
        this.canvasManager.onRenderOverlay = (ctx) => {
            this.polygonManager.render(ctx);
            if (this.toolbar.currentTool === 'sam') {
                this.sam.render(ctx);
            }
        };

        // Canvas mouse events
        this.canvasManager.onMouseEvent = (type, e) => {
            this._handleMouseEvent(type, e);
        };

        // History updates -> toolbar
        this.history.onUpdate = () => {
            this.toolbar.updateUndoRedo();
        };

        // Polygon changes -> annotation list + dirty state
        this.polygonManager.onChanged = () => {
            this.classesManager.renderAnnotationList();
            this.classesManager.renderClassList();
            this.setDirty(true);
        };

        // Focus input on modal load
        this._pathInput.focus();
    }

    /* ─── Dataset Loading ─────────────────────────────────── */

    async _loadDataset() {
        const path = this._pathInput.value.trim();
        if (!path) {
            this._loadError.textContent = 'Please enter a dataset path.';
            return;
        }

        this._loadBtn.disabled = true;
        this._loadError.textContent = '';
        this._loadBtn.innerHTML = `
            <div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>
            Loading...
        `;

        try {
            this.dataset = await API.loadDataset(path);

            // Hide modal, show app
            this._modal.classList.remove('active');
            this._appEl.classList.remove('hidden');

            // Setup classes
            this.classesManager.setClasses(this.dataset.classes);

            // Setup image list
            this._imageTotal.textContent = this.dataset.total_images;
            this._renderImageList();

            // Load first image
            if (this.dataset.images.length > 0) {
                await this._loadImage(0);
            }

        } catch (e) {
            this._loadError.textContent = e.message || 'Failed to load dataset';
        } finally {
            this._loadBtn.disabled = false;
            this._loadBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                Load Dataset
            `;
        }
    }

    /* ─── Image Navigation ────────────────────────────────── */

    async _loadImage(index) {
        if (!this.dataset || index < 0 || index >= this.dataset.images.length) return;

        // Auto-save if dirty
        if (this.isDirty && this.currentImage) {
            await this.saveCurrentAnnotations();
        }

        const imageName = this.dataset.images[index];
        this.currentIndex = index;
        this.currentImage = imageName;

        // Update counter
        this._imageCounter.textContent = `${index + 1} / ${this.dataset.total_images}`;
        this._statusFile.textContent = imageName;

        // Highlight in image list
        this._highlightImageItem(index);

        // Load image onto canvas
        const url = API.getImageUrl(imageName);
        await this.canvasManager.loadImage(url);

        // Load annotations
        try {
            const data = await API.getAnnotations(imageName);
            this.polygonManager.loadAnnotations(data.annotations);
        } catch (e) {
            console.error('Failed to load annotations:', e);
            this.polygonManager.loadAnnotations([]);
        }

        // Reset tool state
        this.sam.cancel();
        this.history.clear();
        this.setDirty(false);

        // Refresh sidebar
        this.classesManager.renderAnnotationList();
        this.classesManager.renderClassList();
    }

    async navigateImage(delta) {
        if (!this.dataset) return;
        const newIndex = this.currentIndex + delta;
        if (newIndex >= 0 && newIndex < this.dataset.images.length) {
            await this._loadImage(newIndex);
        }
    }

    /* ─── Saving ──────────────────────────────────────────── */

    async saveCurrentAnnotations() {
        if (!this.dataset || !this.currentImage) return;

        try {
            const annotations = this.polygonManager.getAnnotations();
            await API.saveAnnotations(this.currentImage, {
                image_name: this.currentImage,
                annotations,
                image_width: this.canvasManager.imageW,
                image_height: this.canvasManager.imageH,
            });
            this.setDirty(false);
            this._showToast('Annotations saved', 'success');
        } catch (e) {
            console.error('Save failed:', e);
            this._showToast('Save failed: ' + e.message, 'error');
        }
    }

    /* ─── Mouse Event Dispatch ────────────────────────────── */

    _handleMouseEvent(type, e) {
        const tool = this.toolbar.currentTool;
        const rect = this.canvasManager.overlay.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const imgCoords = this.canvasManager.screenToImage(sx, sy);

        // Update coordinate display on any move
        if (type === 'move') {
            if (imgCoords.x >= 0 && imgCoords.x < this.canvasManager.imageW &&
                imgCoords.y >= 0 && imgCoords.y < this.canvasManager.imageH) {
                this.toolbar.updateCoords(imgCoords.x, imgCoords.y);
            } else {
                this.toolbar.updateCoords(null, null);
            }
        }

        if (tool === 'sam') {
            this._handleSAMEvent(type, e, imgCoords);
        } else if (tool === 'select') {
            this._handleSelectEvent(type, e, imgCoords);
        } else if (tool === 'edit') {
            this._handleEditEvent(type, e, imgCoords, sx, sy);
        }
    }

    _handleSAMEvent(type, e, imgCoords) {
        if (type === 'down' && e.button === 0) {
            // Left click → add positive point
            const label = 1;
            this.sam.addPoint(imgCoords.x, imgCoords.y, label, this.currentImage);
        }
        if (type === 'contextmenu') {
            // Right click → add negative point
            this.sam.addPoint(imgCoords.x, imgCoords.y, 0, this.currentImage);
        }
    }

    _handleSelectEvent(type, e, imgCoords) {
        if (type === 'down' && e.button === 0) {
            // Try hit-test polygon
            const hit = this.polygonManager.hitTestPolygon(imgCoords.x, imgCoords.y);
            if (hit) {
                this.polygonManager.select(hit.id);
            } else {
                this.polygonManager.deselect();
            }
            this.classesManager.renderAnnotationList();
        }
    }

    _handleEditEvent(type, e, imgCoords, sx, sy) {
        if (type === 'down' && e.button === 0) {
            // Try to grab a vertex
            const vHit = this.polygonManager.hitTestVertex(sx, sy);
            if (vHit) {
                const poly = this.polygonManager.polygons.find(p => p.id === vHit.polygonId);
                if (poly) {
                    this.polygonManager.draggingVertex = {
                        polygonId: vHit.polygonId,
                        vertexIdx: vHit.vertexIdx,
                        startPos: [...poly.points[vHit.vertexIdx]],
                    };
                }
                return;
            }

            // Try to add vertex at edge midpoint
            const eHit = this.polygonManager.hitTestEdgeMid(sx, sy);
            if (eHit) {
                const cmd = AddVertexCommand(
                    this.polygonManager, eHit.polygonId,
                    eHit.afterIdx + 1, [eHit.x, eHit.y]
                );
                this.history.execute(cmd);
                this.setDirty(true);
                return;
            }

            // Otherwise try to select a polygon
            const hit = this.polygonManager.hitTestPolygon(imgCoords.x, imgCoords.y);
            if (hit) {
                this.polygonManager.select(hit.id);
            } else {
                this.polygonManager.deselect();
            }
            this.classesManager.renderAnnotationList();
        }

        if (type === 'move') {
            if (this.polygonManager.draggingVertex) {
                const dv = this.polygonManager.draggingVertex;
                this.polygonManager.setVertex(dv.polygonId, dv.vertexIdx,
                    [imgCoords.x, imgCoords.y]);
            } else {
                // Update hover state
                const vHit = this.polygonManager.hitTestVertex(sx, sy);
                this.polygonManager.hoverVertex = vHit;

                if (!vHit) {
                    const eHit = this.polygonManager.hitTestEdgeMid(sx, sy);
                    this.polygonManager.hoverEdgeMid = eHit;
                } else {
                    this.polygonManager.hoverEdgeMid = null;
                }

                this.canvasManager.renderOverlay();
            }
        }

        if (type === 'up') {
            if (this.polygonManager.draggingVertex) {
                const dv = this.polygonManager.draggingVertex;
                const poly = this.polygonManager.polygons.find(p => p.id === dv.polygonId);
                if (poly) {
                    const newPos = [...poly.points[dv.vertexIdx]];
                    // Only create history if position actually changed
                    if (dv.startPos[0] !== newPos[0] || dv.startPos[1] !== newPos[1]) {
                        // Restore original, then apply via command
                        this.polygonManager.setVertex(dv.polygonId, dv.vertexIdx, dv.startPos);
                        const cmd = MoveVertexCommand(
                            this.polygonManager, dv.polygonId, dv.vertexIdx,
                            dv.startPos, newPos
                        );
                        this.history.execute(cmd);
                        this.setDirty(true);
                    }
                }
                this.polygonManager.draggingVertex = null;
            }
        }

        // Right-click on vertex to delete it
        if (type === 'contextmenu') {
            const vHit = this.polygonManager.hitTestVertex(sx, sy);
            if (vHit) {
                const poly = this.polygonManager.polygons.find(p => p.id === vHit.polygonId);
                if (poly && poly.points.length > 3) {
                    const point = [...poly.points[vHit.vertexIdx]];
                    const cmd = DeleteVertexCommand(
                        this.polygonManager, vHit.polygonId, vHit.vertexIdx, point
                    );
                    this.history.execute(cmd);
                    this.setDirty(true);
                }
            }
        }
    }

    /* ─── Dirty State ────────────────────────────────────── */

    setDirty(dirty) {
        this.isDirty = dirty;
        if (dirty) {
            this._statusDirty.textContent = 'Modified';
            this._statusDirty.className = 'status-item status-dirty';
        } else {
            this._statusDirty.textContent = 'Saved';
            this._statusDirty.className = 'status-item status-clean';
        }
    }

    /* ─── Image List UI ───────────────────────────────────── */

    _renderImageList() {
        this._imageList.innerHTML = '';
        this.dataset.images.forEach((img, idx) => {
            const item = document.createElement('div');
            item.className = 'image-item' + (idx === this.currentIndex ? ' active' : '');
            item.dataset.index = idx;

            const idxSpan = document.createElement('span');
            idxSpan.className = 'img-index';
            idxSpan.textContent = String(idx + 1).padStart(3, '0');

            const nameSpan = document.createElement('span');
            nameSpan.className = 'img-name';
            nameSpan.textContent = img;

            item.appendChild(idxSpan);
            item.appendChild(nameSpan);

            item.addEventListener('click', () => this._loadImage(idx));

            this._imageList.appendChild(item);
        });
    }

    _highlightImageItem(index) {
        const items = this._imageList.querySelectorAll('.image-item');
        items.forEach((item, i) => {
            item.classList.toggle('active', i === index);
        });

        // Scroll into view
        const activeItem = this._imageList.querySelector('.image-item.active');
        if (activeItem) {
            activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    /* ─── Toast Notifications ─────────────────────────────── */

    _showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        // Auto-remove after animation
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
}

/* ─── Bootstrap ─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
