const fs = require('fs');

const html = fs.readFileSync('../fixtures/linkedIn_job2.html', 'utf8');

// Extract the JSON
const startToken = 'window.__como_rehydration__ = [';
const startIdx = html.indexOf(startToken);
const scriptEndIdx = html.indexOf('</script>', startIdx);
let jsonStr = html.substring(startIdx + 'window.__como_rehydration__ = '.length, scriptEndIdx).trim();
if (jsonStr.endsWith(';')) jsonStr = jsonStr.slice(0, -1);

const data = JSON.parse(jsonStr);

console.log('Searching for location pattern in', data.length, 'items...\n');

// Test the location pattern
const locationPattern = /([^•]+)\s*•\s*([^"\\]+(?:\s*\([^)]+\))?)/;

let found = 0;
for (let i = 0; i < data.length; i++) {
    if (typeof data[i] !== 'string') continue;

    const match = data[i].match(locationPattern);
    if (match && match[2]) {
        const location = match[2].trim();
        // Verify it looks like a location
        if (location.length > 3 && (location.includes(',') || location.includes('(') || /[A-Z][a-z]+/.test(location))) {
            console.log(`\n✓ Found at index ${i}:`);
            console.log(`  Full match: "${match[0]}"`);
            console.log(`  Company: "${match[1].trim()}"`);
            console.log(`  Location: "${location}"`);
            found++;
            if (found >= 3) break; // Show first 3 matches
        }
    }
}

if (found === 0) {
    console.log('\n❌ No location patterns found!');
    console.log('\nSearching for bullet character "•" in strings...');

    for (let i = 0; i < data.length; i++) {
        if (typeof data[i] === 'string' && data[i].includes('•')) {
            console.log(`\nIndex ${i} contains "•":`);
            const idx = data[i].indexOf('•');
            console.log(data[i].substring(Math.max(0, idx - 50), idx + 100));
            break;
        }
    }
}
