// Questions for checking that the right answer is found, and that no answer is found when none
// would be right. Each is [what a person might type, the entry that should answer it, or null].
//
// null matters as much as an id: a wrong answer to a health question is worse than "ask a health
// worker". The "null" questions are of four kinds, marked in the comments: a topic that is not
// written yet, a message with its own safety reply, a different meaning of the same words, and
// something that is not about health at all.
//
// Used by test/knowledge.test.js, and by the review pack, which shows the reviewers what was asked and what each question gets.
export const EVAL = [
  // --- what postnatal depression is
  ['What is postnatal depression?', 'what-is-ppd'],
  ['what is PPD', 'what-is-ppd'],
  ['What is postpartum depression', 'what-is-ppd'],
  ['Tell me about postpartum depression', 'what-is-ppd'],
  ['Can you explain postnatal depression to me?', 'what-is-ppd'],
  ['What does PPD mean?', 'what-is-ppd'],
  ['When does postnatal depression start?', 'what-is-ppd'],
  ['Can I get depressed months after the birth?', 'what-is-ppd'],

  // --- the baby blues
  ['What are the baby blues?', 'baby-blues'],
  ['how long do the baby blues last', 'baby-blues'],
  ['Are the baby blues normal?', 'baby-blues'],
  ['I feel tearful and emotional since the birth.', 'baby-blues'],
  ['feeling down after birth', 'baby-blues'],

  // --- signs of postnatal depression
  ['What are the symptoms of postnatal depression?', 'ppd-symptoms'],
  ['signs of postpartum depression', 'ppd-symptoms'],
  ['What does postnatal depression feel like?', 'ppd-symptoms'],
  ['postnatal depression symptoms', 'ppd-symptoms'],
  ['How do I know if I have postnatal depression?', 'ppd-symptoms'],
  ['what are the warning signs of PPD', 'ppd-symptoms'],

  // --- getting help
  ['Do I have postpartum depression?', 'ppd-get-help'],
  ['I think I have postnatal depression. What should I do?', 'ppd-get-help'],
  ['How long does postnatal depression last?', 'ppd-get-help'],
  ['Does postpartum depression go away?', 'ppd-get-help'],
  ['Who can help with postnatal depression?', 'ppd-get-help'],
  ['Am I depressed after giving birth?', 'ppd-get-help'],

  // --- treatment
  ['How is postnatal depression treated?', 'ppd-treatment'],
  ['What is the treatment for postpartum depression?', 'ppd-treatment'],
  ['Can postnatal depression be cured?', 'ppd-treatment'],
  ['Is there therapy for postnatal depression?', 'ppd-treatment'],

  // --- fathers and partners
  ['Can fathers get postnatal depression?', 'ppd-partners'],
  ['My husband seems depressed since the baby came.', 'ppd-partners'],
  ['Do men get postpartum depression too?', 'ppd-partners'],
  ['can a partner get depression after a baby', 'ppd-partners'],

  // --- how common
  ['How common is postnatal depression?', 'how-common-ppd'],
  ['Is postpartum depression common?', 'how-common-ppd'],
  ['How many women get depression after birth?', 'how-common-ppd'],
  ['How many mothers have mental health problems after a baby?', 'how-common-ppd'],

  // --- postpartum psychosis
  ['What is postpartum psychosis?', 'postpartum-psychosis'],
  ['I keep seeing things that are not there since the birth.', 'postpartum-psychosis'],
  ['She is hearing voices since the baby was born.', 'postpartum-psychosis'],
  ['What are the signs of postnatal psychosis?', 'postpartum-psychosis'],

  // --- the Edinburgh scale
  ['What does my EPDS score mean?', 'epds-meaning'],
  ['What is the Edinburgh Postnatal Depression Scale?', 'epds-meaning'],
  ['Is the EPDS accurate?', 'epds-meaning'],
  ['what is the epds', 'epds-meaning'],

  // --- postnatal checkups
  ['How many postnatal checkups should I have?', 'postnatal-checkups'],
  ['When are the postnatal visits?', 'postnatal-checkups'],
  ['When is the 6 week check?', 'postnatal-checkups'],
  ['When should I see a doctor after giving birth?', 'postnatal-checkups'],
  ['Will someone visit me at home after the birth?', 'postnatal-checkups'],

  // --- hospital stay
  ['How long should I stay in hospital after the birth?', 'hospital-stay'],
  ['How soon can I go home after delivery?', 'hospital-stay'],

  // --- the newborn
  ['What are the danger signs in a newborn?', 'newborn-danger-signs'],
  ['When should I worry about my baby?', 'newborn-danger-signs'],
  ["My baby won't feed.", 'newborn-danger-signs'],
  ['My baby is not feeding well', 'newborn-danger-signs'],
  ["My baby is very sleepy and won't feed since morning.", 'newborn-danger-signs'],
  ["My baby's skin looks yellow.", 'newborn-danger-signs'],
  ['newborn jaundice', 'newborn-danger-signs'],
  ['My baby is breathing fast', 'newborn-danger-signs'],
  ['my baby feels cold', 'newborn-danger-signs'],
  ['When should I take my baby to the hospital?', 'newborn-danger-signs'],

  // --- breastfeeding
  ['How long should I breastfeed?', 'exclusive-breastfeeding'],
  ['What is exclusive breastfeeding?', 'exclusive-breastfeeding'],
  ['When should I start solid food?', 'exclusive-breastfeeding'],
  ['When should I start breastfeeding after the birth?', 'exclusive-breastfeeding'],
  ['What are the benefits of breastfeeding?', 'breastfeeding-benefits'],
  ['Why should I breastfeed?', 'breastfeeding-benefits'],
  ['Is breastfeeding good for my baby?', 'breastfeeding-benefits'],
  ['What is skin-to-skin contact?', 'skin-to-skin'],
  ['kangaroo care', 'skin-to-skin'],

  // --- the mother's body
  ['How long does bleeding last after giving birth?', 'lochia'],
  ['What is lochia?', 'lochia'],
  ['Is bleeding after delivery normal?', 'lochia'],
  ['Why do I have tummy pain after birth?', 'lochia'],
  ['When should I worry about bleeding after birth?', 'bleeding-warning-signs'],
  ['Is it normal to pass blood clots after birth?', 'bleeding-warning-signs'],
  ['My bleeding smells strange. Is that a problem?', 'bleeding-warning-signs'],
  ['What happens at a postnatal checkup?', 'maternal-checks'],
  ['What will the nurse check at my 6 week check?', 'maternal-checks'],
  ['What is the 6 week check?', 'maternal-checks'],
  ['Will they check for depression at my postnatal visits?', 'postnatal-mood-checks'],
  ['Is there screening for postnatal depression?', 'postnatal-mood-checks'],

  // --- feelings in words
  ['I am not bonding with my baby.', 'bonding-difficulty'],
  ["I don't feel any love for my baby", 'bonding-difficulty'],
  ["I can't bond with my baby", 'bonding-difficulty'],
  ['I feel anxious all the time since the baby was born.', 'postnatal-anxiety'],
  ['I keep worrying constantly since the birth.', 'postnatal-anxiety'],
  ['postnatal anxiety', 'postnatal-anxiety'],

  // --- null: a topic that is not written yet. These must not get a nearby answer.
  ['Tell me about postnatal diet', null],
  ['Can postnatal depression harm my baby?', null],
  ['What causes postnatal depression?', null],
  ['Can I give my baby water?', null],
  ['How much should my newborn weigh?', null],
  ['When can I start exercising after birth?', null],
  ['How do I stop my baby crying?', null],
  ['When will my periods come back?', null],
  ['Is it normal to cry a lot after having a baby?', null],

  // --- null: a message that has its own safety reply or flow
  ['I have heavy bleeding', null],
  ['I have a fever and my stitches hurt', null],
  ['Can I take paracetamol for my headache?', null],
  ['Is it safe to take antidepressants while breastfeeding?', null],
  ['I want to take the EPDS', null],
  ['start the check-in', null],
  ['hi', null],
  ['thanks', null],
  ['yes', null],
  ['3', null],
  ['I want to end my life', null],

  // --- null: the same words with another meaning, or a situation the entries are not written for
  ['My baby is turning blue', null],
  ['My baby looks blue', null],
  ['I have dry skin after the birth', null],
  ['My baby cried a lot after birth', null],
  ['How long should I stay in hospital after a caesarean?', null],
  ['I lost my baby and I feel so sad', null],
  ['How long does bleeding last after a miscarriage?', null],
  ['Is breastfeeding safe with HIV?', null],
  ['Can twins be breastfed exclusively?', null],

  // --- null: not about health
  ['What is the capital of Nepal?', null],
  ['How do I cook dal bhat?', null],
  ['What is the weather like today?', null],
  ['how to treat diabetes', null],
  ['', null],
  ['What is postnatal depression? '.repeat(20).trim(), null]
];
