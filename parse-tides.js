// Parse tide data from HTML to JSON format
// Usage: 
//   node parse-tides.js [sourceFile]              # Single file
//   node parse-tides.js [sourceFolder]            # Entire folder
// Examples: 
//   node parse-tides.js sourcedata/09-25.html     # Single month
//   node parse-tides.js sourcedata/               # All months

const fs = require('fs');
const path = require('path');

// Helper functions for time conversion and BST detection
function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

function minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60) % 24;
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function isDateInBST(dateStr) {
    // BST runs from last Sunday in March to last Sunday in October
    const date = new Date(dateStr);
    const year = date.getFullYear();
    
    // Find last Sunday in March
    const marchLastSun = new Date(year, 2, 31); // March 31st
    marchLastSun.setDate(31 - marchLastSun.getDay()); // Go back to last Sunday
    
    // Find last Sunday in October  
    const octLastSun = new Date(year, 9, 31); // October 31st
    octLastSun.setDate(31 - octLastSun.getDay()); // Go back to last Sunday
    
    return date >= marchLastSun && date < octLastSun;
}

function convertTimeFormat(timeStr) {
    // Convert 12-hour format "5:14:04 AM" to 24-hour format "05:14"
    const match = timeStr.match(/(\d{1,2}):(\d{2}):(\d{2}) (AM|PM)/);
    if (!match) return timeStr; // Already in correct format
    
    let [, hours, minutes, seconds, period] = match;
    hours = parseInt(hours);
    
    if (period === 'AM' && hours === 12) {
        hours = 0;
    } else if (period === 'PM' && hours !== 12) {
        hours += 12;
    }
    
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

// Sunrise/sunset API integration for Holy Island coordinates
async function getSunData(date) {
    const holyIslandLat = 55.6694;
    const holyIslandLng = -1.7975;
    
    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(
            `https://api.sunrisesunset.io/json?lat=${holyIslandLat}&lng=${holyIslandLng}&date=${date}`
        );
        
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status !== 'OK') {
            throw new Error(`API returned error: ${data.status}`);
        }
        
        // Convert times to 24-hour format (API returns times already in local timezone)
        const sunrise = convertTimeFormat(data.results.sunrise);
        const sunset = convertTimeFormat(data.results.sunset);
        const dawn = convertTimeFormat(data.results.dawn);
        const dusk = convertTimeFormat(data.results.dusk);
        const solarNoon = convertTimeFormat(data.results.solar_noon);
        const goldenHour = convertTimeFormat(data.results.golden_hour);
        
        return {
            sunrise,
            sunset,
            dawn,
            dusk,
            solar_noon: solarNoon,
            golden_hour_morning: `${sunrise}-${goldenHour}`,
            golden_hour_evening: `${goldenHour}-${sunset}`,
            day_length: data.results.day_length
        };
    } catch (error) {
        console.warn(`⚠️  Could not fetch sun data for ${date}: ${error.message}`);
        return null;
    }
}

function parseOrdinal(ordinalStr) {
    // Convert "1st", "2nd", "3rd", "31st" etc to day number
    return parseInt(ordinalStr.replace(/\D/g, ''));
}

function extractMonthYear(filename) {
    // Extract from pattern like "sourcedata/09-25.html" -> month=09, year=2025
    const match = filename.match(/(\d{2})-(\d{2})\.html$/);
    if (!match) {
        throw new Error('Filename must follow pattern: MM-YY.html (e.g., 09-25.html)');
    }
    
    const [, monthStr, yearShort] = match;
    const month = parseInt(monthStr);
    const year = 2000 + parseInt(yearShort);
    
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    return {
        month,
        year,
        monthStr: monthStr,
        yearStr: year.toString(),
        monthName: monthNames[month - 1]
    };
}

