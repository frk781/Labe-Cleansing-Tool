/**
 * SAM Tool — Point-click segmentation with SAM2.
 */
class SAMTool {
    constructor(canvasManager, polygonManager, historyManager) {
        this.canvas = canvasManager;
        this.polygons = polygonManager;
        this.history = historyManager;

        this.points = [];       // { x, y, label } in image coords
        this.previewMasks = [];  // from last SAM response
        this.previewScores = [];
        this.activeMaskIdx = 0;
        this.isLoading = false;

        // Which class to assign new polygons
        this.activeClassId = 0;

        this.onStatusChange = null;
    }

    /* ─── Point Management ────────────────────────────────── */

    async addPoint(x, y, label = 1, imageName) {
        // Clamp to image bounds
        x = Math.max(0, Math.min(this.canvas.imageW - 1, x));
        y = Math.max(0, Math.min(this.canvas.imageH - 1, y));

        this.points.push({ x, y, label });
        this.canvas.renderOverlay();

        // Call SAM API
        await this._predict(imageName);
    }

    cancel() {
        this.points = [];
        this.previewMasks = [];
        this.previewScores = [];
        this.activeMaskIdx = 0;
        this.canvas.renderOverlay();
    }

    cycleMask() {
        if (this.previewMasks.length <= 1) return;
        this.activeMaskIdx = (this.activeMaskIdx + 1) % this.previewMasks.length;
        this.canvas.renderOverlay();
    }

    accept() {
        if (this.previewMasks.length === 0) return null;

        const mask = this.previewMasks[this.activeMaskIdx];
        if (!mask || !mask.points || mask.points.length < 3) return null;

        const polygon = {
            id: 0, // will be assigned by addPolygonDirect
            classId: this.activeClassId,
            points: mask.points.map(p => [p[0], p[1]]),
        };

        // Add via history
        const cmd = AddPolygonCommand(this.polygons, polygon);
        this.history.execute(cmd);

        // Clear SAM state
        this.cancel();

        return polygon;
    }

    /* ─── Rendering ─────────────────────────────────────── */

    render(ctx) {
        // Draw preview mask
        if (this.previewMasks.length > 0) {
            const mask = this.previewMasks[this.activeMaskIdx];
            if (mask && mask.points && mask.points.length >= 3) {
                const screenPts = mask.points.map(p =>
                    this.canvas.imageToScreen(p[0], p[1])
                );

                ctx.beginPath();
                ctx.moveTo(screenPts[0].x, screenPts[0].y);
                for (let i = 1; i < screenPts.length; i++) {
                    ctx.lineTo(screenPts[i].x, screenPts[i].y);
                }
                ctx.closePath();

                // Teal preview fill
                ctx.fillStyle = 'rgba(22, 194, 213, 0.25)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(22, 194, 213, 0.8)';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 3]);
                ctx.stroke();
                ctx.setLineDash([]);

                // Score badge
                if (this.previewScores.length > this.activeMaskIdx) {
                    const score = this.previewScores[this.activeMaskIdx];
                    const cx = screenPts.reduce((s, p) => s + p.x, 0) / screenPts.length;
                    const cy = screenPts.reduce((s, p) => s + p.y, 0) / screenPts.length;
                    ctx.font = '600 11px Inter, sans-serif';
                    const text = `${(score * 100).toFixed(0)}%`;
                    const tw = ctx.measureText(text).width;
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                    ctx.beginPath();
                    ctx.roundRect(cx - tw / 2 - 6, cy - 8, tw + 12, 18, 4);
                    ctx.fill();
                    ctx.fillStyle = '#16c2d5';
                    ctx.fillText(text, cx - tw / 2, cy + 4);
                }

                // Mask index indicator
                if (this.previewMasks.length > 1) {
                    const text2 = `Mask ${this.activeMaskIdx + 1}/${this.previewMasks.length} (Tab to cycle)`;
                    ctx.font = '500 11px Inter, sans-serif';
                    const tw2 = ctx.measureText(text2).width;
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                    ctx.beginPath();
                    ctx.roundRect(10, 10, tw2 + 16, 24, 6);
                    ctx.fill();
                    ctx.fillStyle = '#16c2d5';
                    ctx.fillText(text2, 18, 26);
                }
            }
        }

        // Draw click points
        for (const pt of this.points) {
            const sp = this.canvas.imageToScreen(pt.x, pt.y);
            const isPositive = pt.label === 1;

            // Outer ring
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, 8, 0, Math.PI * 2);
            ctx.fillStyle = isPositive
                ? 'rgba(52, 211, 153, 0.3)'
                : 'rgba(248, 113, 113, 0.3)';
            ctx.fill();

            // Inner dot
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = isPositive ? '#34d399' : '#f87171';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // +/- label
            ctx.font = 'bold 10px Inter, sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(isPositive ? '+' : '−', sp.x, sp.y);
        }
    }

    /* ─── Private ─────────────────────────────────────────── */

    async _predict(imageName) {
        if (!imageName) return;

        this.isLoading = true;
        this._setLoading(true);

        try {
            const apiPoints = this.points.map(p => ({
                x: p.x,
                y: p.y,
                label: p.label,
            }));

            const result = await API.samPredict(imageName, apiPoints, true);

            this.previewMasks = result.masks || [];
            this.previewScores = result.scores || [];
            this.activeMaskIdx = 0;

            // Auto-select highest-score mask
            if (this.previewScores.length > 1) {
                let bestIdx = 0;
                for (let i = 1; i < this.previewScores.length; i++) {
                    if (this.previewScores[i] > this.previewScores[bestIdx]) {
                        bestIdx = i;
                    }
                }
                this.activeMaskIdx = bestIdx;
            }

            this.canvas.renderOverlay();
        } catch (e) {
            console.error('SAM prediction failed:', e);
            if (this.onStatusChange) this.onStatusChange('error', e.message);
        } finally {
            this.isLoading = false;
            this._setLoading(false);
        }
    }

    _setLoading(show) {
        const el = document.getElementById('sam-loading');
        if (el) el.classList.toggle('hidden', !show);
        const status = document.getElementById('status-sam');
        if (status) {
            if (show) {
                status.textContent = 'SAM: processing...';
                status.className = 'status-item status-loading';
            } else {
                status.textContent = 'SAM: ready';
                status.className = 'status-item status-ready';
            }
        }
    }
}
