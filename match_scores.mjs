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
  if (!response.ok) throw new Error('Failed to get access token');
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
    const url = `https://api.assignr.com/api/v2/sites/${siteId}/games.json?page=${page}&limit=50&search[start_date]=${startDate}&search[end_date]=${endDate}&search[league_id]=${leagueId}`;
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

function normalizeTeam(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function parseCsv(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',').map(h => h.trim());
  const hTeamIdx = headers.indexOf('Home Team');
  const aTeamIdx = headers.indexOf('Away Team');
  const hScoreIdx = headers.indexOf('Home Team Score');
  const aScoreIdx = headers.indexOf('Away Team Score');
  const dateIdx = headers.indexOf('Date');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    if (cols[hScoreIdx] && cols[aScoreIdx]) {
      const dateParts = cols[dateIdx].split('/');
      let dateString = '';
      if (dateParts.length === 3) {
         const m = dateParts[0].padStart(2, '0');
         const d = dateParts[1].padStart(2, '0');
         const y = dateParts[2].length === 2 ? '20' + dateParts[2] : dateParts[2];
         dateString = `${y}-${m}-${d}`;
      }

      rows.push({
        home: cols[hTeamIdx],
        away: cols[aTeamIdx],
        normHome: normalizeTeam(cols[hTeamIdx]),
        normAway: normalizeTeam(cols[aTeamIdx]),
        date: dateString
      });
    }
  }
  return rows;
}

async function main() {
  const token = await getAccessToken();
  const csvRows = parseCsv('/Users/trent.templet/Downloads/Schedule_Match.csv');
  const assignrGames = await fetchAllGames(token);
  
  let direct = 0;
  let swapped = 0;
  let unmatched = 0;

  for (const row of csvRows) {
    const match = assignrGames.find(g => {
      const gDate = g.start_time?.split('T')[0];
      if (gDate !== row.date) return false;
      const gHome = normalizeTeam(g.home_team || '');
      const gAway = normalizeTeam(g.away_team || '');
      
      return gHome === row.normHome && gAway === row.normAway;
    });

    if (match) {
      direct++;
    } else {
      const swapMatch = assignrGames.find(g => {
        const gDate = g.start_time?.split('T')[0];
        if (gDate !== row.date) return false;
        const gHome = normalizeTeam(g.home_team || '');
        const gAway = normalizeTeam(g.away_team || '');
        
        return gHome === row.normAway && gAway === row.normHome;
      });

      if (swapMatch) {
        swapped++;
      } else {
        unmatched++;
      }
    }
  }

  console.log(`Scored CSV rows: ${csvRows.length}`);
  console.log(`Matches direct: ${direct}`);
  console.log(`Matches swapped: ${swapped}`);
  console.log(`Unmatched: ${unmatched}`);
}

main().catch(console.error);