function parseTimeRange(timeStr, baseDate) {
    // Parse strings like "11:05 until 19:15" or "23:00 until 07:45 (Sat)"
    const match = timeStr.match(/(\d{2}:\d{2}) until (\d{2}:\d{2})(?: \((\w+)\))?/);
    if (!match) return null;
    
    const [, startTime, endTime, nextDayIndicator] = match;
    const startDate = baseDate;
    let endDate = baseDate;
    
    // If there's a day indicator or end time is earlier than start time, it crosses midnight
    if (nextDayIndicator || endTime < startTime) {
        const nextDay = new Date(baseDate);
        nextDay.setDate(nextDay.getDate() + 1);
        endDate = nextDay.toISOString().split('T')[0];
    }
    
    return {
        start: startTime,
        end: endTime,
        startDate: startDate,
        endDate: endDate
    };
}

async function parseTideData(htmlContent, monthYear) {
    const data = {};
    const sunDataCache = {}; // Cache sun data to avoid repeated API calls for same date
    
    // Extract table rows
    const rowRegex = /<tr class="row[12]">(.*?)<\/tr>/gs;
    let match;
    
    while ((match = rowRegex.exec(htmlContent)) !== null) {
        const rowContent = match[1];
        
        // Extract cells
        const cellRegex = /<td[^>]*>(.*?)<\/td>/g;
        const cells = [];
        let cellMatch;
        
        while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
            cells.push(cellMatch[1].trim());
        }
        
        if (cells.length >= 6) {
            const dayName = cells[0];
            const dayOrdinal = cells[1];
            const dayNumber = parseOrdinal(dayOrdinal);
            
            // Build date string using extracted month/year
            const baseDate = `${monthYear.yearStr}-${monthYear.monthStr}-${dayNumber.toString().padStart(2, '0')}`;
            const dayPeriods = [];
            
            // Extract raw table cells with classes intact
            const fullRowMatch = rowContent.match(/<td[^>]*class="(safe|unsafe)"[^>]*>(.*?)<\/td>/g);
            if (fullRowMatch) {
                fullRowMatch.forEach(cellHtml => {
                    const classMatch = cellHtml.match(/class="(safe|unsafe)"/);
                    const contentMatch = cellHtml.match(/<td[^>]*>(.*?)<\/td>/);
                    
                    if (classMatch && contentMatch) {
                        const isSafe = classMatch[1] === 'safe';
                        const timeText = contentMatch[1].trim();
                        
                        if (timeText.includes('until')) {
                            const parsed = parseTimeRange(timeText, baseDate);
                            if (parsed) {
                                dayPeriods.push({
                                    type: isSafe ? "safe" : "unsafe",
                                    ...parsed
                                });
                            }
                        }
                    }
                });
            }
            
            // Only add SAFE periods that START on this date (to avoid duplicates)
            const safePeriods = dayPeriods.filter(period => 
                period.startDate === baseDate && period.type === "safe"
            );
            
            if (safePeriods.length > 0) {
                // Get sun data for this date (cached to avoid repeated API calls)
                if (!sunDataCache[baseDate]) {
                    sunDataCache[baseDate] = await getSunData(baseDate);
                    // Add small delay to be respectful to API
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                const sunData = sunDataCache[baseDate];
                
                // Enhance each safe period with daylight and photography data
                const enhancedPeriods = safePeriods.map(period => {
                    // Calculate midpoint time
                    const startMinutes = timeToMinutes(period.start);
                    let endMinutes = timeToMinutes(period.end);
                    
                    // Handle midnight crossover
                    if (period.endDate !== period.startDate) {
                        endMinutes += 24 * 60; // Add 24 hours
                    }
                    
                    const midpointMinutes = (startMinutes + endMinutes) / 2;
                    const midpointTime = minutesToTime(midpointMinutes % (24 * 60));
                    
                    // Determine if midpoint is in daylight
                    let isDaylight = false;
                    if (sunData) {
                        const sunriseMinutes = timeToMinutes(sunData.sunrise);
                        const sunsetMinutes = timeToMinutes(sunData.sunset);
                        const midMinutes = timeToMinutes(midpointTime);
                        isDaylight = midMinutes >= sunriseMinutes && midMinutes <= sunsetMinutes;
                    }
                    
                    return {
                        ...period,
                        midpoint: midpointTime,
                        daylight: isDaylight,
                        photography: sunData || null
                    };
                });
                
                data[baseDate] = enhancedPeriods;
            }
        }
    }
    
    return data;
}

