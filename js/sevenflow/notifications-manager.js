// SevenFlow Notifications Manager
class SevenFlowNotificationsManager {
    constructor(app) {
        this.app = app;
        this.androidReminderIdsStorageKey = 'sevenflow_android_scheduled_reminder_ids';
    }

    readStoredAndroidReminderIds() {
        try {
            const raw = localStorage.getItem(this.androidReminderIdsStorageKey);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.map((id) => String(id)).filter(Boolean);
        } catch (error) {
            return [];
        }
    }

    writeStoredAndroidReminderIds(ids) {
        try {
            const unique = Array.from(new Set((ids || []).map((id) => String(id)).filter(Boolean)));
            localStorage.setItem(this.androidReminderIdsStorageKey, JSON.stringify(unique));
        } catch (error) {
            // Ignore storage write errors
        }
    }

    async requestPermission() {
        try {
            // In Android WebView, skip web notifications (use native bridge instead)
            if (window.location.protocol === 'file:') {
                if (typeof AndroidNotifications !== 'undefined' && AndroidNotifications.hasPermission) {
                    return AndroidNotifications.hasPermission();
                }
                return false;
            }

            if (!('Notification' in window)) {
                console.log('[Notifications] Not supported in this environment');
                return false;
            }

            if (Notification.permission === 'granted') {
                return true;
            }

            if (Notification.permission !== 'denied') {
                const permission = await Notification.requestPermission();
                return permission === 'granted';
            }

            return false;
        } catch (error) {
            console.error('[Notifications] Permission request error:', error);
            return false;
        }
    }

    startChecker() {
        try {
            const hasAndroidNotif = typeof AndroidNotifications !== 'undefined';
            const hasWebNotif = 'Notification' in window;

            if (!hasAndroidNotif && !hasWebNotif) {
                return;
            }

            // Align checks to full-minute boundaries
            const now = new Date();
            const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

            setTimeout(() => {
                this.checkDueNotifications();
                setInterval(() => {
                    this.checkDueNotifications();
                }, 60000);
            }, msUntilNextMinute);

            this.checkDueNotifications();
        } catch (error) {
            console.error('[Notifications] Checker start error:', error);
        }
    }

    checkDueNotifications() {
        try {
            const now = new Date();
            const currentDate = this.app.formatDate(now);
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

            if (typeof AndroidNotifications !== 'undefined' && AndroidNotifications.hasPermission()) {
                const todayTasks = this.app.tasks[currentDate] || [];
                todayTasks.forEach(task => {
                    if (task.reminderEnabled && task.reminderTime === currentTime && !task.completed) {
                        const notifKey = `notif_${currentDate}_${task.id}_${currentTime}`;
                        const lastShown = localStorage.getItem(notifKey);
                        const nowMs = Date.now();
                        if (!lastShown || (nowMs - parseInt(lastShown)) > 120000) {
                            this.showNotification(task.text, task.description);
                            localStorage.setItem(notifKey, nowMs.toString());
                        }
                    }
                });
                return;
            }

            if (!('Notification' in window) || Notification.permission !== 'granted') {
                return;
            }

            const todayTasks = this.app.tasks[currentDate] || [];
            todayTasks.forEach(task => {
                if (task.reminderEnabled && task.reminderTime === currentTime && !task.completed) {
                    const notifKey = `notif_${currentDate}_${task.id}_${currentTime}`;
                    const lastShown = localStorage.getItem(notifKey);
                    const nowMs = Date.now();
                    if (!lastShown || (nowMs - parseInt(lastShown)) > 120000) {
                        this.showNotification(task.text, task.description);
                        localStorage.setItem(notifKey, nowMs.toString());
                    }
                }
            });
        } catch (error) {
            console.error('[Notifications] Check error:', error);
        }
    }

    scheduleAllReminders() {
        if (typeof AndroidNotifications === 'undefined' || !AndroidNotifications.scheduleNotification) {
            return;
        }

        try {
            const now = new Date();
            const today = new Date(now);
            today.setHours(0, 0, 0, 0);
            const taskIdsWithReminders = new Set();
            const previouslyScheduledIds = this.readStoredAndroidReminderIds();

            for (let i = 0; i < 7; i++) {
                const checkDate = new Date(today);
                checkDate.setDate(today.getDate() + i);
                const dateKey = this.app.formatDate(checkDate);
                const tasks = this.app.tasks[dateKey] || [];

                tasks.forEach(task => {
                    if (task.reminderEnabled && task.id) {
                        taskIdsWithReminders.add(task.id);
                    }
                });
            }

            const idsToCancel = new Set([
                ...previouslyScheduledIds.map((id) => String(id)),
                ...Array.from(taskIdsWithReminders).map((id) => String(id))
            ]);

            idsToCancel.forEach(taskId => {
                try {
                    if (AndroidNotifications.cancelNotification) {
                        AndroidNotifications.cancelNotification(String(taskId));
                    }
                } catch (error) {
                    console.error('[Notifications] Cancel error for task:', taskId, error);
                }
            });

            for (let i = 0; i < 7; i++) {
                const checkDate = new Date(today);
                checkDate.setDate(today.getDate() + i);
                const dateKey = this.app.formatDate(checkDate);
                const tasks = this.app.tasks[dateKey] || [];

                tasks.forEach(task => {
                    if (task.reminderEnabled && task.reminderTime && !task.completed && task.id) {
                        const [hours, minutes] = task.reminderTime.split(':');
                        const reminderDate = new Date(checkDate);
                        reminderDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

                        if (reminderDate.getTime() > now.getTime()) {
                            try {
                                AndroidNotifications.scheduleNotification(
                                    task.text,
                                    task.description || 'Erinnerung fuer deine Aufgabe',
                                    reminderDate.getTime(),
                                    String(task.id)
                                );
                            } catch (error) {
                                console.error('[Notifications] Schedule error:', error);
                            }
                        }
                    }
                });
            }

            this.writeStoredAndroidReminderIds(Array.from(taskIdsWithReminders));
        } catch (error) {
            console.error('[Notifications] scheduleAllReminders error:', error);
        }
    }

    showNotification(title, body) {
        if (typeof AndroidNotifications !== 'undefined' && AndroidNotifications.hasPermission()) {
            try {
                AndroidNotifications.showNotification(title, body || 'Erinnerung fuer deine Aufgabe');
                return;
            } catch (error) {
                console.error('[Notifications] Android native error:', error);
            }
        }

        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
                const options = {
                    body: body || 'Erinnerung fuer deine Aufgabe',
                    tag: 'sevenflow-reminder-' + Date.now(),
                    icon: '/icon-192.png',
                    badge: '/icon-192.png',
                    vibrate: [200, 100, 200],
                    requireInteraction: false,
                    silent: false
                };

                const notification = new Notification(title, options);
                setTimeout(() => {
                    notification.close();
                }, 10000);
            } catch (error) {
                console.error('[Notifications] Error creating notification:', error);
            }
        }
    }
}

window.SevenFlowNotificationsManager = SevenFlowNotificationsManager;
