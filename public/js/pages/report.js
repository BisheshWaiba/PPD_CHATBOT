document.addEventListener('DOMContentLoaded', function () {
  const user = MOMAuth.getUser();

  /* ---------- EPDS questions (English). "reverse" items score 3,2,1,0 ---------- */
  const QUESTIONS = [
    { q: 'I have been able to laugh and see the funny side of things', reverse: false,
      a: ['As much as I always could', 'Not quite so much now', 'Definitely not so much now', 'Not at all'] },
    { q: 'I have looked forward with enjoyment to things', reverse: false,
      a: ['As much as I ever did', 'Rather less than I used to', 'Definitely less than I used to', 'Hardly at all'] },
    { q: 'I have blamed myself unnecessarily when things went wrong', reverse: true,
      a: ['Yes, most of the time', 'Yes, some of the time', 'Not very often', 'No, never'] },
    { q: 'I have been anxious or worried for no good reason', reverse: false,
      a: ['No, not at all', 'Hardly ever', 'Yes, sometimes', 'Yes, very often'] },
    { q: 'I have felt scared or panicky for no very good reason', reverse: true,
      a: ['Yes, quite a lot', 'Yes, sometimes', 'No, not much', 'No, not at all'] },
    { q: 'Things have been getting on top of me', reverse: true,
      a: ["Yes, most of the time I haven't been able to cope at all", "Yes, sometimes I haven't been coping as well as usual", 'No, most of the time I have coped quite well', 'No, I have been coping as well as ever'] },
    { q: 'I have been so unhappy that I have had difficulty sleeping', reverse: true,
      a: ['Yes, most of the time', 'Yes, sometimes', 'Not very often', 'No, not at all'] },
    { q: 'I have felt sad or miserable', reverse: true,
      a: ['Yes, most of the time', 'Yes, quite often', 'Not very often', 'No, not at all'] },
    { q: 'I have been so unhappy that I have been crying', reverse: true,
      a: ['Yes, most of the time', 'Yes, quite often', 'Only occasionally', 'No, never'] },
    { q: 'The thought of harming myself has occurred to me', reverse: true,
      a: ['Yes, quite often', 'Sometimes', 'Hardly ever', 'Never'] }
  ];

  // Same scoring as /js/chatbot-client.js. Answers are numbers 1-4.
  function pointsFor(index, answer) {
    return QUESTIONS[index].reverse ? 4 - answer : answer - 1;
  }

  /* ---------- Read the saved questionnaire ---------- */
  let answers = null;
  try { answers = JSON.parse(localStorage.getItem('epdsAnswers')); } catch (e) { answers = null; }

  const complete = Array.isArray(answers) && answers.length === QUESTIONS.length &&
    answers.every(n => Number.isInteger(n) && n >= 1 && n <= 4);
  if (!complete) return; // the "No results yet" state stays visible

  // Recalculate from the answers so the report never depends on an older saved score
  const points = answers.map((a, i) => pointsFor(i, a));
  const score = points.reduce((sum, p) => sum + p, 0);
  const flagged = score >= 10;
  // Any answer except "Never" on item 10 needs a follow-up with a health professional,
  // whatever the total score. Same rule as /js/chat-logic.js.
  const selfHarmFlag = points[9] > 0;

  /* ---------- Fill in the page ---------- */
  document.getElementById('empty').hidden = true;
  document.getElementById('report').hidden = false;

  const meta = ['Edinburgh Postnatal Depression Scale (EPDS)'];
  const completedAt = localStorage.getItem('epdsCompletedAt');
  if (completedAt && !isNaN(new Date(completedAt))) {
    meta.push('Completed ' + new Date(completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }));
  }
  if (user && user.name) meta.push('Prepared for ' + user.name);
  document.getElementById('report-meta').textContent = meta.join(' · ');

  const card = document.getElementById('score-card');
  card.classList.add(flagged ? 'is-flag' : 'is-ok');
  document.getElementById('score-num').textContent = score;
  document.getElementById('score-category').textContent = flagged ? 'Possible depression' : 'Below the usual cut-off';
  document.getElementById('score-icon').setAttribute('href', flagged ? '#i-alert' : '#i-check-circle');
  document.getElementById('score-text').textContent = flagged
    ? "Your score indicates possible depression. It's recommended that you speak with a healthcare provider about these feelings. This is not a diagnosis, but your answers suggest you may benefit from professional support."
    : "Your score is below the usual cut-off of 10 for possible depression. A screening can't rule anything out, so if you are worried about how you feel, please speak with a healthcare provider. Continue to look after yourself during this important time.";

  // Marker position on the 0-30 scale (31 possible scores)
  document.getElementById('scale-marker').style.left = ((score + 0.5) / 31 * 100) + '%';
  document.getElementById('scale').setAttribute('aria-label',
    'Score ' + score + ' out of 30. A score of 10 or more suggests speaking with a healthcare provider.');

  document.getElementById('safety').hidden = !selfHarmFlag;

  if (localStorage.getItem('epdsLanguage') === 'nepali') {
    document.getElementById('answers-note').textContent =
      'You took the questionnaire in Nepali. The questions are shown here in English. Each answer is scored from 0 to 3 points, and the points add up to your score out of 30.';
  }

  const list = document.getElementById('answers');
  QUESTIONS.forEach(function (item, i) {
    const row = document.createElement('li');
    row.className = 'answer-row' + (i === 9 && selfHarmFlag ? ' is-flag' : '');

    const num = document.createElement('span');
    num.className = 'answer-num';
    num.textContent = i + 1;

    const text = document.createElement('div');
    const q = document.createElement('p');
    q.className = 'answer-q';
    q.textContent = item.q;
    const a = document.createElement('p');
    a.className = 'answer-a';
    a.textContent = item.a[answers[i] - 1];
    text.append(q, a);

    const pts = document.createElement('span');
    pts.className = 'answer-pts';
    pts.textContent = points[i] + (points[i] === 1 ? ' point' : ' points');

    row.append(num, text, pts);
    list.appendChild(row);
  });

  document.getElementById('print-btn').addEventListener('click', function () { window.print(); });
});
