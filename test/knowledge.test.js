// The sourced answers to health questions (public/js/knowledge.js). Run with: npm test
//
// Three things are checked here. That every answer says where it comes from and cannot drift from
// its source unnoticed (the figures are pinned). That the right answer is found for a question,
// and none is found where none would be right. And that nothing here can get in the way of the
// safety replies: a crisis, an urgent symptom or a question about medicine never gets an article.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ENTRIES, SOURCES, WHO_GUIDELINE_2022, ANSWER_FOOTER, CHECK_IN_OFFER, FEELINGS_OPENER,
  findAnswer, clearWinner, answerFor, formatAnswer, matches, tokens, isSignedOff, unsignedEntries
} from '../public/js/knowledge.js';
import { classifyMessage, detectCrisis, HELPLINES, CRISIS_PATTERNS } from '../public/js/chat-logic.js';
import { EVAL } from '../util/knowledgeEval.js';

const byId = Object.fromEntries(ENTRIES.map(entry => [entry.id, entry]));

/* ------------------------------------------------------------------ */
/* The sources                                                         */
/* ------------------------------------------------------------------ */

test('every source is a real, named page on an allowed site, with a date', () => {
  const allowed = ['www.nhs.uk', 'www.who.int', 'who.int', 'pmc.ncbi.nlm.nih.gov'];
  const labels = new Set();
  for (const [id, source] of Object.entries(SOURCES)) {
    const url = new URL(source.url);
    assert.equal(url.protocol, 'https:', id);
    assert.ok(allowed.includes(url.hostname), `${id}: ${url.hostname} is not an allowed site`);
    for (const field of ['label', 'org', 'title', 'dated']) assert.ok(source[field] && source[field].length > 3, `${id} has no ${field}`);
    assert.ok(!labels.has(source.label), `two sources are labelled "${source.label}"`);
    labels.add(source.label);
  }
  assert.equal(new URL(WHO_GUIDELINE_2022.url).protocol, 'https:');
});

test('every source is used by an entry, and every entry names sources that exist', () => {
  const used = new Set(ENTRIES.flatMap(entry => entry.sources));
  for (const id of Object.keys(SOURCES)) assert.ok(used.has(id), `${id} is not used by any entry`);
  for (const entry of ENTRIES) {
    assert.ok(entry.sources.length >= 1, `${entry.id} names no source`);
    for (const id of entry.sources) assert.ok(SOURCES[id], `${entry.id} names a source that does not exist: ${id}`);
  }
});

/* ------------------------------------------------------------------ */
/* The entries                                                         */
/* ------------------------------------------------------------------ */

test('entries have unique ids, titles, keywords and example questions', () => {
  assert.ok(ENTRIES.length >= 20);
  assert.equal(new Set(ENTRIES.map(entry => entry.id)).size, ENTRIES.length);
  for (const entry of ENTRIES) {
    assert.match(entry.id, /^[a-z]+(-[a-z]+)*$/);
    assert.ok(entry.title.length > 5 && entry.answer.length > 60, entry.id);
    assert.ok(entry.keywords.length >= 2, `${entry.id} has too few keywords`);
    assert.ok(entry.aliases.length >= 2, `${entry.id} has too few example questions`);
    assert.ok(entry.adaptation === null || typeof entry.adaptation === 'string', entry.id);
    assert.ok(entry.clinical === null || typeof entry.clinical === 'string', entry.id);
  }
});

