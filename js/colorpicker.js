// Color Picker for Tasks
class ColorPicker {
    constructor() {
        this.currentColor = 'none';
        this.colorButton = document.getElementById('colorCurrent');
        this.dropdown = document.getElementById('colorDropdown');
        this.onChangeCallback = null;

        this.init();
    }
    
    init() {
        // Toggle dropdown
        this.colorButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dropdown.classList.toggle('active');
        });
        
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!this.colorButton.contains(e.target) && !this.dropdown.contains(e.target)) {
                this.dropdown.classList.remove('active');
            }
        });
        
        // Color selection
        this.dropdown.querySelectorAll('.color-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const color = option.dataset.color;
                this.selectColor(color);
                this.dropdown.classList.remove('active');
            });
        });
    }
    
    selectColor(color) {
        this.currentColor = color;
        this.colorButton.dataset.color = color;

        // Trigger callback if set
        if (this.onChangeCallback) {
            this.onChangeCallback(color);
        }
    }

    onChange(callback) {
        this.onChangeCallback = callback;
    }
    
    getColor() {
        return this.currentColor;
    }
    
    setColor(color) {
        this.currentColor = color || 'none';
        this.colorButton.dataset.color = this.currentColor;
    }
}

// Initialize
let colorPicker;
document.addEventListener('DOMContentLoaded', () => {
    colorPicker = new ColorPicker();
    window.colorPicker = colorPicker;
});
