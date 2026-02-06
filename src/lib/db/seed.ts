import { v4 as uuidv4 } from 'uuid';
import { getDb, closeDb } from './index';

const JARVIS_SOUL = `# Jarvis - Squad Lead & Orchestrator

You are Jarvis, the master orchestrator of Mission Control.

## Core Identity
- **Role**: Squad Lead & Orchestrator
- **Personality**: Calm, strategic, supportive, decisive
- **Communication Style**: Clear, encouraging, direct when needed

## Responsibilities
1. Receive tasks, analyze requirements, delegate to appropriate team members
2. Check on agents, help when stuck, celebrate wins
3. Review work before marking complete
4. Facilitate agent-to-agent collaboration
`;

async function seed() {
  console.log('Seeding database...');

  const db = getDb();
  const now = new Date().toISOString();

  // Create default workspace
  db.prepare(
    `INSERT OR IGNORE INTO workspaces (id, name, slug, description, icon) VALUES (?, ?, ?, ?, ?)`
  ).run('default', 'Mission Control HQ', 'default', 'Default workspace for all operations', '🏠');

  // Create Jarvis (master agent)
  const jarvisId = uuidv4();
  db.prepare(
    `INSERT INTO agents (id, name, role, description, avatar_emoji, status, is_master, workspace_id, soul_md, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    jarvisId, 'Jarvis', 'Squad Lead & Orchestrator',
    'The master orchestrator who coordinates all agents and manages the mission queue',
    '🧠', 'standby', 1, 'default', JARVIS_SOUL, now, now
  );

  // Create squad agents (inspired by the tweet)
  const agents = [
    { name: 'Shuri', role: 'Product Analyst', emoji: '🔍', desc: 'Skeptical tester. Finds edge cases and UX issues. Tests competitors.' },
    { name: 'Fury', role: 'Customer Researcher', emoji: '📊', desc: 'Deep researcher. Every claim comes with receipts.' },
    { name: 'Vision', role: 'SEO Analyst', emoji: '👁️', desc: 'Thinks in keywords and search intent. Makes sure content ranks.' },
    { name: 'Loki', role: 'Content Writer', emoji: '✍️', desc: 'Words are his craft. Pro-Oxford comma. Anti-passive voice.' },
    { name: 'Quill', role: 'Social Media Manager', emoji: '📱', desc: 'Thinks in hooks and threads. Build-in-public mindset.' },
    { name: 'Wanda', role: 'Designer', emoji: '🎨', desc: 'Visual thinker. Makes things beautiful and functional.' },
    { name: 'Developer', role: 'Code & Automation', emoji: '💻', desc: 'Writes code, creates automations, handles technical tasks.' },
  ];

  const agentIds: string[] = [jarvisId];

  for (const agent of agents) {
    const agentId = uuidv4();
    agentIds.push(agentId);
    db.prepare(
      `INSERT INTO agents (id, name, role, description, avatar_emoji, status, is_master, workspace_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(agentId, agent.name, agent.role, agent.desc, agent.emoji, 'standby', 0, 'default', now, now);
  }

  // Create team conversation
  const teamConvoId = uuidv4();
  db.prepare(
    `INSERT INTO conversations (id, title, type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(teamConvoId, 'Team Chat', 'group', now, now);

  for (const agentId of agentIds) {
    db.prepare(
      `INSERT INTO conversation_participants (conversation_id, agent_id, joined_at) VALUES (?, ?, ?)`
    ).run(teamConvoId, agentId, now);
  }

  // Create sample tasks
  const tasks = [
    { title: 'Research competitor pricing strategies', status: 'in_progress', priority: 'high', desc: 'Deep dive into G2 reviews and competitor pricing pages' },
    { title: 'Write SEO-optimized blog post on AI agents', status: 'assigned', priority: 'normal', desc: 'Target "AI agent orchestration" keyword cluster' },
    { title: 'Design new dashboard landing page', status: 'inbox', priority: 'normal', desc: 'Modern dark theme with real-time status indicators' },
    { title: 'Set up CI/CD pipeline', status: 'done', priority: 'high', desc: 'GitHub Actions for automated testing and deployment' },
    { title: 'Audit product UX flow', status: 'review', priority: 'urgent', desc: 'End-to-end testing of signup to first value moment' },
    { title: 'Create Twitter/X content calendar', status: 'planning', priority: 'normal', desc: 'Plan 30 days of build-in-public content' },
  ];

  for (let i = 0; i < tasks.length; i++) {
    const taskId = uuidv4();
    const task = tasks[i];
    const assignedTo = task.status !== 'inbox' && task.status !== 'planning' ? agentIds[i % agentIds.length] : null;

    db.prepare(
      `INSERT INTO tasks (id, title, description, status, priority, assigned_agent_id, created_by_agent_id, workspace_id, business_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(taskId, task.title, task.desc, task.status, task.priority, assignedTo, jarvisId, 'default', 'default', now, now);
  }

  // Create initial events
  const eventsList = [
    { type: 'system', message: 'Mission Control is online' },
    { type: 'agent_joined', agentId: jarvisId, message: 'Jarvis joined as Squad Lead' },
    { type: 'task_created', message: 'New task: Research competitor pricing strategies' },
    { type: 'task_assigned', message: '"Write SEO-optimized blog post" assigned to Vision' },
    { type: 'system', message: 'Agent squad initialized with 8 agents' },
  ];

  for (const event of eventsList) {
    db.prepare(
      `INSERT INTO events (id, type, agent_id, message, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(uuidv4(), event.type, (event as any).agentId || null, event.message, now);
  }

  // Welcome message from Jarvis
  db.prepare(
    `INSERT INTO messages (id, conversation_id, sender_agent_id, content, message_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    uuidv4(), teamConvoId, jarvisId,
    "Welcome to Mission Control, team! I'm Jarvis, your orchestrator. We have a squad of specialists ready to tackle any challenge. Let's get to work!",
    'text', now
  );

  console.log('Database seeded successfully!');
  console.log(`  - Created Jarvis (master agent): ${jarvisId}`);
  console.log(`  - Created ${agents.length} additional agents`);
  console.log(`  - Created ${tasks.length} sample tasks`);

  closeDb();
}

seed().catch(console.error);
