import type { StructuralRole } from "@transforma/db";
import { HomeHub, type HubGroup, type HubTask } from "@/components/home/HomeHub";
import { loadSession } from "@/lib/auth/session";
import { resolveLabels } from "@/lib/labels/roleLabel";
import { getActiveCycle, getCycleMonitor } from "@/lib/admin/data";
import { getMyReviewStatus } from "@/lib/subject/data";
import { getNominationData } from "@/lib/subject/nominations";
import { getSelfReview } from "@/lib/subject/selfReview";
import { getPeerAssignments } from "@/lib/peer/feedback";
import { getApproverQueue } from "@/lib/approver/data";
import { getNominationQueue } from "@/lib/approver/nominations";

function daysLeft(deadlineAt: string | null): number | null {
  if (!deadlineAt) return null;
  return Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 86_400_000);
}

function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Map the subject's current stage to a single hub card. Mirrors the design's
 * subjectHubCard() over the real review-status / nomination reads. The nomination
 * phase (roster not yet approved) is checked first because the subject status view
 * collapses draft → "in-review".
 */
async function subjectTask(): Promise<HubTask | null> {
  const nom = await getNominationData();
  if (nom && nom.status !== "approved") {
    if (nom.status === "changes_requested")
      return {
        id: "subj",
        title: "Adjust your peer nominations",
        status: "flagged",
        due: "Changes requested",
        meta: "Your manager asked for a change",
        cta: "Review",
        href: "/review/nominate",
      };
    if (nom.status === "pending")
      return {
        id: "subj",
        title: "Nominations sent for approval",
        status: "in-review",
        due: "With your manager",
        meta: "Awaiting nomination approval",
        cta: "View status",
        href: "/review/nominate",
      };
    return {
      id: "subj",
      title: "Nominate your peer reviewers",
      status: "draft",
      due: "Action needed",
      meta: "Pick who gives you feedback",
      cta: "Nominate",
      href: "/review/nominate",
    };
  }

  const status = await getMyReviewStatus();
  if (!status) return null;

  if (status.displayStatus === "in-review") {
    const self = await getSelfReview();
    if (!self || !self.submitted)
      return {
        id: "subj",
        title: "Write your self-review",
        status: "draft",
        due: "Due Jun 14",
        meta: "Self-review · 4 prompts · peer feedback open too",
        cta: "Continue",
        href: "/review/self",
      };
    return {
      id: "subj",
      title: "Your review is on its way",
      status: "in-review",
      due: "In review",
      meta: "Nothing needed from you yet",
      cta: "View status",
      href: "/review",
    };
  }

  if (status.displayStatus === "awaiting-acknowledgement") {
    const by = shortDate(status.ackWindowEndsAt);
    return {
      id: "subj",
      title: "Your review is ready to read",
      status: "awaiting-acknowledgement",
      due: by ? `Acknowledge by ${by}` : "Ready to read",
      meta: "Read it, then acknowledge or flag",
      cta: "Read & acknowledge",
      href: "/review",
    };
  }

  return {
    id: "subj",
    title: "Your review is locked",
    status: "locked",
    due: "Complete",
    meta: "Final review · read-only",
    cta: "View",
    href: "/review",
  };
}

/** Build live peer hub cards from open requests (each links into its form). */
async function peerTasks(): Promise<HubTask[]> {
  const requests = await getPeerAssignments();
  return requests
    .filter((r) => r.state === "new" || r.state === "draft")
    .map((r) => {
      const d = daysLeft(r.deadlineAt);
      const by = shortDate(r.deadlineAt);
      const due = by ? (d !== null && d <= 3 ? `Due ${by} · ${d}d` : `Due ${by}`) : "Open";
      return {
        id: `peer-${r.reviewId}`,
        title: `Feedback for ${r.subjectName}`,
        status: r.state === "draft" ? "in-review" : "draft",
        due,
        meta: r.department ?? "",
        cta: r.state === "draft" ? "Continue" : "Start",
        href: `/peer/${r.reviewId}`,
      };
    });
}

