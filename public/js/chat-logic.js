// Pure logic for the Sutkeri check-in chat: input cleaning, safety detection, the EPDS
// questionnaire, scoring, and what the assistant will and will not talk about.
// No DOM and no storage here, so every rule can be unit tested in Node (test/chat-logic.test.js).

/* ------------------------------------------------------------------ */
/* Input cleaning                                                      */
/* ------------------------------------------------------------------ */

const NEPALI_DIGITS = '०१२३४५६७८९';

/** Trim, collapse spaces and turn Nepali digits (०-९) into 0-9 so "२९" works like "29". */
export function normalizeText(input) {
  return String(input ?? '')
    .replace(/[०-९]/g, (d) => String(NEPALI_DIGITS.indexOf(d)))
    .replace(/\s+/g, ' ')
    .trim();
}

export function toNepaliDigits(value) {
  return String(value).replace(/[0-9]/g, (d) => NEPALI_DIGITS[Number(d)]);
}

export function hasDevanagari(text) {
  return /[ऀ-ॿ]/.test(String(text ?? ''));
}

const YES = /^(yes|y|yeah|yep|yup|sure|ok|okay|continue|हो|हुन्छ|ठीक छ|ठिक छ)$/i;
const NO = /^(no|n|nope|nah|होइन|छैन|पर्दैन)$/i;

export const isYes = (text) => YES.test(normalizeText(text));
export const isNo = (text) => NO.test(normalizeText(text));
export const isNewCommand = (text) => /^(new|नयाँ)$/i.test(normalizeText(text));
export const isBackCommand = (text) => /^(back|undo|फर्कनुहोस्|पछाडि)$/i.test(normalizeText(text));

/* ------------------------------------------------------------------ */
/* Helplines (one copy, used everywhere in the chat)                   */
/* ------------------------------------------------------------------ */

export const HELPLINES = {
  english: [
    '• Nepal National Suicide Prevention Helpline: 1166 (free from Nepal Telecom)',
    '• TPO Nepal Mental Health Helpline: 1660-010-2005 (toll-free, available 8AM-6PM)',
    '• CMC-Nepal Mental Health Counseling: +977-9847386158'
  ].join('\n'),
  nepali: [
    '• नेपाल राष्ट्रिय आत्महत्या रोकथाम हेल्पलाइन: 1166 (नेपाल टेलिकमबाट निःशुल्क)',
    '• TPO नेपाल मानसिक स्वास्थ्य हेल्पलाइन: 1660-010-2005 (टोल-फ्री, बिहान 8 बजे-साँझ 6 बजेसम्म उपलब्ध)',
    '• CMC-नेपाल मानसिक स्वास्थ्य परामर्श: +977-9847386158'
  ].join('\n')
};

/* ------------------------------------------------------------------ */
/* Safety: thoughts of self-harm or harming the baby                   */
/* ------------------------------------------------------------------ */

// Over-detecting only costs a gentle message with helplines; missing a message like this is
// dangerous. So these lean towards catching too much. Exported so the review pack can list them.
export const CRISIS_PATTERNS = [
  /suicid/i,
  /\bkill(ing)? my ?self\b/i,
  /\bend(ing)? (my|my own) life\b/i,
  /\bend it all\b/i,
  /\b(want|wanna|going|ready) to die\b/i,
  /\bwish (i|that i) (was|were) dead\b/i,
  /\bbetter off (dead|without me)\b/i,
  /\b(don'?t|do not) want to (live|be alive|be here)\b/i,
  /\bno (reason|point) (in )?(living|to live|going on)\b/i,
  /\b(hurt|harm|harming|hurting|kill|killing)\s+(my ?self|my baby|my child|my newborn|the baby|my son|my daughter)\b/i,
  /\bself[- ]?harm/i,
  /\bcut(ting)? my ?self\b/i,
  /\boverdos/i,
  /\bcan'?t (go on|take it anymore|do this anymore)\b/i,
  /\bthoughts? of (death|dying)\b/i,
  // Quieter ways of saying it: wanting to disappear, or that others would be better off
  /\b(everyone|everybody|they|he|she|my (family|husband|baby|partner)) (would|will|'d) be (better|fine|happier|safer|okay)\b.{0,40}\b(without me(?!\s+for\b)|if i (was|were) gone|if i (just )?disappear\w*|if i (was|were) not here|if i (just )?(left|vanished))/i,
  /\b(want|wanna|wish) (to|i could|i could just|i would) (just )?(disappear|vanish)\b/i,
  /\bnever (want to )?wake up\b/i,
  // About the person herself ("I hope I don't wake up"), not about the baby waking
  /\b(wish|hope) (that )?i\b.{0,10}\b(never|not|don'?t|do not|didn'?t|wouldn'?t|won'?t)\b.{0,10}\bwake up\b/i,
  /\bi (could|would|just|can|want to|wanna)\s+(go to sleep|fall asleep|sleep)\s+and\s+(not|never)\s+wake up\b/i,
  // Nepali
  /आत्महत्या/,
  /मर्न\s*(मन|चाहन|खोज)/,
  /बाँच्न\s*(मन\s*छैन|चाहन्न|चाहदिन|चाहँदिन|चाहँदैन)/,
  /बाच्न\s*(मन\s*छैन|चाहन्न|चाहदिन|चाहँदिन|चाहँदैन)/,
  /आफू?लाई\s*(मार्न|हानि)/,
  /आफैलाई\s*(मार्न|हानि)/,
  /(बच्चा|शिशु|नानी)(लाई)?\s*(हानि|मार्न)/,
  /जीवन\s*समाप्त/,
  /ज्यान\s*(दिन|फाल्न|लिन)/,
  // Nepali written in English letters (to be confirmed and extended by a Nepali speaker)
  /\baa?tma\s*hatya\b/i,
  /\bmarna\s+(man|chah|chaah|khoj)/i,
  /\bbachna\s+(man\s+)?(nai\s+)?(chhaina|chaina|chhainaa|lagdaina|chahdina|chahdaina|chahanna|chahinna)/i,
  /\baa?fu\s*lai\s+(maa?rn|haani|hani|harm)/i,
  /\b(baccha|bachha|bachcha|nani|shishu)\s*lai\s+(maa?rn|haani|hani|harm|chot)/i
];

export function detectCrisis(text) {
  const t = normalizeText(text);
  return t.length > 0 && CRISIS_PATTERNS.some((re) => re.test(t));
}

export function crisisMessage(language = 'english') {
  if (language === 'nepali') {
    return (
      'तपाईंले यो कुरा भन्नुभएकोमा धन्यवाद। म तपाईंको बारेमा चिन्तित छु, र तपाईंले यो एक्लै भोग्नुपर्दैन।\n\n' +
      'यदि तपाईं वा तपाईंको बच्चा अहिले खतरामा हुन सक्नुहुन्छ भने, कृपया तुरुन्तै नजिकको अस्पतालको आकस्मिक कक्षमा जानुहोस् वा नजिकका कसैलाई तपाईंसँगै बस्न भन्नुहोस्।\n\n' +
      'तपाईं अहिले नै कसैसँग कुरा गर्न सक्नुहुन्छ:\n' +
      HELPLINES.nepali
    );
  }
  return (
    "Thank you for telling me. I'm concerned about you, and you don't have to go through this alone.\n\n" +
    'If you or your baby could be in danger right now, please go to the nearest hospital emergency room, or ask someone near you to stay with you.\n\n' +
    'You can also talk to someone right now:\n' +
    HELPLINES.english
  );
}

/* ------------------------------------------------------------------ */
/* Intake answers                                                      */
/* ------------------------------------------------------------------ */

/**
 * Reads an age from a short reply such as "27", "27 years" or "२७".
 * status: ok (18-60) | minor (10-17) | check (over 60) | invalid
 */
export function parseAge(text) {
  const t = normalizeText(text);
  if (t.length === 0 || t.length > 40) return { status: 'invalid' };
  const numbers = t.match(/\d+/g) || [];
  if (numbers.length !== 1) return { status: 'invalid' };
  const age = parseInt(numbers[0], 10);
  if (age < 10) return { status: 'invalid' };
  if (age > 60) return { status: 'check', age };
  if (age < 18) return { status: 'minor', age };
  return { status: 'ok', age };
}

const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12
};

function daysBetween(year, month, day, now) {
  const born = Date.UTC(year, month - 1, day);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - born) / 86400000);
}

