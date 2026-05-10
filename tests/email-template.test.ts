import { describe, expect, it } from "vitest";

import { buildBirthdayEmailHtml, buildBirthdayEmailText } from "@/lib/email-template";

const birthdayEmail = {
  to: "maya@example.com",
  birthdayName: "Maya",
  message: "Hope this feels like a pocket-sized party.",
  caption: "Caption with <sparkle>",
  videoUrl: "https://cdn.example.com/birthday-video.mp4?name=\"maya\"&autoplay=0"
};

describe("birthday email template", () => {
  it("embeds the birthday video with an animated, playable template", () => {
    const html = buildBirthdayEmailHtml(birthdayEmail, "Maya");

    expect(html).toContain("<video controls playsinline preload=\"metadata\"");
    expect(html).toContain("src=\"https://cdn.example.com/birthday-video.mp4?name=&quot;maya&quot;&amp;autoplay=0\"");
    expect(html).toContain("Download the birthday video");
    expect(html).toContain("@keyframes bb-float");
    expect(html).toContain("@keyframes bb-pop");
  });

  it("escapes message, caption, name, and video attributes", () => {
    const html = buildBirthdayEmailHtml(
      {
        ...birthdayEmail,
        message: "Hey <script>alert(1)</script>",
        caption: "You & me > everything",
        videoUrl: "https://cdn.example.com/a.mp4?title=\"party\""
      },
      "Maya <3"
    );

    expect(html).toContain("Maya &lt;3");
    expect(html).toContain("Hey &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("You &amp; me &gt; everything");
    expect(html).toContain("title=&quot;party&quot;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("includes a download fallback link in the plain-text email", () => {
    const text = buildBirthdayEmailText(birthdayEmail, "Maya");

    expect(text).toContain("Your birthday video is included in the email.");
    expect(text).toContain("download it here: https://cdn.example.com/birthday-video.mp4");
  });
});