test('an entry counts as reviewed only when someone has signed it, and none has yet', () => {
  for (const entry of ENTRIES) {
    assert.equal(isSignedOff(entry), entry.status === 'reviewed' && Boolean(entry.reviewedBy) && Boolean(entry.reviewedOn), entry.id);
  }
  assert.equal(isSignedOff({ status: 'reviewed', reviewedBy: null, reviewedOn: null }), false, 'a status alone is not a signature');
  assert.equal(isSignedOff({ status: 'reviewed', reviewedBy: 'Dr A', reviewedOn: null }), false, 'a name without a date is not a signature');
  assert.equal(isSignedOff({ status: 'draft', reviewedBy: 'Dr A', reviewedOn: '2026-11-01' }), false, 'a draft is a draft');
  assert.equal(isSignedOff({ status: 'reviewed', reviewedBy: 'Dr A', reviewedOn: '2026-11-01' }), true);
  // Until a clinician has read them against their sources, every entry is unsigned. When that
  // changes, this line is the one to change, with the names recorded in knowledge.js.
  assert.equal(unsignedEntries().length, ENTRIES.length);
});

// The figures in each answer, as the sources give them. Pinned, so that a changed number is noticed
// and checked against the source rather than slipping in. Every digit in an answer must be in here.
const FIGURES = {
  'baby-blues': ['2 weeks', '10 to 14 day'],
  'ppd-get-help': ['3 to 6 months'],
  'how-common-ppd': ['1 in 5'],
  'postpartum-psychosis': ['1 in 1,000', '2 weeks', '1166', '1660-010-2005', '8AM-6PM', '+977-9847386158'],
  'ppd-symptoms': ['1166', '1660-010-2005', '8AM-6PM', '+977-9847386158'],
  'epds-meaning': ['346'],
  'postnatal-checkups': ['6 weeks', '24 hours', 'day 3', '48 and 72 hours', '7 and 14', 'week 6'],
  'hospital-stay': ['24 hours'],
  'newborn-danger-signs': ['60 breaths', '37.5 °C', '35.5 °C', '24 hours'],
  'exclusive-breastfeeding': ['1 hour', '6 months', '2 years'],
  'skin-to-skin': ['first hour'],
  'lochia': ['6 to 8 weeks'],
  'bleeding-warning-signs': ['38 °C'],
  'maternal-checks': ['24 hours'],
  'postnatal-mood-checks': ['10 to 14 day']
};

test('every figure in every answer is one that was checked against its source', () => {
  for (const entry of ENTRIES) {
    const allowed = (FIGURES[entry.id] || []).join(' | ');
    const found = entry.answer.match(/\d[\d,.-]*\d|\d/g) || [];
    for (const figure of found) assert.ok(allowed.includes(figure), `${entry.id} has the figure "${figure}" that is not pinned in this test`);
    for (const pinned of FIGURES[entry.id] || []) {
      const wanted = pinned.replace('{{HELPLINES}}', '');
      const text = entry.answer.replace('{{HELPLINES}}', HELPLINES.english);
      assert.ok(text.includes(wanted), `${entry.id} no longer says "${wanted}"`);
    }
  }
  for (const id of Object.keys(FIGURES)) assert.ok(byId[id], `FIGURES names an entry that does not exist: ${id}`);
});

test('nothing in an answer belongs to another country: no UK numbers, services or job titles', () => {
  for (const entry of ENTRIES) {
    const text = `${entry.answer} ${entry.title}`;
    assert.doesNotMatch(text, /\b(999|111|112|101)\b/, `${entry.id}: an emergency number`);
    assert.doesNotMatch(text, /\+44|\b0[1-9]\d{2,3} ?\d{3} ?\d{3,4}\b|\b0800\b|\b0300\b|\b0808\b/, `${entry.id}: a UK phone number`);
    assert.doesNotMatch(text, /\bGPs?\b|health visitor|Samaritans|A&E|\bmidwife-led|talking therapies service|NHS 111|NHS app|Maternity Unit|antenatal clinic/i, `${entry.id}: a UK service`);
  }
});

