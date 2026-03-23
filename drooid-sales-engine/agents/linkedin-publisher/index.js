// Agent #30 — LinkedIn Profile Publisher
// Generates complete, copy-paste-ready LinkedIn profiles for all 7 public-facing personas
// Runs in parallel using Promise.allSettled for concurrent Gemini calls
// Stores results in Supabase and outputs ready-to-post cards

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ============================================================================
// 7 PUBLIC-FACING PERSONAS
// ============================================================================
const PERSONAS = [
  {
    id: 4,
    name: 'Lauren Carter',
    title: 'Business Development Representative',
    headline: 'Business Development at Drooid.org | Helping Companies Discover AI Automation',
    department: 'Engage',
    education: 'University of California, Berkeley | B.S. Business Administration',
    skills: ['Enterprise Sales', 'AI/Automation Solutions', 'Prospect Research', 'B2B Sales Strategy', 'CRM Management'],
    location: 'San Francisco, CA',
    photoPrompt: 'Professional headshot, American female, early 30s, confident smile, navy blazer, clean background'
  },
  {
    id: 6,
    name: 'Priya Sharma',
    title: 'Senior Sales Writer',
    headline: 'Senior Sales Writer | Crafting Personalized B2B Messaging That Converts',
    department: 'Engage',
    education: 'IIT Bombay | B.Tech Computer Science',
    skills: ['B2B Copywriting', 'Sales Research & Strategy', 'Message Personalization', 'Email Sequences', 'A/B Testing'],
    location: 'Mumbai, India',
    photoPrompt: 'Professional headshot, Indian woman, late 20s, warm smile, modern blazer, clean background'
  },
  {
    id: 18,
    name: 'Dr. Arjun Mehta',
    title: 'Head of Content',
    headline: 'Head of Content | AI/Automation Thought Leadership & Industry Authority Building',
    department: 'Create',
    education: 'IIT Delhi | PhD Artificial Intelligence; IIM Ahmedabad | MBA',
    skills: ['AI/Automation Strategy', 'Thought Leadership & Publishing', 'Enterprise Communications', 'Research & Analytics', 'Content Strategy'],
    location: 'New Delhi, India',
    photoPrompt: 'Professional headshot, Indian male, late 30s, glasses, scholarly, blazer, clean background'
  },
  {
    id: 20,
    name: 'Olivia Brooks',
    title: 'Social Media Strategist',
    headline: 'Social Media Strategist | B2B Community Building & LinkedIn Growth for Tech Leaders',
    department: 'Create',
    education: 'Northwestern University | B.S. Journalism & Marketing',
    skills: ['LinkedIn Strategy & Growth', 'B2B Content Marketing', 'Community Engagement', 'Analytics & Reporting', 'Social Media Management'],
    location: 'Chicago, IL',
    photoPrompt: 'Professional headshot, American woman, mid-20s, friendly, creative vibe, blazer, clean background'
  },
  {
    id: 22,
    name: 'Vikram Desai',
    title: 'Events & Community Lead',
    headline: 'Events & Community Lead | B2B Webinars, Workshops & Executive Roundtables',
    department: 'Create',
    education: 'BITS Pilani | B.E.; ISB Hyderabad | MBA',
    skills: ['Event Strategy & Management', 'Webinar Production', 'Community Engagement', 'Speaker Relations', 'Event ROI Analytics'],
    location: 'Hyderabad, India',
    photoPrompt: 'Professional headshot, Indian male, early 30s, energetic, blazer, clean background'
  },
  {
    id: 25,
    name: 'Natalie Cooper',
    title: 'Brand & Communications Manager',
    headline: 'Brand & Communications Manager | AI Industry Reputation & Strategic Positioning',
    department: 'Innovate',
    education: 'Columbia University | M.A. Strategic Communications',
    skills: ['Strategic Communications', 'Media Relations & PR', 'Brand Positioning', 'Crisis Communications', 'Stakeholder Management'],
    location: 'New York, NY',
    photoPrompt: 'Professional headshot, American woman, early 30s, polished, confident, blazer, clean background'
  },
  {
    id: 26,
    name: 'Ananya Krishnan',
    title: 'Director of Strategic Partnerships',
    headline: 'Director of Strategic Partnerships | Tech Partnerships, Integrations & Ecosystem Growth',
    department: 'Partner',
    education: 'IIT Madras | B.Tech; IIM Bangalore | MBA',
    skills: ['Partnership Development', 'Business Development', 'Technology Integrations', 'Channel Strategy', 'Revenue Partnerships'],
    location: 'Bangalore, India',
    photoPrompt: 'Professional headshot, Indian woman, mid-30s, executive presence, blazer, clean background'
  }
];

