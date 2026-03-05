import { N8N_API_KEY, N8N_BASE_URL } from './env.mjs';

const HEADERS = { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json' };

// Workflow IDs from CLAUDE.md
const WF_IDS = {
  'beB84wDnEG2soY1m': 'wf1',
  '2i6zvyAy3j7BjaZE': 'wf2',
  'nPbr15LJxGaZUqo7': 'wf3',
  'RNuSFAtwoEAkb9rA': 'wf4',
  '7JzGHAG24ra3977B': 'wf5',
  'EbKgRSRr2Poe34vH': 'wf6',
  'TVNOzjSnaWrmTlqw': 'wf7',
  'wJLD5sFxddNNxR7p': 'wf8',
  'AaHXknYh9egPDxcG': 'wf9',
  '50Odnt5vzIMfSBZE': 'wf10',
};

// Tags to create + which workflows get which tag
// Sorted grouping: Lead Enrichment → Verification → Wave → Send & Monitor
const TAG_PLAN = [
  {
    name: '1 · Lead Enrichment',
    wfIds: ['beB84wDnEG2soY1m', '2i6zvyAy3j7BjaZE', 'nPbr15LJxGaZUqo7', 'RNuSFAtwoEAkb9rA'],
  },
  {
    name: '2 · Verification',
    wfIds: ['7JzGHAG24ra3977B', 'EbKgRSRr2Poe34vH'],
  },
  {
    name: '3 · Wave & Queue',
    wfIds: ['TVNOzjSnaWrmTlqw'],
  },
  {
    name: '4 · Send & Monitor',
    wfIds: ['wJLD5sFxddNNxR7p', 'AaHXknYh9egPDxcG', '50Odnt5vzIMfSBZE'],
  },
];

// Also add a top-level "folder" tag so all 10 appear under one group
const FOLDER_TAG = 'Outreach System';

async function api(method, path, body) {
  const r = await fetch(N8N_BASE_URL + path, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text.substring(0, 200)}`);
  return JSON.parse(text);
}

async function createTag(name) {
  try {
    const tag = await api('POST', '/api/v1/tags', { name });
    console.log(`  Created tag: "${name}" (id: ${tag.id})`);
    return tag.id;
  } catch (e) {
    // May already exist — list and find it
    const list = await api('GET', '/api/v1/tags?limit=100');
    const tags = list.data ?? list;
    const existing = tags.find(t => t.name === name);
    if (existing) {
      console.log(`  Tag already exists: "${name}" (id: ${existing.id})`);
      return existing.id;
    }
    throw e;
  }
}

async function setWorkflowTags(wfId, tagIds) {
  // PUT /api/v1/workflows/{id}/tags expects array of { id }
  await api('PUT', `/api/v1/workflows/${wfId}/tags`, tagIds.map(id => ({ id })));
}

async function main() {
  console.log('=== Organizing n8n workflows with tags ===\n');

  // 1. Create the folder tag
  console.log('Creating top-level folder tag...');
  const folderTagId = await createTag(FOLDER_TAG);

  // 2. Create group tags
  console.log('\nCreating group tags...');
  const groupTagIds = {};
  for (const group of TAG_PLAN) {
    groupTagIds[group.name] = await createTag(group.name);
  }

  // 3. Apply tags to each workflow
  console.log('\nApplying tags to workflows...');
  for (const group of TAG_PLAN) {
    const groupId = groupTagIds[group.name];
    for (const wfId of group.wfIds) {
      try {
        await setWorkflowTags(wfId, [folderTagId, groupId]);
        console.log(`  ✓ ${WF_IDS[wfId] ?? wfId} → [${FOLDER_TAG}] + [${group.name}]`);
      } catch (e) {
        console.error(`  ✗ ${wfId}: ${e.message}`);
      }
    }
  }

  console.log('\n✅ Done! In n8n UI you can now filter by tag to see grouped workflows.');
  console.log('   Filter by "Outreach System" to see all 10 at once.');
  console.log('   Filter by a numbered tag (e.g. "1 · Lead Enrichment") to see a sub-group.');
}

main().catch(console.error);
