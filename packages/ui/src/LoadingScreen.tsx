import { RotateCw } from "lucide-react";

function LoadingIllustration({ failed = false }: { failed?: boolean }) {
  return (
    <svg
      className="ct-loading-screen__illustration"
      viewBox="0 0 264 176"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="132" cy="91" rx="111" ry="68" fill="var(--ct-brand-50)" />
      <ellipse cx="132" cy="144" rx="68" ry="8" fill="var(--ct-brand-100)" />
      <g className="ct-loading-screen__sparkles">
        <path d="M49 43v14m-7-7h14m158 65v12m-6-6h12" stroke="var(--ct-brand-500)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="59" cy="96" r="3" fill="var(--ct-brand-200)" />
        <circle cx="215" cy="78" r="3" fill="var(--ct-intake-ink)" />
      </g>
      <g className="ct-loading-screen__book">
        <path d="M132 112c-16-12-36-16-57-12v38c20-3 39 0 57 10 18-10 37-13 57-10v-38c-21-4-41 0-57 12Z" fill="var(--ct-brand-500)" />
        <path d="M132 105c-15-12-34-17-52-13v38c18-2 38 3 52 13 14-10 34-15 52-13V92c-18-4-37 1-52 13Z" fill="var(--ct-white)" stroke="var(--ct-brand-700)" strokeWidth="2" strokeLinejoin="round" />
        <path d="M132 106v36m-41-36c10 0 20 3 29 8m-29 1c10 0 20 3 29 8m24-9c9-5 19-8 29-8m-29 17c9-5 19-8 29-8" stroke="var(--ct-brand-200)" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <g className="ct-loading-screen__bubble">
        <path d="M93 38h27a14 14 0 0 1 0 28h-12l-10 8v-8h-5a14 14 0 0 1 0-28Z" fill="var(--ct-intake-mint)" stroke="var(--ct-intake-ink)" strokeWidth="2" strokeLinejoin="round" />
        <path d="m101 52 4 4 8-8" stroke="var(--ct-intake-ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g className="ct-loading-screen__bubble ct-loading-screen__bubble--large">
        <path d="M150 48h29a17 17 0 0 1 0 34h-16l-11 9v-9h-2a17 17 0 0 1 0-34Z" fill="var(--ct-brand-100)" stroke="var(--ct-brand-700)" strokeWidth="2" strokeLinejoin="round" />
        {failed ? (
          <path d="M164.5 57v9m0 6h.01" stroke="var(--ct-brand-700)" strokeWidth="3" strokeLinecap="round" />
        ) : (
          <g fill="var(--ct-brand-700)">
            <circle cx="154" cy="65" r="2.5" />
            <circle cx="164.5" cy="65" r="2.5" />
            <circle cx="175" cy="65" r="2.5" />
          </g>
        )}
      </g>
    </svg>
  );
}

export function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="ct-loading-screen">
      <div className="ct-loading-screen__content" role="status">
        <LoadingIllustration />
        <p className="ct-loading-screen__message">{message}</p>
      </div>
    </main>
  );
}

export function LoadingFailureScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="ct-loading-screen ct-loading-screen--failed">
      <div className="ct-loading-screen__content">
        <LoadingIllustration failed />
        <div role="alert">
          <h1 className="ct-loading-screen__message">数据加载失败</h1>
          <p className="ct-loading-screen__description">暂时无法读取数据，请稍后重试。</p>
        </div>
        <button type="button" className="btn btn-primary ct-loading-screen__retry" onClick={onRetry}>
          <RotateCw size={16} aria-hidden="true" />
          重新加载
        </button>
      </div>
    </main>
  );
}
