// Drag & Drop manager for SevenFlow.
// Extracted verbatim from SevenFlowApp (behavior-neutral). All shared drag state
// (isDragging, draggedTask, dragAutoScroll*, globalDragAutoScrollBound) lives on
// the app instance and is accessed via this.app.* so the 50+ readers elsewhere
// in sevenflow.js keep working unchanged.

class SevenFlowDragDropManager {
    constructor(app) {
        this.app = app;
    }

    getDragAutoScrollContainer() {
        const weekContainer = document.querySelector('.week-container');
        if (weekContainer) {
            const style = window.getComputedStyle(weekContainer);
            const canScrollY = style.overflowY === 'auto' || style.overflowY === 'scroll';
            if (canScrollY && weekContainer.scrollHeight > weekContainer.clientHeight + 1) {
                return weekContainer;
            }
        }

        const appRoot = document.getElementById('app');
        if (appRoot) {
            const style = window.getComputedStyle(appRoot);
            const canScrollY = style.overflowY === 'auto' || style.overflowY === 'scroll';
            if (canScrollY && appRoot.scrollHeight > appRoot.clientHeight + 1) {
                return appRoot;
            }
        }

        const bodyStyle = window.getComputedStyle(document.body);
        const htmlStyle = window.getComputedStyle(document.documentElement);
        const bodyScrollable = (bodyStyle.overflowY === 'auto' || bodyStyle.overflowY === 'scroll');
        const htmlScrollable = (htmlStyle.overflowY === 'auto' || htmlStyle.overflowY === 'scroll');
        if ((bodyScrollable || htmlScrollable) && document.documentElement.scrollHeight > window.innerHeight + 1) {
            return document.scrollingElement || document.documentElement;
        }

        if (weekContainer && weekContainer.scrollHeight > weekContainer.clientHeight + 1) {
            return weekContainer;
        }
        return document.scrollingElement || document.documentElement;
    }

    getDragAutoScrollCandidates() {
        const list = [];
        const weekContainer = document.querySelector('.week-container');
        const appRoot = document.getElementById('app');
        const docScroller = document.scrollingElement || document.documentElement;
        [weekContainer, appRoot, docScroller, document.documentElement, document.body].forEach((el) => {
            if (!el) return;
            if (list.includes(el)) return;
            list.push(el);
        });
        return list;
    }

    canScrollElement(el, direction) {
        if (!el) return false;
        const max = Math.max(0, el.scrollHeight - el.clientHeight);
        if (max <= 0) return false;
        if (direction < 0) return el.scrollTop > 0;
        if (direction > 0) return el.scrollTop < max;
        return false;
    }

    tryScrollElement(el, delta) {
        if (!el || !delta) return false;
        const before = el.scrollTop;
        el.scrollTop = before + delta;
        return el.scrollTop !== before;
    }

