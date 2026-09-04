// Natural Language Parser for Tasks (Multi-Language)
class TaskParser {
    constructor() {
        this.languages = {
            de: {
                dayMap: {
                    'montag': 1,
                    'dienstag': 2,
                    'mittwoch': 3,
                    'donnerstag': 4,
                    'freitag': 5,
                    'samstag': 6,
                    'sonntag': 0
                },
                monthMap: {
                    'januar': 0, 'jan': 0,
                    'februar': 1, 'feb': 1,
                    'märz': 2, 'maerz': 2, 'mrz': 2,
                    'april': 3, 'apr': 3,
                    'mai': 4,
                    'juni': 5, 'jun': 5,
                    'juli': 6, 'jul': 6,
                    'august': 7, 'aug': 7,
                    'september': 8, 'sep': 8, 'sept': 8,
                    'oktober': 9, 'okt': 9,
                    'november': 10, 'nov': 10,
                    'dezember': 11, 'dez': 11
                }
            },
            en: {
                dayMap: {
                    'monday': 1,
                    'tuesday': 2,
                    'wednesday': 3,
                    'thursday': 4,
                    'friday': 5,
                    'saturday': 6,
                    'sunday': 0
                },
                monthMap: {
                    'january': 0, 'jan': 0,
                    'february': 1, 'feb': 1,
                    'march': 2, 'mar': 2,
                    'april': 3, 'apr': 3,
                    'may': 4,
                    'june': 5, 'jun': 5,
                    'july': 6, 'jul': 6,
                    'august': 7, 'aug': 7,
                    'september': 8, 'sep': 8, 'sept': 8,
                    'october': 9, 'oct': 9,
                    'november': 10, 'nov': 10,
                    'december': 11, 'dec': 11
                }
            }
        };
    }

    parse(text) {
        const original = (text || '').trim();
        const result = {
            text: original,
            date: null,
            time: null,
            reminder: null,
            recurring: null,
            hasDate: false,
            hasTime: false,
            hasReminder: false,
            hasRecurring: false
        };

        let cleanText = original;

        const recurring = this.extractRecurring(cleanText);
        if (recurring) {
            result.recurring = recurring;
            result.hasRecurring = true;
            cleanText = this.removeRecurringFromText(cleanText);
        }

        const reminder = this.extractReminder(cleanText);
        if (reminder) {
            result.reminder = reminder;
            result.hasReminder = true;
            cleanText = this.removeReminderFromText(cleanText);
        }

        const time = this.extractTime(cleanText);
        if (time) {
            result.time = time;
            result.hasTime = true;
            cleanText = this.removeTimeFromText(cleanText);
        }

        const date = this.extractDate(cleanText);
        if (date) {
            result.date = date;
            result.hasDate = true;
            cleanText = this.removeDateFromText(cleanText);
        }

        // If no explicit clock time was provided, infer from day part phrases.
        if (!result.time) {
            const inferredTime = this.inferTimeFromDayPart(cleanText);
            if (inferredTime) {
                result.time = inferredTime;
                result.hasTime = true;
                cleanText = this.removeDayPartFromText(cleanText);
            }
        }

        cleanText = this.cleanupTaskText(cleanText);
        result.text = cleanText;
        return result;
    }

    cleanupTaskText(text) {
        return text
            .replace(/\s+/g, ' ')
            .replace(/^[,\-:\s]+|[,\-:\s]+$/g, '')
            .replace(/\b(?:und|and)\s*$/i, '')
            .trim();
    }

    extractRecurring(text) {
        const lower = text.toLowerCase();

        // German
        if (/\b(werktags|wochentags)\b/.test(lower)) return 'weekdays';
        if (/\b(täglich|taeglich|jeden tag)\b/.test(lower)) return 'daily';
        if (/\b(wöchentlich|woechentlich|jede woche)\b/.test(lower)) return 'weekly';
        if (/\b(monatlich|jeden monat)\b/.test(lower)) return 'monthly';
        if (/\b(jährlich|jaehrlich|jedes jahr)\b/.test(lower)) return 'yearly';

        // English
        if (/\b(weekdays|workdays|every weekday)\b/.test(lower)) return 'weekdays';
        if (/\b(daily|every day|everyday)\b/.test(lower)) return 'daily';
        if (/\b(weekly|every week)\b/.test(lower)) return 'weekly';
        if (/\b(monthly|every month)\b/.test(lower)) return 'monthly';
        if (/\b(yearly|annually|every year)\b/.test(lower)) return 'yearly';

        return null;
    }

