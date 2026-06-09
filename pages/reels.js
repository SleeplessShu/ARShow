// pages/reels.js
export function init(container) {
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                height:100%;min-height:300px;gap:12px;padding:2rem;text-align:center;">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#333" stroke-width="1.5">
        <rect x="8" y="8" width="32" height="32" rx="6"/>
        <line x1="8" y1="24" x2="40" y2="24" opacity="0.5"/>
        <line x1="24" y1="8" x2="24" y2="40" opacity="0.5"/>
      </svg>
      <span style="font-size:1rem;font-weight:500;color:#555;">Reels</span>
      <span style="font-size:0.8rem;color:#3a3a3a;">Coming soon</span>
    </div>
  `;
}
