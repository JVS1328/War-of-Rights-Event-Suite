/**
 * Generate Complete US County Data
 *
 * Fetches county data from Plotly's GeoJSON dataset and creates a comprehensive
 * JSON file mapping every state to all its counties.
 *
 * Run: node scripts/generateCountyData.js
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEOJSON_URL = 'https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json';
const OUTPUT_FILE = path.join(__dirname, '../src/data/usCountiesComplete.json');

const stateFipsToAbbr = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT',
  '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL',
  '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD',
  '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE',
  '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD',
  '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV',
  '55': 'WI', '56': 'WY'
};

const stateNames = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'DC': 'District of Columbia',
  'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois',
  'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana',
  'ME': 'Maine', 'MD': 'Maryland', 'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota',
  'MS': 'Mississippi', 'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
  'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
  'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma', 'OR': 'Oregon',
  'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina', 'SD': 'South Dakota',
  'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont', 'VA': 'Virginia',
  'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
};

function fetchGeoJSON() {
  return new Promise((resolve, reject) => {
    console.log('Fetching county data from Plotly GeoJSON...');
    
    https.get(GEOJSON_URL, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log(`Fetched ${json.features?.length || 0} county features`);
          resolve(json);
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`Failed to fetch data: ${error.message}`));
    });
  });
}

function processCountyData(geoJson) {
  console.log('Processing county data...');
  
  const statesData = {};
  
  // Initialize all states
  Object.entries(stateFipsToAbbr).forEach(([fips, abbr]) => {
    statesData[abbr] = {
      name: stateNames[abbr],
      fips: fips,
      counties: []
    };
  });
  
  // Process each county
  geoJson.features.forEach(feature => {
    const fips = feature.id;
    const countyName = feature.properties?.NAME || 'Unknown';
    
    if (fips && fips.length === 5) {
      const stateFips = fips.substring(0, 2);
      const stateAbbr = stateFipsToAbbr[stateFips];
      
      if (stateAbbr && statesData[stateAbbr]) {
        statesData[stateAbbr].counties.push({
          name: countyName,
          fips: fips,
          id: `${stateAbbr}_${countyName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}`
        });
      }
    }
  });
  
  // Sort counties alphabetically within each state
  Object.values(statesData).forEach(state => {
    state.counties.sort((a, b) => a.name.localeCompare(b.name));
  });
  
  // Calculate statistics
  const totalCounties = Object.values(statesData).reduce(
    (sum, state) => sum + state.counties.length,
    0
  );
  
  console.log(`Processed ${totalCounties} counties across ${Object.keys(statesData).length} states`);
  
  // Show state breakdown
  Object.entries(statesData)
    .sort((a, b) => b[1].counties.length - a[1].counties.length)
    .slice(0, 5)
    .forEach(([abbr, data]) => {
      console.log(`  ${abbr}: ${data.counties.length} counties`);
    });
  
  return statesData;
}

function saveToFile(data) {
  console.log(`Writing data to ${OUTPUT_FILE}...`);
  
  // Ensure directory exists
  const dir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Write JSON file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2), 'utf8');
  
  const stats = fs.statSync(OUTPUT_FILE);
  console.log(`File saved successfully (${(stats.size / 1024).toFixed(2)} KB)`);
}

async function main() {
  try {
    console.log('='.repeat(60));
    console.log('US County Data Generator');
    console.log('='.repeat(60));
    
    const geoJson = await fetchGeoJSON();
    const statesData = processCountyData(geoJson);
    saveToFile(statesData);
    
    console.log('='.repeat(60));
    console.log('Complete! County data generated successfully.');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
