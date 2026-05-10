import { EmailSendRequest } from "@/lib/types";

export function buildBirthdayEmailText(input: EmailSendRequest, birthdayName: string) {
  const videoUrl = input.videoUrl?.trim();

  return [
    `Happy birthday, ${birthdayName}!`,
    "",
    input.message,
    input.caption ? ["", input.caption].join("\n") : "",
    videoUrl
      ? [
          "",
          "Your birthday video is included in the email.",
          `If it does not play in your inbox, open it here: ${videoUrl}`
        ].join("\n")
      : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildBirthdayEmailHtml(input: EmailSendRequest, birthdayName: string) {
  const escapedName = escapeHtml(birthdayName);
  const escapedMessage = escapeHtml(input.message).replace(/\n/g, "<br />");
  const escapedCaption = input.caption?.trim()
    ? `<p style="margin:18px 0 0;color:#53334d;font-size:15px;line-height:1.6;">${escapeHtml(input.caption).replace(/\n/g, "<br />")}</p>`
    : "";
  const videoBlock = buildVideoBlock(input.videoUrl);

  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <style>
      @keyframes bb-float {
        0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.72; }
        50% { transform: translateY(-10px) rotate(8deg); opacity: 1; }
      }

      @keyframes bb-pop {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.055); }
      }

      @keyframes bb-shimmer {
        0% { background-position: 0% 50%; }
        100% { background-position: 100% 50%; }
      }

      @media screen and (max-width: 620px) {
        .bb-shell { padding: 20px 12px !important; }
        .bb-card { padding: 24px 18px !important; }
        .bb-title { font-size: 34px !important; }
        .bb-video-wrap { border-width: 7px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#fff3d8;">
    <div class="bb-shell" style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#221428;max-width:680px;margin:0 auto;padding:30px 16px;background:#fff3d8;">
      <div class="bb-card" style="position:relative;overflow:hidden;border-radius:26px;background:#fffdf7;border:3px solid #221428;box-shadow:8px 8px 0 #221428;padding:34px 30px;">
        <div aria-hidden="true" style="position:absolute;inset:0;background:radial-gradient(circle at 12% 14%, rgba(255,112,150,.22) 0 12%, transparent 13%),radial-gradient(circle at 88% 16%, rgba(55,190,160,.2) 0 11%, transparent 12%),radial-gradient(circle at 78% 90%, rgba(255,207,71,.26) 0 12%, transparent 13%);pointer-events:none;"></div>

        <div aria-hidden="true" style="position:relative;height:34px;margin-bottom:6px;">
          <span style="position:absolute;left:4%;top:4px;width:12px;height:20px;background:#ff5c8a;border-radius:2px;display:inline-block;animation:bb-float 1.8s ease-in-out infinite;"></span>
          <span style="position:absolute;left:20%;top:14px;width:16px;height:10px;background:#2ec4a6;border-radius:10px;display:inline-block;animation:bb-float 2.1s ease-in-out infinite;"></span>
          <span style="position:absolute;left:44%;top:0;width:12px;height:12px;background:#ffd447;border-radius:999px;display:inline-block;animation:bb-float 1.6s ease-in-out infinite;"></span>
          <span style="position:absolute;right:22%;top:13px;width:18px;height:8px;background:#8b5cf6;border-radius:2px;display:inline-block;animation:bb-float 2.3s ease-in-out infinite;"></span>
          <span style="position:absolute;right:5%;top:2px;width:11px;height:19px;background:#ff8a3d;border-radius:2px;display:inline-block;animation:bb-float 1.9s ease-in-out infinite;"></span>
        </div>

        <p style="position:relative;margin:0 0 10px;color:#7b3cff;font-size:13px;font-weight:800;letter-spacing:0;text-transform:uppercase;">BirthdayBot delivery</p>
        <h1 class="bb-title" style="position:relative;font-size:44px;line-height:1.02;margin:0 0 16px;color:#221428;">
          Happy birthday, ${escapedName}!
        </h1>

        <div style="position:relative;background:#f7ffd8;border:2px solid #221428;border-radius:18px;padding:18px 18px;box-shadow:4px 4px 0 #221428;">
          <p style="font-size:18px;margin:0;color:#221428;">${escapedMessage}</p>
          ${escapedCaption}
        </div>

        ${videoBlock}

        <div style="position:relative;margin-top:24px;padding:14px 16px;border-radius:999px;background:linear-gradient(90deg,#ff5c8a,#ffd447,#2ec4a6,#7b3cff);background-size:220% 100%;animation:bb-shimmer 3.6s linear infinite;color:#221428;text-align:center;font-weight:900;">
          Made with one photo, one message, and a properly festive amount of sparkle.
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function buildVideoBlock(videoUrl: string | undefined) {
  const trimmedVideoUrl = videoUrl?.trim();

  if (!trimmedVideoUrl) {
    return "";
  }

  const escapedVideoUrl = escapeAttribute(trimmedVideoUrl);

  return `
        <div class="bb-video-wrap" style="position:relative;margin:26px 0 0;background:#221428;border:9px solid #221428;border-radius:24px;overflow:hidden;box-shadow:6px 6px 0 #ffcf47;">
          <video controls playsinline preload="metadata" src="${escapedVideoUrl}" style="display:block;width:100%;max-width:100%;height:auto;background:#221428;">
            <a href="${escapedVideoUrl}" style="color:#fff;text-decoration:underline;">Play the birthday video</a>
          </video>
        </div>
        <p style="position:relative;margin:14px 0 0;text-align:center;">
          <a href="${escapedVideoUrl}" style="display:inline-block;background:#221428;color:#fff;text-decoration:none;border-radius:999px;padding:13px 20px;font-size:15px;font-weight:900;box-shadow:4px 4px 0 #ff5c8a;animation:bb-pop 1.8s ease-in-out infinite;">Play the birthday video</a>
        </p>
        <p style="position:relative;margin:12px 0 0;text-align:center;color:#6d536b;font-size:13px;">
          If your inbox blocks inline video, this button opens the same video in your browser.
        </p>`;
}

function escapeHtml(value = "") {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
