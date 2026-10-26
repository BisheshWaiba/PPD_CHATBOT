// Sourced answers to health questions: a small, reviewed knowledge base and the code that finds the
// right entry for a question. No DOM and no storage here, so it can be tested in Node, and the
// chat page uses the very same code (see test/knowledge.test.js).
//
// WHY THIS AND NOT THE AI
// A health answer has to be right, and has to say where it comes from. So these answers are written
// in advance, each one from named sources that were actually read (see SOURCES), and a question is
// matched to an entry by plain rules. Nothing is invented at the moment of asking, and a question
// that is not covered gets an honest "ask a health worker" rather than a guess.
//
// STATUS: every entry is a DRAFT until a clinician has read it against its sources and signed it
// (reviewedBy, reviewedOn). `npm run check:production` refuses to pass while any entry is unsigned.
//
// Rules for every entry:
//   - It says only what its sources say, in plain words. Where it adapts something to Nepal it says
//     so in `adaptation`, so the reviewer can check it. No UK phone numbers: they would be wrong here.
//   - It never diagnoses and never tells a person what medicine to take or stop.
//   - Anything urgent is sent to a health worker or the hospital first.
import { HELPLINES } from './chat-logic.js';

export const ACCESSED = '26 October 2026';

export const SOURCES = {
  'nhs-pnd': {
    label: 'NHS: Post-natal depression',
    org: 'NHS (UK)',
    title: 'Post-natal depression',
    url: 'https://www.nhs.uk/mental-health/conditions/post-natal-depression/',
    dated: 'page last reviewed 18 March 2026'
  },
  'nhs-psychosis': {
    label: 'NHS: Postpartum psychosis',
    org: 'NHS (UK)',
    title: 'Postpartum psychosis',
    url: 'https://www.nhs.uk/mental-health/conditions/post-partum-psychosis/',
    dated: 'page last reviewed 18 October 2023'
  },
  'nhs-early-days': {
    label: 'NHS: Early days after the birth',
    org: 'NHS (UK)',
    title: 'Early days',
    url: 'https://www.nhs.uk/pregnancy/labour-and-birth/early-days/',
    dated: 'page last reviewed 27 January 2026'
  },
  'who-news-2022': {
    label: 'WHO: quality care in the first weeks after childbirth (2022)',
    org: 'World Health Organization',
    title: 'WHO urges quality care for women and newborns in critical first weeks after childbirth',
    url: 'https://www.who.int/news/item/30-03-2022-who-urges-quality-care-for-women-and-newborns-in-critical-first-weeks-after-childbirth',
    dated: '30 March 2022'
  },
  'who-perinatal-mh-2022': {
    label: 'WHO: perinatal mental health (2022)',
    org: 'World Health Organization',
    title: 'Launch of the WHO guide for integration of perinatal mental health',
    url: 'https://who.int/news/item/19-09-2022-launch-of-the-who-guide-for-integration-of-perinatal-mental-health',
    dated: '19 September 2022'
  },
  'who-feeding': {
    label: 'WHO: infant and young child feeding',
    org: 'World Health Organization',
    title: 'Infant and young child feeding (fact sheet)',
    url: 'https://www.who.int/news-room/fact-sheets/detail/infant-and-young-child-feeding',
    dated: 'fact sheet dated 4 August 2026, read on ' + ACCESSED
  },
  'who-2013-brief': {
    label: 'WHO 2013 postnatal care recommendations (summary)',
    org: 'World Health Organization (summarised by the USAID Maternal and Child Survival Program, April 2015)',
    title: 'Postnatal Care for Mothers and Newborns: Highlights from the World Health Organization 2013 Guidelines',
    url: 'https://www.who.int/docs/default-source/mca-documents/nbh/brief-postnatal-care-for-mothers-and-newborns-highlights-from-the-who-2013-guidelines.pdf',
    dated: 'April 2015, of the WHO 2013 recommendations'
  },
  'bhusal-2016': {
    label: 'Study of the Nepali Edinburgh scale, Kathmandu (2016)',
    org: 'Bhusal et al., International Journal of Mental Health Systems 10:71',
    title: 'Validating the Edinburgh Postnatal Depression Scale as a screening tool for postpartum depression in Kathmandu, Nepal',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5073833/',
    dated: '2016'
  }
};

// The WHO guideline these summaries point back to. Not cited to mothers (its full text could not be
// read while this was written), but a reviewer should check the 2013 figures against it.
export const WHO_GUIDELINE_2022 = {
  title: 'WHO recommendations on maternal and newborn care for a positive postnatal experience',
  url: 'https://www.who.int/publications/i/item/9789240045989',
  dated: '30 March 2022'
};

const FIND_HELP = 'a doctor, midwife or other health worker (in Nepal, at your nearest health post or hospital)';

