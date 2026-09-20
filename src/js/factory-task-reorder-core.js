/**
 * Pure helpers + DOM bind for factory task-card drag reorder.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubFactoryTaskReorder = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function factoryTaskReorderFactory() {
    /** Custom MIME so the media drop-zone ignores in-app reorder drags. */
    const TASK_REORDER_MIME = 'application/x-transub-task-reorder';

    /**
     * Move item at fromIndex so it lands at toIndex in the resulting array.
     * @template T
     * @param {T[]} items
     * @param {number} fromIndex
     * @param {number} toIndex
     * @returns {T[]}
     */
    function moveItem(items, fromIndex, toIndex) {
        const list = Array.isArray(items) ? items.slice() : [];
        const from = Number(fromIndex);
        let to = Number(toIndex);
        if (!Number.isInteger(from) || from < 0 || from >= list.length) return list;
        if (!Number.isInteger(to) || to < 0) to = 0;
        if (to >= list.length) to = list.length - 1;
        if (from === to) return list;
        const [row] = list.splice(from, 1);
        list.splice(to, 0, row);
        return list;
    }

    function isTaskReorderDrag(dataTransfer) {
        if (!dataTransfer) return false;
        try {
            const types = Array.from(dataTransfer.types || []);
            return types.includes(TASK_REORDER_MIME);
        } catch (_) {
            return false;
        }
    }

    /**
     * @param {HTMLElement | null | undefined} listEl
     * @param {{
     *   isEnabled?: () => boolean,
     *   onReorder?: (fromIdx: number, toIdx: number) => void,
     *   onDragStart?: () => void,
     *   onDragEnd?: () => void,
     * }} [opts]
     */
    function bindCardListDrag(listEl, opts = {}) {
        if (!listEl || listEl.dataset.dragBound === '1') return;
        listEl.dataset.dragBound = '1';
        let dragEl = null;

        listEl.addEventListener('dragstart', (e) => {
            if (opts.isEnabled && !opts.isEnabled()) {
                e.preventDefault();
                return;
            }
            const handle = e.target?.closest?.('.task-card-drag');
            const card = e.target?.closest?.('.task-card');
            if (!handle || !card || !listEl.contains(card)) {
                e.preventDefault();
                return;
            }
            dragEl = card;
            card.classList.add('is-dragging');
            try {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData(TASK_REORDER_MIME, '1');
                e.dataTransfer.setData('text/plain', card.getAttribute('data-idx') || '');
            } catch (_) { /* ignore */ }
            try { opts.onDragStart?.(); } catch (_) { /* ignore */ }
        });

        listEl.addEventListener('dragend', () => {
            if (dragEl) dragEl.classList.remove('is-dragging');
            listEl.querySelectorAll('.task-card.drag-over').forEach((el) => el.classList.remove('drag-over'));
            dragEl = null;
            try { opts.onDragEnd?.(); } catch (_) { /* ignore */ }
        });

        listEl.addEventListener('dragover', (e) => {
            if (!dragEl) return;
            e.preventDefault();
            e.stopPropagation();
            const over = e.target?.closest?.('.task-card');
            if (!over || over === dragEl || !listEl.contains(over)) return;
            over.classList.add('drag-over');
            const rect = over.getBoundingClientRect();
            const before = e.clientY < rect.top + rect.height / 2;
            listEl.insertBefore(dragEl, before ? over : over.nextSibling);
        });

        listEl.addEventListener('dragleave', (e) => {
            e.target?.closest?.('.task-card')?.classList.remove('drag-over');
        });

        listEl.addEventListener('drop', (e) => {
            // External media drops must bubble to filePanel so intake can add
            // files and clear the drop overlay. Only intercept in-app reorder.
            if (!dragEl) return;
            e.preventDefault();
            e.stopPropagation();
            const cards = Array.from(listEl.querySelectorAll('.task-card'));
            const fromIdx = Number(dragEl.getAttribute('data-idx'));
            const toIdx = cards.indexOf(dragEl);
            listEl.querySelectorAll('.task-card.drag-over').forEach((el) => el.classList.remove('drag-over'));
            if (!Number.isInteger(fromIdx) || toIdx < 0 || fromIdx === toIdx) return;
            opts.onReorder?.(fromIdx, toIdx);
        });
    }

    return {
        TASK_REORDER_MIME,
        moveItem,
        isTaskReorderDrag,
        bindCardListDrag,
    };
}));