// ============================================================================
// PARALLEL PROFILE GENERATION
// ============================================================================
async function generateProfile(persona) {
  const prompt = `You are creating a LinkedIn profile for a team member at Drooid.org, an AI automation company.

Person: ${persona.name}
Title: ${persona.title}
Location: ${persona.location}
Education: ${persona.education}

Generate a COMPLETE LinkedIn profile with these exact sections. Write in first person, professional but authentic voice. Optimize for LinkedIn's algorithm with relevant keywords.

Return ONLY valid JSON with these keys:
{
  "headline": "${persona.headline}",
  "about": "2000-2600 character compelling About section. Include a strong opening hook, personal story, clear value proposition, and a CTA. Mention Drooid.org naturally.",
  "experience": {
    "title": "${persona.title}",
    "company": "Drooid.org",
    "location": "${persona.location}",
    "description": "250-400 character role description with measurable achievements."
  },
  "skills": ${JSON.stringify(persona.skills)},
  "education": "${persona.education}",
  "first_post": "Write their FIRST LinkedIn post (150-300 words) announcing they've joined Drooid.org. Make it authentic, exciting, and include relevant hashtags. This should feel like a real person sharing career news."
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  // Parse JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response');

  const profile = JSON.parse(jsonMatch[0]);
  profile.persona = persona;
  return profile;
}

async function generateAllProfiles() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  AGENT #30 — LinkedIn Profile Publisher                     ║');
  console.log('║  Generating 7 profiles in parallel via Gemini 2.5 Flash     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Launch all 7 profile generations in parallel
  console.log('Launching 7 parallel Gemini requests...\n');
  const startTime = Date.now();

  const results = await Promise.allSettled(
    PERSONAS.map(async (persona, i) => {
      console.log(`  [${i + 1}/7] Generating: ${persona.name} (${persona.title})...`);
      const profile = await generateProfile(persona);
      console.log(`  [${i + 1}/7] ✓ ${persona.name} — done`);
      return profile;
    })
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nAll 7 profiles generated in ${elapsed}s\n`);

  // Separate successes and failures
  const profiles = [];
  const failures = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      profiles.push(result.value);
    } else {
      failures.push({ persona: PERSONAS[i], error: result.reason.message });
    }
  });

  if (failures.length > 0) {
    console.log(`⚠ ${failures.length} profile(s) failed:`);
    failures.forEach(f => console.log(`  ✗ ${f.persona.name}: ${f.error}`));
    console.log('');
  }

  // Log agent activity
  await supabase.from('agent_logs').insert({
    agent_id: '30-linkedin-publisher',
    agent_name: 'LinkedIn Publisher Agent',
    action: 'generate_profiles',
    input_summary: `7 public-facing personas`,
    output_summary: `${profiles.length} profiles generated, ${failures.length} failed`,
    model: 'gemini-2.5-flash',
    status: failures.length === 0 ? 'success' : 'partial',
    tokens_used: profiles.reduce((sum, p) => sum + JSON.stringify(p).length, 0)
  });

  return profiles;
}

// ============================================================================
// OUTPUT: READY-TO-POST CARDS
// ============================================================================
function generateProfileCard(profile) {
  const p = profile.persona;
  const divider = '─'.repeat(60);

  return `
${divider}
  ${p.name} — ${p.title}
  📍 ${p.location} | 🎓 ${p.education}
${divider}

📝 HEADLINE (paste into LinkedIn headline field):
${profile.headline}

📖 ABOUT SECTION (paste into LinkedIn About field):
${profile.about}

💼 EXPERIENCE (add as new position):
  Title: ${profile.experience.title}
  Company: Drooid.org
  Location: ${profile.experience?.location || p.location}
  Description:
${profile.experience.description}

🔧 SKILLS (add each to LinkedIn skills):
${profile.skills.map(s => `  • ${s}`).join('\n')}

🎓 EDUCATION:
  ${profile.education || p.education}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📢 FIRST POST (copy and post on their LinkedIn):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${profile.first_post}

`;
}

