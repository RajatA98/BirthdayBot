import type { DraftRequest, Occasion } from "@/lib/types";

// Photo→video-message occasion configs. The pipeline parameterizes its
// prompts, captions, and overlay copy against this map. Default is
// "general" — fully driven by the user's prompt, no holiday seasoning.
// Adding a new preset is: add the id to `Occasion` in lib/types.ts,
// register a config here, and the rest of the pipeline picks it up.

export type OccasionConfig = {
  id: Occasion;
  // Human-facing label for cards / nav.
  label: string;
  // Greeting baked into voice-over text and overlay titles ("Happy Birthday",
  // "Happy Mother's Day", etc.). Keep it short — the overlay font is large.
  greeting: string;
  // The role we're celebrating, used in copy where we'd otherwise hardcode
  // "the birthday person" — mom / dad / grad / honoree / etc.
  honoree: string;
  // Falls back here if the user hasn't typed a name (e.g. "Mom", "your mom").
  defaultRecipientName: string;
  // System-prompt seasoning for the OpenAI plan call. Short — appended after
  // the universal birthday-style direction so the plan tilts mom-themed.
  planSeasoning: string;
  // System-prompt seasoning for the caption generator. Drives the voice-over
  // tone and the on-screen overlay text.
  captionSeasoning: string;
  // What the fal video prompt opens with — replaces "birthday celebration"
  // for the visual scene.
  sceneOpeningLine: string;
  // What the negative prompt should explicitly NOT render (occasion-specific
  // anti-clichés, e.g. for Mother's Day we want to avoid generic flowers if
  // the prompt asks for something else).
  negativePromptExtras?: string;
  // 5-7 seeded prompt suggestions surfaced in the UI.
  promptSuggestions: string[];
  // Whether the holiday card should be clickable on the dashboard. Coming-
  // soon occasions render in a disabled state.
  status: "live" | "coming-soon";
  // Card swatch — matches the existing ColorName palette.
  cardSwatch: "pink" | "yellow" | "lime" | "lavender" | "coral";
};

export const occasionConfigs: Record<Occasion, OccasionConfig> = {
  general: {
    id: "general",
    label: "Just a message",
    greeting: "",
    honoree: "the person you're sending this to",
    defaultRecipientName: "",
    planSeasoning: [
      "This is a personalized video MESSAGE, NOT a holiday or birthday video. Do not lean into birthday-party tropes, Mother's Day tributes, or any holiday-specific framing unless the user prompt explicitly asks for it.",
      "The user's prompt is the primary creative direction — interpret it literally and follow its tone (sentimental, funny, congratulatory, longing, hype, etc.).",
      "The caption should NOT start with 'Happy ___'. Lead with whatever fits the relationship and the prompt."
    ].join(" "),
    captionSeasoning: [
      "Caption is a personalized video message, not a holiday greeting.",
      "Do NOT start with 'Happy birthday' or 'Happy ___' anything. Open with warmth that fits the user's prompt and the relationship.",
      "Use the recipient's name once if it's provided; otherwise stay second-person and direct."
    ].join(" "),
    sceneOpeningLine:
      "Create a short cinematic personalized video message from the uploaded photo.",
    promptSuggestions: [
      "A thinking-of-you moment — sunlit window, soft smile, like a quiet text in video form.",
      "Throwback road-trip energy — open windows, late afternoon light, laughing in the front seat.",
      "A quick congratulations beat — proud, warm, a single celebratory gesture.",
      "Just-because hug — golden hour, the kind of moment you wish you could send over the phone.",
      "Long-distance hello — close-up, eye contact, a tiny wave to the camera."
    ],
    status: "live",
    cardSwatch: "lavender"
  },
  birthday: {
    id: "birthday",
    label: "Birthday",
    greeting: "Happy Birthday",
    honoree: "the birthday person",
    defaultRecipientName: "the birthday person",
    planSeasoning: "",
    captionSeasoning: "",
    sceneOpeningLine:
      "Create a short cinematic birthday celebration video from the uploaded photo.",
    promptSuggestions: [
      "Make it a rooftop toast at sunset with confetti and warm laughter.",
      "A cozy birthday dinner with candles, cake, and a warm hug at the end.",
      "Beachside golden hour with friends raising glasses to the camera.",
      "A dreamy surprise party reveal — door opens, smiles, sparkles."
    ],
    status: "live",
    cardSwatch: "pink"
  },
  "mothers-day": {
    id: "mothers-day",
    label: "Mother's Day",
    greeting: "Happy Mother's Day",
    honoree: "the mom we're celebrating",
    defaultRecipientName: "Mom",
    planSeasoning: [
      "This is a Mother's Day video, not a birthday video. Lean into the relationship between mother and child — quiet warmth, nostalgia, gratitude, and the small everyday gestures that define motherhood.",
      "Avoid generic party tropes (no balloons, no cake, no candles, no confetti) unless the user's prompt explicitly asks for them.",
      "Favor scenes that feel like a love letter: golden-hour kitchen light, a hug from behind, sharing a cup of tea, holding hands across a generation, looking at old photos together, a garden walk, a phone call you wish you'd made sooner."
    ].join(" "),
    captionSeasoning: [
      "Caption is a Mother's Day message, NOT a birthday message.",
      "Address the recipient as 'Mom' / their actual name / the relationship the user describes (grandma, stepmom, mother-in-law, chosen mom, etc.). Do NOT say 'happy birthday'.",
      "Lead with 'Happy Mother's Day' or a warm equivalent. The tone should feel personal, grateful, and a little soft — like something said in a quiet moment, not shouted at a party."
    ].join(" "),
    sceneOpeningLine:
      "Create a short cinematic Mother's Day tribute video from the uploaded photo.",
    negativePromptExtras:
      "birthday cake, birthday candles, birthday balloons, birthday confetti, birthday party hat, party hat, age numerals, balloon arch",
    promptSuggestions: [
      "A quiet golden-hour kitchen moment — mom laughing, a cup of tea in her hands.",
      "Mom and me in the garden she's always tending, soft sunlight, gentle wind.",
      "A nostalgic montage feel: old family photos, then mom now, side by side.",
      "Mom holding my hand, walking through a tree-lined neighborhood at dusk.",
      "A grateful hug-from-behind moment in a sunlit living room.",
      "Mom dancing in the kitchen to her favorite old song, smiling at the camera."
    ],
    status: "live",
    cardSwatch: "lavender"
  }
};

export function getOccasionConfig(occasion: Occasion | undefined): OccasionConfig {
  return occasionConfigs[occasion ?? "general"];
}

export function occasionFromDraft(draft: Pick<DraftRequest, "occasion">): Occasion {
  return draft.occasion ?? "general";
}

// Occasions surfaced in the dashboard's inline occasion picker. Order is
// intentional — generic first (the default), then the seasoned presets.
export const occasionPickerOptions: ReadonlyArray<{
  id: Occasion;
  label: string;
}> = [
  { id: "general", label: "Just a message" },
  { id: "birthday", label: "Birthday" },
  { id: "mothers-day", label: "Mother's Day" }
];
