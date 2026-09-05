// Ramble - Voice Input for Multiple Tasks
class RambleManager {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.onResultCallback = null;
        this.currentLanguage = 'de';
        this.backend = null; // 'android' | 'web'
        this.lastStartTimestamp = 0;
    }

    // Check if speech recognition is supported
    isSupported() {
        // Prefer native Android bridge in app builds
        if (typeof AndroidSpeech !== 'undefined') {
            return true;
        }

        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            return true;
        }

        return false;
    }

    // Initialize speech recognition
    init(language = 'de') {
        this.currentLanguage = language;

        if (typeof AndroidSpeech !== 'undefined') {
            this.backend = 'android';
            this.recognition = null;
            return true;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
            this.backend = 'web';
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = false;
            this.recognition.maxAlternatives = 1;
            this.recognition.lang = language === 'de' ? 'de-DE' : 'en-US';

            this.recognition.onresult = (event) => {
                const transcript = event.results[event.results.length - 1][0].transcript;
                this.processTranscript(transcript);
            };

            this.recognition.onerror = (event) => {
                this.isListening = false;
                if (this.onResultCallback) {
                    this.onResultCallback({ success: false, error: event.error });
                }
            };

            this.recognition.onend = () => {
                this.isListening = false;
            };

            return true;
        }

        return false;
    }

    // Start listening
    startListening(callback) {
        if (!this.isSupported()) {
            callback({ success: false, error: 'not-supported' });
            return;
        }

        this.onResultCallback = callback;
        this.isListening = true;
        this.lastStartTimestamp = Date.now();

        if (this.backend === 'android' && typeof AndroidSpeech !== 'undefined') {
            try {
                AndroidSpeech.startListening(this.currentLanguage === 'de' ? 'de-DE' : 'en-US');
            } catch (error) {
                this.isListening = false;
                callback({ success: false, error: error.message || 'android-start-failed' });
            }
        } else if (this.recognition) {
            try {
                this.recognition.start();
            } catch (error) {
                this.isListening = false;
                callback({ success: false, error: error.message });
            }
        }
    }

    // Stop listening
    stopListening() {
        this.isListening = false;

        if (this.backend === 'android' && typeof AndroidSpeech !== 'undefined') {
            AndroidSpeech.stopListening();
        } else if (this.recognition) {
            this.recognition.stop();
        }
    }

    // Process transcript from Android (called from native bridge)
    onAndroidResult(transcript) {
        this.isListening = false;
        this.processTranscript(transcript);
    }

    // Process error from Android (called from native bridge)
    onAndroidError(error) {
        // Ignore stale/transient Android errors that can arrive right after a new session start
        const transientStartupErrors = new Set(['client-error', 'no-match', 'unknown-error']);
        if (
            this.backend === 'android' &&
            transientStartupErrors.has(error) &&
            this.isListening &&
            Date.now() - this.lastStartTimestamp < 2000
        ) {
            return;
        }

        const benignAndroidErrors = new Set(['no-match', 'client-error']);
        if (this.backend === 'android' && benignAndroidErrors.has(error)) {
            this.isListening = false;
            if (this.onResultCallback) {
                this.onResultCallback({ success: false, error: error, benign: true });
            }
            return;
        }

        this.isListening = false;
        if (this.onResultCallback) {
            this.onResultCallback({ success: false, error: error });
        }
    }

    // Parse multiple tasks from a single transcript
    processTranscript(transcript) {
        try {
            if (transcript && transcript.length > 0) {
                transcript = transcript.charAt(0).toUpperCase() + transcript.slice(1);
            }

            const tasks = this.parseMultipleTasks(transcript);

            if (this.onResultCallback) {
                this.onResultCallback({
                    success: true,
                    transcript: transcript,
                    tasks: tasks
                });
            }
        } catch (error) {
            if (this.onResultCallback) {
                this.onResultCallback({
                    success: false,
                    error: error.message
                });
            }
        }
    }

    parseMultipleTasks(transcript) {
        const tasks = [];
        if (!transcript || !transcript.trim()) return tasks;

        const parser = new TaskParser();
        const segments = this.splitIntoNaturalSegments(transcript);

        let previousContext = null;

        segments.forEach((segment) => {
            const parsed = parser.parse(segment);
            if (!parsed.text || !parsed.text.trim()) return;

            // Carry explicit context from prior segment when users chain with "und/and"
            if (previousContext) {
                if (!parsed.date && previousContext.date) parsed.date = previousContext.date;
                if (!parsed.time && previousContext.time) parsed.time = previousContext.time;
                if (!parsed.reminder && previousContext.reminder) parsed.reminder = previousContext.reminder;
                if (!parsed.recurring && previousContext.recurring) parsed.recurring = previousContext.recurring;
            }

            tasks.push({
                text: parsed.text.trim(),
                date: parsed.date,
                time: parsed.time,
                reminder: parsed.reminder || null,
                recurring: parsed.recurring || null
            });

            previousContext = {
                date: parsed.date || null,
                time: parsed.time || null,
                reminder: parsed.reminder || null,
                recurring: parsed.recurring || null
            };
        });

        return tasks;
    }

    splitIntoNaturalSegments(transcript) {
        const normalized = transcript
            .replace(/[•·]/g, ',')
            .replace(/\s+/g, ' ')
            .trim();

        if (!normalized) return [];

        const hardSplitRegex = /(?:\n+|[;]|[!?]+|\s+-\s+|\s(?:dann|danach|anschließend|anschliessend|später|spater|then|after that|afterwards|next)\s+)/gi;
        const chunks = normalized
            .split(hardSplitRegex)
            .map(s => s.trim())
            .filter(Boolean);

        const result = [];
        chunks.forEach((chunk) => {
            const softParts = this.splitBySoftConjunction(chunk);
            softParts.forEach((part) => {
                if (part && part.trim()) result.push(part.trim());
            });
        });

        return result;
    }

    splitBySoftConjunction(chunk) {
        const parts = [];
        let remaining = chunk.trim();

        if (!remaining) return parts;

        const boundaryRegex = /\s+(?:und|and)\s+(?=(?:heute|morgen|übermorgen|uebermorgen|am|in\s+\d+|nächste(?:n|r|m|s)?|naechste(?:n|r|m|s)?|kommenden?|diesen?|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|today|tomorrow|tonight|in\s+\d+|next|this|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d{1,2}(?::|\.)\d{2}|\d{1,2}\s*(?:am|pm)|reminder|remind|erinner))/i;

        while (remaining.length > 0) {
            const match = remaining.match(boundaryRegex);
            if (!match || typeof match.index !== 'number') {
                parts.push(remaining.trim());
                break;
            }

            const left = remaining.slice(0, match.index).trim();
            if (left) parts.push(left);

            remaining = remaining.slice(match.index + match[0].length).trim();
        }

        return parts.length > 0 ? parts : [chunk];
    }

    // Change language
    setLanguage(language) {
        this.currentLanguage = language;

        if (this.recognition) {
            this.recognition.lang = language === 'de' ? 'de-DE' : 'en-US';
        }
    }
}

// Make available globally
window.RambleManager = RambleManager;

(function () {
    if (!window.SevenFlowPlugins) return;

    window.SevenFlowPlugins.register({
        id: 'ramble',
        appHooks: {
            afterCoreReady(app) {
                if (typeof app.setupRamble === 'function') {
                    app.setupRamble();
                }
            }
        }
    });
})();
