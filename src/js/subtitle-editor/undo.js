/**
 * 字幕编辑器 — 撤销 / 重做栈（相对 initial 基线的补丁，降低长片内存）
 */
(function (global) {
    const UNDO_MAX = 50;
    const DETAIL_UNDO_GAP_MS = 600;

    function installUndo(ctx) {
        if (!ctx?.state || !ctx?.els || !ctx?.utils) {
            throw new Error('installUndo(ctx): ctx.state, ctx.els, ctx.utils required');
        }
        const { cloneCues, cuesEqual } = ctx.utils;
        const patchCore = ctx.undoPatchCore || global.TransubUndoPatch;

        let detailUndoTimer = null;

        function getBaseline() {
            const { state } = ctx;
            if (state.initialSnapshot?.cues) {
                return {
                    cues: state.initialSnapshot.cues,
                    header: state.initialSnapshot.header || [],
                };
            }
            return { cues: [], header: [] };
        }

        function createEditorSnapshot() {
            const { state } = ctx;
            return {
                header: Array.isArray(state.header) ? [...state.header] : [],
                cues: cloneCues(state.cues),
                selectedIndex: state.selectedIndex,
            };
        }

        function encodeEntry(snapshot) {
            if (patchCore?.encodeEditorEntry) {
                return patchCore.encodeEditorEntry(getBaseline(), snapshot);
            }
            return {
                selectedIndex: snapshot.selectedIndex,
                header: snapshot.header,
                cuePatch: { type: 'full', cues: cloneCues(snapshot.cues) },
            };
        }

        function decodeEntry(entry) {
            if (patchCore?.decodeEditorEntry) {
                return patchCore.decodeEditorEntry(getBaseline(), entry);
            }
            return {
                selectedIndex: entry?.selectedIndex ?? -1,
                header: Array.isArray(entry?.header) ? [...entry.header] : [],
                cues: cloneCues(entry?.cuePatch?.cues || entry?.cues || []),
            };
        }

        function editorSnapshotsEqual(a, b) {
            if (!a || !b) return false;
            if (a.selectedIndex !== b.selectedIndex) return false;
            const leftHeader = a.header || [];
            const rightHeader = b.header || [];
            if (leftHeader.length !== rightHeader.length) return false;
            for (let i = 0; i < leftHeader.length; i += 1) {
                if (leftHeader[i] !== rightHeader[i]) return false;
            }
            return cuesEqual(a.cues, b.cues);
        }

        function entriesEqual(a, b) {
            if (patchCore?.entriesEqual) {
                return patchCore.entriesEqual(a, b, getBaseline());
            }
            return editorSnapshotsEqual(decodeEntry(a), decodeEntry(b));
        }

        function updateUndoRedoUi() {
            const { state, els } = ctx;
            if (els.undoBtn) els.undoBtn.disabled = !state.undoStack.length;
            if (els.redoBtn) els.redoBtn.disabled = !state.redoStack.length;
        }

        function resetDetailUndoGroup() {
            const { state } = ctx;
            state.detailUndoGrouped = false;
            if (detailUndoTimer) {
                clearTimeout(detailUndoTimer);
                detailUndoTimer = null;
            }
        }

        function pushUndoSnapshot() {
            const { state } = ctx;
            if (state.undoRecording) return;
            const snap = createEditorSnapshot();
            const entry = encodeEntry(snap);
            const top = state.undoStack[state.undoStack.length - 1];
            if (top && entriesEqual(top, entry)) return;
            state.undoStack.push(entry);
            if (state.undoStack.length > UNDO_MAX) state.undoStack.shift();
            state.redoStack = [];
            updateUndoRedoUi();
        }

        function recordUndoBeforeChange() {
            const { state } = ctx;
            if (state.undoRecording) return;
            resetDetailUndoGroup();
            pushUndoSnapshot();
        }

        function beginDetailUndoGroup() {
            const { state } = ctx;
            if (state.undoRecording) return;
            if (!state.detailUndoGrouped) {
                pushUndoSnapshot();
                state.detailUndoGrouped = true;
            }
            if (detailUndoTimer) clearTimeout(detailUndoTimer);
            detailUndoTimer = setTimeout(() => {
                state.detailUndoGrouped = false;
                detailUndoTimer = null;
            }, DETAIL_UNDO_GAP_MS);
        }

        function clearUndoHistory() {
            const { state } = ctx;
            state.undoStack = [];
            state.redoStack = [];
            resetDetailUndoGroup();
            updateUndoRedoUi();
        }

        function applyEditorSnapshot(snap) {
            const { state, setDirty, renderCueList } = ctx;
            state.undoRecording = true;
            state.header = [...snap.header];
            state.cues = cloneCues(snap.cues);
            if (snap.selectedIndex >= 0 && snap.selectedIndex < state.cues.length) {
                state.selectedIndex = snap.selectedIndex;
            } else if (state.cues.length) {
                state.selectedIndex = Math.min(Math.max(snap.selectedIndex, 0), state.cues.length - 1);
            } else {
                state.selectedIndex = -1;
            }
            setDirty(!cuesEqual(state.cues, state.savedSnapshot));
            renderCueList();
            state.undoRecording = false;
        }

        function undo() {
            const { state, syncDetailToCue, setStatus } = ctx;
            if (!state.undoStack.length) return;
            syncDetailToCue();
            state.redoStack.push(encodeEntry(createEditorSnapshot()));
            const entry = state.undoStack.pop();
            applyEditorSnapshot(decodeEntry(entry));
            updateUndoRedoUi();
            setStatus('已返回', 'ok');
        }

        function redo() {
            const { state, syncDetailToCue, setStatus } = ctx;
            if (!state.redoStack.length) return;
            syncDetailToCue();
            state.undoStack.push(encodeEntry(createEditorSnapshot()));
            const entry = state.redoStack.pop();
            applyEditorSnapshot(decodeEntry(entry));
            updateUndoRedoUi();
            setStatus('已重做', 'ok');
        }

        function saveInitialSnapshot() {
            const { state, els } = ctx;
            const cues = cloneCues(state.cues);
            state.initialSnapshot = {
                header: Array.isArray(state.header) ? [...state.header] : [],
                cues,
            };
            state.savedSnapshot = cloneCues(cues);
            // Re-encode existing undo/redo against new baseline (usually empty stacks)
            state.undoStack = [];
            state.redoStack = [];
            if (els.restoreBtn) els.restoreBtn.disabled = !state.initialSnapshot?.cues?.length;
            updateUndoRedoUi();
        }

        async function restoreInitialSnapshot() {
            const {
                state,
                setStatus,
                editorConfirm,
                syncDetailToCue,
                setDirty,
                renderCueList,
                closeFindReplaceModal,
            } = ctx;
            if (!state.initialSnapshot?.cues?.length) {
                setStatus('没有可恢复的初始字幕', 'err');
                return;
            }
            if (!(await editorConfirm('将丢弃当前全部修改并恢复到打开文件时的初始字幕，确定继续？'))) return;
            recordUndoBeforeChange();
            syncDetailToCue();
            state.header = [...state.initialSnapshot.header];
            state.cues = cloneCues(state.initialSnapshot.cues);
            state.selectedIndex = state.cues.length
                ? Math.min(Math.max(state.selectedIndex, 0), state.cues.length - 1)
                : -1;
            state.playbackIndex = -1;
            setDirty(!cuesEqual(state.cues, state.savedSnapshot));
            renderCueList();
            closeFindReplaceModal();
            setStatus(`已恢复到初始字幕（${state.cues.length} 条）`, 'ok');
        }

        ctx.createEditorSnapshot = createEditorSnapshot;
        ctx.editorSnapshotsEqual = editorSnapshotsEqual;
        ctx.updateUndoRedoUi = updateUndoRedoUi;
        ctx.resetDetailUndoGroup = resetDetailUndoGroup;
        ctx.pushUndoSnapshot = pushUndoSnapshot;
        ctx.recordUndoBeforeChange = recordUndoBeforeChange;
        ctx.beginDetailUndoGroup = beginDetailUndoGroup;
        ctx.clearUndoHistory = clearUndoHistory;
        ctx.applyEditorSnapshot = applyEditorSnapshot;
        ctx.undo = undo;
        ctx.redo = redo;
        ctx.saveInitialSnapshot = saveInitialSnapshot;
        ctx.restoreInitialSnapshot = restoreInitialSnapshot;

        return ctx;
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installUndo = installUndo;
    global.TransubEditorParts.UNDO_MAX = UNDO_MAX;
    global.TransubEditorParts.DETAIL_UNDO_GAP_MS = DETAIL_UNDO_GAP_MS;
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