/** Approver cards: peer-nomination approvals + reviews to decide (excludes locked). */
async function approverTasks(): Promise<HubTask[]> {
  const [noms, queue] = await Promise.all([getNominationQueue(), getApproverQueue()]);

  const nomCards: HubTask[] = noms
    .filter((n) => n.status === "pending")
    .map((n) => ({
      id: `nom-${n.employeeId}`,
      title: `Approve peer nominations — ${n.subjectName}`,
      status: "in-review",
      due: "Awaiting approval",
      meta: `${n.nomineeCount} nominated`,
      cta: "Review",
      href: `/nominations/${n.employeeId}`,
    }));

  const reviewCards: HubTask[] = queue
    .filter((q) => q.status !== "locked")
    .map((q) => {
      const flagged = q.status === "flagged" || q.flaggedInternal;
      // Anonymity floor: never render a peer count below the floor. Only the
      // at/above-floor case carries an exact, non-null peerCount.
      const peerMeta =
        !flagged && !q.belowFloor && q.peerCount !== null
          ? ` · ${q.peerCount} peer ${q.peerCount === 1 ? "response" : "responses"}`
          : "";
      return {
        id: `rev-${q.reviewId}`,
        title: flagged ? `Flagged — ${q.subjectName}` : `Review — ${q.subjectName}`,
        status: flagged ? "flagged" : "in-review",
        due: flagged ? "Needs rework" : "Awaiting decision",
        meta: `${q.department ?? ""}${peerMeta}`,
        cta: flagged ? "Rework" : "Review draft",
        href: `/approvals/${q.reviewId}`,
      };
    });

  return [...nomCards, ...reviewCards];
}

/** Admin-role cards: cycle health + nomination approvals, from real reads. */
async function adminTasks(): Promise<HubTask[]> {
  const tasks: HubTask[] = [];

  const [noms, monitor, cycle] = await Promise.all([
    getNominationQueue(),
    getCycleMonitor(),
    getActiveCycle(),
  ]);

  const pendingNoms = noms.filter((n) => n.status === "pending").length;
  if (pendingNoms > 0)
    tasks.push({
      id: "ad-noms",
      title: "Nomination approvals waiting",
      status: "in-review",
      due: `${pendingNoms} to review`,
      meta: "Direct reports’ peer nominations",
      cta: "Open nominations",
      href: "/nominations",
    });

  if (monitor) {
    const d = daysLeft(cycle?.closesAt ?? null);
    const dueText = d !== null && d >= 0 ? `${d} ${d === 1 ? "day" : "days"} left` : "In progress";
    tasks.push({
      id: "ad-mon",
      title: "Cycle in progress",
      status: "in-review",
      due: dueText,
      meta: `${monitor.activeTotal} participants · ${monitor.counts.locked} locked`,
      cta: "View cycle",
      href: "/admin/cycle",
    });
  }

  return tasks;
}

export default async function HomePage() {
  const session = await loadSession();
  // The (app) layout already gates unauthenticated access; this guards types.
  if (!session) return null;

  const has = (r: StructuralRole) => session.roles.includes(r);
  const blurbs: Record<StructuralRole, string> = {
    subject: "Your own review in this cycle.",
    peer: "Feedback others have asked you for.",
    approver: "Reviews waiting for your decision.",
    admin: "Cycle health and setup across the workspace.",
  };

  const [labels, cycle, subj, peer, approver, admin] = await Promise.all([
    resolveLabels(),
    getActiveCycle(),
    has("subject") ? subjectTask() : Promise.resolve<HubTask | null>(null),
    has("peer") ? peerTasks() : Promise.resolve<HubTask[]>([]),
    has("approver") ? approverTasks() : Promise.resolve<HubTask[]>([]),
    has("admin") ? adminTasks() : Promise.resolve<HubTask[]>([]),
  ]);

  const candidates: { role: StructuralRole; tasks: HubTask[] }[] = [
    { role: "subject", tasks: subj ? [subj] : [] },
    { role: "peer", tasks: peer },
    { role: "approver", tasks: approver },
    { role: "admin", tasks: admin },
  ];

  // Only groups for held roles that actually have at least one task (the design
  // hides a role section when it has nothing — the empty role drops out).
  const groups: HubGroup[] = candidates
    .filter((c) => has(c.role) && c.tasks.length > 0)
    .map((c) => ({ role: c.role, blurb: blurbs[c.role], tasks: c.tasks }));

  return (
    <HomeHub
      firstName={session.name.split(" ")[0] ?? session.name}
      cycleName={cycle?.name ?? null}
      labels={labels}
      groups={groups}
    />
  );
}