    updateDragAutoScroll(pointerY) {
        if (!this.app.isDragging || typeof pointerY !== 'number') {
            this.stopDragAutoScroll();
            return;
        }

        const target = this.getDragAutoScrollContainer();
        if (!target) {
            this.stopDragAutoScroll();
            return;
        }

        const isDocumentScroller = target === document.scrollingElement || target === document.documentElement || target === document.body;
        const useViewportEdges = isDocumentScroller || this.app.isAndroidAppRuntime();
        const rect = useViewportEdges
            ? { top: 0, bottom: window.innerHeight }
            : target.getBoundingClientRect();

        const threshold = this.app.dragAutoScrollThreshold;
        const minSpeed = this.app.dragAutoScrollMinSpeed;
        const maxSpeed = this.app.dragAutoScrollMaxSpeed;
        let speed = 0;

        if (pointerY < rect.top + threshold) {
            const ratio = (rect.top + threshold - pointerY) / threshold;
            const scaled = minSpeed + (Math.min(1, ratio) * (maxSpeed - minSpeed));
            speed = -Math.round(scaled);
        } else if (pointerY > rect.bottom - threshold) {
            const ratio = (pointerY - (rect.bottom - threshold)) / threshold;
            const scaled = minSpeed + (Math.min(1, ratio) * (maxSpeed - minSpeed));
            speed = Math.round(scaled);
        }

        this.app.dragAutoScrollTarget = target;
        this.app.dragAutoScrollSpeed = speed;

        if (speed === 0) {
            this.stopDragAutoScroll();
            return;
        }

        if (this.app.dragAutoScrollRaf) return;

        const step = () => {
            if (!this.app.isDragging || !this.app.dragAutoScrollTarget || this.app.dragAutoScrollSpeed === 0) {
                this.stopDragAutoScroll();
                return;
            }

            const scroller = this.app.dragAutoScrollTarget;
            const direction = this.app.dragAutoScrollSpeed > 0 ? 1 : -1;
            let moved = false;

            if (this.canScrollElement(scroller, direction)) {
                moved = this.tryScrollElement(scroller, this.app.dragAutoScrollSpeed);
            }

            if (!moved) {
                const candidates = this.getDragAutoScrollCandidates();
                for (let i = 0; i < candidates.length; i++) {
                    const candidate = candidates[i];
                    if (candidate === scroller) continue;
                    if (!this.canScrollElement(candidate, direction)) continue;
                    if (this.tryScrollElement(candidate, this.app.dragAutoScrollSpeed)) {
                        this.app.dragAutoScrollTarget = candidate;
                        moved = true;
                        break;
                    }
                }
            }

            if (!moved) {
                const beforeY = window.scrollY;
                window.scrollBy(0, this.app.dragAutoScrollSpeed);
                moved = window.scrollY !== beforeY;
            }

            this.app.dragAutoScrollRaf = requestAnimationFrame(step);
        };

        this.app.dragAutoScrollRaf = requestAnimationFrame(step);
    }

    stopDragAutoScroll() {
        this.app.dragAutoScrollSpeed = 0;
        this.app.dragAutoScrollTarget = null;

        if (this.app.dragAutoScrollRaf) {
            cancelAnimationFrame(this.app.dragAutoScrollRaf);
            this.app.dragAutoScrollRaf = null;
        }
    }

    handleDragStart(e, date, task) {
        this.app.isDragging = true;
        this.app.draggedTask = {
            date: date,
            task: task
        };
        
        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
    }

    handleDragEnd(e) {
        e.currentTarget.classList.remove('dragging');
        this.stopDragAutoScroll();
        
        // Reset isDragging flag after a short delay to prevent click event
        setTimeout(() => {
            this.app.isDragging = false;
            this.app.flushRealtimeChanges();
        }, 100);

        // Remove all drop-active classes
        document.querySelectorAll('.drop-active').forEach(el => {
            el.classList.remove('drop-active');
        });
        
        // Remove all drop indicators
        document.querySelectorAll('.drop-indicator').forEach(el => {
            el.remove();
        });
    }

    handleDragOver(e, container) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this.updateDragAutoScroll(e.clientY);
        
        if (!container.classList.contains('drop-active')) {
            container.classList.add('drop-active');
        }
        
        const taskElements = Array.from(container.querySelectorAll('.task-item:not(.dragging)'));
        
        // Remove any existing drop indicators
        const existingIndicator = container.querySelector('.drop-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        // Always allow dropping, even if no tasks (empty container)
        if (taskElements.length === 0) {
            // Show indicator at the top
            const indicator = document.createElement('div');
            indicator.className = 'drop-indicator';

            // Find first placeholder or insert at beginning
            const firstPlaceholder = container.querySelector('.task-placeholder');
            if (firstPlaceholder) {
                container.insertBefore(indicator, firstPlaceholder);
            } else {
                container.insertBefore(indicator, container.firstChild);
            }
            return false;
        }

        const mouseY = e.clientY;
        let insertBeforeElement = null;

        // Find where to insert based on mouse position
        for (let i = 0; i < taskElements.length; i++) {
            const rect = taskElements[i].getBoundingClientRect();
            const taskMiddle = rect.top + rect.height / 2;

            if (mouseY < taskMiddle) {
                insertBeforeElement = taskElements[i];
                break;
            }
        }

        // Create drop indicator
        const indicator = document.createElement('div');
        indicator.className = 'drop-indicator';
        
        if (insertBeforeElement) {
            // Insert before the found element
            container.insertBefore(indicator, insertBeforeElement);
        } else {
            // Insert at end - after last task, before placeholders
            const lastTask = taskElements[taskElements.length - 1];
            const firstPlaceholder = container.querySelector('.task-placeholder');

            if (firstPlaceholder) {
                container.insertBefore(indicator, firstPlaceholder);
            } else if (lastTask) {
                lastTask.after(indicator);
            } else {
                container.appendChild(indicator);
            }
        }
        
        return false;
    }

