import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function getAccessToken() {
  const response = await fetch(`${process.env.ASSIGNR_TOKEN_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.ASSIGNR_CLIENT_ID,
      client_secret: process.env.ASSIGNR_CLIENT_SECRET,
      scope: 'read'
    })
  });
  const data = await response.json();
  return data.access_token;
}

async function fetchAllGames(token) {
  let games = [];
  let page = 1;
  const siteId = process.env.ASSIGNR_SITE_ID;
  const leagueId = '515712';
  const startDate = '2026-03-01';
  const endDate = '2026-06-30';
  
  while (true) {
    const url = `https://api.assignr.com/api/v2/sites/${siteId}/games.json?page=${page}&search[start_date]=${startDate}&search[end_date]=${endDate}&search[league_id]=${leagueId}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
    if (!response.ok) break;
    const data = await response.json();
    const fetchedGames = data._embedded?.games || [];
    if (fetchedGames.length === 0) break;
    
    games = games.concat(fetchedGames);
    if (!data.page || page >= data.page.pages) break;
    page++;
  }
  return games;
}

function readCsvMatchIds(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  const headers = lines[0].split(',');
  const matchIdIndex = headers.findIndex(h => h.trim() === 'Match ID');
  if (matchIdIndex === -1) throw new Error('Match ID column not found');
  
  return new Set(lines.slice(1).map(line => {
    const columns = line.split(',');
    return columns[matchIdIndex]?.trim();
  }).filter(Boolean));
}

async function main() {
  const token = await getAccessToken();
  const csvMatchIds = readCsvMatchIds('/Users/trent.templet/Downloads/Schedule_Match.csv');
  const games = await fetchAllGames(token);
  
  const assignrIds = new Set(games.map(g => g.id.toString()));
  
  let matchCount = 0;
  csvMatchIds.forEach(id => {
    if (assignrIds.has(id)) matchCount++;
  });

  console.log(`CSV Match IDs: ${csvMatchIds.size}`);
  console.log(`Assignr Games Fetched: ${games.length}`);
  console.log(`Matches Found (via id): ${matchCount}`);
}
main();
