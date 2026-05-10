# BirthdayBot Demo Script

## Demo Goal

Show BirthdayBot as a practical creative tool for the AutoHDR Photo-to-Video track: it turns one ordinary shared photo into a polished birthday video package with planning, controls, iteration, optional voice-over, and export.

The story to land with judges:

> BirthdayBot is not just "generate me a video." It is a guided photo-to-video workflow that preserves the emotional details of a real photo, turns rough user intent into a creative plan, generates a cinematic birthday clip, and gives the sender an immediately usable caption and download.

## Setup Checklist

- Open the deployed app or local dev server.
- Have one friendly shared photo ready on the desktop.
- Have one backup generated video ready in `public/demo.mp4` in case provider latency is slow.
- Keep environment variables off screen.
- Use a prompt you can say naturally:

```text
Make this feel like a warm cinematic rooftop birthday moment. Keep us recognizable, add soft camera motion, party lights, and a little heartfelt humor. The video should feel personal, polished, and ready to text.
```

- Optional voice demo line:

```text
I recorded a short sample so BirthdayBot can create a narrated version in my voice, with explicit consent before generation.
```

## 90-Second Pitch

**Opening**

Hi, I built BirthdayBot for the AutoHDR Photo-to-Video track. The idea is simple: most people want to send something more thoughtful than "happy birthday," but they do not have time to edit a video. BirthdayBot turns one shared photo and a rough idea into a polished birthday video, caption, and optional narrated message.

**Problem**

The hard part is not only generating a clip. It is making the generation controllable enough for a real person: preserving who is in the photo, choosing the right mood, giving the user confidence before generation starts, and making it easy to refine the result.

**Demo Setup**

I am starting with a single photo and a plain-language prompt. The app first builds an agent plan before spending time on video generation, so the user can see what it intends to preserve, what visual style it will use, and how it will handle motion.

**Main Moment**

Here is the plan: it keeps facial identity and clothing cues from the photo, chooses a birthday scene direction, defines the camera movement, and writes the caption strategy. This is the control layer. I can accept it, adjust my prompt, switch to advanced controls, or ask the agent to surprise me again.

**Generation**

Now I generate. During generation, the app shows meaningful progress states instead of hiding everything behind a spinner: analyzing, writing, generating, retrying if needed, and finalizing.

**Result**

The final package includes the video preview, the send-ready caption, download, copy caption, regenerate, and adjust settings. The important thing is that this becomes a usable creative workflow, not a one-shot toy.

**Close**

For AutoHDR, I focused on control, iteration, usability, and preserving personal details from the input photo. BirthdayBot turns photo-to-video generation into a small but real product: a last-minute birthday message that feels made, not generated.

## Live Demo Walkthrough

### 1. Start On The Creation Screen

Say:

> This is intentionally mobile-first because birthdays are usually last-minute and personal. I wanted the first screen to be the actual workflow, not a marketing page.

Do:

- Point out the simple/advanced toggle.
- Enter the birthday recipient name.
- Paste the prepared prompt.
- Upload the shared photo.

### 2. Show Optional Voice Input

Say:

> Voice is optional, but it shows how this can become more than background motion. If I add a sample, the app requires explicit consent before it will use voice cloning.

Do:

- Briefly point to the recording/upload area.
- Do not record live unless you have plenty of time.
- If showing voice, use a prepared short sample.

### 3. Build The Agent Brief

Say:

> Before generating video, BirthdayBot translates the user's rough request into a creative brief. This is where the product adds control: it makes the model plan visible.

Do:

- Click **Build my birthday brief**.
- Pause on the agent planning state.
- When the review appears, read the plan labels:
  - Vibe
  - Scene direction
  - Motion direction
  - Generation strategy
  - Keep from photo
  - Caption approach

### 4. Emphasize Control

Say:

> This is the key difference from a raw model playground. I can inspect what it plans to keep from the photo, adjust the prompt, or use advanced controls for tone, scene, aspect ratio, music vibe, motion intensity, and goal mode.