    removeRecurringFromText(text) {
        return text
            .replace(/\bwerktags\b/gi, '')
            .replace(/\bwochentags\b/gi, '')
            .replace(/\btäglich\b/gi, '')
            .replace(/\btaeglich\b/gi, '')
            .replace(/\bjeden tag\b/gi, '')
            .replace(/\bwöchentlich\b/gi, '')
            .replace(/\bwoechentlich\b/gi, '')
            .replace(/\bjede woche\b/gi, '')
            .replace(/\bmonatlich\b/gi, '')
            .replace(/\bjeden monat\b/gi, '')
            .replace(/\bjährlich\b/gi, '')
            .replace(/\bjaehrlich\b/gi, '')
            .replace(/\bjedes jahr\b/gi, '')
            .replace(/\bweekdays\b/gi, '')
            .replace(/\bworkdays\b/gi, '')
            .replace(/\bevery weekday\b/gi, '')
            .replace(/\bdaily\b/gi, '')
            .replace(/\bevery day\b/gi, '')
            .replace(/\beveryday\b/gi, '')
            .replace(/\bweekly\b/gi, '')
            .replace(/\bevery week\b/gi, '')
            .replace(/\bmonthly\b/gi, '')
            .replace(/\bevery month\b/gi, '')
            .replace(/\byearly\b/gi, '')
            .replace(/\bannually\b/gi, '')
            .replace(/\bevery year\b/gi, '')
            .trim();
    }

