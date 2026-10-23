import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeText, parseAge, parseBirthInput, birthTimingMessage, detectCrisis, crisisMessage,
  parseEpdsChoice, scoreEpds, epdsPoints, EPDS_QUESTIONS, formatEpdsQuestion, buildEpdsResults,
  classifyMessage, replyFor, isYes, isNo, isNewCommand, isBackCommand, HELPLINES
} from '../public/js/chat-logic.js';

const NOW = new Date(2026, 9, 21); // 21 Oct 2026, local time

/* ---------- input cleaning ---------- */

test('Nepali digits become ordinary digits', () => {
  assert.equal(normalizeText('  २९  '), '29');
  assert.equal(normalizeText('२०८२/०९/१०'), '2082/09/10');
  assert.equal(normalizeText('a   b'), 'a b');
});

test('yes / no / new / back are recognised exactly, not as parts of words', () => {
  assert.ok(isYes('Yes') && isYes('ok') && isYes('हुन्छ'));
  assert.ok(!isYes('yesterday') && !isYes('no'));
  assert.ok(isNo('No') && isNo('होइन') && !isNo('november'));
  assert.ok(isNewCommand('NEW') && !isNewCommand('news'));
  assert.ok(isBackCommand('back') && !isBackCommand('my back hurts'));
});

/* ---------- age ---------- */

test('age: numbers, Nepali digits and words around them', () => {
  assert.deepEqual(parseAge('29'), { status: 'ok', age: 29 });
  assert.deepEqual(parseAge('२९'), { status: 'ok', age: 29 });
  assert.deepEqual(parseAge('29 years'), { status: 'ok', age: 29 });
  assert.equal(parseAge('17').status, 'minor');
  assert.equal(parseAge('61').status, 'check');
});

test('age: unusable replies are rejected', () => {
  for (const bad of ['', 'banana', '5', '0', '29 and 31', 'x'.repeat(60)]) {
    assert.equal(parseAge(bad).status, 'invalid', JSON.stringify(bad));
  }
});

/* ---------- birth date ---------- */

test('birth date: "no" words only count when they stand alone', () => {
  assert.equal(parseBirthInput('no', NOW).kind, 'not_born');
  assert.equal(parseBirthInput('not yet', NOW).kind, 'not_born');
  assert.equal(parseBirthInput("I'm still pregnant", NOW).kind, 'not_born');
  assert.equal(parseBirthInput('I have not given birth yet', NOW).kind, 'not_born');
  // these used to be treated as "not born" because they contain the letters "no"
  assert.equal(parseBirthInput('November 2025', NOW).kind, 'invalid');
  assert.equal(parseBirthInput('I know the date', NOW).kind, 'invalid');
});

test('birth date: real dates, relative dates, skip', () => {
  assert.deepEqual(parseBirthInput('2026/10/01', NOW), { kind: 'ad', days: 20 });
  assert.deepEqual(parseBirthInput('2026-10-01', NOW), { kind: 'ad', days: 20 });
  assert.deepEqual(parseBirthInput('3 weeks ago', NOW), { kind: 'relative', days: 21 });
  assert.deepEqual(parseBirthInput('two months', NOW), { kind: 'relative', days: 61 });
  assert.deepEqual(parseBirthInput('yesterday', NOW), { kind: 'relative', days: 1 });
  assert.equal(parseBirthInput('skip', NOW).kind, 'skip');
});

test('birth date: impossible and future dates are refused', () => {
  assert.equal(parseBirthInput('2026/02/30', NOW).kind, 'invalid');
  assert.equal(parseBirthInput('2026/13/01', NOW).kind, 'invalid');
  assert.equal(parseBirthInput('2026/12/25', NOW).kind, 'future');
  assert.equal(parseBirthInput('', NOW).kind, 'invalid');
});