    handleDragLeave(e, container) {
        // Only remove if we're actually leaving the container
        if (e.currentTarget === e.target) {
            container.classList.remove('drop-active');
        }
    }

    handleDrop(e, targetDate, container) {
        e.preventDefault();
        e.stopPropagation();
        this.stopDragAutoScroll();
        
        container.classList.remove('drop-active');
        
        if (!this.app.draggedTask) {
            return;
        }

        const draggedKey = this.app.draggedTask.backlogId
            ? this.app.getBacklogSelectionKey(this.app.draggedTask.backlogId, this.app.draggedTask.task.id)
            : this.app.getTaskSelectionKey(this.app.formatDate(this.app.draggedTask.date), this.app.draggedTask.task.id);
        
        // Find drop indicator to determine exact insert position
        const dropIndicator = container.querySelector('.drop-indicator');
        let targetIndex = 0;

        if (dropIndicator) {
            // Count task items before the drop indicator (excluding the dragged task)
            const allElements = Array.from(container.children);
            const indicatorIndex = allElements.indexOf(dropIndicator);
            const draggedTaskId = this.app.draggedTask.task.id;

            targetIndex = 0;
            for (let i = 0; i < indicatorIndex; i++) {
                if (allElements[i].classList.contains('task-item')) {
                    const taskId = parseFloat(allElements[i].dataset.taskId);
                    if (taskId !== draggedTaskId) {
                        targetIndex++;
                    }
                }
            }
        } else {
            // Fallback: calculate from mouse position
            const taskElements = Array.from(container.querySelectorAll('.task-item:not(.dragging)'));
            targetIndex = taskElements.length;

            for (let i = 0; i < taskElements.length; i++) {
                const rect = taskElements[i].getBoundingClientRect();
                const mouseY = e.clientY;

                if (mouseY < rect.top + rect.height / 2) {
                    targetIndex = i;
                    break;
                }
            }
        }

        // Remove drop indicator
        if (dropIndicator) {
            dropIndicator.remove();
        }

        const shouldBulkMove = this.app.selectionMode && this.app.selectedTasks.size > 1 && this.app.selectedTasks.has(draggedKey);
        if (shouldBulkMove) {
            this.app.moveSelectedTasksToDay(targetDate, targetIndex);
            this.app.draggedTask = null;
            return;
        }

        // Check if dropping from backlog
        if (this.app.draggedTask.backlogId) {
            // From backlog to week
            this.app.moveTaskFromBacklog(this.app.draggedTask.backlogId, this.app.draggedTask.task.id, targetDate, targetIndex);
            this.app.renderWeek();
            this.app.renderBacklog();
            return;
        }
        
        const sourceDate = this.app.draggedTask.date;
        const task = this.app.draggedTask.task;
        const sourceDateKey = this.app.formatDate(sourceDate);
        const targetDateKey = this.app.formatDate(targetDate);
        
        // Same day reordering
        if (sourceDateKey === targetDateKey) {
            const tasks = this.app.tasks[sourceDateKey];
            if (!tasks) {
                return;
            }
            
            // Find current index
            const currentIndex = tasks.findIndex(t => t.id === task.id);
            if (currentIndex === -1) {
                return;
            }

            // Remove from current position
            const [movedTask] = tasks.splice(currentIndex, 1);
            const movedTaskIsRecurring = !!(movedTask && (movedTask.recurringId || (movedTask.recurring && movedTask.recurring !== 'none')));

            // targetIndex was counted from the rendered (display-sorted) DOM, so it can't
            // be used as a raw array index directly — normalizeDayInsertIndex translates it
            // via the task's completed/recurring group, which also keeps completed tasks
            // below incomplete ones and recurring tasks in their block.
            const insertIndex = this.app.normalizeDayInsertIndex(tasks, movedTask, targetIndex);

            // Insert at new position
            tasks.splice(insertIndex, 0, movedTask);

            // Use global recurring order for recurring-series reordering so it stays
            // consistent on future dates as well.
            if (movedTaskIsRecurring) {
                this.app.persistRecurringOrderFromDay(sourceDateKey);
            } else {
                // Use optimized save for single date only
                this.app.saveTasksForDate(sourceDate);
            }
            this.app.draggedTask = null;
            this.app.renderWeek();
            return;
        }
        
        // Moving between different days
        // Move between different days atomically to avoid transient empty states
        const movedTask = this.app.removeTaskFromDateList(sourceDateKey, task.id);
        if (!movedTask) {
            return false;
        }
        
        if (!this.app.tasks[targetDateKey]) {
            this.app.tasks[targetDateKey] = [];
        }

        const insertIndex = this.app.normalizeDayInsertIndex(this.app.tasks[targetDateKey], movedTask, targetIndex);
        this.app.tasks[targetDateKey].splice(insertIndex, 0, movedTask);
        
        // Save both affected dates
        this.app.saveTasksForDate(sourceDate);
        this.app.saveTasksForDate(targetDate);

        this.app.draggedTask = null;
        this.app.renderWeek();
        
        return false;
    }

