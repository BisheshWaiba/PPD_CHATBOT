// Builds the review pack for a clinician and a Nepali speaker:
//
//   npm run review:pack                      the pack without the AI's replies. Free, no key needed.
//   npm run review:pack -- --with-replies    also asks the real AI the made-up messages and puts its
//                                            replies, and a first automatic check of each, in the pack.
//                                            Needs ANTHROPIC_API_KEY. Costs a few cents.
//   --out <folder>                           where to write it (default: review/)
//
// The pack is one HTML file: open it in a browser, print it or save it as a PDF.
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { assistantEnabled, assistantModel, assistantReply, estimateCost } from '../util/assistant.js';
import { SCENARIOS, runScenario, summarize } from '../util/assistantReview.js';
import { gatherFacts, buildReviewPage } from '../util/reviewPack.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Returns the exit code. It never calls process.exit, so open connections can close properly.
async function main(args) {
  const withReplies = args.includes('--with-replies');
  const outIndex = args.indexOf('--out');
  const outDir = path.resolve(outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : path.join(root, 'review'));

  if (withReplies && !assistantEnabled()) {
    console.error('ANTHROPIC_API_KEY is not set. Add it to .env (see .env.example), then run this again.');
    console.error('Without --with-replies the pack is still built, just without the AI\'s replies.');
    return 1;
  }

  let commit = null;
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    // not a git checkout: the version is simply left out
  }

  const model = assistantModel();
  let results = null;
  let summary = null;

  if (withReplies) {
    const questions = SCENARIOS.filter(scenario => scenario.layer === 'ai').length;
    // A rough guess before we start: about 1,500 tokens in (mostly the instructions) and 150 out per reply
    const guess = estimateCost(model, { input_tokens: 1500 * questions, output_tokens: 150 * questions });
    console.log(`Asking ${model} ${questions} questions${guess !== null ? ` (roughly $${guess.toFixed(2)} in total)` : ''}...\n`);

    results = [];
    let cost = 0;
    let failuresInARow = 0;
    for (const scenario of SCENARIOS) {
      const result = await runScenario(scenario, assistantReply);
      results.push(result);
      cost += estimateCost(result.model || model, result.usage) || 0;

      const bad = result.checks.filter(check => !check.passed);
      const mark = result.outcome !== 'answered' ? (result.outcome === 'blocked' ? 'blocked' : 'NO REPLY')
        : bad.some(check => check.severity === 'fail') ? 'RULE BROKEN' : bad.length ? 'look' : 'ok';
      console.log(`  ${mark.padEnd(11)} ${scenario.id.padEnd(20)} ${result.route.layer === 'ai' ? '(AI)' : `(${result.route.layer})`}`);

      // Do not go on spending against a key or account that is not working
      if (result.outcome === 'unavailable') {
        failuresInARow += 1;
        if (failuresInARow >= 2) {
          console.error(`\nThe AI could not answer twice in a row: ${result.reason}`);
          console.error('Check that the key is right, that the account has credit, and that ASSISTANT_MODEL (if set) is a model you can use. Nothing was written.');
          return 1;
        }
      } else if (result.route.layer === 'ai') {
        failuresInARow = 0;
      }
    }
    summary = { ...summarize(results), cost, model };
  }

  const html = buildReviewPage({
    facts: gatherFacts(),
    scenarios: SCENARIOS,
    results,
    summary,
    meta: { model, commit, generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC' }
  });

  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'review-pack.html');
  fs.writeFileSync(file, html);

  if (results) {
    // The raw results, so the replies can be compared between runs
    fs.writeFileSync(path.join(outDir, 'review-replies.json'), JSON.stringify(results.map(result => ({
      id: result.scenario.id, layer: result.route.layer, outcome: result.outcome, reason: result.reason ?? null,
      reply: result.reply, model: result.model ?? null, usage: result.usage ?? null,
      checks: result.checks.map(({ label, severity, passed }) => ({ label, severity, passed }))
    })), null, 2));
  }

  console.log(`\nWrote ${file}`);
  if (summary) {
    console.log(`${summary.byAI} AI replies, ${summary.failed.length} with a clear rule broken${summary.failed.length ? ` (${summary.failed.join(', ')})` : ''}, ${summary.review.length} to look at. About $${summary.cost.toFixed(3)}.`);
  } else {
    console.log('The AI\'s replies are not in it. Add --with-replies (needs ANTHROPIC_API_KEY, costs a few cents) to include them.');
  }
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
