/**
 * Command-line entry used by the Cloud Run Job (and for local checks):
 *   node dist/cli.js auto        morning batch before 12:00 local time, evening digest after (what the scheduler runs)
 *   node dist/cli.js morning     the five morning mails (anything already sent today is skipped)
 *   node dist/cli.js evening     the module completion & testing digest
 *   node dist/cli.js health      list configuration problems, send nothing
 *   node dist/cli.js preview me@example.edu   every mail, to that address only
 */
import { readEnv } from './config.js';
import { makeDeps } from './deps.js';
import { buildCtx, healthProblems, loadConfig, runReports } from './engine.js';
import { ALL_KEYS, EVENING_KEYS, MORNING_KEYS } from './reports/registry.js';
import { localTime } from './lib/dates.js';

async function main() {
  const [cmd = 'auto', arg] = process.argv.slice(2);
  const deps = makeDeps(readEnv());
  const trigger = process.env.K_JOB ? 'scheduler' : 'cli';

  if (cmd === 'health') {
    const cfg = await loadConfig(deps);
    const p = await healthProblems(cfg, buildCtx(deps, cfg));
    console.log(`Mode: ${cfg.dryRun ? 'DRY RUN' : 'LIVE'}; transport: ${deps.mailerFor(cfg).describe()}`);
    console.log(p.length ? 'Problems:\n - ' + p.join('\n - ') : 'Configuration looks complete.');
    return 0;
  }
  if (cmd === 'preview') {
    if (!arg) throw new Error('preview needs an e-mail address');
    const out = await runReports(deps, { keys: ALL_KEYS, mode: 'preview', trigger, preview: true, redirectTo: arg });
    console.log(out.results.map((r) => `${r.key}: ${r.status} ${r.message}`).join('\n'));
    return out.results.some((r) => r.status === 'FAILED') ? 1 : 0;
  }
  let mode = cmd;
  if (cmd === 'auto') mode = localTime(deps.now()).hour < 12 ? 'morning' : 'evening';
  if (mode !== 'morning' && mode !== 'evening') throw new Error(`unknown command "${cmd}"`);
  const out = await runReports(deps, { keys: mode === 'morning' ? MORNING_KEYS : EVENING_KEYS, mode, trigger });
  if (out.locked) { console.log('Another run is in progress; nothing done.'); return 0; }
  console.log(`[${mode}] ` + out.results.map((r) => `${r.key}: ${r.status}${r.message ? ' – ' + r.message : ''}`).join(' | '));
  if (out.problems.length) console.log('Problems: ' + out.problems.join(' | '));
  return out.results.some((r) => r.status === 'FAILED') ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((e) => { console.error(e); process.exit(1); });
