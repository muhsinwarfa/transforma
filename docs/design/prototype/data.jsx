// Transforma — tenant config + structural data.
// CRITICAL: role WORDS shown to users are tenant-configured labels.
// The system reasons about the structural role; the UI renders TENANT.labels[role].

const TENANT = {
  name: 'Transforma',
  initial: 'T',
  cycle: 'H1 2026 Review',
  // structural role  ->  this tenant's configured label
  labels: {
    subject: 'Team Member',
    peer: 'Peer',
    approver: 'Manager',
    admin: 'People Ops',
  },
  // the underlying token name surfaced by the annotation layer
  tokens: {
    subject: 'subject_label',
    peer: 'peer_label',
    approver: 'approver_label',
    admin: 'admin_label',
  },
};

// Review status lifecycle — shared everywhere.
// Draft → In review → Awaiting acknowledgement → Locked.
const STATUS = {
  draft:        { key: 'draft',         label: 'Draft',     cls: 'draft' },
  'in-review':  { key: 'in-review',     label: 'In review', cls: 'in-review' },
  'awaiting-ack': { key: 'awaiting-ack', label: 'Awaiting acknowledgement', cls: 'awaiting-ack' },
  locked:       { key: 'locked',        label: 'Locked',    cls: 'locked' },
  flagged:      { key: 'flagged',       label: 'Flagged',   cls: 'flagged' },
};

// The signed-in person. Amina holds ALL FOUR structural roles at once — the
// fullest case for the adaptive shell (her own review, peer forms, an approval
// queue, and People Ops administration).
const ME = {
  name: 'Amina Yusuf',
  initial: 'AY',
  email: 'amina.yusuf@workmail.com',
  roles: ['subject', 'peer', 'approver', 'admin'], // structural roles held
};

// Primary nav — adapts to the roles a person holds. 9 items (matches the app).
// `roles: null` = always shown. Otherwise shown only if ME holds one.
const NAV = [
  { id: 'home',        label: 'Home',          icon: 'IcoHome',      roles: null },
  { id: 'review',      label: 'My review',     icon: 'IcoReview',    roles: ['subject'] },
  { id: 'peer',        label: 'Peer feedback', icon: 'IcoPeer',      roles: ['peer'],     count: 3 },
  { id: 'approvals',   label: 'Approvals',     icon: 'IcoApprovals', roles: ['approver'], count: 4,
    labelToken: 'approver' },
  { id: 'nominations', label: 'Nominations',   icon: 'IcoPeer',      roles: ['approver'], count: 2 },
  // admin-only sections (People Ops)
  { id: 'cycles',      label: 'Cycle',         icon: 'IcoCycles',    roles: ['admin'] },
  { id: 'roster',      label: 'Roster',        icon: 'IcoRoster',    roles: ['admin'] },
  { id: 'reviews',     label: 'Reviews',       icon: 'IcoDoc',       roles: ['admin'] },
  { id: 'settings',    label: 'Settings',      icon: 'IcoSettings',  roles: ['admin'] },
];

// Home hub task groups — one per structural role the person holds.
// Card CONTENT is placeholder (filled by later persona prompts); the HUB LAYOUT is the deliverable.
const HUB = [
  {
    role: 'subject',
    blurb: 'Your own review in this cycle.',
    tasks: [
      { id: 's1', title: 'Write your self-review', status: 'draft', due: 'Due Jun 14', meta: 'Self-review · 4 sections', cta: 'Continue' },
    ],
  },
  {
    role: 'peer',
    blurb: 'Feedback others have asked you for.',
    tasks: [
      { id: 'p1', title: 'Feedback for D. Osman', status: 'in-review', due: 'Due Jun 12', meta: 'Requested by a colleague', cta: 'Open form' },
      { id: 'p2', title: 'Feedback for L. Farah',  status: 'draft', due: 'Due Jun 16', meta: 'Requested by a colleague', cta: 'Start' },
    ],
  },
  {
    role: 'approver',
    blurb: 'Reviews waiting for your decision.',
    tasks: [
      { id: 'a1', title: 'Draft ready — H. Abdi',  status: 'in-review', due: 'Action needed', meta: 'Generated draft · ready to review', cta: 'Review draft' },
      { id: 'a2', title: 'Flagged — M. Noor',      status: 'flagged',   due: 'Needs attention', meta: 'Sent back for edits', cta: 'Resolve' },
      { id: 'a3', title: 'Locked — S. Ahmed',      status: 'locked',    due: 'Completed Jun 5', meta: 'Final review · locked', cta: 'View' },
    ],
  },
];