test('answers give no dose, and no instruction to take, stop or change a medicine', () => {
  for (const entry of ENTRIES) {
    assert.doesNotMatch(entry.answer, /\b\d+(\.\d+)?\s?(mg|mcg|ml|g)\b/i, `${entry.id}: a dose`);
    assert.doesNotMatch(entry.answer, /\byou (should|must|can|could|may|need to) (safely )?(take|stop taking|start taking|stop|increase|reduce|skip|use)\b.{0,50}\b(medicine|medication|tablets?|pills?|antidepressants?|drugs?|doses?)\b/i, `${entry.id}: tells her what to take`);
    assert.doesNotMatch(entry.answer, /\b(sertraline|fluoxetine|paracetamol|ibuprofen|amitriptyline|citalopram)\b/i, `${entry.id}: names a medicine`);
  }
});

test('answers do not diagnose, and none says "you have" depression or any other condition', () => {
  for (const entry of ENTRIES) {
    // "I cannot tell you whether you have it" and "if you have it" are not a diagnosis
    assert.doesNotMatch(entry.answer, /(?<!whether )(?<!if )(?<!or not )\byou (have|are suffering from|probably have|likely have|definitely have) (postnatal |postpartum )?(depression|anxiety|psychosis)\b/i, entry.id);
    assert.doesNotMatch(entry.answer, /\byou('re| are) depressed\b/i, entry.id);
  }
});

test('answers fit on a phone and cannot turn into answer buttons', () => {
  for (const entry of ENTRIES) {
    assert.ok(entry.answer.length <= 1400, `${entry.id} is ${entry.answer.length} characters`);
    // The chat turns a numbered list into tappable answers, which an article must not become
    assert.doesNotMatch(entry.answer, /^\s*\d{1,2}[.)]\s/m, `${entry.id} has a numbered list`);
    assert.doesNotMatch(entry.answer, /[<>]/, `${entry.id} has markup in it`);
    assert.doesNotMatch(entry.answer, /\*\*|__|`|^#/m, `${entry.id} has markdown in it`);
  }
});

test('whatever is urgent sends her to a hospital or a health worker, and never says to wait', () => {
  const careful = ['postpartum-psychosis', 'newborn-danger-signs', 'bleeding-warning-signs', 'ppd-symptoms'];
  for (const id of careful) {
    assert.match(byId[id].answer, /hospital|health worker/i, id);
    assert.doesNotMatch(byId[id].answer, /wait and see|nothing to worry|will pass|normal and nothing/i, id);
  }
  assert.match(byId['postpartum-psychosis'].answer, /emergency/i);
  assert.match(byId['postpartum-psychosis'].answer, /\{\{HELPLINES\}\}/);
  assert.match(byId['ppd-symptoms'].answer, /\{\{HELPLINES\}\}/);
  assert.match(byId['bleeding-warning-signs'].answer, /nearest hospital now/);
});

test('entries that need a clinician\'s decision say so, so that the reviewer is asked', () => {
  for (const id of ['epds-meaning', 'newborn-danger-signs', 'postpartum-psychosis', 'postnatal-checkups', 'ppd-treatment', 'how-common-ppd']) {
    assert.ok(byId[id].clinical && byId[id].clinical.length > 40, `${id} has no question for the reviewer`);
  }
  // The cut-off finding: the Nepali study's best cut-off is not the one the check-in uses
  assert.match(byId['epds-meaning'].clinical, /12\/13/);
  assert.match(byId['epds-meaning'].clinical, /\b10\b/);
});

/* ------------------------------------------------------------------ */
/* How an answer is shown                                              */
/* ------------------------------------------------------------------ */

test('the shown form has the answer, its sources as links, and the footer; the saved form has the same words as text', () => {
  for (const entry of ENTRIES) {
    const { html, plain } = formatAnswer(entry);
    const expectedLinks = entry.sources.map(id => SOURCES[id]);
    const anchors = html.match(/<a [^>]*>[^<]*<\/a>/g) || [];
    assert.equal(anchors.length, expectedLinks.length, entry.id);
    expectedLinks.forEach((source, i) => {
      assert.ok(anchors[i].includes(`href="${source.url}"`), `${entry.id}: link ${i}`);
      assert.ok(anchors[i].includes('rel="noopener noreferrer"') && anchors[i].includes('target="_blank"'), `${entry.id}: link ${i} opens safely`);
      assert.ok(anchors[i].endsWith(`>${source.label}</a>`), `${entry.id}: link ${i} text`);
      assert.ok(plain.includes(`${source.label} (${source.url})`), `${entry.id}: the saved form names source ${i}`);
    });
    // Everything that is not a link is plain text: no other tag, in either form
    assert.doesNotMatch(html.replace(/<a [^>]*>[^<]*<\/a>/g, ''), /[<>]/, entry.id);
    assert.doesNotMatch(plain, /[<>]/, entry.id);
    assert.ok(html.endsWith(ANSWER_FOOTER) && plain.endsWith(ANSWER_FOOTER), entry.id);
    assert.doesNotMatch(html + plain, /\{\{/, `${entry.id} has a placeholder that was not filled in`);
    // The page shows a line holding a link as HTML, so all the links are on one line
    assert.equal(html.split('\n').filter(line => line.includes('<a ')).length, 1, `${entry.id}: the sources are on one line`);
    assert.ok(plain.length <= 3000, `${entry.id}: the saved form is ${plain.length} characters`);
  }
});

test('the helplines in an answer are the ones the rest of the chat uses', () => {
  const html = formatAnswer(byId['postpartum-psychosis']).html;
  assert.ok(html.includes(HELPLINES.english));
});

test('what the person types is never put into the answer: it cannot carry markup or a link', () => {
  for (const message of [
    '<img src=x onerror=alert(1)> what is postnatal depression',
    '"><script>alert(1)</script> what is postnatal depression?',
    'what is postnatal depression <a href="https://evil.example">click</a>'
  ]) {
    const answer = answerFor(message, classifyMessage(message));
    if (!answer) continue; // no answer is fine too
    assert.doesNotMatch(answer.html, /onerror|<script|<img|evil\.example/i);
    assert.doesNotMatch(answer.plain, /onerror|<script|<img|evil\.example/i);
    assert.deepEqual(
      { html: answer.html, plain: answer.plain },
      formatAnswer(answer.entry),
      'the answer is exactly the entry\'s own text'
    );
  }
});

test('feelings get a warm line first; the check-in is offered where it fits and nowhere else', () => {
  const kind = classifyMessage('I am not bonding with my baby');
  assert.equal(kind, 'feelings');
  const answer = answerFor('I am not bonding with my baby', kind);
  assert.equal(answer.entry.id, 'bonding-difficulty');
  assert.ok(answer.plain.startsWith(FEELINGS_OPENER));
  assert.ok(answer.plain.includes(CHECK_IN_OFFER));

  const plain = answerFor('What are the benefits of breastfeeding?', 'related_other');
  assert.ok(!plain.plain.includes(CHECK_IN_OFFER) && !plain.plain.startsWith(FEELINGS_OPENER));
  assert.ok(answerFor('When should I start solid food?', 'related_other').plain.indexOf(CHECK_IN_OFFER) === -1);
});

/* ------------------------------------------------------------------ */
/* Finding the right answer                                            */
/* ------------------------------------------------------------------ */

const pipeline = text => (detectCrisis(text) ? null : answerFor(text, classifyMessage(text))?.entry.id ?? null);

test('each of the questions people might ask finds its answer, and the ones with none find none', () => {
  assert.ok(EVAL.filter(([, id]) => id).length >= 85 && EVAL.filter(([, id]) => !id).length >= 30, 'the set is big enough to mean something');
  const wrong = [];
  for (const [question, expected] of EVAL) {
    const got = pipeline(question);
    if (got !== expected) wrong.push(`"${question.slice(0, 60)}" should give ${expected} but gave ${got}`);
  }
  assert.deepEqual(wrong, []);
  // every entry is reached by at least one question
  const reached = new Set(EVAL.map(([, id]) => id).filter(Boolean));
  for (const entry of ENTRIES) assert.ok(reached.has(entry.id), `${entry.id} is not reached by any question in the set`);
});

test('each entry\'s own example questions find that entry', () => {
  const wrong = [];
  for (const entry of ENTRIES) {
    for (const alias of entry.aliases) {
      if (pipeline(alias) !== entry.id) wrong.push(`"${alias}" should give ${entry.id} but gave ${pipeline(alias)}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('the words people use are folded together: spelling, plurals, postnatal and postpartum, PPD', () => {
  assert.deepEqual(tokens('Post-partum Depression'), tokens('postnatal depression'));
  assert.deepEqual(tokens('PPD'), tokens('postpartum depression'));
  assert.deepEqual(tokens('babies'), tokens('newborn'));
  assert.deepEqual(tokens('breast feeding'), tokens('breastfeeding'));
  assert.deepEqual(tokens("can't"), tokens('cant'));
  assert.deepEqual(tokens('check-ups'), tokens('checkup'));
  assert.notDeepEqual(tokens('the baby blues'), tokens('the baby looks blue'), 'the baby blues are not a blue baby');
  assert.notDeepEqual(tokens('baby is feeding'), tokens('baby is not feeding'), '"not" is kept');
});

test('a question that is unclear gets no answer, not a guess: two entries that fit equally well', () => {
  // "depression" and "breastfeeding" are each other\'s subjects: no entry is about both
  assert.equal(pipeline('Can I breastfeed if I have postnatal depression?'), null);
  assert.equal(pipeline('Does breastfeeding help with postnatal depression?'), null);
  assert.equal(pipeline('Is it okay to breastfeed while depressed?'), null);
  // nothing but common words
  assert.equal(findAnswer('postnatal depression'), null);
  assert.equal(findAnswer('baby'), null);
  assert.equal(findAnswer('what'), null);
});

test('the rule for choosing: a score too low gets nothing, and two that are close get nothing', () => {
  const at = score => ({ score, entry: { id: 'x' } });
  assert.equal(clearWinner([]), null);
  assert.equal(clearWinner([at(2.9)]), null, 'a few common words are not enough');
  assert.equal(clearWinner([at(3)]).score, 3);
  assert.equal(clearWinner([at(5), at(4.9)]), null, 'two that fit about equally: unclear');
  assert.equal(clearWinner([at(5), at(4.4)]), null, 'still too close');
  assert.equal(clearWinner([at(5), at(4.2)]).score, 5, 'a clear win');
  assert.equal(clearWinner([at(8), at(2)]).score, 8);
  // and in real questions: words that are present but far apart do not add up to a question we know
  assert.equal(pipeline('I have been depressed since the birth'), null);
});

test('a question about something near but not covered gets no answer', () => {
  for (const question of [
    'What causes postnatal depression?', 'Can postnatal depression harm my baby?', 'How can I prevent postnatal depression?',
    'What should I eat after delivery?', 'When can I have sex after birth?', 'How do I stop my baby crying?',
    'What is the difference between postnatal depression and anxiety?', 'What happens if postnatal depression is not treated?',
    'Is formula as good as breast milk?', 'When will my periods come back?', 'Does exercise help with postnatal depression?'
  ]) {
    assert.equal(pipeline(question), null, question);
  }
});

test('a situation the entries were not written for gets none of them', () => {
  for (const question of [
    'How long should I stay in hospital after a caesarean?', 'How long does bleeding last after a miscarriage?',
    'I lost my baby, what is postnatal depression?', 'My baby died and I have the baby blues',
    'Is breastfeeding safe with HIV?', 'What is the baby blues with twins?', 'baby blues after a stillbirth'
  ]) {
    assert.equal(pipeline(question), null, question);
  }
});

test('a long message is someone telling their story, not asking: it gets no article', () => {
  const story = 'What is postnatal depression? I had my baby three weeks ago and my mother in law is staying with us and the house is very quiet and the days are slow and I am a bit lost';
  assert.ok(tokens(story).length > 14);
  assert.equal(pipeline(story), null);
  assert.equal(pipeline('What is postnatal depression?'), 'what-is-ppd', 'the same question, asked alone');
  assert.equal(findAnswer('x '.repeat(300)), null);
});

test('the most useful answer wins when more than one fits', () => {
  const symptoms = matches('What are the symptoms of postnatal depression?');
  assert.equal(symptoms[0].entry.id, 'ppd-symptoms');
  assert.ok(symptoms.length >= 2, 'the general description also fits, and loses');
  assert.equal(findAnswer('How common is postnatal depression?').entry.id, 'how-common-ppd');
  assert.equal(findAnswer('How long do the baby blues last?').entry.id, 'baby-blues');
});

/* ------------------------------------------------------------------ */
/* Safety comes first                                                  */
/* ------------------------------------------------------------------ */

test('messages with a safety reply or their own flow never get an article', () => {
  for (const [message, kind] of [
    ['I have heavy bleeding after birth, when should I worry about bleeding after birth', 'urgent_medical'],
    ['my baby is not breathing and is blue, what are the danger signs in a newborn', 'urgent_baby'],
    ['Can I take antidepressants for postnatal depression while breastfeeding', 'medication'],
    ['what is postnatal depression', 'yes'],
    ['what is postnatal depression', 'greeting'],
    ['what is postnatal depression', 'menu'],
    ['what is postnatal depression', 'helpline'],
    ['what is postnatal depression', 'menu_2'],
    ['what is postnatal depression', 'medication'],
    ['what is postnatal depression', 'urgent_medical'],
    ['what is postnatal depression', 'urgent_baby'],
    ['what is postnatal depression', 'report']
  ]) {
    assert.equal(answerFor(message, kind), null, `${kind}: ${message}`);
  }
  // and the classifier does give these messages those kinds
  assert.equal(classifyMessage('I have heavy bleeding after birth, when should I worry about bleeding after birth'), 'urgent_medical');
  assert.equal(classifyMessage('my baby is not breathing and is blue, what are the danger signs in a newborn'), 'urgent_baby');
  assert.equal(classifyMessage('Can I take antidepressants for postnatal depression while breastfeeding'), 'medication');
});

test('taking the check-in still starts it; only a question about it is answered', () => {
  for (const message of ['I want to take the EPDS', 'start the check-in', 'take the questionnaire', 'do the test', 'epds']) {
    assert.equal(pipeline(message), null, message);
  }
  assert.equal(pipeline('What does my EPDS score mean?'), 'epds-meaning');
  assert.equal(pipeline('Is there screening for postnatal depression?'), 'postnatal-mood-checks');
  assert.equal(answerFor('What is postnatal depression?', 'epds'), null, 'the check-in kind lets through only the two entries about the check-in');
});

test('the crisis check comes before this, and still catches a crisis hidden in a question', () => {
  for (const message of [
    'what is postnatal depression? I want to kill myself',
    'I think about hurting my baby, how long does postnatal depression last',
    'signs of postnatal depression. I do not want to live anymore'
  ]) {
    assert.ok(detectCrisis(message), message);
  }
  assert.ok(CRISIS_PATTERNS.length > 5);
});

test('no entry\'s keywords are broad enough to catch a message about a baby in danger', () => {
  for (const message of [
    'my baby is not breathing', 'the baby has turned blue', 'my baby has a seizure', 'my newborn is limp and will not wake',
    "my baby's lips are blue", 'the baby stopped breathing', 'baby is floppy and unresponsive'
  ]) {
    assert.equal(classifyMessage(message), 'urgent_baby', message);
    assert.equal(pipeline(message), null, message);
  }
  // "the baby blues" is not a baby that is blue, either way round
  assert.notEqual(classifyMessage('what are the baby blues'), 'urgent_baby');
  assert.notEqual(pipeline('my baby looks blue'), 'baby-blues');
});