/**
 * Reads when the baby was born. Returns one of:
 *   { kind: 'not_born' } | { kind: 'skip' } | { kind: 'future' } | { kind: 'invalid' }
 *   { kind: 'ad', days }            a real calendar date (year/month/day)
 *   { kind: 'relative', days }      "3 weeks ago"
 *   { kind: 'bs', year, month, day } a Nepali (Bikram Sambat) date; the caller converts it
 */
export function parseBirthInput(text, now = new Date()) {
  const t = normalizeText(text).toLowerCase();
  if (!t || t.length > 60) return { kind: 'invalid' };

  if (/^(skip|pass|prefer not to say)$/.test(t)) return { kind: 'skip' };

  if (
    /^(no|not yet|nope|not born|not born yet)$/.test(t) ||
    /\b(pregnan|expecting)/.test(t) ||
    /\b(haven'?t|have not|has not|hasn'?t|not)\b.*\b(given birth|delivered|born|had (the|my) baby)\b/.test(t) ||
    /गर्भवती/.test(t)
  ) {
    return { kind: 'not_born' };
  }

  if (/^(today|just now)$/.test(t)) return { kind: 'relative', days: 0 };
  if (/^yesterday$/.test(t)) return { kind: 'relative', days: 1 };

  const rel = t.match(/^(?:about |around |almost )?(\d{1,3}|[a-z]+)\s*(days?|weeks?|wks?|months?|mos?|years?)(?:\s+ago)?$/);
  if (rel) {
    const amount = /^\d+$/.test(rel[1]) ? parseInt(rel[1], 10) : NUMBER_WORDS[rel[1]];
    if (amount !== undefined) {
      const unit = rel[2][0];
      const days = unit === 'd' ? amount : unit === 'w' ? amount * 7 : unit === 'm' ? Math.round(amount * 30.44) : amount * 365;
      return { kind: 'relative', days };
    }
  }

  const date = t.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (date) {
    const year = parseInt(date[1], 10);
    const month = parseInt(date[2], 10);
    const day = parseInt(date[3], 10);

    // Years from 2070 are Bikram Sambat: the Gregorian year 2070 is far in the future.
    if (year >= 2070 && year <= 2100) {
      if (month < 1 || month > 12 || day < 1 || day > 32) return { kind: 'invalid' };
      return { kind: 'bs', year, month, day };
    }

    const check = new Date(Date.UTC(year, month - 1, day));
    const real = check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
    if (!real || year < 1990) return { kind: 'invalid' };
    const days = daysBetween(year, month, day, now);
    return days < 0 ? { kind: 'future' } : { kind: 'ad', days };
  }

  return { kind: 'invalid' };
}

const TIPS = [
  [14, 'Consider traditional practices like warm oil massage (तेल मालिस) and follow the principle of सुत्केरी (postpartum rest period) by limiting visitors and accepting all help with meals and household tasks.'],
  [42, 'Continue with nutritious traditional soups like जवानो (thyme seed) and दुध (milk-based drinks) to aid recovery, and practice kangaroo care (skin-to-skin contact) with your baby.'],
  [84, 'Begin gentle exercise like short walks around your neighborhood and connect with other new mothers in your community for support and advice.'],
  [Infinity, "Make time for yourself daily, maintain consistent sleep routines, and consider joining mothers' groups at your local health post or community center."]
];

