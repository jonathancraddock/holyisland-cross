// Store crossing data globally
let currentCrossingData = [];

// Function to format date in "1st Aug 2025" format
function formatDateRange(dateStr) {
    const date = new Date(dateStr);
    const day = date.getDate();
    const month = date.toLocaleDateString('en-GB', { month: 'short' });
    const year = date.getFullYear();
    
    // Add ordinal suffix
    const ordinal = (day) => {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = day % 100;
        return day + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    
    return `${ordinal(day)} ${month} ${year}`;
}

// Function to update date label with available range
async function updateDateLabel() {
    try {
        const response = await fetch('./data/tides.json');
        if (!response.ok) {
            return; // Silently fail, keep original label
        }
        
        const tideData = await response.json();
        if (tideData.data) {
            const dates = Object.keys(tideData.data).sort();
            if (dates.length > 0) {
                const firstDate = formatDateRange(dates[0]);
                const lastDate = formatDateRange(dates[dates.length - 1]);
                
                const dateLabel = document.getElementById('dateSelectField');
                if (dateLabel) {
                    dateLabel.textContent = `Date: (${firstDate} - ${lastDate})`;
                }
            }
        }
    } catch (error) {
        console.log('Could not load date range:', error.message);
        // Silently fail, keep original label
    }
}

// Function to load tide data and populate time fields
async function loadTideData(selectedDate) {
    try {
        console.log('Loading tide data for date:', selectedDate.toISOString().split('T')[0]);
        const response = await fetch('./data/tides.json');
        if (!response.ok) {
            throw new Error('Tide data not available');
        }
        
        const tideData = await response.json();
        const dateStr = selectedDate.toISOString().split('T')[0]; // YYYY-MM-DD format
        console.log('Looking for tide data for:', dateStr);
        
        // Look for tide data for the selected date
        if (tideData.data && tideData.data[dateStr] && tideData.data[dateStr].length > 0) {
            currentCrossingData = tideData.data[dateStr];
            console.log('Found crossing data:', currentCrossingData);
            
            updateCrossingOptions();
            return true;
        } else {
            console.log('No tide data found for', dateStr);
            currentCrossingData = [];
            updateCrossingOptions();
        }
        
        return false;
    } catch (error) {
        console.log('Could not load tide data:', error.message);
        currentCrossingData = [];
        updateCrossingOptions();
        return false;
    }
}

// Function to update radio button states and populate time fields
function updateCrossingOptions() {
    const crossing1Radio = document.getElementById('crossing1');
    const crossing2Radio = document.getElementById('crossing2');
    
    if (currentCrossingData.length === 0) {
        // No data available - disable both radio buttons
        crossing1Radio.disabled = true;
        crossing2Radio.disabled = true;
        crossing1Radio.checked = false;
        crossing2Radio.checked = false;
        
        // Clear time fields
        document.getElementById('startTime').value = '';
        document.getElementById('endTime').value = '';
        
    } else if (currentCrossingData.length === 1) {
        // Only one crossing - enable first radio button, disable second
        crossing1Radio.disabled = false;
        crossing2Radio.disabled = true;
        crossing1Radio.checked = true;
        crossing2Radio.checked = false;
        
        // Populate with first crossing
        const crossing = currentCrossingData[0];
        document.getElementById('startTime').value = crossing.start;
        document.getElementById('endTime').value = crossing.end;
        
    } else {
        // Two crossings - enable both radio buttons
        crossing1Radio.disabled = false;
        crossing2Radio.disabled = false;
        
        // Set first crossing as default if no selection
        if (!crossing1Radio.checked && !crossing2Radio.checked) {
            crossing1Radio.checked = true;
        }
        
        // Populate based on current selection
        populateSelectedCrossing();
    }
}

// Function to populate time fields based on selected radio button
function populateSelectedCrossing() {
    const crossing1Radio = document.getElementById('crossing1');
    const crossing2Radio = document.getElementById('crossing2');
    
    let selectedIndex = 0;
    if (crossing2Radio.checked) {
        selectedIndex = 1;
    }
    
    if (currentCrossingData.length > selectedIndex) {
        const crossing = currentCrossingData[selectedIndex];
        document.getElementById('startTime').value = crossing.start;
        document.getElementById('endTime').value = crossing.end;
    }
}

// Set today's date as default and try to load tide data
document.addEventListener('DOMContentLoaded', function() {
    const dateInput = document.getElementById('crossingDate');
    const crossing1Radio = document.getElementById('crossing1');
    const crossing2Radio = document.getElementById('crossing2');
    const today = new Date();
    dateInput.value = today.toISOString().split('T')[0];
    
    // Update the date label with available range
    updateDateLabel();
    
    // Try to load tide data for today
    loadTideData(today);
    
    // Add event listener for date changes
    dateInput.addEventListener('change', function(event) {
        const selectedDate = new Date(event.target.value + 'T00:00:00');
        loadTideData(selectedDate);
    });
    
    // Add event listeners for radio button changes
    crossing1Radio.addEventListener('change', function() {
        if (this.checked) {
            populateSelectedCrossing();
        }
    });
    
    crossing2Radio.addEventListener('change', function() {
        if (this.checked) {
            populateSelectedCrossing();
        }
    });
});

document.querySelector('#timeForm').addEventListener('submit', function(event) {
    
    event.preventDefault();
    console.log('calculate times');

    const startTime = document.querySelector('#startTime').value;
    const endTime = document.querySelector('#endTime').value;

    if (startTime && endTime) {
      const start = new Date(`1970-01-01T${startTime}:00`);
      const end = new Date(`1970-01-01T${endTime}:00`);

      // Calculate the difference in milliseconds
      const diff = end - start;

      // Check if the end time is before the start time and adjust the date accordingly
      if (diff < 0) {
        end.setDate(end.getDate() + 1);
      }

      // Recalculate the difference after adjusting the date
      const adjustedDiff = end - start;

      // Calculate minutes
      const diffMinutes = Math.floor(adjustedDiff / (1000 * 60));
      const midpoint = new Date(start.getTime() + adjustedDiff / 2);
      const causeway = new Date(midpoint.getTime() - 90 * 60 * 1000);
      const begin = new Date(causeway.getTime() - 300 * 60 * 1000);

      // Format the times
      const formatTime = date => date.toTimeString().substring(0, 5);
      const formattedCauseway = formatTime(causeway);
      const formattedMidpoint = formatTime(midpoint);
      const formattedBegin = formatTime(begin);

      // Check for the sanity condition (8-10 hours)
      const hoursDiff = adjustedDiff / (1000 * 60 * 60);
      let warning = '';
      if (hoursDiff < 6 || hoursDiff > 10) {
        warning = '<span style="color: darkred; font-style: italic;"><br /><br />(Safe crossing duration falls outside of the typical range. Tides are seasonal, but please double-check your start and end times.)</span>';
      }

      // Display the result
      const resultDiv = document.querySelector('#messageBody');
      resultDiv.innerHTML = `You have stated that the safe crossing time is from <b>${startTime}</b> until <b>${endTime}</b>. 
      To safely begin the Pilgrim's Way you should arrive at the causeway no later than <strong>${formattedCauseway}</strong> and
      complete your crossing before <strong>${formattedMidpoint}</strong>.
      Using Naismith's Rule, this means you should depart from Belford at <b>${formattedBegin}</b>.${warning}`;
        
    document.getElementById('infoMessage').style.display = 'block';
    
    // Scroll to the start time input field
    document.getElementById('startTime').scrollIntoView({ behavior: 'smooth', block: 'start' });
    
  } else {
    document.getElementById('messageBody').textContent = 'Please enter both start and end times.';
    document.getElementById('infoMessage').style.display = 'block';
  }

});