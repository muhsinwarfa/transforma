import Anthropic from "@anthropic-ai/sdk";
import {
  DeterministicSynthesisError,
  type JudgeVerdict,
  type NarrativeSections,
  type SynthesisDeps,
  type SynthesisInput,
} from "@transforma/review-core";
import { JUDGE_SYSTEM_PROMPT, WRITER_SYSTEM_PROMPT } from "./prompts.js";

// Verified against live docs (models overview + migration guide):
// writer Opus 4.8, judge Sonnet 4.6; adaptive thinking; output_config.{effort,format};
// NO temperature/top_p/top_k, NO budget_tokens, NO assistant prefill.
const WRITER_MODEL = "claude-opus-4-8";
const JUDGE_MODEL = "claude-sonnet-4-6";

const NARRATIVE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "strengths", "areasToGrow", "focusNextCycle"],
  properties: {
    summary: { type: "string" },
    strengths: { type: "string" },
    areasToGrow: { type: "string" },
    focusNextCycle: { type: "string" },
  },
} as const;

const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pass", "issues"],
  properties: {
    pass: { type: "boolean" },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "detail"],
        properties: { category: { type: "string" }, detail: { type: "string" } },
      },
    },
  },
} as const;

function firstText(msg: { content: { type: string; text?: string }[] }): string {
  for (const block of msg.content) if (block.type === "text" && block.text) return block.text;
  return "";
}

/** 4xx (auth / invalid request) → deterministic abort; everything else is transient. */
function mapError(e: unknown): never {
  const status = (e as { status?: unknown } | null)?.status;
  if (typeof status === "number" && [400, 401, 403, 404].includes(status)) {
    throw new DeterministicSynthesisError(`anthropic ${status}`);
  }
  throw e;
}

function parseNarrative(text: string): NarrativeSections {
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    return {
      summary: String(o.summary ?? ""),
      strengths: String(o.strengths ?? ""),
      areasToGrow: String(o.areasToGrow ?? ""),
      focusNextCycle: String(o.focusNextCycle ?? ""),
    };
  } catch {
    // unparseable → empty sections → the deterministic formatting gate fails → regenerate
    return { summary: "", strengths: "", areasToGrow: "", focusNextCycle: "" };
  }
}

function parseVerdict(text: string): JudgeVerdict {
  try {
    const o = JSON.parse(text) as { pass?: unknown; issues?: unknown };
    const issues = Array.isArray(o.issues)
      ? o.issues.map((i: { category?: unknown; detail?: unknown }) => ({
          category: String(i.category ?? "judge"),
          detail: String(i.detail ?? ""),
        }))
      : [];
    return { pass: Boolean(o.pass), issues };
  } catch {
    return { pass: false, issues: [{ category: "judge", detail: "unparseable verdict" }] }; // fail closed
  }
}

/**
 * Build the writer + judge ports for `runSynthesis` from a per-review bundle.
 * The bundle handed to the model is self-review + (themes | omitted below floor) —
 * never raw peer bodies. The judge sees the draft + a de-identified peer SOURCE
 * COUNT only, so the judge itself cannot leak peer content.
 */
export function buildSynthesisDeps(input: SynthesisInput): SynthesisDeps {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY

  return {
    async generate(priorIssues: string[]): Promise<NarrativeSections> {
      const userContent = JSON.stringify({
        self_review: input.selfReview,
        peer_themes: input.peerThemes,
        below_floor: input.belowFloor,
        prior_issues: priorIssues.length ? priorIssues : undefined,
      });
      const params = {
        model: WRITER_MODEL,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high", format: { type: "json_schema", schema: NARRATIVE_SCHEMA } },
        system: [{ type: "text", text: WRITER_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userContent }],
      };
      try {
        const stream = client.messages.stream(params as unknown as Parameters<typeof client.messages.stream>[0]);
        const msg = await stream.finalMessage();
        return parseNarrative(firstText(msg as { content: { type: string; text?: string }[] }));
      } catch (e) {
        mapError(e);
      }
    },

    async judge(draft: NarrativeSections): Promise<JudgeVerdict> {
      const userContent = JSON.stringify({
        draft,
        peer_source_count: input.peerThemes ? input.peerThemes.length : 0,
        below_floor: input.belowFloor,
      });
      const params = {
        model: JUDGE_MODEL,
        max_tokens: 1500,
        output_config: { format: { type: "json_schema", schema: VERDICT_SCHEMA } },
        system: [{ type: "text", text: JUDGE_SYSTEM_PROMPT }],
        messages: [{ role: "user", content: userContent }],
      };
      try {
        const msg = await client.messages.create(params as unknown as Parameters<typeof client.messages.create>[0]);
        return parseVerdict(firstText(msg as { content: { type: string; text?: string }[] }));
      } catch (e) {
        mapError(e);
      }
    },
  };
}
