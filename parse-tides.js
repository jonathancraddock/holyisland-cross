// Parse tide data from HTML to JSON format
// Usage: 
//   node parse-tides.js [sourceFile]              # Single file
//   node parse-tides.js [sourceFolder]            # Entire folder
// Examples: 
//   node parse-tides.js sourcedata/09-25.html     # Single month
//   node parse-tides.js sourcedata/               # All months

const fs = require('fs');
const path = require('path');

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

function parseTideData(htmlContent, monthYear) {
    const data = {};
    
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
                data[baseDate] = safePeriods;
            }
        }
    }
    
    return data;
}

function processFolder(folderPath) {
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

    files.forEach(file => {
        const filePath = path.join(folderPath, file);
        console.log(`\n🔄 Processing ${file}...`);
        
        try {
            const monthYear = extractMonthYear(file);
            const htmlContent = fs.readFileSync(filePath, 'utf8');
            const tideData = parseTideData(htmlContent, monthYear);
            
            // Merge data into combined object
            Object.assign(allData, tideData);
            
            monthsProcessed.push(`${monthYear.monthName} ${monthYear.year}`);
            totalDays += Object.keys(tideData).length;
            
            console.log(`   ✅ ${Object.keys(tideData).length} days processed`);
        } catch (error) {
            console.log(`   ❌ Error processing ${file}: ${error.message}`);
        }
    });

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

function processSingleFile(sourceFile) {
    // Extract month/year from filename
    const monthYear = extractMonthYear(sourceFile);

    // Read the HTML file
    const htmlContent = fs.readFileSync(sourceFile, 'utf8');

    // Parse the data
    const tideData = parseTideData(htmlContent, monthYear);

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
const input = process.argv[2] || './sourcedata/08-25.html';

// Check if input is a directory or file
if (fs.existsSync(input)) {
    const stats = fs.statSync(input);
    
    if (stats.isDirectory()) {
        processFolder(input);
    } else {
        processSingleFile(input);
    }
} else {
    console.log(`❌ Path not found: ${input}`);
    process.exit(1);
}