// ---- PEER track ----
// A person can be asked to give feedback on SEVERAL subjects this cycle.
// Each request is independent, has its own deadline, and is scoped strictly to
// the peer's own contribution (no visibility into the subject's review).
// `state`: 'new' (not started) · 'draft' (in progress) · 'submitted' · 'closed'.
const PEER_PROMPTS = [
  { id: 'pq1', q: 'How have you worked with them?', hint: 'A line or two of context — same team, a project, a one-off.', type: 'short' },
  { id: 'pq2', q: 'What are they great at?', hint: 'Be specific — a moment or example helps more than adjectives.', type: 'long' },
  { id: 'pq3', q: 'Where could they grow?', hint: 'Said kindly, the way you\u2019d want to hear it yourself.', type: 'long' },
  { id: 'pq4', q: 'Anything else worth knowing?', hint: 'Optional — leave blank if you\u2019ve covered it.', type: 'long', optional: true },
];

const PEER_REQUESTS = [
  { id: 'pr1', subject: 'Deqa Osman', initials: 'DO', subjectRole: 'subject', dept: 'Clinical Ops',
    deadline: 'Jun 12', daysLeft: 4, state: 'draft',
    seed: { pq1: 'We\u2019ve been on the Clinical Ops team together for about a year.', pq2: 'Deqa is the person who keeps a launch calm.', pq3: '', pq4: '' } },
  { id: 'pr2', subject: 'Liban Farah', initials: 'LF', subjectRole: 'subject', dept: 'Nursing',
    deadline: 'Jun 16', daysLeft: 8, state: 'new', seed: { pq1: '', pq2: '', pq3: '', pq4: '' } },
  { id: 'pr3', subject: 'Yusuf Ali', initials: 'YA', subjectRole: 'subject', dept: 'Clinical Ops',
    deadline: 'Jun 20', daysLeft: 12, state: 'new', seed: { pq1: '', pq2: '', pq3: '', pq4: '' } },
  { id: 'pr4', subject: 'Sahra Mohamed', initials: 'SM', subjectRole: 'subject', dept: 'Pharmacy',
    deadline: 'Jun 4', daysLeft: -2, state: 'closed', seed: { pq1: '', pq2: '', pq3: '', pq4: '' } },
];

// ---- PEER SELECTION (nomination) stage ----
// Runs after sign-in/activation, before feedback. The subject nominates peer
// reviewers (up to a configurable max) and submits them for manager approval.
// The roster defines the population only — it no longer pre-assigns peers.
const NOMINATION = {
  min: 3,
  max: 5,
  // candidate population the subject can nominate from (drawn from the roster)
  population: [
    { id: 'c1', name: 'Deqa Osman',   initials: 'DO', dept: 'Clinical Ops', relation: 'Same team' },
    { id: 'c2', name: 'Liban Farah',  initials: 'LF', dept: 'Nursing',      relation: 'Intake redesign' },
    { id: 'c3', name: 'Yusuf Ali',    initials: 'YA', dept: 'Clinical Ops', relation: 'Project I led' },
    { id: 'c4', name: 'Sahra Mohamed',initials: 'SM', dept: 'Pharmacy',     relation: 'Cross-team' },
    { id: 'c5', name: 'Hodan Abdi',   initials: 'HA', dept: 'Clinical Ops', relation: 'Same team' },
    { id: 'c6', name: 'Maryan Noor',  initials: 'MN', dept: 'Nursing',      relation: 'Shared shifts' },
    { id: 'c7', name: 'Idil Warsame', initials: 'IW', dept: 'Operations',   relation: 'Worked together once' },
    { id: 'c8', name: 'Omar Jama',    initials: 'OJ', dept: 'Pharmacy',     relation: 'Occasional projects' },
  ],
  preselected: ['c1', 'c3', 'c5'],
  changeNote: 'Two of these sit outside your day-to-day. Could you swap one for someone from the intake project who saw your work directly?',
};

