// Store crossing data globally
let currentCrossingData = [];
let filteredResults = [];
let currentResultIndex = 0;

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
                <p>Crossing Times (<span id="showCrossingDate" class="has-text-weight-bold">${formatDateRange(currentCrossingData[0].date)}</span>)</p>
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
                <p class="is-size-8 has-text-grey">
                    <em>The table shows an optimal Pilgrim's Crossing time (allowing 90 minutes) but always assess the local conditions before embarking on this walk.</em>
                </p>
            </div>
        </div>
    `;
    
    resultsDiv.innerHTML = tableHTML;
    
    // Note: Date is already correctly displayed in the table header from currentCrossingData[0].date
    
    // Display daylight information if available
    if (currentCrossingData.length > 0 && currentCrossingData[0].photography) {
        displayDaylightInfo(currentCrossingData[0].photography);
    } else {
        displayDaylightInfo(null);
    }
}


// Modal functionality
function showModal() {
    const modal = document.getElementById('filterModal');
    modal.classList.add('is-active');
    
    // Set default date range (today to 3 months ahead)
    const today = new Date();
    const threeMonthsAhead = new Date(today);
    threeMonthsAhead.setMonth(threeMonthsAhead.getMonth() + 3);
    
    document.getElementById('dateFrom').value = today.toISOString().split('T')[0];
    document.getElementById('dateUntil').value = threeMonthsAhead.toISOString().split('T')[0];
    
    // Check all days by default
    document.querySelectorAll('input[type="checkbox"][id^="day-"]').forEach(cb => cb.checked = true);
    
    // Hide results initially
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('viewResult').style.display = 'none';
}

function hideModal() {
    const modal = document.getElementById('filterModal');
    modal.classList.remove('is-active');
}

// Advanced search functionality
async function performAdvancedSearch() {
    try {
        const response = await fetch('./data/tides.json');
        if (!response.ok) {
            throw new Error('Tide data not available');
        }
        
        const tideData = await response.json();
        
        // Get filter criteria
        const crossingType = document.getElementById('crossingType').value;
        const dateFrom = new Date(document.getElementById('dateFrom').value + 'T00:00:00');
        const dateUntil = new Date(document.getElementById('dateUntil').value + 'T00:00:00');
        const selectedDays = Array.from(document.querySelectorAll('input[type="checkbox"][id^="day-"]:checked')).map(cb => parseInt(cb.value));
        const timeFrom = document.getElementById('timeFrom').value;
        const timeUntil = document.getElementById('timeUntil').value;
        
        // Convert time strings to minutes for comparison
        const timeToMinutes = timeStr => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        };
        
        const minTime = timeToMinutes(timeFrom);
        const maxTime = timeToMinutes(timeUntil);
        
        // Filter results
        filteredResults = [];
        
        Object.keys(tideData.data).forEach(dateStr => {
            const date = new Date(dateStr + 'T00:00:00');
            
            // Check date range
            if (date < dateFrom || date > dateUntil) return;
            
            // Check day of week
            if (!selectedDays.includes(date.getDay())) return;
            
            
            // Check each crossing for this date
            tideData.data[dateStr].forEach((crossing, index) => {
                let crossingTime, crossingLabel;
                
                if (crossingType === 'pilgrim') {
                    // Calculate pilgrim optimal time (90min before midpoint)
                    const startTime = new Date(`1970-01-01T${crossing.start}:00`);
                    const endTime = new Date(`1970-01-01T${crossing.end}:00`);
                    
                    if (endTime < startTime) {
                        endTime.setDate(endTime.getDate() + 1);
                    }
                    
                    const duration = endTime - startTime;
                    const midpoint = new Date(startTime.getTime() + duration / 2);
                    const optimalStart = new Date(midpoint.getTime() - 90 * 60 * 1000);
                    
                    crossingTime = optimalStart.getHours() * 60 + optimalStart.getMinutes();
                    crossingLabel = `${optimalStart.toTimeString().substring(0, 5)} - ${midpoint.toTimeString().substring(0, 5)}`;
                } else {
                    // Use causeway start time
                    const [hours, minutes] = crossing.start.split(':').map(Number);
                    crossingTime = hours * 60 + minutes;
                    crossingLabel = `${crossing.start} - ${crossing.end}`;
                }
                
                // Check time range
                if (crossingTime >= minTime && crossingTime <= maxTime) {
                    filteredResults.push({
                        date: dateStr,
                        crossing: crossing,
                        crossingIndex: index,
                        crossingLabel: crossingLabel,
                        daylight: crossing.daylight
                    });
                }
            });
        });
        
        // Sort by date
        filteredResults.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Show results
        currentResultIndex = 0;
        displaySearchResults();
        
    } catch (error) {
        alert('Error searching crossing data: ' + error.message);
    }
}

function displaySearchResults() {
    const resultsDiv = document.getElementById('searchResults');
    const resultDate = document.getElementById('resultDate');
    const resultDetails = document.getElementById('resultDetails');
    const resultCount = document.getElementById('resultCount');
    const prevButton = document.getElementById('prevResult');
    const nextButton = document.getElementById('nextResult');
    const viewButton = document.getElementById('viewResult');
    
    if (filteredResults.length === 0) {
        resultsDiv.style.display = 'block';
        resultDate.textContent = 'No crossings found';
        resultDetails.textContent = 'Try adjusting your search criteria';
        resultCount.textContent = '';
        prevButton.disabled = true;
        nextButton.disabled = true;
        viewButton.style.display = 'none';
        return;
    }
    
    const result = filteredResults[currentResultIndex];
    
    resultsDiv.style.display = 'block';
    resultDate.textContent = formatDateRange(result.date);
    resultDetails.textContent = `${result.crossingLabel} ${result.daylight ? '☀️' : '🌙'}`;
    resultCount.textContent = `${currentResultIndex + 1} of ${filteredResults.length} matches`;
    
    prevButton.disabled = currentResultIndex === 0;
    nextButton.disabled = currentResultIndex === filteredResults.length - 1;
    viewButton.style.display = 'inline-flex';
}

function navigateResults(direction) {
    if (direction === 'prev' && currentResultIndex > 0) {
        currentResultIndex--;
    } else if (direction === 'next' && currentResultIndex < filteredResults.length - 1) {
        currentResultIndex++;
    }
    displaySearchResults();
}

function viewSelectedResult() {
    if (filteredResults.length > 0) {
        const result = filteredResults[currentResultIndex];
        
        // Set the date in the main form
        document.getElementById('crossingDate').value = result.date;
        
        // Load the tide data for that date
        const selectedDate = new Date(result.date + 'T00:00:00');
        updateShowCrossingDate(result.date);
        loadTideData(selectedDate);
        
        // Close the modal
        hideModal();
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
    
    // Modal event listeners
    document.getElementById('filterButton').addEventListener('click', showModal);
    document.querySelector('#filterModal .delete').addEventListener('click', hideModal);
    document.querySelector('#filterModal .modal-background').addEventListener('click', hideModal);
    document.getElementById('cancelFilter').addEventListener('click', hideModal);
    document.getElementById('searchButton').addEventListener('click', performAdvancedSearch);
    document.getElementById('prevResult').addEventListener('click', () => navigateResults('prev'));
    document.getElementById('nextResult').addEventListener('click', () => navigateResults('next'));
    document.getElementById('viewResult').addEventListener('click', viewSelectedResult);
});