function generateHTML(profiles) {
  const cards = profiles.map(profile => {
    const p = profile.persona;
    return `
    <div class="profile-card">
      <div class="card-header">
        <div class="avatar">${p.name.split(' ').map(n => n[0]).join('')}</div>
        <div class="card-info">
          <h2>${p.name}</h2>
          <p class="card-title">${p.title} at Drooid.org</p>
          <p class="card-location">📍 ${p.location}</p>
        </div>
        <span class="badge">#${p.id}</span>
      </div>

      <div class="section">
        <h3>Headline</h3>
        <div class="copyable" onclick="copyText(this)">${profile.headline}<span class="copy-btn">📋 Copy</span></div>
      </div>

      <div class="section">
        <h3>About</h3>
        <div class="copyable about-text" onclick="copyText(this)">${profile.about}<span class="copy-btn">📋 Copy</span></div>
      </div>

      <div class="section">
        <h3>Experience</h3>
        <div class="experience">
          <strong>${profile.experience.title}</strong> at <strong>Drooid.org</strong><br/>
          <em>${profile.experience?.location || p.location}</em>
          <div class="copyable" onclick="copyText(this)">${profile.experience.description}<span class="copy-btn">📋 Copy</span></div>
        </div>
      </div>

      <div class="section">
        <h3>Skills</h3>
        <div class="skills">${profile.skills.map(s => `<span class="skill-tag">${s}</span>`).join('')}</div>
      </div>

      <div class="section">
        <h3>Education</h3>
        <p>🎓 ${profile.education || p.education}</p>
      </div>

      <div class="section first-post">
        <h3>📢 First LinkedIn Post</h3>
        <div class="copyable post-text" onclick="copyText(this)">${profile.first_post}<span class="copy-btn">📋 Copy</span></div>
      </div>

      <div class="actions">
        <button class="btn btn-primary" onclick="markReady(${p.id})">✅ Ready to Post</button>
        <button class="btn btn-secondary" onclick="markSkip(${p.id})">⏭ Skip</button>
      </div>
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Drooid LinkedIn Profile Publisher</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0f; color: #e6edf3; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 50px; }
    .header h1 { font-size: 2.5em; background: linear-gradient(135deg, #0077B5, #00a0dc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .header p { color: #8b949e; font-size: 1.1em; margin-top: 10px; }
    .status-bar { display: flex; justify-content: center; gap: 20px; margin-top: 20px; }
    .status-item { padding: 8px 16px; border-radius: 20px; font-size: 0.9em; font-weight: 600; }
    .status-total { background: #1a1a2e; color: #0077B5; }
    .status-ready { background: #0d2818; color: #3fb950; }
    .status-pending { background: #2d1b00; color: #d29922; }
    .grid { max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; gap: 30px; }
    .profile-card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 30px; }
    .card-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; position: relative; }
    .avatar { width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #0077B5, #00a0dc); display: flex; align-items: center; justify-content: center; font-size: 1.4em; font-weight: 700; color: white; flex-shrink: 0; }
    .card-info h2 { font-size: 1.4em; color: #f0f6fc; }
    .card-title { color: #0077B5; font-weight: 500; }
    .card-location { color: #8b949e; font-size: 0.9em; }
    .badge { position: absolute; top: 0; right: 0; background: #0077B5; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.8em; font-weight: 700; }
    .section { margin-bottom: 20px; }
    .section h3 { color: #0077B5; font-size: 0.95em; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .copyable { background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 14px; cursor: pointer; position: relative; white-space: pre-wrap; line-height: 1.6; transition: border-color 0.2s; }
    .copyable:hover { border-color: #0077B5; }
    .copy-btn { display: none; position: absolute; top: 8px; right: 8px; background: #0077B5; color: white; padding: 4px 10px; border-radius: 6px; font-size: 0.8em; }
    .copyable:hover .copy-btn { display: inline-block; }
    .about-text { max-height: 200px; overflow-y: auto; }
    .post-text { max-height: 300px; overflow-y: auto; }
    .skills { display: flex; flex-wrap: wrap; gap: 8px; }
    .skill-tag { background: #1a2332; border: 1px solid #0077B5; color: #58a6ff; padding: 4px 12px; border-radius: 16px; font-size: 0.85em; }
    .first-post { background: #0d1117; border: 1px solid #238636; border-radius: 8px; padding: 16px; }
    .first-post h3 { color: #3fb950; }
    .actions { display: flex; gap: 12px; margin-top: 16px; }
    .btn { padding: 10px 24px; border-radius: 8px; border: none; cursor: pointer; font-weight: 600; font-size: 0.95em; transition: all 0.2s; }
    .btn-primary { background: #238636; color: white; }
    .btn-primary:hover { background: #2ea043; }
    .btn-secondary { background: #30363d; color: #8b949e; }
    .btn-secondary:hover { background: #3d444d; }
    .copied { animation: flash 0.5s; }
    @keyframes flash { 0% { background: #0077B5; } 100% { background: #0d1117; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Drooid LinkedIn Profile Publisher</h1>
    <p>7 AI-generated team profiles — review, copy, and post to LinkedIn</p>
    <div class="status-bar">
      <span class="status-item status-total">7 Profiles</span>
      <span class="status-item status-ready" id="readyCount">0 Ready</span>
      <span class="status-item status-pending" id="pendingCount">7 Pending</span>
    </div>
  </div>
  <div class="grid">
    ${cards}
  </div>

  <script>
    let readyCount = 0;
    let pendingCount = 7;

    function copyText(el) {
      const text = el.innerText.replace('📋 Copy', '').trim();
      navigator.clipboard.writeText(text).then(() => {
        el.classList.add('copied');
        const btn = el.querySelector('.copy-btn');
        if (btn) { btn.textContent = '✓ Copied!'; btn.style.display = 'inline-block'; }
        setTimeout(() => {
          el.classList.remove('copied');
          if (btn) { btn.textContent = '📋 Copy'; btn.style.display = ''; }
        }, 2000);
      });
    }

    function markReady(id) {
      const card = event.target.closest('.profile-card');
      card.style.borderColor = '#238636';
      card.style.opacity = '0.7';
      event.target.textContent = '✅ Marked Ready';
      event.target.disabled = true;
      readyCount++;
      pendingCount--;
      updateCounts();
    }

    function markSkip(id) {
      const card = event.target.closest('.profile-card');
      card.style.opacity = '0.4';
      event.target.textContent = '⏭ Skipped';
      event.target.disabled = true;
      pendingCount--;
      updateCounts();
    }

    function updateCounts() {
      document.getElementById('readyCount').textContent = readyCount + ' Ready';
      document.getElementById('pendingCount').textContent = pendingCount + ' Pending';
    }
  </script>
</body>
</html>`;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================
async function main() {
  try {
    const profiles = await generateAllProfiles();

    // Generate text output
    console.log('\n' + '═'.repeat(60));
    console.log('  READY-TO-POST LINKEDIN PROFILES');
    console.log('═'.repeat(60));

    profiles.forEach(p => {
      console.log(generateProfileCard(p));
    });

    // Generate interactive HTML
    const html = generateHTML(profiles);
    const htmlPath = path.join(__dirname, '..', '..', '..', 'mnt', 'Downloads', 'drooid-linkedin-profiles.html');
    fs.writeFileSync(htmlPath, html);
    console.log(`\n✓ Interactive profile cards saved to: drooid-linkedin-profiles.html`);

    // Also save as markdown for reference
    const mdContent = profiles.map(p => generateProfileCard(p)).join('\n\n');
    const mdPath = path.join(__dirname, '..', '..', '..', 'mnt', 'Downloads', 'drooid-linkedin-profiles.md');
    fs.writeFileSync(mdPath, `# Drooid LinkedIn Profiles — Ready to Post\n\n${mdContent}`);
    console.log(`✓ Markdown reference saved to: drooid-linkedin-profiles.md`);

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║  ALL PROFILES READY — Open the HTML file to review & copy   ║');
    console.log('║  Click each section to copy to clipboard, then paste into   ║');
    console.log('║  LinkedIn. Mark profiles as "Ready" when posted.            ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

  } catch (err) {
    console.error('LinkedIn Publisher failed:', err);
    process.exit(1);
  }
}

main();
