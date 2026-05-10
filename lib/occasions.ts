import type { DraftRequest, Occasion } from "@/lib/types";

// HolidayBot — single source of truth for occasion-specific copy that the
// pipeline parameterizes against. Adding a new holiday is: add the id to
// `Occasion` in lib/types.ts, register a config here, and the rest of the
// pipeline picks it up.

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
  return occasionConfigs[occasion ?? "birthday"];
}

export function occasionFromDraft(draft: Pick<DraftRequest, "occasion">): Occasion {
  return draft.occasion ?? "birthday";
}

// Holiday rail surfaced on the BirthdayBot dashboard. Live ones are
// clickable; coming-soon entries render disabled. Order is intentional —
// most-relevant first.
export const holidayRail: Array<{
  id: Occasion | string;
  label: string;
  emoji: string;
  status: "live" | "coming-soon";
  href?: string;
  swatch: "pink" | "yellow" | "lime" | "lavender" | "coral";
}> = [
  {
    id: "mothers-day",
    label: "Mother's Day",
    emoji: "💐",
    status: "live",
    href: "/mothers-day",
    swatch: "lavender"
  },
  {
    id: "fathers-day",
    label: "Father's Day",
    emoji: "🧢",
    status: "coming-soon",
    swatch: "coral"
  },
  {
    id: "valentines",
    label: "Valentine's Day",
    emoji: "💌",
    status: "coming-soon",
    swatch: "pink"
  },
  {
    id: "anniversary",
    label: "Anniversary",
    emoji: "💞",
    status: "coming-soon",
    swatch: "coral"
  },
  {
    id: "graduation",
    label: "Graduation",
    emoji: "🎓",
    status: "coming-soon",
    swatch: "yellow"
  },
  {
    id: "thanksgiving",
    label: "Thanksgiving",
    emoji: "🍂",
    status: "coming-soon",
    swatch: "yellow"
  },
  {
    id: "christmas",
    label: "Christmas",
    emoji: "🎄",
    status: "coming-soon",
    swatch: "lime"
  },
  {
    id: "new-year",
    label: "New Year",
    emoji: "🎉",
    status: "coming-soon",
    swatch: "lavender"
  }
];
