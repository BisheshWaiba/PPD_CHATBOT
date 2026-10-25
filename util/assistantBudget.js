import { estimateCost, dearestCost } from './assistant.js';

// A ceiling on what the AI conversation may cost in one day, across everybody.
//
// Each person already has an allowance (replies per minute and per day), but that does not stop
// many people, or one person with many accounts, adding up to a bill nobody expected. Set
// ASSISTANT_DAILY_BUDGET_USD (for example 5) and once that much has been spent today the AI is
// switched off until midnight UTC. The chat carries on with its fixed, reviewed replies, and a
// crisis message is still answered in code, as always. Nothing set means no ceiling.
//
// This is a second line of defence. The real limit is the spend limit set in the Anthropic
// console, which also covers a bug in this code.
//
// The running total is kept in memory, so a restart starts the day again from zero. Run one
// instance (see docs/DEPLOYMENT.md): two instances would each have their own total.

let day = null;
let spent = 0;
let announced = false;

const dayOf = now => new Date(now).toISOString().slice(0, 10);

function rollOver(now) {
  const today = dayOf(now);
  if (today !== day) {
    day = today;
    spent = 0;
    announced = false;
  }
}

export function dailyBudget() {
  const value = Number(process.env.ASSISTANT_DAILY_BUDGET_USD);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function spentToday(now = Date.now()) {
  rollOver(now);
  return spent;
}

export function budgetReached(now = Date.now()) {
  const limit = dailyBudget();
  return limit > 0 && spentToday(now) >= limit;
}

// What a call cost. A model whose price is not known here is counted at the dearest price we do
// know, so the ceiling errs on the side of stopping early.
export function costOfCall(model, usage) {
  return estimateCost(model, usage) ?? dearestCost(usage);
}

export function recordSpend(dollars, now = Date.now()) {
  rollOver(now);
  if (!(dollars > 0)) return;
  spent += dollars;
  const limit = dailyBudget();
  if (limit > 0 && spent >= limit && !announced) {
    announced = true;
    console.warn(`[assistant] today's AI budget of $${limit} is used up ($${spent.toFixed(2)} spent). The chat uses its fixed replies until midnight UTC.`);
  }
}

// For tests
export function resetBudget() {
  day = null;
  spent = 0;
  announced = false;
}