// ---- MANAGER: approve peer nominations (one task per direct report) ----
// `state`: 'pending' (awaiting approval) \u00b7 'approved' \u00b7 'changes'.
const NOMINATION_QUEUE = [
  { id: 'nq1', subject: 'Hodan Abdi', initials: 'HA', subjectRole: 'subject', dept: 'Clinical Ops', state: 'pending',
    nominees: [
      { name: 'Deqa Osman', initials: 'DO', dept: 'Clinical Ops', relation: 'Same team' },
      { name: 'Yusuf Ali', initials: 'YA', dept: 'Clinical Ops', relation: 'Intake project' },
      { name: 'Sahra Mohamed', initials: 'SM', dept: 'Pharmacy', relation: 'Cross-team' },
      { name: 'Idil Warsame', initials: 'IW', dept: 'Operations', relation: 'Worked together once' },
    ] },
  { id: 'nq2', subject: 'Maryan Noor', initials: 'MN', subjectRole: 'subject', dept: 'Nursing', state: 'pending',
    nominees: [
      { name: 'Liban Farah', initials: 'LF', dept: 'Nursing', relation: 'Same unit' },
      { name: 'Omar Jama', initials: 'OJ', dept: 'Pharmacy', relation: 'Shared shifts' },
    ] },
];

// ---- APPROVER track ----
// The approver has a queue of reviews to decide. Each is one subject's draft —
// the system synthesizes real self + peer feedback into NARRATIVE TEXT ONLY.
// It never suggests a rating; the manager sets the rating themselves. The manager
// edits the narrative freely (no justification step). Separation of duties:
// reviews the approver contributed input to, or their own, NEVER appear here.
// `queueState`: 'ready' · 'flagged' (needs rework first) · 'awaiting-ack' · 'locked'.
// ANONYMITY FLOOR: peer feedback is only used when ≥3 peers respond. Below the
// floor, NO surface shows a peer count — `belowFloor: true` replaces it.
const APPROVER_QUEUE = [
  { id: 'aq1', subject: 'Hodan Abdi', initials: 'HA', subjectRole: 'subject', dept: 'Clinical Ops',
    queueState: 'ready', submitted: 'Jun 9', inputs: { self: true, peers: 3 }, draftKey: 'hodan' },
  { id: 'aq2', subject: 'Maryan Noor', initials: 'MN', subjectRole: 'subject', dept: 'Nursing',
    queueState: 'flagged', submitted: 'Jun 8', inputs: { self: true, belowFloor: true }, draftKey: 'maryan' },
  { id: 'aq3', subject: 'Yusuf Ali', initials: 'YA', subjectRole: 'subject', dept: 'Clinical Ops',
    queueState: 'ready', submitted: 'Jun 10', inputs: { self: true, peers: 4 }, draftKey: 'generic' },
  { id: 'aq4', subject: 'Sahra Mohamed', initials: 'SM', subjectRole: 'subject', dept: 'Pharmacy',
    queueState: 'ready', submitted: 'Jun 10', inputs: { self: true, peers: 3 }, draftKey: 'generic' },
  { id: 'aq5', subject: 'Said Ahmed', initials: 'SA', subjectRole: 'subject', dept: 'Pharmacy',
    queueState: 'locked', submitted: 'Jun 2', lockedOn: 'Jun 5', inputs: { self: true, peers: 3 }, draftKey: 'generic', rating: 'Meets expectations' },
  { id: 'aq6', subject: 'Idil Warsame', initials: 'IW', subjectRole: 'subject', dept: 'Operations',
    queueState: 'awaiting-ack', submitted: 'Jun 7', finalizedOn: 'Jun 9', inputs: { self: true, peers: 4 }, draftKey: 'generic', rating: 'Exceeds expectations' },
];

// Draft review content the approver reads/edits. NARRATIVE ONLY — no rating.
// The manager sets the rating from RATING_OPTIONS after reading.
const DRAFT_REVIEWS = {
  hodan: {
    sections: [
      { label: 'Summary', body: 'Hodan had a strong cycle. He took ownership of the intake redesign when it needed an owner and carried it from a rough idea to a working process on two units — calmly, without dropping the day-to-day.' },
      { label: 'Strengths', body: 'Follow-through is his signature: once he commits, it gets done, and the people around him feel that certainty. He also grew visibly in giving direct, kind feedback this cycle.' },
      { label: 'Areas to grow', body: 'Hodan tends to absorb work rather than delegate it. The next step is trusting others with pieces he could comfortably hold himself.' },
      { label: 'Focus for next cycle', body: 'Hand off one meaningful workstream to a teammate and coach them through it. Success looks like the work getting done well without him in the room.' },
    ],
  },
  maryan: {
    sections: [
      { label: 'Summary', body: 'Maryan is dependable and steady on the floor. Peer feedback fell below the confidentiality threshold this cycle, so this draft is built from her self-review alone — worth weighing as you decide.' },
      { label: 'Strengths', body: 'Calm under pressure and trusted by patients. Colleagues describe her as the person they want on a hard shift.' },
      { label: 'Areas to grow', body: '' },
      { label: 'Focus for next cycle', body: '' },
    ],
  },
  generic: {
    sections: [
      { label: 'Summary', body: 'A solid, consistent cycle with clear contributions to the team\u2019s goals and dependable delivery throughout.' },
      { label: 'Strengths', body: 'Reliable execution, good collaboration, and a steady hand on shared work.' },
      { label: 'Areas to grow', body: 'Could take more initiative in surfacing problems early rather than absorbing them.' },
      { label: 'Focus for next cycle', body: 'Pick one stretch goal that pushes beyond the current role.' },
    ],
  },
};

