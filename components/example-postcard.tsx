"use client";

export function ExamplePostcard() {
  return (
    <div className="preview-col-inner">
      <p className="preview-eyebrow">Example output</p>

      <div className="postcard">
        <div className="film-strip" aria-hidden>
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="film-hole" />
          ))}
        </div>

        <div className="postcard-screen">
          <div className="postcard-art" aria-hidden />
          <div className="postcard-bokeh" aria-hidden />

          <span className="postcard-spark ps1" aria-hidden>✦</span>
          <span className="postcard-spark ps2" aria-hidden>✧</span>
          <span className="postcard-spark ps3" aria-hidden>★</span>
          <span className="postcard-spark ps4" aria-hidden>✦</span>
          <span className="postcard-spark ps5" aria-hidden>✧</span>

          <div className="postcard-play" aria-hidden>
            <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>

          <div className="postcard-overlay">
            <p className="postcard-name">Happy birthday Cecilia ✦</p>
            <p className="postcard-msg">
              You are one of my favorite people. I hope this year brings the kind of moments that make you pause and smile.
            </p>
          </div>
        </div>

        <div className="film-strip" aria-hidden>
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="film-hole" />
          ))}
        </div>

        <div className="postcard-footer">
          <span className="postcard-brand">BirthdayBot</span>
          <span className="postcard-dl">↓ Download</span>
        </div>
      </div>

      <p className="preview-hint">
        Upload a photo and describe the vibe — BirthdayBot shapes the rest.
      </p>
    </div>
  );
}

export function ResultPostcard({
  videoUrl,
  caption,
  birthdayName,
  voiceOverUrl,
}: {
  videoUrl: string;
  caption: string;
  birthdayName?: string;
  voiceOverUrl?: string;
}) {
  const label = birthdayName
    ? `Happy birthday ${birthdayName} ✦`
    : "Happy birthday ✦";

  return (
    <div className="preview-col-inner result-col">
      <p className="preview-eyebrow">Birthday package ready</p>

      <div className="postcard result-postcard">
        <div className="film-strip" aria-hidden>
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="film-hole" />
          ))}
        </div>

        <div className="result-postcard-screen">
          <video
            className="result-col-video"
            controls
            playsInline
            autoPlay
            src={videoUrl}
          />
          {voiceOverUrl ? <audio autoPlay src={voiceOverUrl} /> : null}
          <div className="postcard-overlay result-overlay">
            <p className="postcard-name">{label}</p>
          </div>
        </div>

        <div className="film-strip" aria-hidden>
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="film-hole" />
          ))}
        </div>

        <div className="postcard-footer">
          <span className="postcard-brand">BirthdayBot</span>
          <a className="postcard-dl-link" href={videoUrl} download>
            ↓ Download
          </a>
        </div>
      </div>

      <p className="preview-caption-text">{caption}</p>
    </div>
  );
}