test('birth date: Nepali (BS) dates are passed on for conversion, in Nepali or English digits', () => {
  assert.deepEqual(parseBirthInput('2082/09/10', NOW), { kind: 'bs', year: 2082, month: 9, day: 10 });
  assert.deepEqual(parseBirthInput('२०८२/०९/१०', NOW), { kind: 'bs', year: 2082, month: 9, day: 10 });
  assert.equal(parseBirthInput('2082/14/10', NOW).kind, 'invalid');
});

test('timing message follows the baby age', () => {
  assert.match(birthTimingMessage(5), /5 days old.*critical early postpartum/);
  assert.match(birthTimingMessage(21), /3 weeks old.*early postpartum/);
  assert.match(birthTimingMessage(70), /10 weeks old/);
  assert.match(birthTimingMessage(200), /about 6 months old/);
  assert.match(birthTimingMessage(21, { approximate: true }), /converted approximately/);
});

/* ---------- safety ---------- */

test('crisis phrases are detected in English and Nepali', () => {
  for (const text of [
    'I want to kill myself', 'i dont want to live anymore', 'thinking about suicide', 'I want to die',
    'I might hurt my baby', 'I think I will harm myself', 'better off dead',
    'म आत्महत्या गर्न चाहन्छु', 'मर्न मन लागेको छ', 'बाँच्न मन छैन'
  ]) {
    assert.ok(detectCrisis(text), text);
  }
});

test('everyday sentences do not trigger the crisis reply', () => {
  for (const text of [
    'what is postpartum depression', 'I hurt my back lifting the baby', 'my baby is a killer sleeper',
    'I am so tired I could sleep for a week', 'hello', 'who won the match', 'विशेष दिन'
  ]) {
    assert.ok(!detectCrisis(text), text);
  }
});

test('the crisis reply names helplines in both languages', () => {
  assert.match(crisisMessage('english'), /1166/);
  assert.match(crisisMessage('nepali'), /1166/);
  assert.match(crisisMessage('nepali'), /[ऀ-ॿ]/);
});

test('helplines are written in one place and agree across languages', () => {
  for (const number of ['1166', '1660-010-2005', '+977-9847386158']) {
    assert.ok(HELPLINES.english.includes(number), number);
    assert.ok(HELPLINES.nepali.includes(number), number);
  }
});

/* ---------- the EPDS ---------- */

test('answers must be exactly 1 to 4', () => {
  assert.equal(parseEpdsChoice('1'), 1);
  assert.equal(parseEpdsChoice('४'), 4);
  assert.equal(parseEpdsChoice('3.'), 3);
  assert.equal(parseEpdsChoice('2)'), 2);
  for (const bad of ['', '0', '5', '12', '2 3', 'two', '1abc', '-1', '1.5']) {
    assert.equal(parseEpdsChoice(bad), null, JSON.stringify(bad));
  }
});

test('both languages have ten questions with four answers each', () => {
  for (const language of ['english', 'nepali']) {
    assert.equal(EPDS_QUESTIONS[language].length, 10);
    for (const item of EPDS_QUESTIONS[language]) {
      assert.equal(item.a.length, 4);
      assert.ok(item.q.length > 5);
    }
  }
});

test('question text shows its number and the four options', () => {
  const q = formatEpdsQuestion('english', 0);
  assert.match(q, /^Question 1 of 10: I have been able to laugh/);
  assert.match(q, /1\. As much as I always could/);
  assert.match(q, /4\. Not at all/);
  assert.match(formatEpdsQuestion('nepali', 9), /^प्रश्न १० \/ १०:/);
});

test('scoring: items 1, 2 and 4 count up, items 3 and 5-10 count down', () => {
  // first option for every question
  assert.deepEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1].map((a, i) => epdsPoints(i, a)), [0, 0, 3, 0, 3, 3, 3, 3, 3, 3]);
  assert.equal(scoreEpds([1, 1, 4, 1, 4, 4, 4, 4, 4, 4]).score, 0); // healthiest answer everywhere
  assert.equal(scoreEpds([4, 4, 1, 4, 1, 1, 1, 1, 1, 1]).score, 30); // most concerning answer everywhere
  assert.equal(scoreEpds([1, 1, 1, 1, 1, 1, 1, 1, 1, 3]).score, 19);
});