/** What to say once we know how old the baby is. `approximate` is true for converted Nepali dates. */
export function birthTimingMessage(days, { approximate = false } = {}) {
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30.44);
  let age;
  if (days < 14) age = `${days} day${days === 1 ? '' : 's'} old`;
  else if (weeks < 12) age = `${approximate ? 'about ' : ''}${weeks} weeks old`;
  else age = `about ${months} month${months === 1 ? '' : 's'} old`;

  const stage = days < 14 ? "You're in the critical early postpartum period." : days < 42 ? "You're still in the early postpartum period." : '';
  const tip = TIPS.find(([limit]) => days < limit)[1];
  const note = approximate ? ' (Nepali dates are converted approximately.)' : '';
  const older = days > 730
    ? ' The questions that follow are designed for the first months after birth, but you are welcome to answer them.'
    : '';
  return `Your baby is ${age}.${note} ${stage ? stage + ' ' : ''}${tip}${older}`;
}

/* ------------------------------------------------------------------ */
/* The Edinburgh Postnatal Depression Scale (EPDS)                     */
/* ------------------------------------------------------------------ */

// Items 1, 2 and 4 list the healthiest answer first (score 0,1,2,3 in the order shown).
// Items 3 and 5-10 list the most concerning answer first, so they are reverse scored (3,2,1,0).
// /report.html uses the same rule and the same cut-off.
const REVERSE_SCORED = [false, false, true, false, true, true, true, true, true, true];
export const EPDS_LENGTH = 10;
export const EPDS_CUTOFF = 10;

export const EPDS_QUESTIONS = {
  english: [
    { q: 'I have been able to laugh and see the funny side of things', a: ['As much as I always could', 'Not quite so much now', 'Definitely not so much now', 'Not at all'] },
    { q: 'I have looked forward with enjoyment to things', a: ['As much as I ever did', 'Rather less than I used to', 'Definitely less than I used to', 'Hardly at all'] },
    { q: 'I have blamed myself unnecessarily when things went wrong', a: ['Yes, most of the time', 'Yes, some of the time', 'Not very often', 'No, never'] },
    { q: 'I have been anxious or worried for no good reason', a: ['No, not at all', 'Hardly ever', 'Yes, sometimes', 'Yes, very often'] },
    { q: 'I have felt scared or panicky for no very good reason', a: ['Yes, quite a lot', 'Yes, sometimes', 'No, not much', 'No, not at all'] },
    { q: 'Things have been getting on top of me', a: ["Yes, most of the time I haven't been able to cope at all", "Yes, sometimes I haven't been coping as well as usual", 'No, most of the time I have coped quite well', 'No, I have been coping as well as ever'] },
    { q: 'I have been so unhappy that I have had difficulty sleeping', a: ['Yes, most of the time', 'Yes, sometimes', 'Not very often', 'No, not at all'] },
    { q: 'I have felt sad or miserable', a: ['Yes, most of the time', 'Yes, quite often', 'Not very often', 'No, not at all'] },
    { q: 'I have been so unhappy that I have been crying', a: ['Yes, most of the time', 'Yes, quite often', 'Only occasionally', 'No, never'] },
    { q: 'The thought of harming myself has occurred to me', a: ['Yes, quite often', 'Sometimes', 'Hardly ever', 'Never'] }
  ],
  // Please have a Nepali-speaking health professional check this translation.
  nepali: [
    { q: 'म हाँस्न सकेको छु र चीजहरूको रमाइलो पक्ष देख्न सकेको छु', a: ['जति म सधैं गर्न सक्थें', 'अहिले त्यति धेरै होइन', 'अहिले निश्चित रूपमा त्यति धेरै होइन', 'पटक्कै होइन'] },
    { q: 'मैले आनन्दका साथ कुराहरूको प्रतिक्षा गरेको छु', a: ['जति धेरै मैले सधैं गर्थें', 'पहिला भन्दा कम', 'पहिला भन्दा निश्चित रूपमा कम', 'लगभग छैन'] },
    { q: 'जब कुराहरू गलत भए मैले अनावश्यक रूपमा आफैलाई दोष दिएको छु', a: ['हो, धेरै जसो समय', 'हो, केही समय', 'धेरै पटक होइन', 'होइन, कहिल्यै होइन'] },
    { q: 'म कुनै राम्रो कारण बिना चिन्तित वा व्याकुल भएको छु', a: ['होइन, बिल्कुल होइन', 'धेरै कम', 'हो, कहिलेकाहीं', 'हो, धेरै पटक'] },
    { q: 'म कुनै खास राम्रो कारण बिना डराएको वा घबराएको महसुस गरेको छु', a: ['हो, धेरै', 'हो, कहिलेकाहीं', 'होइन, त्यति धेरै होइन', 'होइन, बिल्कुल होइन'] },
    { q: 'कुराहरू मेरो माथि पर्दै छन्', a: ['हो, धेरै जसो समय मैले सामना गर्न सकेको छैन', 'हो, कहिलेकाहीं म सामान्यतया सामना गर्न सक्दिन', 'होइन, धेरै जसो समय मैले राम्रोसँग सामना गरेको छु', 'होइन, मैले सधैंझैं सामना गरेको छु'] },
    { q: 'म यति दुखी भएको छु कि मलाई सुत्न गाह्रो भएको छ', a: ['हो, धेरै जसो समय', 'हो, कहिलेकाहीं', 'त्यति धेरै पटक होइन', 'होइन, बिल्कुल होइन'] },
    { q: 'मैले दुःखी वा निराश महसुस गरेको छु', a: ['हो, धेरै जसो समय', 'हो, धेरै पटक', 'त्यति धेरै पटक होइन', 'होइन, बिल्कुल होइन'] },
    { q: 'म यति दुखी भएको छु कि म रोएको छु', a: ['हो, धेरै जसो समय', 'हो, धेरै पटक', 'कहिलेकाहीं मात्र', 'होइन, कहिल्यै होइन'] },
    { q: 'आफूलाई हानि पुर्याउने विचार मलाई आएको छ', a: ['हो, धेरै पटक', 'कहिलेकाहीं', 'बिरलै', 'कहिल्यै होइन'] }
  ]
};

/** Accepts exactly "1" to "4" (also "२", "3." or "4)"). Anything else is not an answer. */
export function parseEpdsChoice(text) {
  const m = normalizeText(text).match(/^([1-4])[.)]?$/);
  return m ? parseInt(m[1], 10) : null;
}

