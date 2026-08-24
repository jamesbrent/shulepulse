export default function CloudDataStreams() {
  return (
    <svg
      className="cds-svg"
      viewBox="0 0 500 700"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <filter id="cds-glow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── Cloud shape (top-left area) ── */}
      <g opacity="0.12">
        <ellipse cx="120" cy="80" rx="55" ry="30" fill="white" />
        <ellipse cx="90" cy="75" rx="35" ry="25" fill="white" />
        <ellipse cx="155" cy="78" rx="30" ry="22" fill="white" />
        <ellipse cx="120" cy="95" rx="60" ry="18" fill="white" />
      </g>

      {/* ── ShulePulse system box (bottom-right area) ── */}
      <g opacity="0.1">
        <rect x="330" y="560" width="120" height="60" rx="8" fill="none" stroke="white" strokeWidth="1" />
        <text x="390" y="586" textAnchor="middle" fill="white" fontSize="8" fontFamily="system-ui" fontWeight="600" opacity="0.9">ShulePulse</text>
        <text x="390" y="600" textAnchor="middle" fill="white" fontSize="5" fontFamily="system-ui" opacity="0.6">School System</text>
        {/* Small indicator dots inside the box */}
        <circle cx="352" cy="608" r="1.5" fill="white" opacity="0.4">
          <animate attributeName="opacity" values="0.2;0.6;0.2" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx="362" cy="608" r="1.5" fill="white" opacity="0.4">
          <animate attributeName="opacity" values="0.2;0.6;0.2" dur="3s" begin="0.8s" repeatCount="indefinite" />
        </circle>
        <circle cx="372" cy="608" r="1.5" fill="white" opacity="0.4">
          <animate attributeName="opacity" values="0.2;0.6;0.2" dur="3s" begin="1.6s" repeatCount="indefinite" />
        </circle>
      </g>

      {/* ── Data stream paths: Cloud → ShulePulse ── */}

      {/* Stream 1 — main diagonal */}
      <path
        id="cds-path-1"
        d="M160,105 C200,200 280,350 340,560"
        fill="none"
        stroke="white"
        strokeWidth="0.8"
        strokeOpacity="0.15"
        strokeDasharray="4 6"
      />
      <circle r="2" fill="white" opacity="0.2" filter="url(#cds-glow)">
        <animateMotion dur="8s" repeatCount="indefinite" begin="0s">
          <mpath href="#cds-path-1" />
        </animateMotion>
        <animate attributeName="opacity" values="0;0.25;0.25;0" dur="8s" repeatCount="indefinite" begin="0s" />
      </circle>
      <circle r="1.5" fill="white" opacity="0.15">
        <animateMotion dur="8s" repeatCount="indefinite" begin="3s">
          <mpath href="#cds-path-1" />
        </animateMotion>
        <animate attributeName="opacity" values="0;0.18;0.18;0" dur="8s" repeatCount="indefinite" begin="3s" />
      </circle>

      {/* Stream 2 — wider arc */}
      <path
        id="cds-path-2"
        d="M80,110 C60,250 200,400 350,555"
        fill="none"
        stroke="white"
        strokeWidth="0.6"
        strokeOpacity="0.1"
        strokeDasharray="3 8"
      />
      <circle r="1.8" fill="white" opacity="0.15" filter="url(#cds-glow)">
        <animateMotion dur="10s" repeatCount="indefinite" begin="1.5s">
          <mpath href="#cds-path-2" />
        </animateMotion>
        <animate attributeName="opacity" values="0;0.2;0.2;0" dur="10s" repeatCount="indefinite" begin="1.5s" />
      </circle>
      <circle r="1.2" fill="white" opacity="0.1">
        <animateMotion dur="10s" repeatCount="indefinite" begin="6s">
          <mpath href="#cds-path-2" />
        </animateMotion>
        <animate attributeName="opacity" values="0;0.15;0.15;0" dur="10s" repeatCount="indefinite" begin="6s" />
      </circle>

      {/* Stream 3 — steep curve */}
      <path
        id="cds-path-3"
        d="M140,95 C180,180 300,300 380,555"
        fill="none"
        stroke="white"
        strokeWidth="0.5"
        strokeOpacity="0.08"
        strokeDasharray="2 10"
      />
      <circle r="1.5" fill="white" opacity="0.12">
        <animateMotion dur="12s" repeatCount="indefinite" begin="4s">
          <mpath href="#cds-path-3" />
        </animateMotion>
        <animate attributeName="opacity" values="0;0.15;0.15;0" dur="12s" repeatCount="indefinite" begin="4s" />
      </circle>

      {/* Stream 4 — left-side sweep */}
      <path
        id="cds-path-4"
        d="M100,120 C80,300 150,450 335,565"
        fill="none"
        stroke="white"
        strokeWidth="0.7"
        strokeOpacity="0.12"
        strokeDasharray="5 7"
      />
      <circle r="2" fill="white" opacity="0.18" filter="url(#cds-glow)">
        <animateMotion dur="9s" repeatCount="indefinite" begin="2s">
          <mpath href="#cds-path-4" />
        </animateMotion>
        <animate attributeName="opacity" values="0;0.22;0.22;0" dur="9s" repeatCount="indefinite" begin="2s" />
      </circle>
      <circle r="1" fill="white" opacity="0.1">
        <animateMotion dur="9s" repeatCount="indefinite" begin="5.5s">
          <mpath href="#cds-path-4" />
        </animateMotion>
        <animate attributeName="opacity" values="0;0.12;0.12;0" dur="9s" repeatCount="indefinite" begin="5.5s" />
      </circle>

      {/* Stream 5 — tight center path */}
      <path
        id="cds-path-5"
        d="M155,100 C220,220 310,380 395,555"
        fill="none"
        stroke="white"
        strokeWidth="0.4"
        strokeOpacity="0.08"
        strokeDasharray="2 12"
      />
      <circle r="1.2" fill="white" opacity="0.1">
        <animateMotion dur="11s" repeatCount="indefinite" begin="7s">
          <mpath href="#cds-path-5" />
        </animateMotion>
        <animate attributeName="opacity" values="0;0.13;0.13;0" dur="11s" repeatCount="indefinite" begin="7s" />
      </circle>

      {/* ── Reverse streams: ShulePulse → Cloud (data coming back) ── */}

      <path
        id="cds-path-r1"
        d="M380,560 C320,380 200,220 130,105"
        fill="none"
        stroke="white"
        strokeWidth="0.5"
        strokeOpacity="0.08"
        strokeDasharray="3 9"
      />
      <circle r="1.5" fill="white" opacity="0.12">
        <animateMotion dur="9.5s" repeatCount="indefinite" begin="5s">
          <mpath href="#cds-path-r1" />
        </animateMotion>
        <animate attributeName="opacity" values="0;0.15;0.15;0" dur="9.5s" repeatCount="indefinite" begin="5s" />
      </circle>

      <path
        id="cds-path-r2"
        d="M350,570 C250,420 120,280 95,115"
        fill="none"
        stroke="white"
        strokeWidth="0.4"
        strokeOpacity="0.06"
        strokeDasharray="2 11"
      />
      <circle r="1" fill="white" opacity="0.08">
        <animateMotion dur="13s" repeatCount="indefinite" begin="8s">
          <mpath href="#cds-path-r2" />
        </animateMotion>
        <animate attributeName="opacity" values="0;0.1;0.1;0" dur="13s" repeatCount="indefinite" begin="8s" />
      </circle>

      {/* ── Ambient floating particles (background depth) ── */}
      {[
        { cx: 60,  cy: 200, r: 1.5, dur: '7s',  delay: '0s' },
        { cx: 420, cy: 300, r: 1,   dur: '9s',  delay: '2s' },
        { cx: 200, cy: 450, r: 1.2, dur: '11s', delay: '1s' },
        { cx: 350, cy: 150, r: 0.8, dur: '8s',  delay: '4s' },
        { cx: 100, cy: 500, r: 1.3, dur: '10s', delay: '3s' },
        { cx: 300, cy: 250, r: 0.7, dur: '12s', delay: '5s' },
        { cx: 450, cy: 450, r: 1,   dur: '9s',  delay: '6s' },
        { cx: 180, cy: 350, r: 0.9, dur: '11s', delay: '2.5s' },
      ].map((p, i) => (
        <circle
          key={i}
          cx={p.cx}
          cy={p.cy}
          r={p.r}
          fill="white"
          opacity="0"
        >
          <animate attributeName="opacity" values="0;0.1;0.1;0" dur={p.dur} begin={p.delay} repeatCount="indefinite" />
          <animate attributeName="cy" values={`${p.cy};${p.cy - 15};${p.cy}`} dur={p.dur} begin={p.delay} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  )
}