test('cut-off is 10', () => {
  const nine = scoreEpds([4, 4, 1, 1, 4, 4, 4, 4, 4, 4]);
  assert.equal(nine.score, 9);
  assert.equal(nine.flagged, false);
  const ten = scoreEpds([4, 4, 1, 2, 4, 4, 4, 4, 4, 4]);
  assert.equal(ten.score, 10);
  assert.equal(ten.flagged, true);
});

test('item 10: anything except "Never" is flagged, whatever the total', () => {
  const base = [1, 1, 4, 1, 4, 4, 4, 4, 4];
  assert.equal(scoreEpds([...base, 4]).selfHarm, false); // Never
  for (const answer of [1, 2, 3]) {
    const result = scoreEpds([...base, answer]);
    assert.equal(result.selfHarm, true, `answer ${answer}`);
    assert.equal(result.flagged, false, 'total stays low, the warning must not depend on it');
  }
});

test('results text: warning only when item 10 is flagged, helplines always', () => {
  const calm = buildEpdsResults([1, 1, 4, 1, 4, 4, 4, 4, 4, 4], 'english');
  assert.match(calm, /0\/30/);
  assert.match(calm, /Below the usual cut-off/);
  assert.doesNotMatch(calm, /No depression|not experiencing depression/i);
  assert.doesNotMatch(calm, /IMPORTANT/);
  assert.match(calm, /1166/);

  const flagged = buildEpdsResults([1, 1, 4, 1, 4, 4, 4, 4, 4, 3], 'english');
  assert.match(flagged, /IMPORTANT: Your response to question 10/);
  assert.match(flagged, /Whatever your total score/);

  const high = buildEpdsResults([4, 4, 1, 4, 1, 1, 1, 1, 1, 1], 'english');
  assert.match(high, /30\/30/);
  assert.match(high, /Possible depression/);

  const nepali = buildEpdsResults([4, 4, 1, 4, 1, 1, 1, 1, 1, 1], 'nepali');
  assert.match(nepali, /EPDS स्कोर: 🔴 30\/30/);
  assert.match(nepali, /1166/);
});

/* ---------- what the assistant will talk about ---------- */

test('on-topic questions are recognised', () => {
  const cases = {
    'what is postpartum depression': 'info_what',
    'what causes postpartum depression': 'info_causes',
    'symptoms of postpartum depression': 'info_symptoms',
    'self-care tips': 'info_selfcare',
    'take the EPDS': 'epds',
    'check my symptoms': 'symptoms',
    'helpline number': 'helpline',
    'I feel so sad and tired': 'feelings',
    'I cry every day': 'feelings',
    'hello': 'greeting',
    'thanks': 'thanks',
    '3': 'menu_3',
    'menu': 'menu',
    'yes': 'yes',
    'heavy bleeding': 'urgent_medical',
    'which tablet should I take': 'medication'
  };
  for (const [text, expected] of Object.entries(cases)) {
    assert.equal(classifyMessage(text), expected, text);
  }
});

test('questions outside postpartum care are classified as off-topic and never answered', () => {
  for (const text of [
    'what is the weather', 'who won the cricket world cup', 'tell me a joke', 'write a python script',
    'what is 2+2', 'recipe for momo', 'who is the president of nepal', 'what causes earthquakes',
    'tips for cooking pasta', 'how to slow down my car', 'translate hello to french', 'what is the capital of france'
  ]) {
    assert.equal(classifyMessage(text), 'offtopic', text);
    const reply = replyFor('offtopic');
    assert.match(reply, /can't help with that/);
    assert.match(reply, /1\. Take the EPDS/); // and points back to what it can do
  }
});

test('baby and family questions it cannot answer are declined, not improvised', () => {
  assert.equal(classifyMessage('my baby will not latch'), 'related_other');
  assert.match(replyFor('related_other'), /can't give advice on it/);
});