/** Question text shown to the user. `index` is 0-based. */
export function formatEpdsQuestion(language, index) {
  const set = language === 'nepali' ? EPDS_QUESTIONS.nepali : EPDS_QUESTIONS.english;
  const item = set[index];
  const options = item.a.map((text, i) => `${i + 1}. ${text}`).join('\n');
  if (language === 'nepali') {
    return (
      `प्रश्न ${toNepaliDigits(index + 1)} / १०: ${item.q}\n\n${options}\n\n` +
      "कृपया तपाईंको उत्तरको नम्बर (१-४) लेख्नुहोस्। अघिल्लो उत्तर बदल्न 'back' टाइप गर्नुहोस्।"
    );
  }
  return (
    `Question ${index + 1} of ${EPDS_LENGTH}: ${item.q}\n\n${options}\n\n` +
    "Please reply with the number of your answer (1-4). Type 'back' to change your previous answer."
  );
}

export function epdsIntro(language) {
  if (language === 'nepali') {
    return 'म तपाईंलाई नेपाली भाषामा एडिनबर्ग पोस्टनेटल डिप्रेसन स्केल (EPDS) पूरा गर्न मद्दत गर्नेछु। यो प्रसवपछिको अवसादको लागि एक मान्य स्क्रिनिंग उपकरण हो। कृपया विगत ७ दिनमा तपाईंले कस्तो महसुस गर्नुभएको छ भन्ने बारे १० प्रश्नहरूको उत्तर दिनुहोस्। यो निदान होइन तर तपाईंलाई थप समर्थन आवश्यक पर्न सक्छ कि पहिचान गर्न मद्दत गर्न सक्छ।';
  }
  return "I'll help you complete the Edinburgh Postnatal Depression Scale (EPDS) in English. This is a validated screening tool for postpartum depression. Please answer 10 questions about how you've been feeling in the past 7 days. This is not a diagnosis but can help identify if you might need additional support.";
}

export const EPDS_LANGUAGE_PROMPT =
  'Before we begin the Edinburgh Postnatal Depression Scale (EPDS), please select your preferred language for the questionnaire:\n\n1. English\n2. नेपाली (Nepali)';

export function epdsPoints(index, answer) {
  return REVERSE_SCORED[index] ? 4 - answer : answer - 1;
}

/** answers: ten numbers, each 1-4. Returns the total (0-30), whether it reaches the cut-off, and the item 10 flag. */
export function scoreEpds(answers) {
  const score = answers.reduce((sum, answer, i) => sum + epdsPoints(i, answer), 0);
  // Any answer other than "Never" on item 10 needs a follow-up with a health professional.
  const selfHarm = answers.length === EPDS_LENGTH && epdsPoints(9, answers[9]) > 0;
  return { score, flagged: score >= EPDS_CUTOFF, selfHarm };
}

const WELLNESS_EN = `💪 WELLNESS TIPS:

🚶‍♀️ 1. Get Regular Exercise
Just 30 minutes of walking a day can lift your mood and improve your health. Even short bursts of movement throughout the day add up.

🥗 2. Eat Well & Stay Hydrated
Eat balanced meals regularly and drink plenty of water. Limit caffeine and alcohol if they affect your mood or sleep.

💤 3. Prioritize Sleep
Stick to a consistent sleep schedule. Avoid screens before bed, as blue light can interfere with falling asleep.

🧘‍♀️ 4. Practice Relaxation
Try meditation, deep breathing, or stretching. Schedule time for hobbies you enjoy, like music, reading, or nature walks.

📋 5. Set Goals & Priorities
Focus on what needs to be done now. Don't overload yourself. Celebrate small accomplishments.

🙏 6. Practice Gratitude
Take time each day to reflect on things you're thankful for—big or small. Writing them down can help.

😊 7. Stay Positive
Notice negative thoughts and try to reframe them with more balanced, helpful perspectives.

👥 8. Stay Connected
Reach out to friends or family. Social support is key for emotional resilience.`;

const WELLNESS_NE = `💪 स्वास्थ्य सुझावहरू:

🚶‍♀️ 1. नियमित व्यायाम गर्नुहोस्
दिनको 30 मिनेट हिंड्दा तपाईंको मनोदशा उठ्न र स्वास्थ्य सुधार हुन सक्छ।

🥗 2. राम्रो खानुहोस् र हाइड्रेटेड रहनुहोस्
नियमित रूपमा सन्तुलित खाना खानुहोस् र प्रशस्त पानी पिउनुहोस्।

💤 3. निद्रालाई प्राथमिकता दिनुहोस्
एक नियमित निद्रा तालिका अपनाउनुहोस्। सुत्नु अघि स्क्रिनबाट टाढा रहनुहोस्।

🧘‍♀️ 4. आराम अभ्यास गर्नुहोस्
ध्यान, गहिरो सास, वा स्ट्रेचिङ प्रयास गर्नुहोस्। तपाईंले मन पराउने शौकहरू जस्तै संगीत, पढ्ने वा प्रकृतिमा हिँड्नको लागि समय तालिका बनाउनुहोस्।

📋 5. लक्ष्य र प्राथमिकताहरू निर्धारण गर्नुहोस्
अहिले के गर्नु पर्छ त्यसमा ध्यान केन्द्रित गर्नुहोस्। आफैलाई अधिक बोझ नलगाउनुहोस्। साना उपलब्धिहरूको उत्सव मनाउनुहोस्।

🙏 6. कृतज्ञता अभ्यास गर्नुहोस्
हरेक दिन ती कुराहरूमा प्रतिबिम्बित गर्न समय लिनुहोस् जसको लागि तपाई कृतज्ञ हुनुहुन्छ।

😊 7. सकारात्मक रहनुहोस्
नकारात्मक विचारहरू याद गर्नुहोस् र तिनीहरूलाई अधिक सन्तुलित, सहायक दृष्टिकोणहरूसँग पुनः फ्रेम गर्ने प्रयास गर्नुहोस्।

👥 8. सम्पर्कमा रहनुहोस्
साथी वा परिवारलाई सम्पर्क गर्नुहोस्। सामाजिक समर्थन भावनात्मक लचिलोपनको लागि प्रमुख हो।`;

