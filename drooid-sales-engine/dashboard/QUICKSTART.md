# Drooid CEO Command Center - Quick Start Guide

## Installation & Setup (< 5 minutes)

### 1. Prerequisites
- Node.js 18+ installed
- Supabase project configured with credentials
- All required npm packages installed

### 2. Configure Environment
Add to your `.env` file in project root:
```bash
SUPABASE_URL=https://rrtgynwurrdyhxudbesv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
DASHBOARD_PORT=3001
NODE_ENV=production
```

### 3. Start the Server
```bash
npm install  # if dependencies not installed
node dashboard/server.js
```

Expected output:
```
╔════════════════════════════════════════════════════╗
║     Drooid CEO Command Center Dashboard            ║
║              Running on port 3001                  ║
║                                                    ║
║  Dashboard: http://localhost:3001                  ║
║  Health:    http://localhost:3001/health          ║
╚════════════════════════════════════════════════════╝
```

### 4. Access Dashboard
Open browser to: **http://localhost:3001**

## What You'll See

### Top Section: Key Performance Indicators
- **Total Leads**: All leads in the database
- **Active Pipeline**: Deals in active stages
- **Outreach Sent Today**: Messages sent in last 24 hours
- **Agent Actions Today**: Tasks executed by AI agents

### Left Column: Sales Pipeline
- **Pipeline Funnel**: Visual flow from New → Qualified → Engaged → Proposal → Closed
- **Pending Approvals**: Actions requiring your approval/rejection

### Right Column: Activity Feed
- Real-time log of what each agent is doing
- Status indicators (Success/Error/Pending)
- Timestamp for each action

### Bottom: Department Performance
7 departments with all 29 agents:
- **Discover** (3 agents): Market research & ICP analysis
- **Engage** (6 agents): Lead engagement & outreach
- **Convert** (8 agents): Deal conversion & closing
- **Create** (5 agents): Content & marketing
- **Innovate** (3 agents): Product & market feedback
- **Partner** (1 agent): Strategic partnerships
- **Manage** (3 agents): System management & monitoring

## Real-Time Updates

The dashboard automatically refreshes every 30 seconds with:
- Live KPI updates
- Latest agent activities
- New pending approvals
- Updated department metrics

Manual refresh: Click "Refresh Now" button in top right

## Taking Actions

### Approving Agent Requests
1. Look at "Pending Approvals" section
2. Review the action description
3. Click "Approve" to authorize or "Reject" to deny

Approvals are processed immediately and agents are notified.

## Troubleshooting

### "Cannot connect to Supabase"
- Check `.env` file has correct credentials
- Verify internet connection
- Check Supabase project status

### "No data showing"
- Click "Refresh Now" button
- Check that Supabase tables have data
- Look at browser console for errors (F12)

### Server won't start
- Verify Node.js version: `node --version`
- Check port 3001 isn't in use
- Ensure `.env` file exists with required keys

## API Usage (Advanced)

Get metrics programmatically:
```bash
curl http://localhost:3001/api/metrics
```

Check pending approvals:
```bash
curl http://localhost:3001/api/pending-approvals
```

Approve an action (requires approval ID):
```bash
curl -X POST http://localhost:3001/api/approvals/123/approve
```

Health check:
```bash
curl http://localhost:3001/health
```

## Files Overview

| File | Purpose |
|------|---------|
| `server.js` | Express.js backend server with API endpoints |
| `index.html` | Main dashboard (in project dashboard folder) |
| `config.json` | Configuration and metadata |
| `README.md` | Full documentation |
| `QUICKSTART.md` | This quick start guide |

## Customization Tips

### Change refresh rate
Edit `index.html`, find this line:
```javascript
refreshInterval = setInterval(refreshDashboard, 30000);
```
Change `30000` to desired milliseconds (e.g., `60000` for 1 minute)

### Modify colors
Edit CSS variables in `index.html`:
```css
--accent-teal: #14b8a6;
--accent-indigo: #6366f1;
```

### Add new KPI
1. Add HTML card in KPI section
2. Add query logic in `loadKPIs()` function
3. Update DOM element IDs

## Security Notes

- Service role key is required for approval operations
- API rate-limited: 100 req/15min (general), 20 req/60sec (approvals)
- All credentials should be in `.env`, never committed
- Dashboard uses Helmet for security headers
- Supabase Row Level Security applies to all queries

## Support

For issues:
1. Check browser console (F12) for JavaScript errors
2. Check server logs for backend errors
3. Verify Supabase connectivity
4. Review configuration in `.env`

## Next Steps

1. Monitor the real-time activity feed
2. Process pending approvals as they come in
3. Track department performance metrics
4. Analyze pipeline conversion rates
5. Customize dashboard for your team

Dashboard is production-ready and optimized for continuous operation!
