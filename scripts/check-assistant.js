// Tries the AI conversation once with the key in .env, so you can see it work (and what it costs)
// without opening the browser:   npm run check:assistant
import 'dotenv/config';
import { assistantEnabled, assistantModel, assistantReply, estimateCost, AssistantUnavailableError } from '../util/assistant.js';

if (!assistantEnabled()) {
  console.error('ANTHROPIC_API_KEY is not set. Add it to .env (see .env.example), then run this again.');
  process.exit(1);
}

const model = assistantModel();
console.log(`Asking ${model}...\n`);

const message = 'I have been feeling very tired and a little sad since the baby came.';
const started = Date.now();
try {
  const result = await assistantReply([{ role: 'user', text: message }]);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`You:      ${message}`);
  console.log(`Sutkeri:  ${result.reply}\n`);
  console.log(`Answered in ${seconds}s by ${result.model}.`);

  const usage = result.usage || {};
  console.log(`Tokens: ${usage.input_tokens} in, ${usage.output_tokens} out` +
    (usage.cache_read_input_tokens ? `, ${usage.cache_read_input_tokens} read from cache` : ''));
  const cost = estimateCost(model, usage);
  if (cost !== null) {
    console.log(`About $${cost.toFixed(4)} for this reply (a longer chat sends more earlier messages, so costs a little more).`);
  }
  console.log('\nThe AI conversation is working.');
} catch (error) {
  if (!(error instanceof AssistantUnavailableError)) throw error;
  console.error(`The AI could not answer: ${error.reason}`);
  console.error('Check that the key is right, that the account has credit, and that ASSISTANT_MODEL (if set) is a model you can use.');
  process.exit(1);
}