    setupInboxDropZone() {
        const container = document.getElementById('inboxList');
        if (!container || container.dataset.dndSetup === 'true') return;
        container.dataset.dndSetup = 'true';

        const clearIndicator = () => {
            const indicator = container.querySelector('.drop-indicator');
            if (indicator) indicator.remove();
        };

        container.addEventListener('dragover', (e) => {
            if (!this.app.draggedTask || this.app.draggedTask.backlogId !== 'inbox') return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            this.updateDragAutoScroll(e.clientY);

            clearIndicator();

            const wraps = Array.from(container.querySelectorAll('.inbox-item-wrap'));
            if (wraps.length === 0) return;

            const mouseY = e.clientY;
            let insertBeforeWrap = null;
            for (let i = 0; i < wraps.length; i++) {
                const taskEl = wraps[i].querySelector('.task-item');
                if (taskEl?.classList.contains('dragging')) continue;
                const rect = wraps[i].getBoundingClientRect();
                const middle = rect.top + rect.height / 2;
                if (mouseY < middle) {
                    insertBeforeWrap = wraps[i];
                    break;
                }
            }

            const indicator = document.createElement('div');
            indicator.className = 'drop-indicator';
            if (insertBeforeWrap) {
                container.insertBefore(indicator, insertBeforeWrap);
            } else {
                container.appendChild(indicator);
            }
        });

        container.addEventListener('dragleave', (e) => {
            if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) {
                clearIndicator();
            }
        });