export const ENTRIES = [
  {
    id: 'what-is-ppd',
    title: 'What postnatal depression is, and when it can start',
    keywords: ['what postnatal depression', 'postnatal depression mean', 'postnatal depression start', 'postnatal depression begin', 'depressed months after birth'],
    aliases: ['What is postnatal depression?', 'What is postpartum depression?', 'What does PPD mean?', 'When can postnatal depression start?', 'Can I get depressed months after the birth?'],
    answer: 'Postnatal depression (also called postpartum depression) is a common mental health condition that can happen after having a baby. It usually improves with treatment.\n\nIt can start during pregnancy, soon after the birth, or at any time up to a year afterwards.',
    sources: ['nhs-pnd'],
    adaptation: null,
    clinical: null
  },
  {
    id: 'baby-blues',
    title: 'The baby blues',
    keywords: ['baby blues', 'tearful after birth', 'emotional after birth', 'moody after birth', 'weepy after birth', 'down after birth', 'upset after birth', 'low mood after birth', 'baby blues postnatal depression', 'difference baby blues', 'baby blues go away'],
    aliases: ['What are the baby blues?', 'How long do the baby blues last?', 'What is the difference between the baby blues and postnatal depression?', 'I feel tearful and emotional since the birth.'],
    answer: 'Feeling down, anxious or irritable for a few days after the birth is common. It is called the baby blues, and it usually goes away within 2 weeks of the birth.\n\nIf these feelings start later, last longer than 2 weeks, get worse, or you are struggling to cope, it could be postnatal depression. Please speak to ' + FIND_HELP + ' as soon as you can.\n\nWHO advises that health workers ask every woman at the 10 to 14 day visit whether the blues have passed.',
    sources: ['nhs-pnd', 'nhs-early-days', 'who-2013-brief'],
    adaptation: 'The NHS says "GP, midwife or health visitor"; written as "doctor, midwife or other health worker" for Nepal.',
    clinical: null
  },
  {
    id: 'ppd-symptoms',
    title: 'Signs of postnatal depression',
    keywords: ['symptoms of postnatal depression', 'postnatal depression symptoms', 'signs of postnatal depression', 'postnatal depression signs', 'warning signs of postnatal depression', 'symptoms of depression after birth', 'signs of depression after birth', 'how to know if i have postnatal depression', 'postnatal depression feel', 'what symptoms of postnatal depression', 'what signs of postnatal depression', 'what postnatal depression feel'],
    aliases: ['What are the symptoms of postnatal depression?', 'What are the signs of postpartum depression?', 'How do I know if I have postnatal depression?', 'What does postnatal depression feel like?'],
    answer: 'The NHS lists these signs of postnatal depression:\n\n• Low mood, and trouble enjoying things\n• Feeling hopeless, or unable to cope\n• Guilt, worthlessness, or feeling like a bad parent\n• Fear, anxiety, or constant worry\n• Restlessness or irritability\n• Trouble sleeping, even when you have the chance to rest\n• Trouble concentrating or making decisions\n• Difficult feelings about your baby, or trouble bonding with them\n• Thoughts of suicide, or of harming yourself or your baby\n\nYou do not need to have all of them. If you have some, it is worth asking for help.\n\nIf you have thoughts of suicide, or of harming yourself or your baby, please tell someone near you now, and go to the nearest hospital emergency room. You can also call:\n{{HELPLINES}}',
    sources: ['nhs-pnd'],
    adaptation: 'The NHS page points to UK services for urgent help. Replaced with this app\'s own Nepal helplines and "nearest hospital emergency room".',
    clinical: null
  },
  {
    id: 'ppd-get-help',
    title: 'What to do if you think you have postnatal depression, and how long it lasts',
    keywords: ['have postnatal depression', 'depressed after birth', 'postnatal depression last', 'postnatal depression go away', 'postnatal depression get better', 'postnatal depression long', 'who help postnatal depression', 'where help postnatal depression', 'what should i do about postnatal depression'],
    aliases: ['I think I have postnatal depression. What should I do?', 'Do I have postnatal depression?', 'How long does postnatal depression last?', 'Does postnatal depression go away?', 'Who can help with postnatal depression?'],
    answer: 'I cannot tell you whether you have postnatal depression. Only a health professional can do that. But if you think you might have it, please speak to ' + FIND_HELP + '. You can ask for help even if you only have some of the signs.\n\nIt usually improves with treatment. The NHS says it usually gets better within 3 to 6 months, though it can last longer.\n\nThe check-in in this chat can show how you have been feeling, and you can take the result to a health worker.',
    sources: ['nhs-pnd'],
    adaptation: 'Written for Nepal ("health worker at your nearest health post or hospital"). The first sentence ("I cannot tell you whether you have it") and the last paragraph about the check-in are this app\'s own wording.',
    clinical: 'The NHS page says it usually gets better in 3 to 6 months. Please check that this is stated with treatment in the source and that the wording here does not over-promise.'
  },
  {
    id: 'ppd-treatment',
    title: 'How postnatal depression is treated',
    keywords: ['treat postnatal depression', 'cure postnatal depression', 'therapy postnatal depression', 'treat depression after birth', 'cbt', 'talking therapy'],
    aliases: ['How is postnatal depression treated?', 'What treatment is there for postnatal depression?', 'Is there therapy for postnatal depression?', 'Can postnatal depression be cured?'],
    answer: 'The NHS names two main kinds of treatment: talking therapies, such as cognitive behavioural therapy (CBT), and antidepressant medicine. A doctor decides what is right for each person.\n\nIf you are breastfeeding, tell the doctor. The NHS says many antidepressants are safe to use while breastfeeding, but that is for your doctor to advise you on, not for this chat.\n\nPlease speak to ' + FIND_HELP + ' about what is available to you.',
    sources: ['nhs-pnd'],
    adaptation: 'The NHS page also describes UK self-referral to talking therapies; left out because it does not apply in Nepal.',
    clinical: 'This mentions antidepressants and breastfeeding in a general way, and sends the person to a doctor. The app\'s rule is that the chat gives no medicine advice. Please decide whether this sentence should stay.'
  },
  {
    id: 'ppd-partners',
    title: 'Postnatal depression in fathers and partners',
    keywords: ['father depressed', 'husband depressed', 'partner depressed', 'dad depressed', 'men postnatal depression', 'father postnatal depression', 'husband postnatal depression', 'partner postnatal depression', 'dad postnatal depression', 'husband sad since baby', 'father sad since baby'],
    aliases: ['Can fathers get postnatal depression?', 'My husband seems depressed since the baby came. Is that possible?', 'Can partners get depression after a baby?'],
    answer: 'Yes. The NHS says fathers and partners can also have depression after having a baby.\n\nIf a partner feels low, anxious or unable to cope, it is worth speaking to ' + FIND_HELP + '. WHO also recommends that partners are encouraged to take part in the postnatal checkups.',
    sources: ['nhs-pnd', 'who-news-2022'],
    adaptation: 'The second sentence applies the NHS advice to a partner; the NHS page speaks to the mother.',
    clinical: null
  },
  {
    id: 'how-common-ppd',
    title: 'How common mental health problems are after birth',
    keywords: ['common postnatal depression', 'many women postnatal depression', 'many women depression after birth', 'many mothers depression after birth', 'many mothers mental health problems', 'many women mental health problems', 'common mental health problems after birth', 'postnatal depression statistics'],
    aliases: ['How common is postnatal depression?', 'How many women get depression after a baby?', 'Is postpartum depression common?'],
    answer: 'The World Health Organization says almost 1 in 5 women will have a mental health condition during pregnancy or in the year after the birth. So if you are struggling, you are far from alone.\n\nThe NHS says postnatal depression itself is common, and that it usually improves with treatment.',
    sources: ['who-perinatal-mh-2022', 'nhs-pnd'],
    adaptation: 'The sentence "you are far from alone" is this app\'s own words. The WHO figure is for any mental health condition, not only depression.',
    clinical: 'This chat\'s older information text says postpartum depression occurs in "about 1 in 7 births". The WHO figure here is for any mental health condition in pregnancy or the year after. Please decide which numbers the chat should give, so that they do not seem to contradict each other.'
  },
  {
    id: 'postpartum-psychosis',
    title: 'Postpartum psychosis',
    keywords: ['postnatal psychosis', 'psychosis', 'hallucinations', 'delusions', 'hearing voices', 'seeing things that are not there', 'very confused since birth', 'mania after birth', 'confused since baby', 'confused since birth', 'talking strangely'],
    aliases: ['What is postpartum psychosis?', 'I am seeing things that are not there since the birth.', 'What are the signs of postnatal psychosis?', 'My wife is very confused and talking strangely since the baby.'],
    answer: 'Postpartum psychosis is a rare but serious mental illness that can happen soon after having a baby. The NHS says it affects around 1 in 1,000 mothers, and usually starts suddenly within the first 2 weeks.\n\nSigns include seeing or hearing things that are not there, strong beliefs or fears that are unlikely to be true, feeling unusually high or overactive, feeling very confused, very low mood or withdrawal, or moods that change quickly.\n\nIt can get worse quickly and can put the mother and baby at risk, and the person may not realise she is ill. It is an emergency: get urgent medical help straight away. In Nepal, go to the nearest hospital emergency room, and ask someone to go with her. If anyone may be in danger, call:\n{{HELPLINES}}',
    sources: ['nhs-psychosis'],
    adaptation: 'The NHS says to see a GP the same day and to call 999 if someone may be in danger. Replaced with the nearest hospital emergency room and this app\'s Nepal helplines. "Ask someone to go with her" is this app\'s own advice.',
    clinical: 'Please check that "go to the nearest hospital emergency room" is the right first step for someone in Nepal, and whether a psychiatric service should be named.'
  },
  {
    id: 'epds-meaning',
    title: 'What the Edinburgh scale (the check-in) is and is not',
    keywords: ['what epds', 'epds mean', 'epds score', 'epds accurate', 'epds reliable', 'epds cut off', 'edinburgh scale', 'edinburgh postnatal depression scale', 'check in score', 'what score mean', 'epds tell have depression', 'epds diagnose', 'epds diagnosis'],
    aliases: ['What does my EPDS score mean?', 'What is the Edinburgh Postnatal Depression Scale?', 'Is the EPDS accurate?', 'Can the EPDS tell me if I have depression?'],
    answer: 'The Edinburgh Postnatal Depression Scale (EPDS) is a short questionnaire used to screen for postnatal depression. A screening is not a diagnosis. A higher score only shows that it is worth talking to a health worker. It cannot tell you whether you have depression, and a low score does not rule it out.\n\nA study of 346 mothers at a hospital in Kathmandu found that the Nepali version works well as a screening tool.',
    sources: ['bhusal-2016'],
    adaptation: 'The explanation of what a score does and does not mean is this app\'s own, in line with the study\'s description of the scale as a screening tool.',
    clinical: 'IMPORTANT. That study found the best cut-off for the Nepali version was 12/13 (92% sensitivity, 95.6% specificity). At the lowest cut-off it reported, 10, sensitivity was 98% and specificity about 87.5%. This chat calls a score of 10 or more "Possible depression". Please decide which cut-off is right for this chat and why. The study was in one tertiary hospital, mothers 4 to 14 weeks after birth, so it may not apply to everyone.'
  },
  {
    id: 'postnatal-checkups',
    title: 'When the postnatal checkups are',
    keywords: ['postnatal checkups', 'postnatal visits', 'postnatal appointments', 'checkups after birth', 'visits after birth', 'six week check', 'six week checkup', 'home visit after birth', 'see doctor after birth', 'follow up after birth'],
    aliases: ['How many postnatal checkups should I have?', 'When are the postnatal visits?', 'When should I see a doctor after giving birth?', 'When is the 6 week check?', 'Will someone visit me at home after the birth?'],
    answer: 'WHO recommends that every mother and baby have postnatal checkups in the first 6 weeks after the birth: within the first 24 hours, around day 3 (between 48 and 72 hours), between days 7 and 14, and at week 6. They can be at home or at a health facility.\n\nWHO says extra visits may be needed if there are concerns. If you are worried between visits, do not wait for the next one.\n\nThe visits your own health post uses may differ a little, so please ask your health worker which ones you are due.',
    sources: ['who-2013-brief', 'who-news-2022'],
    adaptation: 'The last paragraph is this app\'s own advice. Nepal\'s own postnatal visit schedule could not be confirmed from an official Nepali source while this was written.',
    clinical: 'Please confirm Nepal\'s national postnatal visit schedule and, if it differs, replace the last paragraph with it.'
  },
  {
    id: 'hospital-stay',
    title: 'How long to stay in the health facility after the birth',
    keywords: ['stay in hospital after birth', 'leave hospital after birth', 'discharged after birth', 'go home after birth', 'hospital stay after birth'],
    aliases: ['How long should I stay in hospital after the birth?', 'How soon can I go home after delivery?'],
    answer: 'WHO recommends that after an uncomplicated vaginal birth in a health facility, healthy mothers and babies stay and are cared for there for at least 24 hours.\n\nGoing home is fine only if the mother\'s bleeding is under control, neither mother nor baby has signs of infection or another illness, and the baby is feeding well.',
    sources: ['who-2013-brief'],
    adaptation: null,
    clinical: 'This is the 2013 WHO recommendation for an uncomplicated vaginal birth. It does not cover caesarean births.'
  },
  {
    id: 'newborn-danger-signs',
    title: 'Danger signs in a newborn baby',
    keywords: ['newborn danger signs', 'baby danger signs', 'baby sick', 'baby not feeding', 'baby wont feed', 'baby stopped feeding', 'baby wont breastfeed', 'baby not breastfeeding', 'baby breathing fast', 'baby fast breathing', 'baby breathing heavy', 'baby yellow', 'baby jaundice', 'jaundice', 'baby convulsions', 'baby fits', 'baby feels cold', 'baby feels hot', 'baby low temperature', 'baby high temperature', 'baby not moving', 'when to worry about my baby', 'when to take baby to hospital'],
    aliases: ['What are the danger signs in a newborn?', 'When should I worry about my baby?', 'My baby is not feeding well.', 'My baby\'s skin looks yellow.', 'How do I know if my newborn is sick?', 'When should I take my baby to the hospital?'],
    answer: 'Take your baby to a health worker as soon as you can, without waiting for the next checkup, if you see any of these signs, which WHO lists as danger signs in a newborn:\n\n• Not feeding well, or has stopped feeding well\n• Has had a convulsion (fit)\n• Fast breathing: 60 breaths a minute or more\n• The chest pulling in severely when breathing\n• Not moving on their own\n• Fever: a temperature of 37.5 °C or higher\n• A low body temperature: below 35.5 °C\n• Yellow skin in the first 24 hours of life\n• Yellow palms and soles of the feet, at any age\n\nA baby who is seriously ill may need help urgently. If you are worried, go.',
    sources: ['who-2013-brief'],
    adaptation: 'The last line is this app\'s own safety wording.',
    clinical: 'These are the signs and figures in WHO\'s 2013 recommendation 4. The 2022 WHO guideline replaced it, and its full text could not be read here, so please check every figure against the 2022 text. Also decide whether any baby danger sign should get a fixed urgent reply in code (it does not today, except fever).'
  },
  {
    id: 'exclusive-breastfeeding',
    title: 'What WHO recommends about breastfeeding',
    keywords: ['exclusive breastfeeding', 'how long breastfeed', 'breastfeeding recommendations', 'when to start breastfeeding', 'when to stop breastfeeding', 'when to start solid food', 'complementary food', 'only breast milk', 'weaning', 'start solids', 'solids'],
    aliases: ['How long should I breastfeed?', 'What is exclusive breastfeeding?', 'When should I start solid food?', 'When should I start breastfeeding after the birth?'],
    answer: 'WHO and UNICEF recommend:\n\n• Start breastfeeding within 1 hour of the birth.\n• For the first 6 months, feed only breast milk (exclusive breastfeeding).\n• From 6 months, add small amounts of other food, and increase them gradually as the child grows.\n• Keep breastfeeding often, up to 2 years of age or beyond.\n\nWHO also says mothers should be counselled and supported to breastfeed at each postnatal visit. If breastfeeding is difficult, ask a health worker for help.',
    sources: ['who-feeding', 'who-2013-brief'],
    adaptation: 'The last sentence is this app\'s own advice.',
    clinical: null
  },
  {
    id: 'breastfeeding-benefits',
    title: 'Why breastfeeding is recommended',
    keywords: ['benefits of breastfeeding', 'why breastfeed', 'breastfeeding good for baby', 'breastfeeding good for mother', 'breastfeeding protect', 'breastfeeding cancer'],
    aliases: ['What are the benefits of breastfeeding?', 'Why should I breastfeed?', 'Is breastfeeding good for me as well as my baby?'],
    answer: 'WHO says early, exclusive and continued breastfeeding protect babies and children from infectious diseases. For mothers, it says breastfeeding reduces the risk of ovarian and breast cancer.\n\nIf you cannot breastfeed, or find it hard, please speak to a health worker. They can help you find the right way to feed your baby.',
    sources: ['who-feeding'],
    adaptation: 'The last paragraph is this app\'s own advice.',
    clinical: null
  },
  {
    id: 'skin-to-skin',
    title: 'Skin-to-skin contact after the birth',
    keywords: ['skin to skin', 'kangaroo care', 'skin to skin breastfeeding'],
    aliases: ['What is skin-to-skin contact?', 'Should I hold my baby skin to skin after the birth?'],
    answer: 'WHO advises that during the first hour after birth the baby is held in skin-to-skin contact with the mother. It keeps the baby warm and helps breastfeeding to start.',
    sources: ['who-2013-brief'],
    adaptation: null,
    clinical: 'This is a recommendation from WHO\'s other guidelines, as listed in the postnatal summary. It assumes the baby and mother are well.'
  },
  {
    id: 'lochia',
    title: 'Bleeding after the birth, and tummy pain',
    keywords: ['lochia', 'how long bleeding after birth', 'bleeding last after birth', 'bleeding after birth normal', 'afterpains', 'tummy pain after birth', 'stomach pain after birth', 'womb shrinking pain'],
    aliases: ['How long does bleeding last after giving birth?', 'What is lochia?', 'Is it normal to have tummy pain after the birth?', 'Is bleeding after delivery normal?'],
    answer: 'It is normal to have bleeding from the vagina (called lochia) for a few weeks after giving birth. The NHS says it usually stops after 6 to 8 weeks, but it can last longer.\n\nSome women feel tummy pain as the womb shrinks, especially while breastfeeding. The NHS says this is normal.\n\nBleeding can also be a sign of a problem. See the signs to watch for by asking: "when should I worry about bleeding after birth?"',
    sources: ['nhs-early-days'],
    adaptation: null,
    clinical: 'The NHS page does not describe how much, or what colour, is normal, so this entry does not either.'
  },
  {
    id: 'bleeding-warning-signs',
    title: 'When bleeding after the birth is a warning sign',
    keywords: ['when to worry about bleeding after birth', 'when to call midwife bleeding', 'bleeding warning signs', 'bleeding smells', 'blood clots after birth', 'clots after birth', 'bleeding getting heavier', 'bleeding not getting less', 'postnatal hemorrhage'],
    aliases: ['When should I worry about bleeding after birth?', 'Is it normal to pass blood clots after birth?', 'My bleeding smells strange. Is that a problem?', 'When should I call the midwife about bleeding?'],
    answer: 'If the bleeding is sudden and very heavy, or you feel faint or dizzy, or your heart is pounding, this is an emergency. It could be a very heavy bleed (postpartum haemorrhage). Go to the nearest hospital now.\n\nSpeak to ' + FIND_HELP + ' soon if you have bleeding after the birth and any of these:\n\n• A high temperature (over 38 °C)\n• Bleeding that smells unusual for you\n• Tummy pain that gets worse\n• Bleeding that gets heavier, or does not get any less\n• Lumps (clots) in the blood\n• Pain between your vagina and your bottom that gets worse\n\nThe NHS says these could be a sign of infection.',
    sources: ['nhs-early-days'],
    adaptation: 'The NHS says to call 999 for an emergency and to speak to a GP, midwife or health visitor otherwise. Written as "go to the nearest hospital now" and "a doctor, midwife or other health worker" for Nepal.',
    clinical: 'This is the NHS list. The chat\'s code already sends the clearest heavy-bleeding messages to a fixed urgent reply first. Please confirm the list suits Nepal and that "go to the nearest hospital now" is right for the emergency signs.'
  },
  {
    id: 'maternal-checks',
    title: 'What is checked at a postnatal visit',
    keywords: ['what happens at postnatal checkup', 'what is checked at postnatal checkup', 'what will nurse check after birth', 'what will midwife check after birth', 'what to expect at postnatal checkup', 'what to expect at six week check', 'what do they check at six week check'],
    aliases: ['What happens at a postnatal checkup?', 'What will the nurse check after the birth?', 'What should I expect at my 6 week check?'],
    answer: 'WHO says that at each postnatal contact after the first 24 hours, the health worker should ask how you are in general and ask about or check: passing urine (including leaking), bowel function, how any wound between the vagina and the bottom is healing, headache, tiredness, back pain, pain in that area and how you keep it clean, breast pain, tenderness of the womb, and the bleeding (lochia).\n\nThey should also check how breastfeeding is going, ask how you are feeling in your mood, what support you have from your family and how you cope day to day, be alert to any risk of abuse at home, and tell you who to contact for advice.\n\nThis is a good time to ask about anything that worries you.',
    sources: ['who-2013-brief'],
    adaptation: 'The last line is this app\'s own advice.',
    clinical: null
  },
  {
    id: 'postnatal-mood-checks',
    title: 'Whether health workers check for depression and anxiety',
    keywords: ['screening for postnatal depression', 'screening for depression after birth', 'screening for anxiety after birth', 'check for depression after birth', 'will anyone ask about my mood after birth', 'asked about mood after birth', 'check for depression at postnatal visits', 'check for postnatal depression', 'asked about mood at postnatal visits', 'check for anxiety at postnatal visits'],
    aliases: ['Will they check for depression at my postnatal visits?', 'Is there screening for postnatal depression?', 'Will anyone ask about my mood after the birth?'],
    answer: 'Yes, it is meant to be part of postnatal care. WHO recommends screening for postnatal depression and anxiety, with referral and management services where needed.\n\nWHO also says that at the 10 to 14 day visit every woman should be asked whether the baby blues have gone, and, if they have not, her mood should be looked at more closely.\n\nYou do not have to wait to be asked. You can tell a health worker how you are feeling at any visit.',
    sources: ['who-news-2022', 'who-2013-brief'],
    adaptation: 'The last paragraph is this app\'s own advice.',
    clinical: null
  },
  {
    id: 'bonding-difficulty',
    title: 'Trouble bonding with your baby',
    keywords: ['bonding with baby', 'cant bond with baby', 'not bonding with baby', 'trouble bonding', 'difficulty bonding', 'dont feel love for baby', 'dont feel anything for baby', 'no love for baby', 'feel nothing for baby'],
    aliases: ['I am not bonding with my baby.', 'I don\'t feel any love for my baby. Is something wrong?', 'I can\'t bond with my baby.'],
    answer: 'The NHS lists difficult feelings about your baby, or trouble bonding with them, among the signs of postnatal depression.\n\nIt does not mean you are a bad mother. It is a good reason to speak to ' + FIND_HELP + ', and you can ask for help even if you only have some of the signs of postnatal depression.',
    sources: ['nhs-pnd'],
    adaptation: 'The first sentence of the second paragraph ("It does not mean you are a bad mother") is this app\'s own wording, because the source only lists the sign.',
    clinical: 'Please check the tone and whether the reassurance is right to give.'
  },
  {
    id: 'postnatal-anxiety',
    title: 'Anxiety and constant worry after the birth',
    keywords: ['postnatal anxiety', 'anxiety after birth', 'anxious after birth', 'worry after birth', 'panic after birth', 'worrying constantly', 'constant worry'],
    aliases: ['I feel anxious all the time since the baby was born.', 'Is anxiety after birth normal?', 'I keep worrying constantly since the birth.'],
    answer: 'Fear, anxiety or constant worry are among the signs of postnatal depression that the NHS lists. WHO also recommends that postnatal care includes screening for anxiety, with help where it is needed.\n\nIf the worry is constant, or you are struggling to cope, please speak to ' + FIND_HELP + '.',
    sources: ['nhs-pnd', 'who-news-2022'],
    adaptation: 'The last paragraph is this app\'s own advice.',
    clinical: null
  }
].map(entry => ({ status: 'draft', reviewedBy: null, reviewedOn: null, ...entry }));

