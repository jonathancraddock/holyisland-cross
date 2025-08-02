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

// Function to update the showCrossingDate span
function updateShowCrossingDate(dateValue) {
    const showCrossingDateSpan = document.getElementById('showCrossingDate');
    if (showCrossingDateSpan && dateValue) {
        const selectedDate = new Date(dateValue + 'T00:00:00');
        showCrossingDateSpan.textContent = formatDateRange(dateValue);
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
            
            updateCrossingResults();
            return true;
        } else {
            console.log('No tide data found for', dateStr);
            currentCrossingData = [];
            updateCrossingResults();
        }
        
        return false;
    } catch (error) {
        console.log('Could not load tide data:', error.message);
        currentCrossingData = [];
        updateCrossingOptions();
        return false;
    }
}

// Function to display daylight information
function displayDaylightInfo(photographyData) {
    const daylightDiv = document.getElementById('daylightInfo');
    
    if (!photographyData) {
        daylightDiv.innerHTML = '';
        return;
    }
    
    daylightDiv.innerHTML = `
        <table class="table">
            <thead>
                <tr>
                    <th colspan="2" class="has-text-centered">Daylight Information</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Sunrise</td>
                    <td><strong>${photographyData.sunrise}</strong></td>
                </tr>
                <tr>
                    <td>Sunset</td>
                    <td><strong>${photographyData.sunset}</strong></td>
                </tr>
                <tr>
                    <td>Dawn</td>
                    <td><strong>${photographyData.dawn}</strong></td>
                </tr>
                <tr>
                    <td>Dusk</td>
                    <td><strong>${photographyData.dusk}</strong></td>
                </tr>
                <tr>
                    <td>Day Length</td>
                    <td><strong>${photographyData.day_length}</strong></td>
                </tr>
                <tr>
                    <td>Noon</td>
                    <td><strong>${photographyData.solar_noon}</strong></td>
                </tr>
                <tr>
                    <td>Golden Hour (Morning)</td>
                    <td><strong>${photographyData.golden_hour_morning}</strong></td>
                </tr>
                <tr>
                    <td>Golden Hour (Evening)</td>
                    <td><strong>${photographyData.golden_hour_evening}</strong></td>
                </tr>
            </tbody>
        </table>
    `;
}

// Function to update crossing results table
function updateCrossingResults() {
    const resultsDiv = document.getElementById('crossingResults');
    
    if (currentCrossingData.length === 0) {
        resultsDiv.innerHTML = `
            <div class="message is-warning">
                <div class="message-body">
                    No crossing data available for this date.
                </div>
            </div>
        `;
        displayDaylightInfo(null);
        return;
    }
    
    let tableHTML = `
        <div class="message is-info">
            <div class="message-header">
                <p>Crossing Times (<span id="crossingDate" class="has-text-weight-bold">${currentCrossingData[0].date}</span>)</p>
            </div>
            <div class="message-body">
                <table class="table is-fullwidth">
                    <thead>
                        <tr>
                            <th>&nbsp;</th>
                            <th>Causeway Safe Crossing</th>
                            <th>Pilgrim Optimal Crossing</th>
                            <th>Day</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    currentCrossingData.forEach((crossing, index) => {
        const startTime = new Date(`1970-01-01T${crossing.start}:00`);
        const endTime = new Date(`1970-01-01T${crossing.end}:00`);
        
        // Handle midnight crossover
        if (endTime < startTime) {
            endTime.setDate(endTime.getDate() + 1);
        }
        
        // Calculate midpoint and optimal crossing time (90 minutes before midpoint)
        const duration = endTime - startTime;
        const midpoint = new Date(startTime.getTime() + duration / 2);
        const optimalStart = new Date(midpoint.getTime() - 90 * 60 * 1000);
        
        // Format times
        const formatTime = date => date.toTimeString().substring(0, 5);
        const causalwaySafe = `${crossing.start} - ${crossing.end}`;
        const pilgrimOptimal = `${formatTime(optimalStart)} - ${formatTime(midpoint)}`;
        
        // Daylight icon
        const daylightIcon = crossing.daylight ? '☀️' : '🌙';
        
        tableHTML += `
            <tr>
                <td>${index + 1}.) </td>
                <td>${causalwaySafe}</td>
                <td>${pilgrimOptimal}</td>
                <td style="text-align: center;">${daylightIcon}</td>
            </tr>
        `;
    });
    
    tableHTML += `
                    </tbody>
                </table>
                <p class="is-size-7 has-text-grey">
                    <em>The table shows an optimal Pilgrim's Crossing time (allowing 90 minutes) but always assess the local conditions before embarking on this walk.</em>
                </p>
            </div>
        </div>
    `;
    
    resultsDiv.innerHTML = tableHTML;
    
    // Display daylight information if available
    if (currentCrossingData.length > 0 && currentCrossingData[0].photography) {
        displayDaylightInfo(currentCrossingData[0].photography);
    } else {
        displayDaylightInfo(null);
    }
}


// Set today's date as default and try to load tide data
document.addEventListener('DOMContentLoaded', function() {
    const dateInput = document.getElementById('crossingDate');
    const today = new Date();
    dateInput.value = today.toISOString().split('T')[0];
    
    // Update the date label with available range
    updateDateLabel();
    
    // Update the showCrossingDate span with today's date
    updateShowCrossingDate(dateInput.value);
    
    // Try to load tide data for today
    loadTideData(today);
    
    // Add event listener for date changes
    dateInput.addEventListener('change', function(event) {
        const selectedDate = new Date(event.target.value + 'T00:00:00');
        updateShowCrossingDate(event.target.value);
        loadTideData(selectedDate);
    });
});