// The rating the MANAGER sets (the system never suggests one).
const RATING_OPTIONS = [
  'Exceeds expectations',
  'Meets expectations',
  'Partially meets expectations',
  'Below expectations',
];

// ---- ADMINISTRATOR (People Ops) track ----
// Cycle setup, roster CSV import, role-label config, cycle monitoring, plus
// settings & cycle management (company defaults + mid-cycle actions).
const CYCLE_MONITOR = {
  name: 'H1 2026 Review',
  window: 'Jun 1 – Jun 30, 2026',
  daysLeft: 9,
  participants: 128,
  // aggregate counts across the shared lifecycle
  status: { draft: 22, 'in-review': 50, 'awaiting-ack': 14, locked: 38, flagged: 4 },
  milestones: [
    { label: 'Self-reviews', done: 116, total: 128 },
    { label: 'Peer feedback', done: 402, total: 512 },
    { label: 'Manager decisions', done: 38, total: 128 },
  ],
};

// Sample CSV rows for the roster import preview.
const ROSTER_VALID = [
  { name: 'Hodan Abdi', email: 'h.abdi@workmail.com', role: 'subject', manager: 'amina.yusuf', dept: 'Clinical Ops' },
  { name: 'Maryan Noor', email: 'm.noor@workmail.com', role: 'subject', manager: 'l.farah', dept: 'Nursing' },
  { name: 'Yusuf Ali', email: 'y.ali@workmail.com', role: 'subject', manager: 'amina.yusuf', dept: 'Clinical Ops' },
];
// Validation errors keyed to row + column, with a recoverable message.
const ROSTER_ERRORS = [
  { row: 14, col: 'email', value: 'd.osman[at]workmail.com', msg: 'Not a valid email address' },
  { row: 22, col: 'role', value: 'reviewer', msg: 'Unknown role — use subject, peer, manager, or people_ops' },
  { row: 31, col: 'manager', value: '(blank)', msg: 'Manager is required for a subject row' },
  { row: 47, col: 'email', value: 'm.noor@workmail.com', msg: 'Duplicate — this email appears on row 2' },
];
const ROSTER_IMPORT = { totalRows: 131, validRows: 127, errorRows: 4 };

// Role-label configuration: structural role -> tenant word. This is the human
// side of the label/token mechanism the whole app uses.
const ROLE_CONFIG = [
  { role: 'subject',  token: 'subject_label',  label: 'Team Member', desc: 'The person being reviewed.' },
  { role: 'peer',     token: 'peer_label',     label: 'Peer',        desc: 'Someone giving feedback on a subject.' },
  { role: 'approver', token: 'approver_label', label: 'Manager',     desc: 'Reviews, edits, decides, and locks a review.' },
  { role: 'admin',    token: 'admin_label',    label: 'People Ops',  desc: 'Sets up cycles, uploads the roster, monitors cycle health.' },
];

// Cycle defaults (company-wide) a specific cycle can override.
const CYCLE_DEFAULTS = [
  { id: 'deadline',  label: 'Feedback deadline',       value: '14 days', unit: 'after the cycle opens', desc: 'How long self-review and peer feedback stay open.' },
  { id: 'minpeers',  label: 'Minimum peers',           value: '3',       unit: 'per person', desc: 'Fewest peer responses before a review can be finalized.' },
  { id: 'maxnoms',   label: 'Max peer nominations',    value: '5',       unit: 'per person', desc: 'Most peers a person may nominate.' },
  { id: 'ackwindow', label: 'Acknowledgement window',  value: '7 days',  unit: 'after a review is shared', desc: 'How long someone has to acknowledge before a review locks automatically.' },
];

// ---- ADMIN · individual review access (A1/A2) ----
// A gated capability, separate from the admin role. Every read is audited.
const REVIEW_ACCESS = {
  // demo flags — the Reviews screen states are driven by deep-link, not these
  companyEnabled: true,
  granted: true,
};