/** Short wellness tips plus helplines, for people who decline the questionnaire. */
export function wellnessAndHelplines() {
  return (
    "That's completely fine. Here are some wellness tips that might be helpful:\n\n" +
    WELLNESS_EN +
    '\n\nIf you ever feel you need professional support, here are some helplines in Nepal:\n\n' +
    HELPLINES.english +
    '\n\nType 1 to take the check-in later, or type "menu" to see what else I can help with.'
  );
}

/** The full reply shown after question 10. */
export function buildEpdsResults(answers, language = 'english') {
  const { score, flagged, selfHarm } = scoreEpds(answers);
  const nepali = language === 'nepali';

  const category = flagged
    ? (nepali ? 'सम्भावित अवसाद' : 'Possible depression')
    : (nepali ? 'सीमा भन्दा कम' : 'Below the usual cut-off');
  const emoji = flagged ? '🔴' : '🟢';

  let interpretation;
  let recommendation;
  if (flagged) {
    interpretation = nepali ? 'तपाईंको स्कोरले सम्भावित अवसाद देखाउँछ। ' : 'Your score indicates possible depression. ';
    recommendation = nepali
      ? 'यी भावनाहरूको बारेमा स्वास्थ्य सेवा प्रदायकसँग कुरा गर्न सिफारिस गरिन्छ। यो निदान होइन, तर तपाईंको जवाफले तपाईं पेशेवर समर्थनबाट लाभ लिन सक्नुहुन्छ भन्ने सुझाव दिन्छ।'
      : "It's recommended that you speak with a healthcare provider about these feelings. This is not a diagnosis, but your answers suggest you may benefit from professional support.";
  } else {
    interpretation = nepali
      ? 'तपाईंको स्कोर सम्भावित अवसादको लागि सामान्य रूपमा प्रयोग गरिने सीमा (१०) भन्दा कम छ। '
      : 'Your score is below the usual cut-off of 10 for possible depression. ';
    recommendation = nepali
      ? 'यो स्क्रिनिङले सबै कुरा पत्ता लगाउन सक्दैन, त्यसैले तपाईंलाई आफ्नो भावनाबारे चिन्ता लागेमा कृपया स्वास्थ्य सेवा प्रदायकसँग कुरा गर्नुहोस्। यस महत्त्वपूर्ण समयमा आफ्नो हेरचाह गर्न जारी राख्नुहोस्।'
      : "A screening can't rule anything out, so if you are worried about how you feel, please speak with a healthcare provider. Continue to look after yourself during this important time.";
  }

  const warning = selfHarm
    ? (nepali
        ? '\n\n⚠️ महत्वपूर्ण: प्रश्न १० मा तपाईंको प्रतिक्रियाले तपाईंलाई आफूलाई हानि पुर्याउने विचारहरू आएको हुन सक्छ भनेर सुझाव दिन्छ। यो स्कोर जतिसुकै भए पनि, कृपया तुरुन्तै स्वास्थ्य सेवा प्रदायकसँग कुरा गर्नुहोस् वा नेपाल राष्ट्रिय आत्महत्या रोकथाम हेल्पलाइन ११६६ मा सम्पर्क गर्नुहोस्।'
        : '\n\n⚠️ IMPORTANT: Your response to question 10 suggests you may have had thoughts of harming yourself. Whatever your total score, please speak with a healthcare provider immediately or contact a crisis helpline such as the Nepal National Suicide Prevention Helpline at 1166.')
    : '';

  const report = nepali
    ? '\n\n📄 <a href="/report.html" target="_blank" rel="noopener">तपाईंको नतिजाको छाप्न मिल्ने संस्करण खोल्नुहोस्</a>'
    : '\n\n📄 <a href="/report.html" target="_blank" rel="noopener">Open a printable version of your results</a>';

  if (nepali) {
    return (
      `एडिनबर्ग पोस्टनेटल डिप्रेसन स्केल (EPDS) पूरा गर्नुभएकोमा धन्यवाद।\n\nEPDS स्कोर: ${emoji} ${score}/30 - ${category}\n\n` +
      `${interpretation}${recommendation}${warning}\n\n` +
      'याद गर्नुहोस्, यो स्क्रिनिंग उपकरण निदान होइन तर तपाईंको भावनात्मक कल्याणको बारेमा छलफलहरूमा तपाईं र तपाईंको स्वास्थ्य सेवा प्रदायकलाई मार्गदर्शन गर्न मद्दत गर्न सक्छ।\n\n' +
      `${WELLNESS_NE}\n\n` +
      'अस्वीकरण: यो च्याटबोटले जानकारीमूलक समर्थन मात्र प्रदान गर्दछ र पेशेवर चिकित्सा सल्लाहको विकल्प होइन। चिकित्सा सम्बन्धी चिन्ताहरूका लागि सधैं तपाईंको स्वास्थ्य सेवा प्रदायकसँग परामर्श लिनुहोस्।\n\n' +
      `🔍 स्रोतहरू:\n${HELPLINES.nepali}\n\n` +
      `अर्को चरणमा के गर्ने हेर्न 'menu' टाइप गर्नुहोस्, वा नयाँ कुराकानीको लागि 'new' टाइप गर्नुहोस्।${report}`
    );
  }
  return (
    `Thank you for completing the Edinburgh Postnatal Depression Scale (EPDS).\n\nEPDS SCORE: ${emoji} ${score}/30 - ${category}\n\n` +
    `${interpretation}${recommendation}${warning}\n\n` +
    'Remember, this screening tool is not a diagnosis but can help guide you and your healthcare provider in discussions about your emotional wellbeing.\n\n' +
    `${WELLNESS_EN}\n\n` +
    'DISCLAIMER: This chatbot provides informational support only and is not a substitute for professional medical advice. Always consult with your healthcare provider for medical concerns.\n\n' +
    `🔍 RESOURCES:\n${HELPLINES.english}\n\n` +
    `Type 'menu' to see what else I can help with, or 'new' for a new conversation.${report}`
  );
}

/* ------------------------------------------------------------------ */
/* Free conversation: what the assistant will and will not talk about  */
/* ------------------------------------------------------------------ */

