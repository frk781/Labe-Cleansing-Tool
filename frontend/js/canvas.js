/**
 * Canvas Manager — Image rendering with zoom/pan.
 */
class CanvasManager {
    constructor(bgCanvasId, overlayCanvasId, containerId) {
        this.bgCanvas = document.getElementById(bgCanvasId);
        this.overlay = document.getElementById(overlayCanvasId);
        this.container = document.getElementById(containerId);
        this.bgCtx = this.bgCanvas.getContext('2d');
        this.olCtx = this.overlay.getContext('2d');

        this.image = null;
        this.imageW = 0;
        this.imageH = 0;

        // Transform state
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;

        // Pan state
        this._isPanning = false;
        this._panStartX = 0;
        this._panStartY = 0;
        this._panOffsetStartX = 0;
        this._panOffsetStartY = 0;
        this._spaceDown = false;

        // Render callback (called by polygon/sam to draw overlays)
        this.onRenderOverlay = null;
        this.onMouseEvent = null;

        this._setupResize();
        this._setupInput();
    }

    /* ─── Public ──────────────────────────────────────────── */

    loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                this.image = img;
                this.imageW = img.naturalWidth;
                this.imageH = img.naturalHeight;
                this._fitImage();
                this.render();
                resolve({ width: this.imageW, height: this.imageH });
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = url;
        });
    }

    /** Convert screen (canvas) coords → image pixel coords */
    screenToImage(sx, sy) {
        return {
            x: (sx - this.offsetX) / this.scale,
            y: (sy - this.offsetY) / this.scale,
        };
    }

    /** Convert image pixel coords → screen (canvas) coords */
    imageToScreen(ix, iy) {
        return {
            x: ix * this.scale + this.offsetX,
            y: iy * this.scale + this.offsetY,
        };
    }

    /** Full redraw: background image + overlay */
    render() {
        this._drawBackground();
        this._drawOverlay();
    }

    /** Redraw only overlay (polygons, points, etc.) */
    renderOverlay() {
        this._drawOverlay();
    }

    getZoomPercent() {
        return Math.round(this.scale * 100);
    }

    /* ─── Private: Resize ─────────────────────────────────── */

    _setupResize() {
        const ro = new ResizeObserver(() => this._handleResize());
        ro.observe(this.container);
        // Initial size
        requestAnimationFrame(() => this._handleResize());
    }

    _handleResize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        const dpr = window.devicePixelRatio || 1;

        for (const c of [this.bgCanvas, this.overlay]) {
            c.width = w * dpr;
            c.height = h * dpr;
            c.style.width = w + 'px';
            c.style.height = h + 'px';
            c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        if (this.image) {
            this._fitImage();
            this.render();
        }
    }

    _fitImage() {
        const cw = this.container.clientWidth;
        const ch = this.container.clientHeight;
        const padding = 40;
        const scaleX = (cw - padding * 2) / this.imageW;
        const scaleY = (ch - padding * 2) / this.imageH;
        this.scale = Math.min(scaleX, scaleY, 1);
        this.offsetX = (cw - this.imageW * this.scale) / 2;
        this.offsetY = (ch - this.imageH * this.scale) / 2;
    }

    /* ─── Private: Drawing ────────────────────────────────── */

    _drawBackground() {
        const ctx = this.bgCtx;
        const cw = this.container.clientWidth;
        const ch = this.container.clientHeight;
        ctx.clearRect(0, 0, cw, ch);

        if (!this.image) return;

        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.scale, this.scale);

        // Checkerboard behind image (transparency indicator)
        this._drawCheckerboard(ctx, this.imageW, this.imageH);

        ctx.drawImage(this.image, 0, 0);
        ctx.restore();
    }

    _drawCheckerboard(ctx, w, h) {
        const size = 16;
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#333333';
        for (let y = 0; y < h; y += size) {
            for (let x = 0; x < w; x += size) {
                if ((Math.floor(x / size) + Math.floor(y / size)) % 2 === 0) {
                    ctx.fillRect(x, y, size, size);
                }
            }
        }
    }

    _drawOverlay() {
        const ctx = this.olCtx;
        const cw = this.container.clientWidth;
        const ch = this.container.clientHeight;
        ctx.clearRect(0, 0, cw, ch);
        if (this.onRenderOverlay) {
            this.onRenderOverlay(ctx);
        }
    }

    /* ─── Private: Input ──────────────────────────────────── */

    _setupInput() {
        const el = this.overlay;

        // Zoom with scroll wheel
        el.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
            const newScale = Math.max(0.1, Math.min(20, this.scale * zoomFactor));

            // Zoom centered on cursor
            this.offsetX = mx - (mx - this.offsetX) * (newScale / this.scale);
            this.offsetY = my - (my - this.offsetY) * (newScale / this.scale);
            this.scale = newScale;

            this.render();
            this._updateZoomStatus();
        }, { passive: false });

        // Pan with middle mouse or space+drag
        el.addEventListener('mousedown', (e) => {
            if (e.button === 1 || (e.button === 0 && this._spaceDown)) {
                e.preventDefault();
                this._isPanning = true;
                this._panStartX = e.clientX;
                this._panStartY = e.clientY;
                this._panOffsetStartX = this.offsetX;
                this._panOffsetStartY = this.offsetY;
                this.container.classList.add('panning');
                return;
            }
            if (this.onMouseEvent) this.onMouseEvent('down', e);
        });

        window.addEventListener('mousemove', (e) => {
            if (this._isPanning) {
                this.offsetX = this._panOffsetStartX + (e.clientX - this._panStartX);
                this.offsetY = this._panOffsetStartY + (e.clientY - this._panStartY);
                this.render();
                return;
            }
            if (this.onMouseEvent) this.onMouseEvent('move', e);
        });

        window.addEventListener('mouseup', (e) => {
            if (this._isPanning) {
                this._isPanning = false;
                this.container.classList.remove('panning');
                return;
            }
            if (this.onMouseEvent) this.onMouseEvent('up', e);
        });

        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (this.onMouseEvent) this.onMouseEvent('contextmenu', e);
        });

        // Space key for pan mode
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.repeat && document.activeElement?.tagName !== 'INPUT') {
                e.preventDefault();
                this._spaceDown = true;
                this.container.classList.add('panning');
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this._spaceDown = false;
                if (!this._isPanning) {
                    this.container.classList.remove('panning');
                }
            }
        });
    }

    _updateZoomStatus() {
        const el = document.getElementById('status-zoom');
        if (el) el.textContent = this.getZoomPercent() + '%';
    }

    /** Get mouse position in image coords from a mouse event */
    getImageCoords(e) {
        const rect = this.overlay.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        return this.screenToImage(sx, sy);
    }
}
