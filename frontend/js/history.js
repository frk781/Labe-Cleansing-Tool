/**
 * Undo/Redo History Manager — Command Pattern.
 */
class HistoryManager {
    constructor(maxSteps = 100) {
        this.undoStack = [];
        this.redoStack = [];
        this.maxSteps = maxSteps;
        this.onUpdate = null; // callback when state changes
    }

    /**
     * Execute a command and push it onto the undo stack.
     * Command shape: { execute(), undo(), description }
     */
    execute(command) {
        command.execute();
        this.undoStack.push(command);
        if (this.undoStack.length > this.maxSteps) {
            this.undoStack.shift();
        }
        // Clear redo stack on new action
        this.redoStack = [];
        this._notify();
    }

    undo() {
        if (this.undoStack.length === 0) return;
        const cmd = this.undoStack.pop();
        cmd.undo();
        this.redoStack.push(cmd);
        this._notify();
    }

    redo() {
        if (this.redoStack.length === 0) return;
        const cmd = this.redoStack.pop();
        cmd.execute();
        this.undoStack.push(cmd);
        this._notify();
    }

    get canUndo() { return this.undoStack.length > 0; }
    get canRedo() { return this.redoStack.length > 0; }

    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this._notify();
    }

    _notify() {
        if (this.onUpdate) this.onUpdate();
    }
}

/* ─── Command Factories ────────────────────────────────────── */

function AddPolygonCommand(polygonManager, polygon) {
    return {
        description: `Add polygon (class ${polygon.classId})`,
        execute() { polygonManager.addPolygonDirect(polygon); },
        undo() { polygonManager.removePolygonDirect(polygon.id); },
    };
}

function DeletePolygonCommand(polygonManager, polygon) {
    const copy = JSON.parse(JSON.stringify(polygon));
    return {
        description: `Delete polygon ${polygon.id}`,
        execute() { polygonManager.removePolygonDirect(polygon.id); },
        undo() { polygonManager.addPolygonDirect(copy); },
    };
}

function MoveVertexCommand(polygonManager, polygonId, vertexIdx, oldPos, newPos) {
    return {
        description: `Move vertex ${vertexIdx} of polygon ${polygonId}`,
        execute() { polygonManager.setVertex(polygonId, vertexIdx, newPos); },
        undo() { polygonManager.setVertex(polygonId, vertexIdx, oldPos); },
    };
}

function AddVertexCommand(polygonManager, polygonId, vertexIdx, point) {
    return {
        description: `Add vertex to polygon ${polygonId}`,
        execute() { polygonManager.insertVertex(polygonId, vertexIdx, point); },
        undo() { polygonManager.removeVertex(polygonId, vertexIdx); },
    };
}

function DeleteVertexCommand(polygonManager, polygonId, vertexIdx, point) {
    return {
        description: `Delete vertex ${vertexIdx} from polygon ${polygonId}`,
        execute() { polygonManager.removeVertex(polygonId, vertexIdx); },
        undo() { polygonManager.insertVertex(polygonId, vertexIdx, point); },
    };
}

function ChangeClassCommand(polygonManager, polygonId, oldClassId, newClassId) {
    return {
        description: `Change class of polygon ${polygonId}`,
        execute() { polygonManager.setClassDirect(polygonId, newClassId); },
        undo() { polygonManager.setClassDirect(polygonId, oldClassId); },
    };
}