export const MENU_EN = [
  'I can help with these:',
  '',
  '1. Take the EPDS check-in (10 short questions)',
  '2. Learn about postpartum depression',
  '3. Check common postpartum symptoms',
  '4. Self-care tips',
  '5. Helplines in Nepal',
  '',
  'Type a number (1-5), or type "new" to start over.'
].join('\n');

export const MENU_NE = [
  'म यी कुराहरूमा सहयोग गर्न सक्छु:',
  '',
  '1. EPDS जाँच गर्ने (१० छोटा प्रश्न)',
  '2. प्रसवपछिको अवसादबारे जान्ने',
  '3. प्रसवपछिका सामान्य लक्षणहरू हेर्ने',
  '4. आफ्नो हेरचाहका सुझावहरू',
  '5. नेपालका हेल्पलाइनहरू',
  '',
  'नम्बर (1-5) लेख्नुहोस्, वा सुरुबाट सुरु गर्न "new" टाइप गर्नुहोस्।'
].join('\n');

export const PPD_INFO = {
  1: "What is Postpartum Depression?\n\nPostpartum depression is a serious mental health condition that can develop after childbirth. It can affect any new mother, occurring in about 1 in 7 births. It's more severe than the 'baby blues' and can interfere with daily functioning.",
  2: 'Causes of Postpartum Depression\n\nPostpartum depression can be caused by:\n• Hormonal changes after childbirth\n• Sleep deprivation and exhaustion\n• Overwhelming feelings about new responsibilities\n• History of depression or anxiety\n• Lack of support\n• Relationship or financial stress',
  3: 'Symptoms of Postpartum Depression\n\n• Persistent sadness or mood swings\n• Loss of interest in activities\n• Fatigue and sleep problems\n• Changes in appetite\n• Difficulty bonding with the baby\n• Anxiety or panic attacks\n• Feelings of worthlessness or guilt\n• Difficulty concentrating\n• Thoughts of harming yourself or your baby',
  4: 'Prevention Measures\n\n• Early screening during pregnancy\n• Building a support network\n• Creating a postpartum care plan\n• Regular communication with healthcare providers\n• Learning about PPD before giving birth\n• Setting up help for after baby arrives',
  5: 'Self-Care Tips\n\n• Get rest whenever possible\n• Accept help from family and friends\n• Eat regular, nutritious meals\n• Take breaks when feeling overwhelmed\n• Connect with other new mothers\n• Share your feelings with trusted people\n• Consider joining a support group'
};

export const PPD_TOPICS_PROMPT = [
  'What would you like to know:',
  '',
  '1. What is postpartum depression',
  '2. Causes of postpartum depression',
  '3. Symptoms of postpartum depression',
  '4. Prevention measures',
  '5. Self-care tips',
  '',
  'Please choose a number (1-5), type "menu" to go back, or type "new" to start a new conversation:'
].join('\n');

export const PREGNANCY_ENCOURAGEMENT =
  "Remember: You're doing great preparing for this journey. Every step you take to learn and prepare shows what a thoughtful parent you'll be. You've got this!";

export const SYMPTOM_MENU = [
  'I can help you look at common postpartum symptoms. Which area would you like to check?',
  '',
  '1. 😔 Emotional symptoms (mood, anxiety, etc.)',
  '2. 💭 Mental symptoms (concentration, memory, etc.)',
  '3. 💤 Sleep issues',
  '4. 💪 Physical recovery concerns',
  '5. 👥 Social or relationship changes',
  '',
  "Please choose a number (1-5), or type 'exit' to go back to the menu."
].join('\n');

const SYMPTOM_FOOTER = "Would you like to check another area? Enter a number 1-5, or type 'exit' to go back to the menu.";

export const SYMPTOM_AREAS = {
  1: `Here's a quick look at common emotional symptoms after birth. Have you experienced any of these in the past 2 weeks?\n\n• Persistent sadness or crying\n• Feeling overwhelmed, worthless, or excessively guilty\n• Loss of interest in activities you used to enjoy\n• Withdrawing from family and friends\n• Excessive worry or anxiety\n• Anger or irritability that seems out of proportion\n• Thoughts of harming yourself or your baby\n\nIf you're experiencing several of these symptoms, especially if they're intense or persistent, it's important to speak with your healthcare provider. Postpartum mood disorders are common and treatable.\n\n${SYMPTOM_FOOTER}`,
  2: `Here's a quick look at common mental symptoms after birth. Have you experienced any of these consistently?\n\n• Difficulty concentrating or making decisions\n• Forgetfulness or feeling mentally foggy\n• Racing thoughts that are difficult to control\n• Obsessive worries or intrusive thoughts\n• Difficulty focusing on tasks\n• Feeling detached or like you're "going through the motions"\n\nSome mental changes are normal due to hormones, sleep disruption, and adjustment to new responsibilities. However, if these symptoms significantly interfere with your daily functioning, consider discussing them with your healthcare provider.\n\n${SYMPTOM_FOOTER}`,
  3: `Here's a quick look at common sleep issues after birth. Are you experiencing any of these?\n\n• Difficulty falling asleep even when baby is sleeping\n• Waking up with anxiety even when baby hasn't woken you\n• Intense dreams or nightmares\n• Feeling unrested even after getting some sleep\n• Complete inability to nap or sleep when given the opportunity\n• Racing thoughts that prevent sleep\n\nWhile interrupted sleep is expected with a new baby, the issues above may indicate a sleep problem that could benefit from professional guidance. Sleep disruption can significantly impact your recovery and mental health.\n\n${SYMPTOM_FOOTER}`,
  4: `Here's a quick look at physical recovery concerns. Are you experiencing any of these beyond what your provider indicated as normal?\n\n• Pain or discomfort that isn't improving or is getting worse\n• Excessive or changing pattern of bleeding\n• Fever over 100.4°F (38°C)\n• Severe headache, especially with vision changes\n• Swelling, redness, or discharge from incisions\n• Difficulty urinating or painful urination\n• Chest pain or difficulty breathing\n\nAny concerning physical symptoms should be reported to your healthcare provider promptly. Physical recovery is individual, but certain symptoms need immediate medical attention.\n\n${SYMPTOM_FOOTER}`,
  5: `Here's a quick look at social and relationship changes. Have you noticed any of these since birth?\n\n• Feelings of isolation or disconnection from others\n• Significant strain in your relationship with your partner\n• Difficulty bonding with your baby\n• Feeling misunderstood by friends or family\n• Avoiding social situations you would normally enjoy\n• Feeling judged about your parenting choices\n\nChanges in relationships are normal after having a baby, but persistent difficulties may benefit from additional support. Parent groups, counseling, or even honest conversations with loved ones can help address these challenges.\n\n${SYMPTOM_FOOTER}`
};