        container.addEventListener('drop', (e) => {
            if (!this.app.draggedTask || this.app.draggedTask.backlogId !== 'inbox') return;
            e.preventDefault();
            this.stopDragAutoScroll();

            const indicator = container.querySelector('.drop-indicator');
            let targetIndex = (this.app.backlogs.inbox || []).length;

            if (indicator) {
                const allChildren = Array.from(container.children);
                const indicatorIndex = allChildren.indexOf(indicator);
                targetIndex = 0;

                for (let i = 0; i < indicatorIndex; i++) {
                    const child = allChildren[i];
                    if (!child.classList || !child.classList.contains('inbox-item-wrap')) continue;
                    const taskEl = child.querySelector('.task-item');
                    const taskId = taskEl ? parseFloat(taskEl.dataset.taskId) : null;
                    if (taskId !== this.app.draggedTask.task.id) targetIndex++;
                }

                indicator.remove();
            } else {
                const wraps = Array.from(container.querySelectorAll('.inbox-item-wrap'));
                targetIndex = 0;
                for (let i = 0; i < wraps.length; i++) {
                    const taskEl = wraps[i].querySelector('.task-item');
                    const wrapTaskId = taskEl ? parseFloat(taskEl.dataset.taskId) : null;
                    if (wrapTaskId === this.app.draggedTask.task.id) continue;
                    const rect = wraps[i].getBoundingClientRect();
                    if (e.clientY < rect.top + rect.height / 2) break;
                    targetIndex++;
                }
            }
            this.app.reorderInboxTask(this.app.draggedTask.task.id, targetIndex);
            this.app.renderInbox();
            this.app.draggedTask = null;
        });
    }

    setupBacklogDropZones() {
        ['1', '2', '3'].forEach(backlogId => {
            const column = document.querySelector(`[data-backlog="${backlogId}"]`);
            if (!column) return;

            column.addEventListener('click', (e) => {
                if (!this.app.selectionMode || this.app.selectedTasks.size === 0) return;
                if (e.target.closest('.task-item')) return;
                if (e.target.closest('.backlog-title-input')) return;
                this.app.moveSelectedTasksToBacklog(backlogId);
            });
            
            column.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                this.updateDragAutoScroll(e.clientY);
                
                const container = document.getElementById(`backlog${backlogId}`);
                const taskElements = Array.from(container.querySelectorAll('.task-item:not(.dragging)'));
                
                // Remove existing indicator
                const existingIndicator = container.querySelector('.drop-indicator');
                if (existingIndicator) {
                    existingIndicator.remove();
                }
                
                // Show indicator even when backlog is empty (or only placeholders)
                if (taskElements.length === 0) {
                    const indicator = document.createElement('div');
                    indicator.className = 'drop-indicator';
                    const firstPlaceholder = container.querySelector('.task-placeholder');
                    if (firstPlaceholder) {
                        container.insertBefore(indicator, firstPlaceholder);
                    } else {
                        container.insertBefore(indicator, container.firstChild);
                    }
                    return;
                }
                
                const mouseY = e.clientY;
                let insertBeforeElement = null;

                // Find where to insert based on mouse position
                for (let i = 0; i < taskElements.length; i++) {
                    const rect = taskElements[i].getBoundingClientRect();
                    const taskMiddle = rect.top + rect.height / 2;

                    if (mouseY < taskMiddle) {
                        insertBeforeElement = taskElements[i];
                        break;
                    }
                }

                // Create drop indicator
                const indicator = document.createElement('div');
                indicator.className = 'drop-indicator';
                
                if (insertBeforeElement) {
                    // Insert before the found element
                    container.insertBefore(indicator, insertBeforeElement);
                } else {
                    // Insert at end - after last task, before placeholders
                    const firstPlaceholder = container.querySelector('.task-placeholder');

                    if (firstPlaceholder) {
                        container.insertBefore(indicator, firstPlaceholder);
                    } else {
                        const lastTask = taskElements[taskElements.length - 1];
                        if (lastTask) {
                            lastTask.after(indicator);
                        } else {
                            container.appendChild(indicator);
                        }
                    }
                }
            });
            
            column.addEventListener('dragleave', (e) => {
                if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) {
                    const container = document.getElementById(`backlog${backlogId}`);
                    const indicator = container.querySelector('.drop-indicator');
                    if (indicator) {
                        indicator.remove();
                    }
                }
            });
            
            column.addEventListener('drop', (e) => {
                e.preventDefault();
                this.stopDragAutoScroll();
                if (!this.app.draggedTask) {
                    return;
                }

                const draggedKey = this.app.draggedTask.backlogId
                    ? this.app.getBacklogSelectionKey(this.app.draggedTask.backlogId, this.app.draggedTask.task.id)
                    : this.app.getTaskSelectionKey(this.app.formatDate(this.app.draggedTask.date), this.app.draggedTask.task.id);
                
                const container = document.getElementById(`backlog${backlogId}`);

                // Find drop indicator to determine exact insert position
                const dropIndicator = container.querySelector('.drop-indicator');
                let targetIndex = 0;

                if (dropIndicator) {
                    // Count task items before the drop indicator (excluding the dragged task)
                    const allElements = Array.from(container.children);
                    const indicatorIndex = allElements.indexOf(dropIndicator);
                    const draggedTaskId = this.app.draggedTask.task.id;

                    targetIndex = 0;
                    for (let i = 0; i < indicatorIndex; i++) {
                        if (allElements[i].classList.contains('task-item')) {
                            const taskId = parseFloat(allElements[i].dataset.taskId);
                            if (taskId !== draggedTaskId) {
                                targetIndex++;
                            }
                        }
                    }
                } else {
                    // Fallback: calculate from mouse position
                    const taskElements = Array.from(container.querySelectorAll('.task-item'));
                    targetIndex = taskElements.length;

                    for (let i = 0; i < taskElements.length; i++) {
                        const rect = taskElements[i].getBoundingClientRect();
                        const mouseY = e.clientY;

                        if (mouseY < rect.top + rect.height / 2) {
                            targetIndex = i;
                            break;
                        }
                    }
                }

                // Remove indicator
                if (dropIndicator) {
                    dropIndicator.remove();
                }

                const shouldBulkMove = this.app.selectionMode && this.app.selectedTasks.size > 1 && this.app.selectedTasks.has(draggedKey);
                if (shouldBulkMove) {
                    this.app.moveSelectedTasksToBacklog(backlogId, targetIndex);
                    this.app.draggedTask = null;
                    return;
                }

                if (this.app.draggedTask.date) {
                    this.app.moveTaskToBacklog(this.app.draggedTask.date, this.app.draggedTask.task.id, backlogId, targetIndex);
                } else if (this.app.draggedTask.backlogId) {
                    this.app.moveBacklogTask(this.app.draggedTask.backlogId, this.app.draggedTask.task.id, backlogId, targetIndex);
                }
                
                this.app.renderWeek();
                this.app.renderBacklog();
                // DON'T call setupBacklogDropZones() - event listeners persist!
            });
        });
    }

    setupGlobalDragListeners() {
        if (!this.app.globalDragAutoScrollBound) {
            this.app.globalDragAutoScrollBound = true;
            document.addEventListener('drag', (e) => {
                if (!this.app.isDragging) return;
                if (typeof e.clientY !== 'number') return;
                this.updateDragAutoScroll(e.clientY);
            });
            document.addEventListener('dragover', (e) => {
                if (!this.app.isDragging) return;
                e.preventDefault();
                if (typeof e.clientY !== 'number') return;
                this.updateDragAutoScroll(e.clientY);
            }, true);
            document.body.addEventListener('dragover', (e) => {
                if (!this.app.isDragging) return;
                e.preventDefault();
                if (typeof e.clientY !== 'number') return;
                this.updateDragAutoScroll(e.clientY);
            }, true);
            const bottomNav = document.querySelector('.mobile-bottom-nav');
            if (bottomNav) {
                bottomNav.addEventListener('dragover', (e) => {
                    if (!this.app.isDragging) return;
                    e.preventDefault();
                    if (typeof e.clientY !== 'number') return;
                    this.updateDragAutoScroll(e.clientY);
                }, true);
            }
            document.addEventListener('touchmove', (e) => {
                if (!this.app.isDragging) return;
                const touch = e.touches && e.touches[0];
                if (!touch) return;
                this.updateDragAutoScroll(touch.clientY);
            }, { passive: true });
            document.addEventListener('drop', () => {
                this.stopDragAutoScroll();
            });
            document.addEventListener('dragend', () => {
                this.stopDragAutoScroll();
            });
        }

    }
}

window.SevenFlowDragDropManager = SevenFlowDragDropManager;
