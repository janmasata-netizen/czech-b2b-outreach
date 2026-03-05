/**
 * diagnose-imap.mjs — One-time diagnostic to check if IMAP emails get marked as read
 *
 * Usage:
 *   npm install imapflow   (one-time)
 *   node diagnose-imap.mjs --host imap.meisat.com --user jaromir.masata@meisat.com --pass YOUR_PASSWORD
 *
 * What it does:
 *   1. Connects to IMAP with explicit markSeen:false (BODY.PEEK)
 *   2. Lists all INBOX emails with their \Seen flag status
 *   3. Optionally waits for n8n to poll (--wait 120), then re-checks
 *   4. Reports which emails changed from UNSEEN → SEEN
 */

import { ImapFlow } from 'imapflow';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { host: '', user: '', pass: '', port: 993, wait: 0 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--host') opts.host = args[++i];
    else if (args[i] === '--user') opts.user = args[++i];
    else if (args[i] === '--pass') opts.pass = args[++i];
    else if (args[i] === '--port') opts.port = parseInt(args[++i], 10);
    else if (args[i] === '--wait') opts.wait = parseInt(args[++i], 10);
  }
  if (!opts.host || !opts.user || !opts.pass) {
    console.error('Usage: node diagnose-imap.mjs --host IMAP_HOST --user EMAIL --pass PASSWORD [--port 993] [--wait SECONDS]');
    console.error('\nExample:');
    console.error('  node diagnose-imap.mjs --host imap.meisat.com --user jaromir.masata@meisat.com --pass secret123 --wait 120');
    process.exit(1);
  }
  return opts;
}

async function getEmailFlags(client) {
  const lock = await client.getMailboxLock('INBOX');
  const emails = new Map();
  try {
    // Use BODY.PEEK[] equivalent — imapflow never sets \Seen when using fetch()
    for await (const msg of client.fetch('1:*', {
      flags: true,
      envelope: true,
      uid: true,
    })) {
      const isSeen = msg.flags.has('\\Seen');
      emails.set(msg.uid, {
        uid: msg.uid,
        seen: isSeen,
        subject: msg.envelope?.subject || '(no subject)',
        from: msg.envelope?.from?.[0]?.address || '(unknown)',
        date: msg.envelope?.date?.toISOString() || '(unknown)',
        messageId: msg.envelope?.messageId || '',
      });
    }
  } finally {
    lock.release();
  }
  return emails;
}

function printEmailSummary(emails, label) {
  const arr = [...emails.values()].sort((a, b) => b.uid - a.uid);
  const unseen = arr.filter(e => !e.seen);
  const seen = arr.filter(e => e.seen);

  console.log(`\n=== ${label} ===`);
  console.log(`Total: ${arr.length} | Unseen: ${unseen.length} | Seen: ${seen.length}\n`);

  if (unseen.length > 0) {
    console.log('UNSEEN emails:');
    for (const e of unseen.slice(0, 20)) {
      console.log(`  UID ${e.uid} | ${e.date} | ${e.from} | ${e.subject}`);
    }
    if (unseen.length > 20) console.log(`  ... and ${unseen.length - 20} more`);
  }

  console.log('');
  if (seen.length > 0) {
    console.log(`SEEN emails (last 10):`);
    for (const e of seen.slice(0, 10)) {
      console.log(`  UID ${e.uid} | ${e.date} | ${e.from} | ${e.subject}`);
    }
    if (seen.length > 10) console.log(`  ... and ${seen.length - 10} more`);
  }
}

function sleep(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function main() {
  const opts = parseArgs();

  const client = new ImapFlow({
    host: opts.host,
    port: opts.port,
    secure: true,
    auth: { user: opts.user, pass: opts.pass },
    logger: false,
  });

  console.log(`Connecting to ${opts.host}:${opts.port} as ${opts.user}...`);
  await client.connect();
  console.log('Connected.\n');

  // Snapshot 1
  const before = await getEmailFlags(client);
  printEmailSummary(before, 'SNAPSHOT 1 (before)');

  if (opts.wait > 0) {
    console.log(`\nWaiting ${opts.wait} seconds for n8n WF9 to poll...`);
    console.log('(Send a test email to the inbox now if you want to test new mail handling)');
    await sleep(opts.wait);

    // Snapshot 2
    const after = await getEmailFlags(client);
    printEmailSummary(after, 'SNAPSHOT 2 (after wait)');

    // Diff
    console.log('\n=== DIFF: Emails that changed UNSEEN → SEEN ===');
    let changed = 0;
    for (const [uid, beforeEmail] of before) {
      if (!beforeEmail.seen) {
        const afterEmail = after.get(uid);
        if (afterEmail && afterEmail.seen) {
          console.log(`  UID ${uid} | ${beforeEmail.from} | ${beforeEmail.subject}`);
          changed++;
        }
      }
    }

    // New emails that arrived seen
    console.log('\n=== NEW emails that arrived during wait ===');
    let newCount = 0;
    for (const [uid, afterEmail] of after) {
      if (!before.has(uid)) {
        console.log(`  UID ${uid} | seen=${afterEmail.seen} | ${afterEmail.from} | ${afterEmail.subject}`);
        newCount++;
      }
    }

    if (changed === 0 && newCount === 0) {
      console.log('\n✓ No emails changed state and no new emails arrived.');
      console.log('  → n8n did NOT mark any emails as read (or no poll happened).');
    } else if (changed > 0) {
      console.log(`\n✗ ${changed} email(s) were marked as SEEN during the wait period.`);
      console.log('  → n8n IS marking emails as read despite postProcessAction: "nothing".');
      console.log('  → Proceed with Step 3: deploy imap-peek-reader proxy.');
    } else {
      console.log(`\n${newCount} new email(s) arrived. Check their seen status above.`);
    }
  }

  await client.logout();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