Do:

- Click **Adjust prompt** only if you want to show controls.
- Switch to **Advanced**.
- Quickly show a few controls, then return to the plan flow.
- Avoid getting stuck tweaking too much.

### 5. Generate

Say:

> Now the app sends the planned request into the video pipeline. In a production version this could become an iterative quality loop; in the MVP I already expose retries and progress so the user knows what is happening.

Do:

- Click **Generate birthday video**.
- Talk through the visible status states.
- If live generation is slow, say:

> Video generation can take longer than a judging slot, so I have a completed run ready to show the final product.

Then open the completed result or use the prepared video.

### 6. Show The Result

Say:

> The result is a complete birthday package: video, caption, download, copy caption, regenerate, and settings adjustment. That last part matters because creative tools need iteration.

Do:

- Play the video.
- Point out the caption overlay and generated caption.
- Click **Copy caption** if useful.
- Point out **Regenerate** and **Adjust settings**.

## 3-Minute Judge Version

Use this if time is tight.

1. "BirthdayBot turns one shared photo and one rough birthday idea into a polished photo-to-video message."
2. "The app first creates an agent plan so the user can see the concept, motion direction, caption strategy, and what details will be preserved."
3. "Advanced controls let the sender steer tone, scene, aspect ratio, music vibe, motion intensity, and whether the agent should surprise or stay close to the prompt."
4. "Generation has visible progress and a retry-aware pipeline, because photo-to-video workflows need trust during latency."
5. "The result is immediately usable: video preview, caption, download, copy, regenerate, and adjust."
6. "For AutoHDR, the product pushes photo-to-video toward an actual creative workflow: controlled, personal, iterative, and sendable."

## Backup Plan

If the provider is slow or fails:

Say:

> Since photo-to-video generation can take longer than a live judging slot, I am going to show a completed run from the same workflow. The important product layer is the controlled pipeline around generation: plan, preserve, generate, refine, export.

Then show:

- The agent plan screen.
- The generated caption.
- `public/demo.mp4` or another completed generated video.
- The result actions.

Do not apologize for model latency. Treat the backup as normal demo hygiene.

## Likely Judge Questions

**How does this fit the AutoHDR track?**

BirthdayBot uses photo-to-video generation as the core output, but wraps it in a usability layer: planning, preservation instructions, style controls, progress, retries, and export. The track asks for control, iteration, preserving details, and turning rough input into polished creative output. That is exactly the product shape.

**What is technically hard here?**

The workflow coordinates image input, prompt planning, caption generation, provider video generation, optional voice-over, progress polling, and final packaging. The product challenge is making a probabilistic video model feel controllable and trustworthy to a non-editor.

**Why birthdays?**

It is narrow on purpose. Birthdays are frequent, emotionally meaningful, and time-sensitive. That lets the product be useful without needing a full professional editor.

**What would you build next?**

- A side-by-side iteration history.
- A quality scoring pass that detects identity drift or weak motion and retries automatically.
- More editable scene recipes.
- Multiple output formats for text message, Instagram story, and square feed post.
- Persistent project history.

**What makes this more than a wrapper?**

The agent plan and refinement loop. The user is not just sending a prompt to a model; they are reviewing a structured creative brief, steering generation settings, and receiving a complete send-ready package.

## Phrases To Reuse

- "A real creative tool needs control before generation and iteration after generation."
- "The plan screen is the trust layer."
- "The app preserves the emotional anchors of the photo while adding cinematic motion."
- "BirthdayBot turns model latency into visible progress instead of uncertainty."
- "The result is not just a clip. It is a complete sendable birthday package."

## Things To Avoid Saying

- Do not say the app is production-ready.
- Do not show API keys or environment variables.
- Do not promise perfect identity preservation.
- Do not spend the whole demo on voice cloning; keep photo-to-video as the hero.
- Do not let live provider latency control the rhythm of the pitch.