// Admins in this workspace (for the Review access grant list).
const ADMIN_LIST = [
  { id: 'ad1', name: 'Amina Yusuf',  initials: 'AY', email: 'amina.yusuf@workmail.com',  granted: true },
  { id: 'ad2', name: 'Khadra Hassan', initials: 'KH', email: 'k.hassan@workmail.com',   granted: false },
  { id: 'ad3', name: 'Bashir Omar',  initials: 'BO', email: 'b.omar@workmail.com',      granted: false },
];

// Finished reviews readable via the gated Reviews screen (A1).
// Narrative + rating + self-review + employee response — NEVER peer feedback.
const ADMIN_REVIEWS = [
  { id: 'rv1', subject: 'Said Ahmed', initials: 'SA', dept: 'Pharmacy', status: 'locked', rating: 'Meets expectations', lockedOn: 'Jun 5, 2026',
    ackOutcome: 'acknowledged', ackOn: 'Jun 5, 2026',
    response: 'Thanks — this reads fair. I\u2019d note the Q1 stock audit shaped my availability more than the review lets on.',
    selfAnswers: [
      { q: 'What are you proud of this cycle?', a: 'Kept the pharmacy running through two staffing gaps without a single missed order.' },
      { q: 'Where did you grow?', a: 'Got better at flagging risks early instead of absorbing them quietly.' },
      { q: 'What got in the way?', a: 'The Q1 stock audit consumed most of February.' },
      { q: 'What do you want to focus on next?', a: 'Mentoring the two new technicians.' },
    ] },
  { id: 'rv2', subject: 'Idil Warsame', initials: 'IW', dept: 'Operations', status: 'awaiting-ack', rating: 'Exceeds expectations', finalizedOn: 'Jun 9, 2026',
    ackOutcome: null, response: null,
    selfAnswers: [
      { q: 'What are you proud of this cycle?', a: 'The vendor consolidation — three contracts merged into one without service gaps.' },
      { q: 'Where did you grow?', a: 'Leading negotiations on my own.' },
      { q: 'What got in the way?', a: 'Competing priorities in March.' },
      { q: 'What do you want to focus on next?', a: 'Process documentation.' },
    ] },
  { id: 'rv3', subject: 'Maryan Noor', initials: 'MN', dept: 'Nursing', status: 'locked', rating: 'Meets expectations', lockedOn: 'Jun 8, 2026',
    flagged: true, flagNote: 'Finalized below the peer-feedback confidentiality threshold — drawn from the self-review only.',
    ackOutcome: 'flagged', ackOn: 'Jun 8, 2026',
    response: 'I don\u2019t agree that delegation is the growth area — I handed off the intake triage in April. I\u2019d like that on record.',
    selfAnswers: [
      { q: 'What are you proud of this cycle?', a: 'Holding the night rotation together during flu season.' },
      { q: 'Where did you grow?', a: 'Handed off intake triage and coached the replacement.' },
      { q: 'What got in the way?', a: 'Chronic understaffing on nights.' },
      { q: 'What do you want to focus on next?', a: 'A formal charge-nurse qualification.' },
    ] },
];

// Roster sample (for the table/list pattern demo)
const ROSTER = [
  { name: 'Hodan Abdi',   role: 'subject',  email: 'h.abdi@workmail.com',  status: 'in-review', dept: 'Clinical Ops' },
  { name: 'Maryan Noor',  role: 'subject',  email: 'm.noor@workmail.com',  status: 'flagged',   dept: 'Nursing' },
  { name: 'Said Ahmed',   role: 'subject',  email: 's.ahmed@workmail.com', status: 'locked',    dept: 'Pharmacy' },
  { name: 'Deqa Osman',   role: 'subject',  email: 'd.osman@workmail.com', status: 'draft',     dept: 'Clinical Ops' },
  { name: 'Liban Farah',  role: 'approver', email: 'l.farah@workmail.com', status: 'in-review', dept: 'Nursing' },
];

Object.assign(window, { TENANT, STATUS, ME, NAV, HUB, ROSTER, PEER_PROMPTS, PEER_REQUESTS, NOMINATION, NOMINATION_QUEUE, APPROVER_QUEUE, DRAFT_REVIEWS, RATING_OPTIONS, CYCLE_MONITOR, ROSTER_VALID, ROSTER_ERRORS, ROSTER_IMPORT, ROLE_CONFIG, CYCLE_DEFAULTS, REVIEW_ACCESS, ADMIN_LIST, ADMIN_REVIEWS });
