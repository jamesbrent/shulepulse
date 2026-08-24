import { useMemo } from 'react'
import './AnimatedNetworkBackground.css'

const MODULES = [
  { name: 'Students',       angle: 0 },
  { name: 'Academics',      angle: 36 },
  { name: 'Finance',        angle: 72 },
  { name: 'Attendance',     angle: 108 },
  { name: 'Examinations',   angle: 144 },
  { name: 'Timetable',      angle: 180 },
  { name: 'HR',             angle: 216 },
  { name: 'Payroll',        angle: 252 },
  { name: 'Communication',  angle: 288 },
  { name: 'Reports',        angle: 324 },
]

const CX = 50, CY = 50, R = 36

function nodePos(angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) }
}

export default function AnimatedNetworkBackground() {
  const nodes = useMemo(() => MODULES.map((m) => ({
    ...m,
    ...nodePos(m.angle),
  })), [])

  return (
    <div className="anb-root" aria-hidden="true">
      <div className="anb-bg" />

      {/* Floating ambient particles */}
      <div className="anb-particles">
        {Array.from({ length: 30 }, (_, i) => (
          <span
            key={i}
            className="anb-particle"
            style={{
              '--x': `${5 + Math.random() * 90}%`,
              '--y': `${5 + Math.random() * 90}%`,
              '--dur': `${8 + Math.random() * 12}s`,
              '--delay': `${-Math.random() * 10}s`,
              '--size': `${2 + Math.random() * 3}px`,
              '--opacity': 0.15 + Math.random() * 0.35,
            }}
          />
        ))}
      </div>

      {/* Network SVG */}
      <svg
        className="anb-network"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="anb-hub-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.6" />
            <stop offset="60%" stopColor="#2563eb" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="anb-node-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </radialGradient>
          <filter id="anb-blur">
            <feGaussianBlur stdDeviation="0.4" />
          </filter>
        </defs>

        {/* Connection lines */}
        {nodes.map((n, i) => {
          const isDotted = i % 3 === 0
          return (
            <g key={`line-${i}`}>
              {/* Glow line */}
              <line
                x1={CX} y1={CY} x2={n.x} y2={n.y}
                className="anb-line-glow"
              />
              {/* Main line */}
              <line
                x1={CX} y1={CY} x2={n.x} y2={n.y}
                className={`anb-line ${isDotted ? 'anb-line--dotted' : ''}`}
              />
              {/* Traveling particle */}
              <circle r="0.5" className="anb-traveler" filter="url(#anb-blur)">
                <animateMotion
                  dur={`${3 + (i % 3)}s`}
                  repeatCount="indefinite"
                  begin={`${i * 0.4}s`}
                >
                  <mpath href={`#anb-path-${i}`} />
                </animateMotion>
              </circle>
              {/* Reverse particle */}
              <circle r="0.35" className="anb-traveler anb-traveler--reverse" filter="url(#anb-blur)">
                <animateMotion
                  dur={`${4 + (i % 2)}s`}
                  repeatCount="indefinite"
                  begin={`${i * 0.6 + 1.5}s`}
                >
                  <mpath href={`#anb-path-${i}`} />
                </animateMotion>
              </circle>
              {/* Hidden path for animateMotion */}
              <path
                id={`anb-path-${i}`}
                d={`M${CX},${CY} L${n.x},${n.y}`}
                fill="none"
                stroke="none"
              />
            </g>
          )
        })}

        {/* Hub glow circle */}
        <circle cx={CX} cy={CY} r="6" fill="url(#anb-hub-glow)" className="anb-hub-aura" />

        {/* Central hub */}
        <circle cx={CX} cy={CY} r="2.8" className="anb-hub" />
        <circle cx={CX} cy={CY} r="1.2" className="anb-hub-core" />

        {/* Module nodes */}
        {nodes.map((n, i) => (
          <g key={`node-${i}`} className="anb-node-group">
            <circle cx={n.x} cy={n.y} r="2.5" fill="url(#anb-node-glow)" className="anb-node-aura" />
            <circle
              cx={n.x} cy={n.y} r="1"
              className="anb-node"
              style={{ animationDelay: `${i * 0.3}s` }}
            />
            <circle
              cx={n.x} cy={n.y} r="0.4"
              className="anb-node-core"
              style={{ animationDelay: `${i * 0.3}s` }}
            />
            <text
              x={n.x} y={n.y + 3.2}
              className="anb-node-label"
              textAnchor="middle"
            >
              {n.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
