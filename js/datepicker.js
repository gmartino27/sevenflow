// Custom Date Picker
class CustomDatePicker {
    constructor(inputId, iconId, pickerId) {
        this.input = document.getElementById(inputId);
        this.icon = document.getElementById(iconId);
        this.picker = document.getElementById(pickerId);
        this.monthEl = document.getElementById('pickerMonth');
        this.daysEl = document.getElementById('pickerDays');
        this.prevBtn = document.getElementById('prevMonth');
        this.nextBtn = document.getElementById('nextMonth');
        this.todayBtn = document.getElementById('pickerToday');
        this.clearBtn = document.getElementById('pickerClear');
        
        this.currentDate = new Date();
        this.selectedDate = null;
        
        this.init();
    }
    
    init() {
        // Open picker
        this.icon.addEventListener('click', (e) => {
            e.stopPropagation();
            this.show();
        });
        
        this.input.addEventListener('click', (e) => {
            e.stopPropagation();
            this.show();
        });
        
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!this.picker.contains(e.target) && e.target !== this.icon && e.target !== this.input) {
                this.hide();
            }
        });
        
        // Navigation
        this.prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.currentDate.setMonth(this.currentDate.getMonth() - 1);
            this.render();
        });
        
        this.nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.currentDate.setMonth(this.currentDate.getMonth() + 1);
            this.render();
        });
        
        this.todayBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectDate(new Date());
        });
        
        this.clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectedDate = null;
            this.input.value = '';
            this.hide();
        });
    }
    
    show() {
        // Parse current input value
        if (this.input.value) {
            const parts = this.input.value.split('.');
            if (parts.length === 3) {
                this.selectedDate = new Date(parts[2], parts[1] - 1, parts[0]);
                this.currentDate = new Date(this.selectedDate);
            }
        }
        
        this.render();
        this.picker.classList.add('active');
        
        // Position picker
        const rect = this.input.getBoundingClientRect();
        this.picker.style.top = (rect.bottom + 8) + 'px';
        this.picker.style.left = rect.left + 'px';
    }
    
    hide() {
        this.picker.classList.remove('active');
    }
    
    selectDate(date) {
        this.selectedDate = date;
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        this.input.value = `${day}.${month}.${year}`;
        this.hide();
    }
    
    render() {
        // Render month/year
        const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 
                           'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
        this.monthEl.textContent = `${monthNames[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;
        
        // Clear days
        this.daysEl.innerHTML = '';
        
        // Get first day of month (0 = Sunday, adjust to Monday = 0)
        const firstDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
        let startDay = firstDay.getDay() - 1;
        if (startDay === -1) startDay = 6; // Sunday becomes 6
        
        // Get last day of month
        const lastDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);
        const daysInMonth = lastDay.getDate();
        
        // Get previous month's last days
        const prevMonth = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 0);
        const prevMonthDays = prevMonth.getDate();
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Render previous month days
        for (let i = startDay - 1; i >= 0; i--) {
            const day = prevMonthDays - i;
            const dayEl = this.createDayElement(day, true);
            this.daysEl.appendChild(dayEl);
        }
        
        // Render current month days
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), day);
            const dayEl = this.createDayElement(day, false);
            
            // Check if today
            if (date.getTime() === today.getTime()) {
                dayEl.classList.add('today');
            }
            
            // Check if selected
            if (this.selectedDate && 
                date.getDate() === this.selectedDate.getDate() &&
                date.getMonth() === this.selectedDate.getMonth() &&
                date.getFullYear() === this.selectedDate.getFullYear()) {
                dayEl.classList.add('selected');
            }
            
            dayEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectDate(date);
            });
            
            this.daysEl.appendChild(dayEl);
        }
        
        // Render next month days to fill grid
        const totalCells = this.daysEl.children.length;
        const remainingCells = 42 - totalCells; // 6 rows * 7 days
        for (let day = 1; day <= remainingCells; day++) {
            const dayEl = this.createDayElement(day, true);
            this.daysEl.appendChild(dayEl);
        }
    }
    
    createDayElement(day, otherMonth) {
        const dayEl = document.createElement('div');
        dayEl.className = 'datepicker-day';
        if (otherMonth) dayEl.classList.add('other-month');
        dayEl.textContent = day;
        return dayEl;
    }
    
    getSelectedDateObject() {
        if (!this.input.value) return null;
        const parts = this.input.value.split('.');
        if (parts.length === 3) {
            return new Date(parts[2], parts[1] - 1, parts[0]);
        }
        return null;
    }
}

// Initialize when DOM is ready
let customDatePicker;
document.addEventListener('DOMContentLoaded', () => {
    customDatePicker = new CustomDatePicker('modalDate', 'datePickerIcon', 'customDatePicker');
});
