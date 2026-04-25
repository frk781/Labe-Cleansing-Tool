/**
 * Polygon Manager — Polygon data, rendering, selection, and vertex editing.
 */

const CLASS_COLORS = [
    '#5b8def', '#ef5b8d', '#8def5b', '#ef8d5b', '#5befc4',
    '#c45bef', '#efef5b', '#5befef', '#ef5bef', '#5bef5b',
    '#a0522d', '#7b68ee', '#ff6347', '#00ced1', '#ffd700',
    '#ff69b4', '#32cd32', '#ba55d3', '#ff4500', '#1e90ff',
];

function getClassColor(classId) {
    return CLASS_COLORS[classId % CLASS_COLORS.length];
}

class PolygonManager {
    constructor(canvasManager) {
        this.canvas = canvasManager;
        this.polygons = []; // { id, classId, points: [[x,y],...], selected }
        this._nextId = 1;
        this.selectedId = null;

        // Edit state
        this.draggingVertex = null; // { polygonId, vertexIdx, startPos }
        this.hoverVertex = null;    // { polygonId, vertexIdx }
        this.hoverEdgeMid = null;   // { polygonId, afterIdx, x, y }

        this.VERTEX_RADIUS = 5;
        this.EDGE_MID_RADIUS = 4;
        this.HIT_THRESHOLD = 8;

        // Callback when dirty state changes
        this.onChanged = null;
    }

    /* ─── Data Operations (no history) ──────────────────── */

    addPolygonDirect(polygon) {
        if (!polygon.id) polygon.id = this._nextId++;
        else this._nextId = Math.max(this._nextId, polygon.id + 1);
        // Ensure no duplicate
        this.polygons = this.polygons.filter(p => p.id !== polygon.id);
        this.polygons.push(polygon);
        this._changed();
    }

    removePolygonDirect(id) {
        this.polygons = this.polygons.filter(p => p.id !== id);
        if (this.selectedId === id) this.selectedId = null;
        this._changed();
    }

    setVertex(polygonId, vertexIdx, pos) {
        const poly = this.polygons.find(p => p.id === polygonId);
        if (poly) {
            poly.points[vertexIdx] = [...pos];
            this._changed();
        }
    }

    insertVertex(polygonId, vertexIdx, point) {
        const poly = this.polygons.find(p => p.id === polygonId);
        if (poly) {
            poly.points.splice(vertexIdx, 0, [...point]);
            this._changed();
        }
    }

    removeVertex(polygonId, vertexIdx) {
        const poly = this.polygons.find(p => p.id === polygonId);
        if (poly && poly.points.length > 3) {
            poly.points.splice(vertexIdx, 1);
            this._changed();
        }
    }

    setClassDirect(polygonId, classId) {
        const poly = this.polygons.find(p => p.id === polygonId);
        if (poly) {
            poly.classId = classId;
            this._changed();
        }
    }

    /* ─── Selection ─────────────────────────────────────── */

    select(id) {
        this.selectedId = id;
        this.canvas.renderOverlay();
    }

    deselect() {
        this.selectedId = null;
        this.canvas.renderOverlay();
    }

    getSelected() {
        return this.polygons.find(p => p.id === this.selectedId) || null;
    }

    /* ─── Import / Export ───────────────────────────────── */

    loadAnnotations(annotations) {
        this.polygons = [];
        this._nextId = 1;
        for (const ann of annotations) {
            this.polygons.push({
                id: this._nextId++,
                classId: ann.class_id,
                points: ann.polygon.map(p => [p[0], p[1]]),
                selected: false,
            });
        }
        this.selectedId = null;
        this.canvas.renderOverlay();
    }

    getAnnotations() {
        return this.polygons.map(p => ({
            class_id: p.classId,
            polygon: p.points.map(pt => [pt[0], pt[1]]),
        }));
    }

    /* ─── Rendering ─────────────────────────────────────── */

    render(ctx) {
        for (const poly of this.polygons) {
            this._renderPolygon(ctx, poly, poly.id === this.selectedId);
        }

        // Hover edge midpoint (edit mode)
        if (this.hoverEdgeMid) {
            const sp = this.canvas.imageToScreen(this.hoverEdgeMid.x, this.hoverEdgeMid.y);
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, this.EDGE_MID_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.fill();
            ctx.strokeStyle = '#5b8def';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }

    _renderPolygon(ctx, poly, isSelected) {
        const color = getClassColor(poly.classId);
        const points = poly.points.map(p => this.canvas.imageToScreen(p[0], p[1]));

        if (points.length < 2) return;

        // Filled polygon
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();

        ctx.fillStyle = isSelected
            ? this._hexToRgba(color, 0.3)
            : this._hexToRgba(color, 0.15);
        ctx.fill();

        // Stroke
        ctx.strokeStyle = isSelected ? color : this._hexToRgba(color, 0.7);
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.stroke();

        // Vertices (only for selected polygon)
        if (isSelected) {
            for (let i = 0; i < points.length; i++) {
                const isHover = this.hoverVertex &&
                    this.hoverVertex.polygonId === poly.id &&
                    this.hoverVertex.vertexIdx === i;

                ctx.beginPath();
                ctx.arc(points[i].x, points[i].y,
                    isHover ? this.VERTEX_RADIUS + 2 : this.VERTEX_RADIUS,
                    0, Math.PI * 2);
                ctx.fillStyle = isHover ? '#ffffff' : color;
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        }
    }

    /* ─── Hit Testing ───────────────────────────────────── */

    /** Find polygon at image coords using ray-casting */
    hitTestPolygon(ix, iy) {
        // Check in reverse order (top-most first)
        for (let i = this.polygons.length - 1; i >= 0; i--) {
            if (this._pointInPolygon(ix, iy, this.polygons[i].points)) {
                return this.polygons[i];
            }
        }
        return null;
    }

    /** Find vertex handle near screen coords */
    hitTestVertex(sx, sy) {
        const selected = this.getSelected();
        if (!selected) return null;

        for (let i = 0; i < selected.points.length; i++) {
            const sp = this.canvas.imageToScreen(selected.points[i][0], selected.points[i][1]);
            const dx = sx - sp.x;
            const dy = sy - sp.y;
            if (Math.sqrt(dx * dx + dy * dy) < this.HIT_THRESHOLD) {
                return { polygonId: selected.id, vertexIdx: i };
            }
        }
        return null;
    }

    /** Find edge midpoint near screen coords */
    hitTestEdgeMid(sx, sy) {
        const selected = this.getSelected();
        if (!selected) return null;

        for (let i = 0; i < selected.points.length; i++) {
            const j = (i + 1) % selected.points.length;
            const mx = (selected.points[i][0] + selected.points[j][0]) / 2;
            const my = (selected.points[i][1] + selected.points[j][1]) / 2;
            const sp = this.canvas.imageToScreen(mx, my);
            const dx = sx - sp.x;
            const dy = sy - sp.y;
            if (Math.sqrt(dx * dx + dy * dy) < this.HIT_THRESHOLD) {
                return { polygonId: selected.id, afterIdx: i, x: mx, y: my };
            }
        }
        return null;
    }

    _pointInPolygon(x, y, points) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i][0], yi = points[i][1];
            const xj = points[j][0], yj = points[j][1];
            if (((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    _hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    _changed() {
        this.canvas.renderOverlay();
        if (this.onChanged) this.onChanged();
    }
}
