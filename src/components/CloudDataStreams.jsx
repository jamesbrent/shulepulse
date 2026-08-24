export default function CloudDataStreams() {
  return (
    <svg
      className="cds-svg"
      viewBox="0 0 600 700"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <filter id="cds-blur">
          <feGaussianBlur stdDeviation="0.8" />
        </filter>
      </defs>

      {/* ── Faded continents ── */}

      {/* Africa */}
      <path
        d="M295,240 C300,235 315,230 325,235 C335,240 340,255 342,270 C344,285 348,300 345,320 C342,340 335,360 325,375 C315,390 305,400 298,405 C290,408 282,400 278,390 C274,380 270,365 268,350 C266,335 265,315 268,300 C270,285 275,270 280,260 C285,250 290,245 295,240Z"
        fill="white"
        opacity="0.06"
        filter="url(#cds-blur)"
      />

      {/* Europe */}
      <path
        d="M280,170 C285,165 295,160 305,162 C315,164 320,170 318,178 C316,186 310,192 302,195 C294,198 286,195 282,188 C278,181 278,175 280,170Z"
        fill="white"
        opacity="0.05"
        filter="url(#cds-blur)"
      />

      {/* Asia */}
      <path
        d="M340,160 C355,155 375,150 395,155 C415,160 430,170 435,185 C440,200 435,215 425,225 C415,235 400,240 385,238 C370,236 355,230 345,220 C335,210 332,195 335,180 C337,170 338,165 340,160Z"
        fill="white"
        opacity="0.05"
        filter="url(#cds-blur)"
      />

      {/* South America */}
      <path
        d="M180,340 C188,335 198,338 202,348 C206,358 208,375 205,395 C202,415 195,430 185,440 C175,448 165,445 160,435 C155,425 152,410 153,395 C154,380 158,365 165,355 C170,348 175,343 180,340Z"
        fill="white"
        opacity="0.05"
        filter="url(#cds-blur)"
      />

      {/* North America */}
      <path
        d="M120,180 C135,170 155,165 175,170 C195,175 205,185 210,200 C215,215 210,230 200,240 C190,250 175,255 160,252 C145,249 132,240 125,228 C118,216 115,200 118,190 C119,185 120,182 120,180Z"
        fill="white"
        opacity="0.05"
        filter="url(#cds-blur)"
      />

      {/* Australia */}
      <path
        d="M410,380 C420,375 435,378 440,388 C445,398 442,410 435,415 C428,420 418,418 412,410 C406,402 405,390 408,384 C409,381 410,379 410,380Z"
        fill="white"
        opacity="0.04"
        filter="url(#cds-blur)"
      />

      {/* ── Data stream paths between continents ── */}

      {/* Africa → Europe */}
      <path
        id="cds-ae"
        d="M305,240 C300,220 295,200 295,185"
        fill="none" stroke="white" strokeWidth="0.7" strokeOpacity="0.14" strokeDasharray="3 5"
      />
      <circle r="1.8" fill="white" opacity="0.2">
        <animateMotion dur="4s" repeatCount="indefinite" begin="0s"><mpath href="#cds-ae" /></animateMotion>
        <animate attributeName="opacity" values="0;0.22;0.22;0" dur="4s" repeatCount="indefinite" begin="0s" />
      </circle>
      <circle r="1.2" fill="white" opacity="0.12">
        <animateMotion dur="4s" repeatCount="indefinite" begin="2s"><mpath href="#cds-ae" /></animateMotion>
        <animate attributeName="opacity" values="0;0.15;0.15;0" dur="4s" repeatCount="indefinite" begin="2s" />
      </circle>

      {/* Europe → Asia */}
      <path
        id="cds-ea"
        d="M315,175 C335,168 355,162 375,162"
        fill="none" stroke="white" strokeWidth="0.6" strokeOpacity="0.1" strokeDasharray="2 7"
      />
      <circle r="1.5" fill="white" opacity="0.15">
        <animateMotion dur="5s" repeatCount="indefinite" begin="1s"><mpath href="#cds-ea" /></animateMotion>
        <animate attributeName="opacity" values="0;0.18;0.18;0" dur="5s" repeatCount="indefinite" begin="1s" />
      </circle>

      {/* Africa → South America */}
      <path
        id="cds-as"
        d="M275,320 C250,330 220,340 200,350"
        fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.08" strokeDasharray="2 8"
      />
      <circle r="1.2" fill="white" opacity="0.1">
        <animateMotion dur="6s" repeatCount="indefinite" begin="2.5s"><mpath href="#cds-as" /></animateMotion>
        <animate attributeName="opacity" values="0;0.12;0.12;0" dur="6s" repeatCount="indefinite" begin="2.5s" />
      </circle>

      {/* North America → Europe */}
      <path
        id="cds-ne"
        d="M210,195 C235,185 260,178 285,175"
        fill="none" stroke="white" strokeWidth="0.6" strokeOpacity="0.12" strokeDasharray="3 6"
      />
      <circle r="1.5" fill="white" opacity="0.16">
        <animateMotion dur="5.5s" repeatCount="indefinite" begin="0.5s"><mpath href="#cds-ne" /></animateMotion>
        <animate attributeName="opacity" values="0;0.18;0.18;0" dur="5.5s" repeatCount="indefinite" begin="0.5s" />
      </circle>
      <circle r="1" fill="white" opacity="0.08">
        <animateMotion dur="5.5s" repeatCount="indefinite" begin="3.5s"><mpath href="#cds-ne" /></animateMotion>
        <animate attributeName="opacity" values="0;0.1;0.1;0" dur="5.5s" repeatCount="indefinite" begin="3.5s" />
      </circle>

      {/* Asia → Australia */}
      <path
        id="cds-aa"
        d="M420,235 C425,280 420,330 418,380"
        fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.08" strokeDasharray="2 9"
      />
      <circle r="1.2" fill="white" opacity="0.1">
        <animateMotion dur="7s" repeatCount="indefinite" begin="3s"><mpath href="#cds-aa" /></animateMotion>
        <animate attributeName="opacity" values="0;0.12;0.12;0" dur="7s" repeatCount="indefinite" begin="3s" />
      </circle>

      {/* South America → North America */}
      <path
        id="cds-sn"
        d="M175,340 C165,310 150,270 145,230"
        fill="none" stroke="white" strokeWidth="0.4" strokeOpacity="0.07" strokeDasharray="2 10"
      />
      <circle r="1" fill="white" opacity="0.08">
        <animateMotion dur="6.5s" repeatCount="indefinite" begin="4s"><mpath href="#cds-sn" /></animateMotion>
        <animate attributeName="opacity" values="0;0.1;0.1;0" dur="6.5s" repeatCount="indefinite" begin="4s" />
      </circle>

      {/* Africa → Asia (long arc) */}
      <path
        id="cds-al"
        d="M335,270 C355,250 380,230 400,210"
        fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.09" strokeDasharray="3 7"
      />
      <circle r="1.3" fill="white" opacity="0.12">
        <animateMotion dur="6s" repeatCount="indefinite" begin="1.5s"><mpath href="#cds-al" /></animateMotion>
        <animate attributeName="opacity" values="0;0.14;0.14;0" dur="6s" repeatCount="indefinite" begin="1.5s" />
      </circle>

      {/* Europe → Australia (long arc) */}
      <path
        id="cds-eau"
        d="M310,195 C340,250 380,320 415,385"
        fill="none" stroke="white" strokeWidth="0.4" strokeOpacity="0.06" strokeDasharray="2 11"
      />
      <circle r="1" fill="white" opacity="0.08">
        <animateMotion dur="8s" repeatCount="indefinite" begin="5s"><mpath href="#cds-eau" /></animateMotion>
        <animate attributeName="opacity" values="0;0.1;0.1;0" dur="8s" repeatCount="indefinite" begin="5s" />
      </circle>

      {/* ── Ambient floating dots ── */}
      {[
        { cx: 80,  cy: 300, dur: '9s',  d: '0s' },
        { cx: 500, cy: 250, dur: '11s', d: '2s' },
        { cx: 250, cy: 500, dur: '10s', d: '1s' },
        { cx: 450, cy: 150, dur: '12s', d: '3s' },
        { cx: 150, cy: 450, dur: '8s',  d: '4s' },
        { cx: 380, cy: 500, dur: '10s', d: '5s' },
        { cx: 50,  cy: 180, dur: '11s', d: '1.5s' },
        { cx: 520, cy: 400, dur: '9s',  d: '3.5s' },
      ].map((p, i) => (
        <circle key={i} cx={p.cx} cy={p.cy} r="1" fill="white" opacity="0">
          <animate attributeName="opacity" values="0;0.08;0.08;0" dur={p.dur} begin={p.d} repeatCount="indefinite" />
          <animate attributeName="cy" values={`${p.cy};${p.cy - 12};${p.cy}`} dur={p.dur} begin={p.d} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  )
}