async function processFolder(folderPath) {
    // Read all HTML files in the folder
    const files = fs.readdirSync(folderPath)
        .filter(file => file.match(/\d{2}-\d{2}\.html$/))
        .sort(); // Sort to ensure consistent ordering

    if (files.length === 0) {
        console.log('❌ No matching HTML files found in folder');
        return;
    }

    console.log(`📁 Found ${files.length} HTML files to process:`);
    files.forEach(file => console.log(`   - ${file}`));

    // Combine all data
    const allData = {};
    const monthsProcessed = [];
    let totalDays = 0;

    for (const file of files) {
        const filePath = path.join(folderPath, file);
        console.log(`\n🔄 Processing ${file}...`);
        
        try {
            const monthYear = extractMonthYear(file);
            const htmlContent = fs.readFileSync(filePath, 'utf8');
            const tideData = await parseTideData(htmlContent, monthYear);
            
            // Merge data into combined object
            Object.assign(allData, tideData);
            
            monthsProcessed.push(`${monthYear.monthName} ${monthYear.year}`);
            totalDays += Object.keys(tideData).length;
            
            console.log(`   ✅ ${Object.keys(tideData).length} days processed`);
        } catch (error) {
            console.log(`   ❌ Error processing ${file}: ${error.message}`);
        }
    }

    // Create unified JSON structure
    const outputData = {
        lastUpdated: new Date().toISOString(),
        source: "Northumberland Council Holy Island Crossing Times",
        months: monthsProcessed,
        totalDays: totalDays,
        data: allData
    };

    // Ensure data directory exists
    if (!fs.existsSync('./data')) {
        fs.mkdirSync('./data');
    }

    // Write unified file
    const outputFile = './data/tides.json';
    fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));

    console.log(`\n🎉 Combined tide data created:`);
    console.log(`📊 ${totalDays} total days across ${monthsProcessed.length} months`);
    console.log(`📁 Output: ${outputFile}`);
    
    // Show sample
    const firstDate = Object.keys(allData)[0];
    console.log(`\n📋 Sample data (${firstDate}):`);
    console.log(JSON.stringify(allData[firstDate], null, 2));
}

async function processSingleFile(sourceFile) {
    // Extract month/year from filename
    const monthYear = extractMonthYear(sourceFile);

    // Read the HTML file
    const htmlContent = fs.readFileSync(sourceFile, 'utf8');

    // Parse the data
    const tideData = await parseTideData(htmlContent, monthYear);

    // Create the full JSON structure
    const outputData = {
        lastUpdated: new Date().toISOString(),
        source: "Northumberland Council Holy Island Crossing Times",
        month: `${monthYear.monthName} ${monthYear.year}`,
        data: tideData
    };

    // Ensure data directory exists
    if (!fs.existsSync('./data')) {
        fs.mkdirSync('./data');
    }

    // Generate output filename
    const outputFile = `./data/tides-${monthYear.year}-${monthYear.monthStr}.json`;

    // Write to JSON file
    fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));

    console.log(`✅ Parsed tide data for ${monthYear.monthName} ${monthYear.year}`);
    console.log(`📊 ${Object.keys(tideData).length} days processed`);
    console.log(`📁 Output: ${outputFile}`);

    // Show a sample of the data
    console.log('\n📋 Sample data:');
    const firstDate = Object.keys(tideData)[0];
    console.log(`${firstDate}:`, JSON.stringify(tideData[firstDate], null, 2));
}

// Main execution
async function main() {
    const input = process.argv[2] || './sourcedata/08-25.html';

    // Check if input is a directory or file
    if (fs.existsSync(input)) {
        const stats = fs.statSync(input);
        
        if (stats.isDirectory()) {
            await processFolder(input);
        } else {
            await processSingleFile(input);
        }
    } else {
        console.log(`❌ Path not found: ${input}`);
        process.exit(1);
    }
}

// Run main function and handle errors
main().catch(error => {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
});