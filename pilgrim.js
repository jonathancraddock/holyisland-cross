// Store crossing data globally
let currentCrossingDate = null;
let currentCrossingData = [];
let currentSunData = null;
let filteredResults = [];
let currentResultIndex = 0;
let selectedCrossingIndex = -1; // Track which crossing was selected from modal
let savedSelectedDays = []; // Remember selected days in modal
let availableFirstDate = null; // First available date in tide data
let availableLastDate = null; // Last available date in tide data

// tides.min.json stores only sunrise/sunset/dawn/dusk/goldenEveStart per day;
// everything else (midpoint, daylight, golden hour AM, day length, solar noon)
// is cheap to derive from those, so it's computed here instead of stored.
function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

function minutesToTime(minutes) {
    const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
    const hours = Math.floor(wrapped / 60);
    const mins = wrapped % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function computeMidpointMinutes(start, end) {
    const startMinutes = timeToMinutes(start);
    let endMinutes = timeToMinutes(end);
    if (endMinutes < startMinutes) endMinutes += 1440; // crosses midnight
    return (startMinutes + endMinutes) / 2;
}

function computeDaylight(midpointMinutes, sunData) {
    if (!sunData) return false;
    const mid = ((midpointMinutes % 1440) + 1440) % 1440;
    return mid >= timeToMinutes(sunData.sunrise) && mid <= timeToMinutes(sunData.sunset);
}

// Function to format date in "Wed 29th Oct 2025" format
function formatDateRange(dateStr) {
    const date = new Date(dateStr);
    const weekday = date.toLocaleDateString('en-GB', { weekday: 'short' });
    const day = date.getDate();
    const month = date.toLocaleDateString('en-GB', { month: 'short' });
    const year = date.getFullYear();
    
    // Add ordinal suffix
    const ordinal = (day) => {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = day % 100;
        return day + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    
    return `${weekday} ${ordinal(day)} ${month} ${year}`;
}

// Function to update date label with available range
async function updateDateLabel() {
    try {
        const response = await fetch('./data/tides.min.json');
        if (!response.ok) {
            return; // Silently fail, keep original label
        }
        
        const tideData = await response.json();
        if (tideData.data) {
            const dates = Object.keys(tideData.data).sort();
            if (dates.length > 0) {
                // Store raw date strings globally for boundary checking
                availableFirstDate = dates[0];
                availableLastDate = dates[dates.length - 1];
                
                const firstDate = formatDateRange(dates[0]);
                const lastDate = formatDateRange(dates[dates.length - 1]);
                
                const tideDateRange = document.getElementById('tideDateRange');
                if (tideDateRange) {
                    tideDateRange.textContent = `(Tide data available: ${firstDate} - ${lastDate}.)`;
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
        const response = await fetch('./data/tides.min.json');
        if (!response.ok) {
            throw new Error('Tide data not available');
        }

        const tideData = await response.json();
        const dateStr = selectedDate.getFullYear() + '-' +
                        String(selectedDate.getMonth() + 1).padStart(2, '0') + '-' +
                        String(selectedDate.getDate()).padStart(2, '0'); // YYYY-MM-DD format in local time
        console.log('Looking for tide data for:', dateStr);

        // Look for tide data for the selected date
        currentCrossingDate = dateStr;
        if (tideData.data && tideData.data[dateStr] && tideData.data[dateStr].safe.length > 0) {
            currentSunData = tideData.data[dateStr].sun;
            currentCrossingData = tideData.data[dateStr].safe;
            console.log('Found crossing data:', currentCrossingData);

            updateCrossingResults();
            return true;
        } else {
            console.log('No tide data found for', dateStr);
            currentSunData = null;
            currentCrossingData = [];
            updateCrossingResults();
        }

        return false;
    } catch (error) {
        console.log('Could not load tide data:', error.message);
        currentSunData = null;
        currentCrossingData = [];
        updateCrossingResults();
        return false;
    }
}

// Function to display daylight information
function displayDaylightInfo(sunData) {
    const daylightDiv = document.getElementById('daylightInfo');

    if (!sunData) {
        daylightDiv.innerHTML = '';
        return;
    }

    // Derived from sunrise/sunset (see computeMidpointMinutes/computeDaylight above for why)
    const goldenHourMorning = `${sunData.sunrise}-${minutesToTime(timeToMinutes(sunData.sunrise) + 60)}`;
    const goldenHourEvening = `${sunData.goldenEveStart}-${sunData.sunset}`;
    const solarNoon = minutesToTime((timeToMinutes(sunData.sunrise) + timeToMinutes(sunData.sunset)) / 2);
    const dayLengthMinutes = timeToMinutes(sunData.sunset) - timeToMinutes(sunData.sunrise);
    const dayLength = `${Math.floor(dayLengthMinutes / 60)}h ${dayLengthMinutes % 60}m`;

    daylightDiv.innerHTML = `
        <table class="table">
            <thead>
                <tr>
                    <th colspan="2" class="has-text-centered">Daylight Information</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Dawn</td>
                    <td><strong>${sunData.dawn}</strong></td>
                </tr>
                <tr>
                    <td>Sunrise</td>
                    <td><strong>${sunData.sunrise}</strong></td>
                </tr>
                <tr>
                    <td>Golden Hour (AM)</td>
                    <td><strong>${goldenHourMorning}</strong></td>
                </tr>
                <tr>
                    <td>Solar Noon</td>
                    <td><strong>${solarNoon}</strong></td>
                </tr>
                <tr>
                    <td>Golden Hour (PM)</td>
                    <td><strong>${goldenHourEvening}</strong></td>
                </tr>
                <tr>
                    <td>Sunset</td>
                    <td><strong>${sunData.sunset}</strong></td>
                </tr>
                <tr>
                    <td>Dusk</td>
                    <td><strong>${sunData.dusk}</strong></td>
                </tr>
                <tr>
                    <td>Day Length</td>
                    <td><strong>${dayLength}</strong></td>
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
                <p>Crossing Times (<span id="showCrossingDate" class="has-text-weight-bold">${formatDateRange(currentCrossingDate)}</span>)</p>
            </div>
            <div class="message-body">
                <table class="table is-fullwidth">
                    <thead>
                        <tr>
                            <th>&nbsp;</th>
                            <th>Causeway ROAD</th>
                            <th>Pilgrim WALK</th>
                            <th>Day?</th>
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
        const daylightIcon = computeDaylight(computeMidpointMinutes(crossing.start, crossing.end), currentSunData) ? '☀️' : '🌙';
        
        // Highlight selected crossing cell
        const pilgrimCellClass = selectedCrossingIndex === index ? ' class="highlightTime"' : '';
        
        tableHTML += `
            <tr>
                <td>${index + 1}.) </td>
                <td>${causalwaySafe}</td>
                <td${pilgrimCellClass}>${pilgrimOptimal}</td>
                <td style="text-align: center;">${daylightIcon}</td>
            </tr>
        `;
    });
    
    tableHTML += `
                    </tbody>
                </table>
                <p class="is-size-8 has-text-grey">
                    <em>The table shows an optimal Pilgrim's Way crossing time (allowing 90 minutes) but always assess the local conditions before embarking on this walk.</em>
                </p>
            </div>
        </div>
    `;
    
    resultsDiv.innerHTML = tableHTML;
    
    // Show/hide navigation buttons
    const navButtons = document.getElementById('dateNavigation');
    if (currentCrossingData.length > 0) {
        navButtons.style.display = 'block';
    } else {
        navButtons.style.display = 'none';
    }
    
    // Note: Date is already correctly displayed in the table header from currentCrossingData[0].date
    
    // Display daylight information if available
    if (currentCrossingData.length > 0 && currentSunData) {
        displayDaylightInfo(currentSunData);
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
    
    // Restore previously selected days, or check all days by default
    if (savedSelectedDays.length > 0) {
        // Restore previous selection
        document.querySelectorAll('input[type="checkbox"][id^="day-"]').forEach(cb => {
            cb.checked = savedSelectedDays.includes(parseInt(cb.value));
        });
    } else {
        // First time - check all days by default
        document.querySelectorAll('input[type="checkbox"][id^="day-"]').forEach(cb => cb.checked = true);
    }
    
    // Hide results initially
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('viewResult').style.display = 'none';
}

function hideModal() {
    // Save selected days before closing
    savedSelectedDays = Array.from(document.querySelectorAll('input[type="checkbox"][id^="day-"]:checked')).map(cb => parseInt(cb.value));
    
    const modal = document.getElementById('filterModal');
    modal.classList.remove('is-active');
}

// Advanced search functionality
async function performAdvancedSearch() {
    try {
        const response = await fetch('./data/tides.min.json');
        if (!response.ok) {
            throw new Error('Tide data not available');
        }

        const tideData = await response.json();

        // Get filter criteria
        const crossingType = 'pilgrim'; // Always use pilgrim crossing
        const dateFrom = new Date(document.getElementById('dateFrom').value + 'T00:00:00');
        const dateUntil = new Date(document.getElementById('dateUntil').value + 'T00:00:00');
        const selectedDays = Array.from(document.querySelectorAll('input[type="checkbox"][id^="day-"]:checked')).map(cb => parseInt(cb.value));
        const timeFrom = document.getElementById('timeFrom').value;
        const timeUntil = document.getElementById('timeUntil').value;

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
            const sunData = tideData.data[dateStr].sun;
            tideData.data[dateStr].safe.forEach((crossing, index) => {
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
                        daylight: computeDaylight(computeMidpointMinutes(crossing.start, crossing.end), sunData)
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
        
        // Scroll to results section after display
        setTimeout(() => {
            resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
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
    
    // Scroll to results section after display
    setTimeout(() => {
        resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
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
        
        // Store which crossing was selected for highlighting
        selectedCrossingIndex = result.crossingIndex;
        
        // Load the tide data for that date
        const selectedDate = new Date(result.date + 'T00:00:00');
        updateShowCrossingDate(result.date);
        loadTideData(selectedDate);
        
        // Update navigation button states
        updateNavigationButtons();
        
        // Close the modal
        hideModal();
    }
}

// Function to update navigation button states based on available date range
function updateNavigationButtons() {
    const dateInput = document.getElementById('crossingDate');
    const prevButton = document.getElementById('prevDate');
    const nextButton = document.getElementById('nextDate');
    
    if (!availableFirstDate || !availableLastDate || !dateInput.value) {
        // If no date range available or no current date, disable both buttons
        prevButton.disabled = true;
        nextButton.disabled = true;
        return;
    }
    
    const currentDate = dateInput.value; // Already in YYYY-MM-DD format
    
    // Disable previous button if at or before first available date
    prevButton.disabled = currentDate <= availableFirstDate;
    
    // Disable next button if at or after last available date
    nextButton.disabled = currentDate >= availableLastDate;
}

// Date navigation functions
function navigateDate(direction) {
    const dateInput = document.getElementById('crossingDate');
    const currentDate = new Date(dateInput.value + 'T00:00:00');
    
    // Calculate new date
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
        newDate.setDate(newDate.getDate() - 1);
    } else if (direction === 'next') {
        newDate.setDate(newDate.getDate() + 1);
    } else if (direction === 'today') {
        const today = new Date();
        newDate.setFullYear(today.getFullYear());
        newDate.setMonth(today.getMonth());
        newDate.setDate(today.getDate());
    }
    
    // Format new date for input field
    const newDateStr = newDate.getFullYear() + '-' + 
                       String(newDate.getMonth() + 1).padStart(2, '0') + '-' + 
                       String(newDate.getDate()).padStart(2, '0');
    
    // Update date input and load new data
    dateInput.value = newDateStr;
    selectedCrossingIndex = -1; // Clear selection when navigating
    updateShowCrossingDate(newDateStr);
    loadTideData(newDate);
    
    // Update navigation button states
    updateNavigationButtons();
}

// Set today's date as default and try to load tide data
document.addEventListener('DOMContentLoaded', function() {
    const dateInput = document.getElementById('crossingDate');
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + 
                    String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                    String(today.getDate()).padStart(2, '0');
    dateInput.value = todayStr;
    
    // Update the date label with available range
    updateDateLabel().then(() => {
        // Update navigation buttons after date range is loaded
        updateNavigationButtons();
    });
    
    // Update the showCrossingDate span with today's date
    updateShowCrossingDate(todayStr);
    
    // Try to load tide data for today
    loadTideData(today);
    
    // Add event listener for date changes
    dateInput.addEventListener('change', function(event) {
        const selectedDate = new Date(event.target.value + 'T00:00:00');
        selectedCrossingIndex = -1; // Clear selection when manually changing date
        updateShowCrossingDate(event.target.value);
        loadTideData(selectedDate);
        
        // Update navigation button states
        updateNavigationButtons();
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
    
    // Date navigation event listeners
    document.getElementById('prevDate').addEventListener('click', () => navigateDate('prev'));
    document.getElementById('todayDate').addEventListener('click', () => navigateDate('today'));
    document.getElementById('nextDate').addEventListener('click', () => navigateDate('next'));
});