    extractReminder(text) {
        // German
        const dePatterns = [
            /(?:erinnerung|errinerung|erinerung|erinnere mich|errinere mich|bitte erinnern)\s+(?:um|für|fuer)?\s*(\d{1,2})(?::(\d{2}))?\s*(uhr)?/i,
            /(?:mit|plus)\s+(?:erinnerung|errinerung|erinerung)(?:\s+um)?\s+(\d{1,2})(?::(\d{2}))?\s*(uhr)?/i
        ];

        for (const pattern of dePatterns) {
            const m = text.match(pattern);
            if (m) return this.to24h(m[1], m[2], null);
        }

        // English
        const enPatterns = [
            /(?:reminder|remind me)\s+(?:at|for)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
            /(?:with|plus)\s+reminder(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i
        ];

        for (const pattern of enPatterns) {
            const m = text.match(pattern);
            if (m) return this.to24h(m[1], m[2], m[3]);
        }

        return null;
    }

    removeReminderFromText(text) {
        return text
            .replace(/(?:mit|plus)\s+(?:erinnerung|errinerung|erinerung)(?:\s+um)?\s+\d{1,2}(?::\d{2})?\s*(?:uhr)?/gi, '')
            .replace(/(?:erinnerung|errinerung|erinerung|erinnere mich|errinere mich|bitte erinnern)\s+(?:um|für|fuer)?\s*\d{1,2}(?::\d{2})?\s*(?:uhr)?/gi, '')
            .replace(/(?:with|plus)\s+reminder(?:\s+at)?\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi, '')
            .replace(/(?:reminder|remind me)\s+(?:at|for)?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi, '')
            .trim();
    }

    extractTime(text) {
        // German natural times
        const halfMatch = text.match(/\bhalb\s+(\d{1,2})\b/i);
        if (halfMatch) {
            const nextHour = parseInt(halfMatch[1], 10);
            const hour = nextHour === 0 ? 23 : nextHour - 1;
            return `${String(hour).padStart(2, '0')}:30`;
        }

        const quarterPastMatch = text.match(/\bviertel\s+nach\s+(\d{1,2})\b/i);
        if (quarterPastMatch) {
            return `${String(parseInt(quarterPastMatch[1], 10)).padStart(2, '0')}:15`;
        }

        const quarterToMatch = text.match(/\bviertel\s+vor\s+(\d{1,2})\b/i);
        if (quarterToMatch) {
            const h = parseInt(quarterToMatch[1], 10);
            const hour = h === 0 ? 23 : h - 1;
            return `${String(hour).padStart(2, '0')}:45`;
        }

        // English natural times
        const halfPastMatch = text.match(/\bhalf\s+past\s+(\d{1,2})\b/i);
        if (halfPastMatch) {
            return `${String(parseInt(halfPastMatch[1], 10)).padStart(2, '0')}:30`;
        }

        const quarterPastEnMatch = text.match(/\bquarter\s+past\s+(\d{1,2})\b/i);
        if (quarterPastEnMatch) {
            return `${String(parseInt(quarterPastEnMatch[1], 10)).padStart(2, '0')}:15`;
        }

        const quarterToEnMatch = text.match(/\bquarter\s+to\s+(\d{1,2})\b/i);
        if (quarterToEnMatch) {
            const h = parseInt(quarterToEnMatch[1], 10);
            const hour = h === 0 ? 23 : h - 1;
            return `${String(hour).padStart(2, '0')}:45`;
        }

        // "um 14:00", "at 2pm"
        const withPrefix = text.match(/\b(?:um|at)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
        if (withPrefix) {
            return this.to24h(withPrefix[1], withPrefix[2], withPrefix[3]);
        }

        return null;
    }

    removeTimeFromText(text) {
        return text
            .replace(/\bhalb\s+\d{1,2}\b/gi, '')
            .replace(/\bviertel\s+nach\s+\d{1,2}\b/gi, '')
            .replace(/\bviertel\s+vor\s+\d{1,2}\b/gi, '')
            .replace(/\bhalf\s+past\s+\d{1,2}\b/gi, '')
            .replace(/\bquarter\s+past\s+\d{1,2}\b/gi, '')
            .replace(/\bquarter\s+to\s+\d{1,2}\b/gi, '')
            .replace(/\b(?:um|at)\s+\d{1,2}(?::\d{2})?\s*(?:uhr|am|pm)?\b/gi, '')
            .trim();
    }

    inferTimeFromDayPart(text) {
        const lower = text.toLowerCase();
        const map = [
            { pattern: /\b(früh|frueh|morgens?)\b/, time: '08:00' },
            { pattern: /\b(vormittag|am vormittag)\b/, time: '10:00' },
            { pattern: /\b(mittag|mittags)\b/, time: '12:00' },
            { pattern: /\b(nachmittag|nachmittags)\b/, time: '15:00' },
            { pattern: /\b(abend|abends)\b/, time: '19:00' },
            { pattern: /\b(nacht|nachts)\b/, time: '22:00' },
            { pattern: /\b(morning)\b/, time: '08:00' },
            { pattern: /\b(noon)\b/, time: '12:00' },
            { pattern: /\b(afternoon)\b/, time: '15:00' },
            { pattern: /\b(evening)\b/, time: '19:00' },
            { pattern: /\b(tonight|night)\b/, time: '21:00' }
        ];

        const match = map.find(entry => entry.pattern.test(lower));
        return match ? match.time : null;
    }

    removeDayPartFromText(text) {
        return text
            .replace(/\b(früh|frueh|morgens?|vormittag|am vormittag|mittag|mittags|nachmittag|nachmittags|abend|abends|nacht|nachts)\b/gi, '')
            .replace(/\b(morning|noon|afternoon|evening|tonight|night)\b/gi, '')
            .trim();
    }

    extractDate(text) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // YYYY-MM-DD
        const isoMatch = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
        if (isoMatch) {
            return new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10));
        }

        // DD.MM(.YYYY) or DD/MM(/YYYY)
        const dateMatch = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
        if (dateMatch) {
            const day = parseInt(dateMatch[1], 10);
            const month = parseInt(dateMatch[2], 10) - 1;
            let year = dateMatch[3] ? parseInt(dateMatch[3], 10) : today.getFullYear();
            if (year < 100) year += 2000;
            return new Date(year, month, day);
        }

