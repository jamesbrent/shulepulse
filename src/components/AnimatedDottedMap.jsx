import { useMemo } from 'react'

const VIEWBOX_W = 1000
const VIEWBOX_H = 500
const DOT_R = 1.3
const GRID = 8

const CONTINENTS = `
M145,115 L155,108 168,105 182,108 195,115 205,125 212,138 215,152 218,165 222,178 225,192 228,205
  225,218 220,230 215,240 208,248 198,252 188,248 180,240 175,230 172,218 170,205 168,192 165,178
  162,165 158,152 152,140 148,128Z
M225,105 L235,98 250,95 265,98 278,105 285,115 280,122 270,128 258,130 245,128 235,122 228,115Z
M310,85 L325,78 345,72 368,68 392,72 415,78 438,88 455,100 468,115 475,132 470,148 460,162
  448,175 432,185 415,192 398,195 380,192 362,185 348,175 335,162 325,148 318,132 312,115 310,100Z
M445,85 L458,80 475,78 492,82 508,90 520,102 528,118 532,135 530,152 522,168 510,180
  495,188 478,190 462,185 448,175 438,162 432,148 428,132 430,115 435,100Z
M525,78 L540,72 558,68 578,72 595,80 610,92 618,108 622,125 620,142 612,158
  600,170 585,178 568,182 550,180 535,172 522,160 515,145 512,128 515,110 518,95Z
M595,68 L615,62 638,58 662,62 685,72 705,85 718,102 725,120 720,138
  710,155 695,168 678,178 658,182 638,180 620,172 608,160 598,145 592,128 590,110 592,90Z
M680,55 L698,48 718,42 740,45 760,52 778,62 792,75 800,92 798,110 790,128
  778,142 762,152 745,158 728,155 712,148 700,135 692,120 688,102 685,82Z
M800,62 L815,58 832,60 845,68 850,80 845,92 835,98 822,95 812,88 805,78Z
M792,95 L808,92 825,95 838,105 842,118 835,128 822,132 808,128 798,118 792,108Z
M440,220 L455,215 472,218 485,228 490,242 488,258 480,272 468,282 452,285
  438,280 428,268 422,252 420,235 425,225Z
M188,260 L198,255 212,258 220,268 225,282 222,298 215,312 205,322 192,328
  180,325 172,312 168,298 170,282 175,270Z
M430,300 L445,295 462,298 475,308 480,322 475,338 465,350 450,355 435,350
  425,338 420,322 422,308Z
M758,162 L772,158 788,160 800,168 808,180 810,195 805,208 795,218 780,222
  765,218 755,208 750,195 752,180Z
M705,185 L718,180 732,182 742,190 748,202 745,215 735,222 722,220 712,212 708,200Z
M475,240 L488,235 502,238 512,248 515,262 510,275 498,280 485,278 475,268 470,255Z
`

/* Subtle decorative module labels placed in open "ocean" areas */
const MODULE_LABELS = []