// What people are likely to ask that no entry answers yet. A question about one of these gets the
// usual reply, which sends her to a health worker. Shown to the reviewers, so that they can say
// which to write first.
export const NOT_WRITTEN = [
  'What causes postnatal depression, who is more likely to get it, and how to prevent it',
  'Whether postnatal depression can harm the baby, and what happens if it is not treated',
  'Danger signs for the mother after the birth other than bleeding (the 2022 WHO list could not be read)',
  'Medicines, including antidepressants and breastfeeding (the chat gives no medicine advice)',
  'Food, exercise, sleep, sex and family planning after the birth',
  'Baby care: bathing, the umbilical cord, vaccines, crying, colic, weight, how often to feed',
  'Expressing milk, formula, and breastfeeding problems such as latching and sore breasts',
  'Mothers who had a caesarean, premature or twin babies, or who have lost a baby',
  'Services in Nepal, and the national postnatal visit schedule',
  'Everything in Nepali'
];

/* ------------------------------------------------------------------ */
/* Finding the right entry                                             */
/* ------------------------------------------------------------------ */

// Words that carry no meaning for matching. "not", "no", "dont", "cant" and "wont" are kept on purpose:
// "baby is not feeding" and "baby is feeding well" must not look the same. So are "what", "how",
// "when" and "have", which tell "what is it" from "how common is it" and "do I have it".
const STOP = new Set((
  'a an the is are was were be been being am do does did i my me we our you your it its to of in on at for and or but if so ' +
  'that this these those can could should would will may might about with after before there they them their has had get got ' +
  'just very really too any some also than then from as by into up out over around please know want need like feeling'
).split(' '));