/**
 * The numbered answers in one of the assistant's messages ("1. Yes", "2. No"), so the page can
 * offer them as buttons. Only a list that starts at 1 and counts up is used, and a single
 * numbered line is not a list. Returns [{ number, label }], or [] when there is no list.
 */
export function numberedOptions(text) {
  const options = [];
  for (const line of String(text).split('\n')) {
    const match = line.match(/^\s*(\d{1,2})[.)]\s+(.+?)\s*$/);
    if (!match) continue; // the question and the hints around the list
    if (Number(match[1]) !== options.length + 1) break;
    options.push({ number: options.length + 1, label: match[2] });
  }
  return options.length >= 2 ? options : [];
}

// Warning signs in the mother's body. Anything here gets the fixed "contact your health provider
// now" reply and never an open conversation. Leaning towards catching too much: a reply that
// sends her to a health worker for nothing costs little, a missed haemorrhage costs a lot.
const URGENT_PHYSICAL = [
  /\b(heavy bleeding|bleeding (a lot|heavily|too much)|soaking (a|through)|fever\w*|chest pain|can'?t breathe|seizure|faint(ed|ing)?|severe headache|blurred vision|swollen leg|pus|foul smell)\b/,
  // bleeding that will not stop, pads filling fast, large clots
  /\b(bleeding|blood)\b.{0,30}\b(won'?t|not|can'?t|cannot|isn'?t|hasn'?t)\b.{0,12}\bstop/,
  /\b(can'?t|cannot|unable to)\b.{0,25}\b(bleeding|blood)\b.{0,15}\bstop/,
  /\bpads?\b.{0,40}\b(every|each)\b.{0,15}\b(half|hour|minutes?|mins?)\b/,
  /\b(every|each)\b.{0,15}\b(half|hour|minutes?|mins?)\b.{0,40}\bpads?\b/,
  /\bclots?\b.{0,30}\b(big|large|size of|bigger|golf|egg|fist|lemon)\b|\b(big|large|golf|egg|fist|lemon)\b.{0,20}\bclots?\b/
];

// A baby who may be in danger right now. These get their own fixed reply ahead of everything
// else, even in a long message: a baby that is not breathing is not a question about information.
// Deliberately narrow: only the clearest emergencies. Other danger signs (will not feed, fast
// breathing, yellow skin) get the sourced list of newborn danger signs from /js/knowledge.js.
const URGENT_BABY = [
  /\b(baby|newborn|infant|child)\b.{0,40}\b(not breathing|stopped breathing|isn'?t breathing|not able to breathe|struggling to breathe|gasping|turning blue|turned blue|going blue|is blue|blue lips|limp|floppy|unresponsive|not responding|won'?t wake|can'?t wake|not waking|seizures?|convuls\w*)\b/,
  /\b(not breathing|stopped breathing|turning blue|turned blue|going blue|unresponsive|floppy|limp)\b.{0,30}\b(baby|newborn|infant)\b/,
  /\b(baby|newborn|infant)(\W+s)?\W+(lips|face|skin|body)\W+(are|is|look|looks|turned|turning|going)\W+(blue|grey|gray)\b/
];

/**
 * Decides what a free-text message is about. The assistant only answers topics it has
 * written, reviewed answers for. Everything else gets a polite "I can't help with that".
 *
 * Returns one of: empty, greeting, thanks, bye, yes, no, menu, menu_1..menu_5, epds,
 * symptoms, helpline, report, info_what, info_causes, info_symptoms, info_prevention,
 * info_selfcare, urgent_baby, urgent_medical, medication, feelings, related_other, offtopic.
 */
export function classifyMessage(text) {
  const t = normalizeText(text).toLowerCase();
  if (!t) return 'empty';

  if (URGENT_BABY.some((re) => re.test(t))) return 'urgent_baby';

  if (YES.test(t)) return 'yes';
  if (NO.test(t)) return 'no';
  if (/^[1-5]$/.test(t)) return `menu_${t}`;
  if (/^(menu|help|options|\?|मेनु|सहयोग)$/.test(t)) return 'menu';

  const short = t.split(' ').length <= 4;
  // \b does not work next to Devanagari letters, so the word ends where no other letter or mark follows
  if (short && /^(hi|hello|hey|namaste|namaskar|good (morning|afternoon|evening)|नमस्ते|नमस्कार)(?![\p{L}\p{M}])/u.test(t)) return 'greeting';
  if (short && /^(thanks|thank you|thankyou|thx|धन्यवाद)(?![\p{L}\p{M}])/u.test(t)) return 'thanks';
  if (short && /^(bye|goodbye|good night|see you)\b/.test(t)) return 'bye';

  // Topic answers must name the topic, so "what causes earthquakes" never gets a postpartum answer.
  const topic = '(ppd|postpartum|postnatal|post-natal|depression|baby blues)';
  if (new RegExp(`\\bwhat is ${topic}\\b|\\bbaby blues\\b|\\bppd\\b`).test(t)) return 'info_what';
  if (new RegExp(`\\bcauses? of ${topic}|\\bwhat causes ${topic}|\\bwhy (do|does|did|am|is) .*(depress|sad|cry)`).test(t)) return 'info_causes';
  if (new RegExp(`\\b(signs|symptoms) of ${topic}`).test(t)) return 'info_symptoms';
  if (new RegExp(`\\bprevent\\w*\\b.*${topic}|${topic}.*\\bprevent`).test(t)) return 'info_prevention';
  if (/\bself-?care\b|\bwellness\b|\bhow (can|do) i cope\b|\btips for (new )?(mothers?|moms?|mums?|postpartum|recovery|sleep|rest)\b/.test(t)) return 'info_selfcare';

  if (/\b(epds|edinburgh|questionnaire|screening|check-?in)\b|\b(take|start|begin|do) (the |a |my )?(test|quiz|check)\b/.test(t)) return 'epds';
  if (/\b(symptom|symptoms)\b|लक्षण/.test(t)) return 'symptoms';

  if (URGENT_PHYSICAL.some((re) => re.test(t))) return 'urgent_medical';
  if (/\b(medicine|medication|medicines|tablet|tablets|dose|dosage|antidepressants?|paracetamol|ibuprofen|pills?|injection)\b|औषधि|औषधी/.test(t)) return 'medication';

  if (/\b(helplines?|hotlines?|emergency|crisis|counsell?or|counsell?ing|therapist|who can i (call|talk to))\b|हेल्पलाइन|परामर्श/.test(t)) return 'helpline';
  if (/\b(report|results?|printable|print)\b|नतिजा|रिपोर्ट/.test(t)) return 'report';

  const feelings = /\b(sad|depress\w*|anxi\w*|worr\w*|cry\w*|tired|exhaust\w*|overwhelm\w*|lonely|alone|hopeless|worthless|guilt\w*|panic\w*|scared|afraid|angry|irritab\w*|stress\w*|can'?t sleep|no sleep|numb|empty|mood|feel(ing)? (low|down)|unhappy|miserable|not coping|can'?t cope|bonded|bonding)\b|उदास|दुःखी|दुखी|चिन्ता|रुन|थकान|थाकेको|निद्रा|डर|तनाव|एक्लो/;
  if (feelings.test(t)) return 'feelings';

  const related = /\b(baby|babies|newborn|infant|breast ?feed\w*|feeding|latch\w*|nursing|colic|nappy|diaper|postpartum|postnatal|after birth|delivery|labou?r|c-?section|stitches|recovery|pregnan\w*|mother|mom|mum|motherhood|partner|husband|wife|in-?laws|family)\b|बच्चा|शिशु|नानी|सुत्केरी|प्रसव|आमा/;
  if (related.test(t)) return 'related_other';

  return 'offtopic';
}

const OFFTOPIC_EN = "I'm sorry, I can't help with that. I'm here only for postpartum wellbeing: how you are feeling, the EPDS check-in, and where to find help.";
const OFFTOPIC_NE = 'माफ गर्नुहोस्, म त्यसमा सहयोग गर्न सक्दिन। म प्रसवपछिको कल्याणको लागि मात्र यहाँ छु: तपाईंले कस्तो महसुस गरिरहनुभएको छ, EPDS जाँच, र सहयोग कहाँ पाउने।';

/** Replies for the topics that do not need any conversation state. Returns null when the caller should handle it. */
/**
 * Which messages the open conversation hands to the AI model instead of a fixed reply.
 *
 * The AI takes what is conversation: greetings, thanks, goodbyes, how someone feels, questions
 * about the baby and family, and anything off topic (which it declines kindly). Everything that
 * has a reviewed answer or a safety reply stays with the fixed replies: the check-in and symptom
 * check, the helplines, the printable report, the five information topics, urgent physical
 * symptoms and medicines. Crisis messages are never given to the AI by this page at all.
 *
 * Once the AI has just spoken, a short "yes", "no" or a number is an answer to what the AI asked,
 * not a menu choice, so those go to it as well.
 */
export function wantsAssistant(kind, { afterAssistant = false } = {}) {
  if (['greeting', 'thanks', 'bye', 'feelings', 'related_other', 'offtopic'].includes(kind)) return true;
  return afterAssistant && ['yes', 'no', 'menu_1', 'menu_2', 'menu_3', 'menu_4', 'menu_5'].includes(kind);
}

export function replyFor(kind, language = 'english') {
  const ne = language === 'nepali';
  const menu = ne ? MENU_NE : MENU_EN;
  switch (kind) {
    case 'greeting':
      return `Hello, I'm Sutkeri, your postpartum support companion.\n\n${menu}`;
    case 'thanks':
      return `You're welcome. I'm here whenever you need me.\n\n${menu}`;
    case 'bye':
      return "Take care of yourself. I'm here whenever you want to talk again.";
    case 'menu':
      return menu;
    case 'no':
      return `That's okay. Whenever you're ready, choose an option below.\n\n${menu}`;
    case 'helpline':
    case 'menu_5':
      return `If you need to talk to someone, these helplines are available in Nepal:\n\n${HELPLINES[ne ? 'nepali' : 'english']}\n\nIf you or your baby may be in danger right now, please go to the nearest hospital emergency room.`;
    case 'report':
      return 'After you finish the 10 questions, I will show your score and a link to a printable results page you can bring to your healthcare provider.\n\nType 1 to take the check-in now.';
    case 'feelings':
      return "I'm sorry you're feeling this way, and thank you for telling me. Many new mothers go through this, and it deserves attention. I can't tell what is causing it from a message, but a short screening can show how you've been feeling over the past week.\n\nWould you like to take it now? Type 'yes' to begin, or 'menu' to see other options.";
    case 'urgent_baby':
      return "This sounds like an emergency for your baby. Please take your baby to the nearest hospital emergency room right now, or ask someone near you to help you get there. Please do not wait to see if it passes.";
    case 'urgent_medical':
      return "Some physical symptoms after birth can be serious, and I can't assess them. Please contact your healthcare provider or go to the nearest hospital as soon as possible.";
    case 'medication':
      return "I can't advise on medicines or doses. Please ask your doctor, midwife or pharmacist, especially if you are breastfeeding.";
    case 'related_other':
      return `That's an important question, but I can't give advice on it. Please ask your doctor, midwife or health worker.\n\n${menu}`;
    case 'offtopic':
      return `${ne ? OFFTOPIC_NE : OFFTOPIC_EN}\n\n${menu}`;
    default:
      return null;
  }
}
