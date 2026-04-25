/**
 * Toolbar Manager — Tool switching, keyboard shortcuts, button states.
 */
class ToolbarManager {
    constructor(app) {
        this.app = app;

        this.currentTool = 'sam'; // 'sam' | 'select' | 'edit'

        // Tool buttons
        this._toolBtns = {
            sam: document.getElementById('tool-sam'),
            select: document.getElementById('tool-select'),
            edit: document.getElementById('tool-edit'),
        };

        this._undoBtn = document.getElementById('btn-undo');
        this._redoBtn = document.getElementById('btn-redo');
        this._saveBtn = document.getElementById('btn-save');

        this._statusTool = document.getElementById('status-tool');
        this._statusCoords = document.getElementById('status-coords');

        this._setupToolButtons();
        this._setupKeyboard();
        this._setupSaveButton();
    }

    /* ─── Public ──────────────────────────────────────────── */

    setTool(tool) {
        this.currentTool = tool;

        // Update button states
        Object.entries(this._toolBtns).forEach(([key, btn]) => {
            btn.classList.toggle('active', key === tool);
        });

        // Update canvas cursor
        const container = document.getElementById('canvas-container');
        container.dataset.tool = tool;

        // Update status bar
        const names = { sam: 'SAM', select: 'Select', edit: 'Edit' };
        this._statusTool.textContent = `Tool: ${names[tool] || tool}`;

        // Cancel SAM points when switching away
        if (tool !== 'sam') {
            this.app.sam.cancel();
        }

        // Deselect when going to SAM tool
        if (tool === 'sam') {
            this.app.polygonManager.deselect();
            this.app.classesManager.renderAnnotationList();
        }
    }

    updateUndoRedo() {
        this._undoBtn.disabled = !this.app.history.canUndo;
        this._redoBtn.disabled = !this.app.history.canRedo;
    }

    updateCoords(x, y) {
        if (x !== null && y !== null) {
            this._statusCoords.textContent = `${Math.round(x)}, ${Math.round(y)}`;
        } else {
            this._statusCoords.textContent = '—';
        }
    }

    /* ─── Private ─────────────────────────────────────────── */

    _setupToolButtons() {
        Object.entries(this._toolBtns).forEach(([tool, btn]) => {
            btn.addEventListener('click', () => this.setTool(tool));
        });

        this._undoBtn.addEventListener('click', () => {
            this.app.history.undo();
        });

        this._redoBtn.addEventListener('click', () => {
            this.app.history.redo();
        });
    }

    _setupSaveButton() {
        this._saveBtn.addEventListener('click', () => {
            this.app.saveCurrentAnnotations();
        });
    }

    _setupKeyboard() {
        window.addEventListener('keydown', (e) => {
            // Don't capture if typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // --- Tool shortcuts ---
            if (e.key === 'v' || e.key === 'V') {
                this.setTool('select');
                return;
            }
            if (e.key === 'e' || e.key === 'E') {
                this.setTool('edit');
                return;
            }
            if (!e.altKey && (e.key === 's' || e.key === 'S')) {
                if (!e.ctrlKey && !e.metaKey) {
                    this.setTool('sam');
                    return;
                }
            }

            // --- Undo / Redo ---
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.app.history.undo();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                this.app.history.redo();
                return;
            }

            // --- Save ---
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                this.app.saveCurrentAnnotations();
                return;
            }

            // --- Delete selected polygon (Delete, Backspace, or Escape) ---
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const selected = this.app.polygonManager.getSelected();
                if (selected) {
                    const cmd = DeletePolygonCommand(this.app.polygonManager, selected);
                    this.app.history.execute(cmd);
                    this.app.classesManager.renderAnnotationList();
                    this.app.classesManager.renderClassList();
                    this.app.setDirty(true);
                }
                return;
            }

            // --- Escape: delete selected mask, or cancel SAM preview ---
            if (e.key === 'Escape') {
                // If SAM has a preview pending, cancel it
                if (this.currentTool === 'sam' && this.app.sam.points.length > 0) {
                    this.app.sam.cancel();
                    return;
                }
                // Otherwise, delete selected polygon
                const selected = this.app.polygonManager.getSelected();
                if (selected) {
                    const cmd = DeletePolygonCommand(this.app.polygonManager, selected);
                    this.app.history.execute(cmd);
                    this.app.classesManager.renderAnnotationList();
                    this.app.classesManager.renderClassList();
                    this.app.setDirty(true);
                }
                return;
            }

            // --- Alt+Tab: cycle active class ID ---
            // Cycles through available classes. The selected class becomes
            // the default for new SAM masks and also updates the SAM preview
            // class in real-time before confirming with Enter.
            if (e.key === 'Tab' && e.altKey) {
                e.preventDefault();
                const cm = this.app.classesManager;
                const total = cm.classes.length;
                if (total === 0) return;

                // Cycle to next class
                const nextId = (cm.activeClassId + 1) % total;
                cm.activeClassId = nextId;
                this.app.sam.activeClassId = nextId;
                cm.renderClassList();

                // Show feedback
                const className = cm.classes[nextId];
                this.app._showToast(`Class: ${className} (${nextId})`, 'info');

                // If SAM has a preview, update the pending mask's class in real-time
                if (this.currentTool === 'sam' && this.app.sam.previewMasks.length > 0) {
                    this.app.canvasManager.renderOverlay();
                }
                return;
            }

            // --- Tab (without Alt): cycle SAM mask candidates ---
            if (e.key === 'Tab' && !e.altKey && this.currentTool === 'sam') {
                e.preventDefault();
                this.app.sam.cycleMask();
                return;
            }

            // --- Enter: accept SAM mask (class stays as default) ---
            if (e.key === 'Enter' && this.currentTool === 'sam') {
                e.preventDefault();
                const accepted = this.app.sam.accept();
                if (accepted) {
                    this.app.classesManager.renderAnnotationList();
                    this.app.classesManager.renderClassList();
                    this.app.setDirty(true);
                    // Class stays selected — ready for next SAM click
                }
                return;
            }

            // --- A / D: navigate images ---
            if (e.key === 'a' || e.key === 'A') {
                if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                    e.preventDefault();
                    this.app.navigateImage(-1);
                    return;
                }
            }
            if (e.key === 'd' || e.key === 'D') {
                if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                    e.preventDefault();
                    this.app.navigateImage(1);
                    return;
                }
            }

            // --- Arrow keys: also navigate images ---
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                this.app.navigateImage(1);
                return;
            }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                this.app.navigateImage(-1);
                return;
            }

            // --- Number keys: change class of selected polygon ---
            const num = parseInt(e.key);
            if (!isNaN(num) && num >= 0 && num <= 9) {
                const selected = this.app.polygonManager.getSelected();
                if (selected && num < this.app.classesManager.classes.length) {
                    const oldClassId = selected.classId;
                    if (oldClassId !== num) {
                        const cmd = ChangeClassCommand(
                            this.app.polygonManager, selected.id, oldClassId, num
                        );
                        this.app.history.execute(cmd);
                        this.app.classesManager.renderAnnotationList();
                        this.app.classesManager.renderClassList();
                        this.app.setDirty(true);
                    }
                }
                // Also change active class for SAM
                if (num < this.app.classesManager.classes.length) {
                    this.app.classesManager.activeClassId = num;
                    this.app.sam.activeClassId = num;
                    this.app.classesManager.renderClassList();
                }
                return;
            }
        });
    }
}