// Different ways of saying the same thing become one, on both sides (the questions and the keywords)
const CANON = [
  [/post[- ]?partum/g, 'postnatal'],
  [/post[- ]?natal/g, 'postnatal'],
  [/\b(ppd|pnd)\b/g, 'postnatal depression'],
  [/\b(tell me (more )?about|explain|describe|information (on|about)|info (on|about)|what do you know about)\b/g, 'what'],
  [/\bwhat (should|can|could|shall|do) i do\b/g, 'whattodo'],
  [/\bafter (a|the|my) baby\b/g, 'after birth'],
  [/\b(newborns?|new borns?|infants?|babies)\b/g, 'baby'],
  [/\bwomen\b/g, 'woman'],
  [/\b(moms?|mums?|mamas?)\b/g, 'mother'],
  [/\b(childbirth|deliver(y|ies)|giving birth|gave birth|given birth|after having (a|my|the) baby|(was|were|is|been) born)\b/g, 'birth'],
  [/\bcheck[- ]?ups?\b/g, 'checkup'],
  [/\bhaemorrhage\b/g, 'hemorrhage'],
  [/\bcan'?t\b/g, 'cant'],
  [/\bdon'?t\b/g, 'dont'],
  [/\bwon'?t\b/g, 'wont'],
  [/\bbreast[- ]feed/g, 'breastfeed'],
  [/\bskin[- ]to[- ]skin\b/g, 'skintoskin'],
  [/\b6(th)?\b/g, 'six'],
  [/\bcut[- ]?offs?\b/g, 'cut off'],
  [/\bcheck[- ]in\b/g, 'check in'],
  [/'s\b/g, '']
];

function stem(word) {
  if (word === 'blues') return word; // "baby blues" is not "my baby looks blue"
  if (word === 'having') return 'have';
  if (word === 'cured' || word === 'cures' || word === 'curing') return 'cure';
  for (const prefix of ['depress', 'breastfe', 'bleed', 'bond', 'worr', 'anxi', 'treat', 'breath', 'hallucin']) {
    if (word.startsWith(prefix)) return prefix === 'breastfe' ? 'breastfeed' : prefix === 'worr' ? 'worry' : prefix;
  }
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  if (/(sses|xes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
  return word;
}

export function tokens(text) {
  let t = String(text ?? '').toLowerCase().replace(/[‘’]/g, "'");
  for (const [pattern, replacement] of CANON) t = t.replace(pattern, replacement);
  return t.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(word => word && !STOP.has(word)).map(stem);
}

// How much a word says about which entry is meant: a word in the keywords of one entry says a lot
// ("jaundice", "lochia"), a word in the keywords of most of them says little ("postnatal").
const KEYWORD_WORDS = ENTRIES.map(entry => new Set(entry.keywords.flatMap(tokens)));
const WEIGHT = new Map();
for (const word of new Set(KEYWORD_WORDS.flatMap(words => [...words]))) {
  const entriesWithWord = KEYWORD_WORDS.filter(words => words.has(word)).length;
  WEIGHT.set(word, Math.log(1 + ENTRIES.length / entriesWithWord));
}

const PHRASES = ENTRIES.map(entry => ({
  entry,
  phrases: entry.keywords.map(keyword => ({ keyword, words: [...new Set(tokens(keyword))] })).filter(phrase => phrase.words.length)
}));

// The shortest stretch of the question that holds all of a phrase's words
function span(query, words) {
  const need = new Set(words);
  let best = Infinity;
  for (let from = 0; from < query.length; from++) {
    if (!need.has(query[from])) continue;
    const seen = new Set();
    for (let to = from; to < query.length; to++) {
      if (need.has(query[to])) seen.add(query[to]);
      if (seen.size === need.size) { best = Math.min(best, to - from + 1); break; }
    }
  }
  return best;
}

const MIN_SCORE = 3;         // below this nothing is answered: a few common words are not a question we know
const CLEAR_WIN = 1.15;      // the best entry must beat the next by this much, or the question is unclear
const MAX_QUERY_WORDS = 14;  // a question is short; a long message is someone telling their story, not asking

// Subjects near these entries that none of them covers. A question that names one of these gets no
// answer, unless the phrase that matched names it too ("baby feels cold" may say "cold"), so
// "what causes postnatal depression" is not answered with "what postnatal depression is".
const UNCOVERED = new Set([
  'cause', 'causes', 'caused', 'causing', 'reason', 'reasons', 'risk', 'risks', 'harm', 'harmful', 'dangerous', 'prevent', 'prevention', 'preventing',
  'diet', 'food', 'foods', 'eat', 'eating', 'nutrition', 'vitamin', 'vitamins', 'supplement', 'supplements', 'iron', 'exercise', 'exercising', 'weight', 'sex', 'sexual',
  'contraception', 'pregnant', 'pregnancy', 'period', 'periods', 'menstrual', 'vaccine', 'vaccines', 'vaccination', 'immunisation', 'immunization',
  'cord', 'bath', 'bathing', 'massage', 'formula', 'bottle', 'pump', 'pumping', 'supply', 'latch', 'latching', 'mastitis', 'engorged', 'colic', 'rash', 'teething',
  'sleep', 'sleeping', 'nap', 'cry', 'cries', 'crying', 'constipation', 'diarrhoea', 'diarrhea', 'vomiting', 'cough', 'cold', 'medicine', 'medicines', 'medication', 'drug', 'drugs',
  'difference', 'differences', 'different', 'compare', 'versus', 'vs', 'happen', 'happens', 'happened', 'untreated', 'herbal', 'ayurvedic', 'recover', 'recovery', 'cost', 'price', 'insurance', 'money', 'work', 'job', 'water', 'weigh'
].flatMap(word => tokens(word)));

// The main subject of a question. An entry can only answer a question about one of these if the
// entry is about it too, so "can I breastfeed if I have postnatal depression" is not answered with
// "what to do if you think you have postnatal depression", which is silent on breastfeeding.
const SUBJECTS = new Set([
  'breastfeeding', 'bleeding', 'clots', 'jaundice', 'solids', 'weaning', 'epds', 'psychosis', 'checkup', 'visits', 'hospital',
  'depression', 'anxiety', 'bonding', 'skin to skin', 'lochia', 'stitches'
].flatMap(word => tokens(word)));

// Situations these entries were not written for. A question about one of these gets no canned
// answer (it goes to the usual reply, or to the AI when it is on), so a mother who has lost a baby
// never gets the article about the baby blues, and a caesarean is not answered with the rules
// for an uncomplicated vaginal birth.
const NOT_COVERED = /miscarr|stillb(irth|orn)|abortion|lost (my|the|our|a) (baby|child)|(baby|child) (died|is dead|has died)|passed away|premature|preterm|\btwins?\b|c[- ]?section|caesarean|cesarean|\bhiv\b|diabet|hypertension|epilep|bipolar|schizo/i;

// Every entry that fits a question, best first: [{ entry, phrase, score }]. A phrase counts when
// every one of its words is in the question; its score is the weight of those words, and more
// when they stand together. So "signs of postnatal depression" finds the signs and not the
// general description, and a question with only the common words in it finds nothing.
export function matches(message) {
  if (NOT_COVERED.test(String(message ?? ''))) return [];
  const query = tokens(message);
  if (query.length === 0 || query.length > MAX_QUERY_WORDS) return [];
  const present = new Set(query);

  const subjects = query.filter(word => SUBJECTS.has(word));
  const found = [];
  for (const [index, { entry, phrases }] of PHRASES.entries()) {
    if (subjects.some(word => !KEYWORD_WORDS[index].has(word))) continue;
    const hits = phrases
      .filter(phrase => phrase.words.every(word => present.has(word)))
      .filter(phrase => !query.some(word => UNCOVERED.has(word) && !phrase.words.includes(word)))
      .map(phrase => {
        const together = phrase.words.length < 2 ? 0 : (() => {
          const width = span(query, phrase.words);
          return width === phrase.words.length ? 1 : width <= phrase.words.length + 1 ? 0.5 : 0;
        })();
        return { phrase: phrase.keyword, score: phrase.words.reduce((sum, word) => sum + WEIGHT.get(word), 0) + together };
      });
    if (!hits.length) continue;
    hits.sort((a, b) => b.score - a.score);
    found.push({ entry, phrase: hits[0].phrase, score: hits[0].score + 0.1 * Math.min(hits.length - 1, 4) });
  }
  return found.sort((a, b) => b.score - a.score);
}

// The entry to answer with from a ranked list (best first), or null. Two entries that score almost
// the same mean the question is unclear, and an unclear question gets no answer rather than a guess.
export function clearWinner([top, second]) {
  if (!top || top.score < MIN_SCORE) return null;
  if (second && top.score < second.score * CLEAR_WIN) return null;
  return top;
}

export const findAnswer = message => clearWinner(matches(message));

/* ------------------------------------------------------------------ */
/* What is shown                                                       */
/* ------------------------------------------------------------------ */

export const ANSWER_FOOTER = 'This is general information from the sources above. It is not medical advice for you. Your own doctor, midwife or health worker knows your situation best.';
export const CHECK_IN_OFFER = "If you would like, I can guide you through a short check-in about how you have been feeling. Type 'yes' to begin, or 'menu' for other options.";
export const FEELINGS_OPENER = 'Thank you for telling me how you feel. Here is what trusted health sources say:';

// Entries about how a mother feels also offer the check-in, as the chat does after a worried message
const OFFERS_CHECK_IN = new Set(['what-is-ppd', 'baby-blues', 'ppd-symptoms', 'ppd-get-help', 'epds-meaning', 'bonding-difficulty', 'postnatal-anxiety']);

const escapeText = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The reply for an entry: its answer, then where it comes from, then the footer. Two forms:
//   html   what the chat shows. The sources are links, on one line (the chat shows a line that
//          holds a link as HTML, so everything put into it is ours and is escaped: the labels and
//          addresses come from SOURCES above and from nowhere else).
//   plain  what is saved to the chat history and sent to the AI, which show text only.
export function formatAnswer(entry, { opener = '' } = {}) {
  const body = entry.answer.replace('{{HELPLINES}}', HELPLINES.english);
  const sources = entry.sources.map(id => SOURCES[id]);
  const checkIn = OFFERS_CHECK_IN.has(entry.id) ? `\n\n${CHECK_IN_OFFER}` : '';
  const start = opener ? `${opener}\n\n` : '';
  const links = sources.map(source => `<a href="${escapeText(source.url)}" target="_blank" rel="noopener noreferrer">${escapeText(source.label)}</a>`);
  const names = sources.map(source => `${source.label} (${source.url})`);
  return {
    html: `${start}${body}${checkIn}\n\nSources: ${links.join(' · ')}\n\n${ANSWER_FOOTER}`,
    plain: `${start}${body}${checkIn}\n\nSources: ${names.join(' · ')}\n\n${ANSWER_FOOTER}`
  };
}

export const isSignedOff = entry => entry.status === 'reviewed' && Boolean(entry.reviewedBy) && Boolean(entry.reviewedOn);
export const unsignedEntries = () => ENTRIES.filter(entry => !isSignedOff(entry));

// Kinds (from classifyMessage) that have their own flow or a safety reply, and so are never
// answered from here: the greeting and menu, yes / no, the urgent-symptom and medicine replies,
// the helplines and the report. "epds" is let through for the two entries about the check-in and
// screening, so "what does my EPDS score mean" is answered and "take the EPDS" still starts it.
const OWN_FLOW = new Set([
  'empty', 'greeting', 'thanks', 'bye', 'yes', 'no', 'menu', 'menu_1', 'menu_2', 'menu_3', 'menu_4', 'menu_5',
  'urgent_baby', 'urgent_medical', 'medication', 'helpline', 'report'
]);

// The answer for a message, ready to show, or null: { entry, phrase, score, html, plain }.
const ABOUT_THE_SCALE = new Set(['epds-meaning', 'postnatal-mood-checks']);

export function answerFor(message, kind) {
  if (OWN_FLOW.has(kind)) return null;
  const found = findAnswer(message);
  if (!found) return null;
  if (kind === 'epds' && !ABOUT_THE_SCALE.has(found.entry.id)) return null;
  const opener = kind === 'feelings' ? FEELINGS_OPENER : '';
  return { ...found, ...formatAnswer(found.entry, { opener }) };
}