export default function AnimatedDottedMap() {
  const dots = useMemo(() => {
    const pts = []
    for (let x = 0; x <= VIEWBOX_W; x += GRID) {
      for (let y = 0; y <= VIEWBOX_H; y += GRID) {
        pts.push({ x, y })
      }
    }
    return pts
  }, [])

  const gridPath = useMemo(() => {
    let d = ''
    for (let x = 0; x <= VIEWBOX_W; x += GRID * 5) d += `M${x},0 L${x},${VIEWBOX_H} `
    for (let y = 0; y <= VIEWBOX_H; y += GRID * 5) d += `M0,${y} L${VIEWBOX_W},${y} `
    return d
  }, [])

  const connections = useMemo(() => [
    { d: 'M200,145 C280,120 380,100 460,110', dur: '9s',  delay: '0s',   opacity: 0.10 },
    { d: 'M460,110 C520,95 600,85 680,80',      dur: '10s', delay: '1.5s', opacity: 0.09 },
    { d: 'M680,80 C740,75 790,80 830,90',       dur: '8s',  delay: '3s',   opacity: 0.07 },
    { d: 'M200,145 C210,180 215,220 210,260',   dur: '7s',  delay: '0.5s', opacity: 0.08 },
    { d: 'M210,260 C220,290 215,310 200,325',   dur: '6s',  delay: '2s',   opacity: 0.06 },
    { d: 'M460,110 C455,160 450,200 455,235',   dur: '8s',  delay: '1s',   opacity: 0.07 },
    { d: 'M455,235 C460,270 455,300 445,340',   dur: '7s',  delay: '2.5s', opacity: 0.06 },
    { d: 'M680,80 C720,120 760,160 780,180',    dur: '9s',  delay: '4s',   opacity: 0.06 },
    { d: 'M780,180 C770,200 730,210 715,205',   dur: '6s',  delay: '5s',   opacity: 0.05 },
    { d: 'M830,90 C840,100 840,115 835,125',    dur: '5s',  delay: '3.5s', opacity: 0.05 },
  ], [])

  return (
    <svg
      className="adm-map-svg"
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <clipPath id="adm-world-clip">
          <path d={CONTINENTS} />
        </clipPath>
        <filter id="adm-dot-glow">
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
      </defs>

      {/* ── Faint background grid lines ── */}
      <path
        d={gridPath}
        fill="none"
        stroke="white"
        strokeWidth="0.5"
        strokeOpacity="0.04"
      />

      {/* ── Dotted world map — grid masked by continent shapes ── */}
      <g clipPath="url(#adm-world-clip)">
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={DOT_R}
            fill="white"
            opacity={0.10 + (((d.x * 7 + d.y * 13) % 100) / 100) * 0.16}
          />
        ))}
      </g>

      {/* ── Floating module labels (decorative) ── */}
      {MODULE_LABELS.map((m, i) => (
        <g key={`label-${i}`} fill="white" opacity="0.05">
          <circle cx={m.x - 8} cy={m.y - 3} r="1.5" />
          <text
            x={m.x}
            y={m.y}
            fontSize="9"
            fontFamily="Inter, sans-serif"
            letterSpacing="2.5"
          >
            {m.text}
          </text>
        </g>
      ))}

      {/* ── Pulsing overlay dots ── */}
      {[
        { cx: 200, cy: 145, r: 4, dur: '5s', d: '0s' },
        { cx: 460, cy: 110, r: 4, dur: '6s', d: '1s' },
        { cx: 680, cy: 80,  r: 4, dur: '5.5s', d: '2s' },
        { cx: 830, cy: 90,  r: 3, dur: '7s', d: '0.5s' },
        { cx: 210, cy: 260, r: 3.5, dur: '6.5s', d: '1.5s' },
        { cx: 455, cy: 235, r: 3.5, dur: '5s', d: '3s' },
        { cx: 780, cy: 180, r: 3, dur: '6s', d: '2.5s' },
        { cx: 200, cy: 325, r: 3, dur: '7s', d: '4s' },
      ].map((p, i) => (
        <g key={`pulse-${i}`}>
          <circle
            cx={p.cx}
            cy={p.cy}
            r={p.r}
            fill={i % 2 === 0 ? '#4ade80' : '#60a5fa'}
            opacity="0"
            filter="url(#adm-dot-glow)"
          >
            <animate attributeName="opacity" values="0;0.09;0" dur={p.dur} begin={p.d} repeatCount="indefinite" />
            <animate attributeName="r" values={`${p.r};${p.r + 2};${p.r}`} dur={p.dur} begin={p.d} repeatCount="indefinite" />
          </circle>
        </g>
      ))}

      {/* ── Connection paths with traveling data particles ── */}
      {connections.map((c, i) => (
        <g key={`conn-${i}`}>
          <path
            id={`adm-cp-${i}`}
            d={c.d}
            fill="none"
            stroke="white"
            strokeWidth="0.6"
            strokeOpacity={c.opacity * 0.5}
            strokeDasharray="3 6"
          />
          {/* Primary particle */}
          <circle
            r="2"
            fill={i % 2 === 0 ? '#4ade80' : '#60a5fa'}
            opacity="0"
            filter="url(#adm-dot-glow)"
          >
            <animateMotion dur={c.dur} repeatCount="indefinite" begin={c.delay}>
              <mpath href={`#adm-cp-${i}`} />
            </animateMotion>
            <animate attributeName="opacity" values="0;0.14;0.14;0" dur={c.dur} repeatCount="indefinite" begin={c.delay} />
          </circle>
          {/* Secondary particle (smaller, slower, fainter) */}
          <circle r="1.2" fill="white" opacity="0">
            <animateMotion dur={`${parseFloat(c.dur) + 3}s`} repeatCount="indefinite" begin={`${parseFloat(c.delay) + 2}s`}>
              <mpath href={`#adm-cp-${i}`} />
            </animateMotion>
            <animate attributeName="opacity" values="0;0.1;0.1;0" dur={`${parseFloat(c.dur) + 3}s`} repeatCount="indefinite" begin={`${parseFloat(c.delay) + 2}s`} />
          </circle>
        </g>
      ))}

      {/* ── Ambient floating particles ── */}
      {[
        { cx: 50,  cy: 200, dur: '12s', d: '0s' },
        { cx: 950, cy: 150, dur: '14s', d: '3s' },
        { cx: 500, cy: 450, dur: '11s', d: '1s' },
        { cx: 150, cy: 400, dur: '13s', d: '5s' },
        { cx: 850, cy: 350, dur: '10s', d: '2s' },
        { cx: 350, cy: 30,  dur: '15s', d: '4s' },
      ].map((p, i) => (
        <circle key={`amb-${i}`} cx={p.cx} cy={p.cy} r="1" fill="white" opacity="0">
          <animate attributeName="opacity" values="0;0.06;0.06;0" dur={p.dur} begin={p.d} repeatCount="indefinite" />
          <animate attributeName="cy" values={`${p.cy};${p.cy - 10};${p.cy}`} dur={p.dur} begin={p.d} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  )
}
