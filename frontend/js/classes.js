/**
 * Classes Manager — Sidebar class list UI, selection, add/edit/delete.
 */
class ClassesManager {
    constructor(polygonManager, samTool) {
        this.polygons = polygonManager;
        this.sam = samTool;

        this.classes = [];          // string[]
        this.activeClassId = 0;

        this._listEl = document.getElementById('class-list');
        this._addBtn = document.getElementById('btn-add-class');
        this._countEl = document.getElementById('annotation-count');
        this._annListEl = document.getElementById('annotation-list');

        this._editingIdx = null;    // index being renamed

        this._addBtn.addEventListener('click', () => this._promptAddClass());
    }

    /* ─── Public API ──────────────────────────────────────── */

    setClasses(classes) {
        this.classes = [...classes];
        if (this.activeClassId >= this.classes.length) {
            this.activeClassId = 0;
        }
        this.sam.activeClassId = this.activeClassId;
        this.renderClassList();
    }

    getClasses() {
        return [...this.classes];
    }

    renderClassList() {
        this._listEl.innerHTML = '';
        this.classes.forEach((cls, idx) => {
            const item = document.createElement('div');
            item.className = 'class-item' + (idx === this.activeClassId ? ' active' : '');
            item.dataset.classId = idx;

            const dot = document.createElement('div');
            dot.className = 'class-dot';
            dot.style.backgroundColor = getClassColor(idx);

            const name = document.createElement('span');
            name.className = 'class-name';
            name.textContent = cls;

            // Count polygons of this class
            const count = document.createElement('span');
            count.className = 'class-count';
            const n = this.polygons.polygons.filter(p => p.classId === idx).length;
            count.textContent = n > 0 ? n : '';

            item.appendChild(dot);
            item.appendChild(name);
            item.appendChild(count);

            // Click to select active class
            item.addEventListener('click', () => {
                this.activeClassId = idx;
                this.sam.activeClassId = idx;
                this.renderClassList();
            });

            // Double-click to rename
            item.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this._startRename(idx);
            });

            this._listEl.appendChild(item);
        });
    }

    renderAnnotationList() {
        this._annListEl.innerHTML = '';
        const polys = this.polygons.polygons;
        this._countEl.textContent = polys.length;

        for (const poly of polys) {
            const item = document.createElement('div');
            item.className = 'ann-item' + (poly.id === this.polygons.selectedId ? ' selected' : '');
            item.dataset.polyId = poly.id;

            const dot = document.createElement('div');
            dot.className = 'ann-dot';
            dot.style.backgroundColor = getClassColor(poly.classId);

            const label = document.createElement('span');
            label.className = 'ann-label';
            const className = this.classes[poly.classId] || `class_${poly.classId}`;
            label.textContent = `${className} #${poly.id}`;

            const vertices = document.createElement('span');
            vertices.className = 'ann-vertices';
            vertices.textContent = `${poly.points.length}v`;

            item.appendChild(dot);
            item.appendChild(label);
            item.appendChild(vertices);

            // Click to select polygon
            item.addEventListener('click', () => {
                this.polygons.select(poly.id);
                this.renderAnnotationList();
            });

            this._annListEl.appendChild(item);
        }
    }

    /* ─── Private ─────────────────────────────────────────── */

    _promptAddClass() {
        const name = prompt('Enter new class name:');
        if (!name || !name.trim()) return;

        this.classes.push(name.trim());
        this._saveClassesToBackend();
        this.renderClassList();
    }

    _startRename(idx) {
        const items = this._listEl.querySelectorAll('.class-item');
        const item = items[idx];
        if (!item) return;

        const nameEl = item.querySelector('.class-name');
        const currentName = this.classes[idx];

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'class-name-input';
        input.value = currentName;

        nameEl.replaceWith(input);
        input.focus();
        input.select();

        const finishRename = () => {
            const newName = input.value.trim() || currentName;
            this.classes[idx] = newName;
            this._saveClassesToBackend();
            this.renderClassList();
        };

        input.addEventListener('blur', finishRename);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                input.value = currentName;
                input.blur();
            }
        });
    }

    async _saveClassesToBackend() {
        try {
            await API.updateClasses(this.classes);
        } catch (e) {
            console.error('Failed to save classes:', e);
        }
    }
}