        // Month name date (English)
        const monthNameEnMatch = text.match(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:,\s*(\d{4}))?\b/i);
        if (monthNameEnMatch) {
            const month = this.languages.en.monthMap[monthNameEnMatch[1].toLowerCase()];
            const day = parseInt(monthNameEnMatch[2], 10);
            const year = monthNameEnMatch[3] ? parseInt(monthNameEnMatch[3], 10) : today.getFullYear();
            return new Date(year, month, day);
        }

        // Relative spans
        const inDaysMatch = text.match(/\bin\s+(\d+)\s+(?:tagen?|days?)\b/i);
        if (inDaysMatch) {
            const date = new Date(today);
            date.setDate(today.getDate() + parseInt(inDaysMatch[1], 10));
            return date;
        }

        const inWeeksMatch = text.match(/\bin\s+(\d+)\s+(?:wochen?|weeks?)\b/i);
        if (inWeeksMatch) {
            const date = new Date(today);
            date.setDate(today.getDate() + (parseInt(inWeeksMatch[1], 10) * 7));
            return date;
        }

        if (/\b(nächste woche|naechste woche|next week)\b/i.test(text)) {
            const date = new Date(today);
            date.setDate(today.getDate() + 7);
            return date;
        }

        if (/\b(nächsten monat|naechsten monat|next month)\b/i.test(text)) {
            const date = new Date(today);
            date.setMonth(today.getMonth() + 1);
            return date;
        }

        if (/(^|\s)(übermorgen|uebermorgen)(\s|$)/i.test(text) || /\bday after tomorrow\b/i.test(text)) {
            const date = new Date(today);
            date.setDate(today.getDate() + 2);
            return date;
        }

        if (/(^|\s)heute(\s|$)/i.test(text) || /\btoday\b/i.test(text)) {
            return new Date(today);
        }

        if (/(^|\s)morgen(\s|$)/i.test(text) || /\b(tomorrow|tmrw|tmr)\b/i.test(text)) {
            const date = new Date(today);
            date.setDate(today.getDate() + 1);
            return date;
        }

        const weekday = this.extractWeekdayReference(text);
        if (weekday !== null) {
            return this.getNextWeekday(weekday, text);
        }

        return null;
    }

    extractWeekdayReference(text) {
        for (const config of Object.values(this.languages)) {
            for (const [dayName, dayNum] of Object.entries(config.dayMap)) {
                const regex = new RegExp(`\\b${dayName}\\b`, 'i');
                if (regex.test(text)) return dayNum;
            }
        }
        return null;
    }

    getNextWeekday(targetDay, text) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const currentDay = today.getDay();

        const isExplicitNext = /\b(next|kommenden?|nächsten?|naechsten?)\b/i.test(text);
        const isThis = /\b(this|diesen?|diese[mnrs]?|am)\b/i.test(text);

        let daysUntil = targetDay - currentDay;
        if (daysUntil < 0) daysUntil += 7;

        // If same day and "this" is used, keep today. Otherwise go to next occurrence.
        if (daysUntil === 0 && !isThis) {
            daysUntil = 7;
        }
        if (isExplicitNext && daysUntil === 0) {
            daysUntil = 7;
        }

        const result = new Date(today);
        result.setDate(today.getDate() + daysUntil);
        return result;
    }

    removeDateFromText(text) {
        let output = text;

        output = output
            .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, '')
            .replace(/\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b/g, '')
            .replace(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+\d{1,2}(?:,\s*\d{4})?\b/gi, '')
            .replace(/\bin\s+\d+\s+(?:tagen?|days?)\b/gi, '')
            .replace(/\bin\s+\d+\s+(?:wochen?|weeks?)\b/gi, '')
            .replace(/\b(nächste woche|naechste woche|next week)\b/gi, '')
            .replace(/\b(nächsten monat|naechsten monat|next month)\b/gi, '')
            .replace(/(^|\s)(übermorgen|uebermorgen)(\s|$)/gi, '$1$3')
            .replace(/\bday after tomorrow\b/gi, '')
            .replace(/(^|\s)heute(\s|$)/gi, '$1$2')
            .replace(/\btoday\b/gi, '')
            .replace(/(^|\s)morgen(\s|$)/gi, '$1$2')
            .replace(/\b(tomorrow|tmrw|tmr)\b/gi, '')
            .replace(/\b(next|kommenden?|nächsten?|naechsten?|this|diesen?|diese[mnrs]?)\s+(monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat|sunday|sun|montag|mo|dienstag|di|mittwoch|mi|donnerstag|do|freitag|fr|samstag|sa|sonntag|so)\b/gi, '');

        for (const config of Object.values(this.languages)) {
            for (const dayName of Object.keys(config.dayMap)) {
                const dayRegex = new RegExp(`\\b(?:am\\s+|on\\s+)?${dayName}\\b`, 'gi');
                output = output.replace(dayRegex, '');
            }
        }

        return output.replace(/\b(am|on)\b/gi, '').trim();
    }

    to24h(hourStr, minuteStr, periodRaw) {
        let hour = parseInt(hourStr, 10);
        const minute = minuteStr ? parseInt(minuteStr, 10) : 0;
        const period = (periodRaw || '').toLowerCase();

        if (period === 'pm' && hour !== 12) hour += 12;
        if (period === 'am' && hour === 12) hour = 0;

        if (!period && hour === 24) hour = 0;
        if (hour > 23 || minute > 59) return null;

        return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
}

// Make available globally
window.TaskParser = TaskParser;
