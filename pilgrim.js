// Function to load tide data and populate time fields
async function loadTideData(selectedDate) {
    try {
        const response = await fetch('./data/tides.json');
        if (!response.ok) {
            throw new Error('Tide data not available');
        }
        
        const tideData = await response.json();
        const dateStr = selectedDate.toISOString().split('T')[0]; // YYYY-MM-DD format
        
        // Look for tide data for the selected date
        if (tideData.data && tideData.data[dateStr] && tideData.data[dateStr].length > 0) {
            // Get the first available safe crossing time for the day
            const firstCrossing = tideData.data[dateStr][0];
            
            document.getElementById('startTime').value = firstCrossing.start;
            document.getElementById('endTime').value = firstCrossing.end;
            
            return true;
        }
        
        return false;
    } catch (error) {
        console.log('Could not load tide data:', error.message);
        return false;
    }
}

// Set today's date as default and try to load tide data
document.addEventListener('DOMContentLoaded', function() {
    const dateInput = document.getElementById('crossingDate');
    const today = new Date();
    dateInput.value = today.toISOString().split('T')[0];
    
    // Try to load tide data for today
    loadTideData(today);
});

// Add event listener for date changes
document.getElementById('crossingDate').addEventListener('change', function(event) {
    const selectedDate = new Date(event.target.value + 'T00:00:00');
    loadTideData(selectedDate);
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