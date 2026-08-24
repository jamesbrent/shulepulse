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
          <feGaussianBlur stdDeviation="0.4" />
        </filter>
      </defs>

      {/* ── Dotted continents — each continent is a cluster of small circles ── */}

      {/* Africa */}
      <g opacity="0.12" filter="url(#cds-blur)">
        {[
          [300,245],[308,242],[316,240],[324,242],[332,248],
          [296,255],[304,252],[312,250],[320,250],[328,254],[336,260],
          [292,268],[300,264],[308,262],[316,260],[324,262],[332,268],[340,274],
          [290,280],[298,276],[306,274],[314,272],[322,274],[330,280],[338,286],
          [288,294],[296,290],[304,288],[312,286],[320,288],[328,294],[336,300],
          [286,308],[294,304],[302,302],[310,300],[318,302],[326,308],[334,314],
          [284,322],[292,318],[300,316],[308,314],[316,316],[324,322],[330,328],
          [282,336],[290,332],[298,330],[306,328],[314,330],[322,336],
          [280,350],[288,346],[296,344],[304,342],[312,344],[320,350],
          [284,362],[292,358],[300,356],[308,358],[316,364],
          [290,372],[298,368],[306,370],[312,376],
          [296,382],[304,380],[310,386],
          [300,394],[306,392],
          [302,404],[306,400],
        ].map(([cx,cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="2.2" fill="white" />
        ))}
      </g>

      {/* Europe */}
      <g opacity="0.10" filter="url(#cds-blur)">
        {[
          [282,172],[290,168],[298,166],[306,168],[314,172],
          [280,180],[288,176],[296,174],[304,174],[312,178],[318,182],
          [284,188],[292,184],[300,182],[308,184],[316,188],
          [290,194],[298,192],[306,194],
          [296,200],[302,198],
        ].map(([cx,cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="2" fill="white" />
        ))}
      </g>

      {/* Asia */}
      <g opacity="0.10" filter="url(#cds-blur)">
        {[
          [345,162],[358,158],[372,155],[386,158],[400,162],[414,168],[426,175],
          [340,175],[354,170],[368,167],[382,168],[396,172],[410,178],[422,185],[434,192],
          [338,188],[352,183],[366,180],[380,182],[394,186],[408,192],[420,200],
          [342,200],[356,196],[370,194],[384,196],[398,200],[412,208],
          [348,212],[362,208],[376,206],[390,210],[404,216],
          [355,224],[368,220],[382,220],[396,224],
          [362,234],[376,232],[390,236],
          [370,244],[384,242],
        ].map(([cx,cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="2" fill="white" />
        ))}
      </g>

      {/* North America */}
      <g opacity="0.09" filter="url(#cds-blur)">
        {[
          [130,185],[145,180],[160,178],[175,180],[190,185],[200,192],
          [125,198],[140,193],[155,190],[170,192],[185,196],[198,202],
          [122,212],[137,207],[152,204],[167,206],[182,210],[195,216],
          [124,225],[139,220],[154,218],[169,220],[184,224],[196,230],
          [130,238],[145,234],[160,232],[175,234],[188,240],
          [140,248],[155,245],[170,246],[182,250],
          [152,256],[165,254],[178,256],
        ].map(([cx,cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="2" fill="white" />
        ))}
      </g>

      {/* South America */}
      <g opacity="0.08" filter="url(#cds-blur)">
        {[
          [185,345],[195,342],[205,345],
          [180,358],[190,354],[200,354],[210,358],
          [178,372],[188,368],[198,366],[208,370],
          [176,386],[186,382],[196,380],[206,384],
          [174,400],[184,396],[194,394],[204,398],
          [176,414],[186,410],[196,412],
          [180,426],[190,424],[198,428],
          [186,438],[194,436],
          [190,448],[196,446],
        ].map(([cx,cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="2" fill="white" />
        ))}
      </g>

      {/* Australia */}
      <g opacity="0.07" filter="url(#cds-blur)">
        {[
          [415,385],[425,382],[435,384],[442,388],
          [412,396],[422,393],[432,393],[440,398],
          [414,408],[424,405],[434,406],
          [418,418],[428,416],
          [422,426],
        ].map(([cx,cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="2" fill="white" />
        ))}
      </g>

      {/* ── Data stream paths between continents ── */}

      {/* Africa → Europe */}
      <path id="cds-ae" d="M305,240 C300,220 295,200 295,185" fill="none" stroke="white" strokeWidth="0.7" strokeOpacity="0.16" strokeDasharray="3 5" />
      <circle r="2" fill="white" opacity="0.22">
        <animateMotion dur="4s" repeatCount="indefinite" begin="0s"><mpath href="#cds-ae" /></animateMotion>
        <animate attributeName="opacity" values="0;0.25;0.25;0" dur="4s" repeatCount="indefinite" begin="0s" />
      </circle>
      <circle r="1.2" fill="white" opacity="0.12">
        <animateMotion dur="4s" repeatCount="indefinite" begin="2s"><mpath href="#cds-ae" /></animateMotion>
        <animate attributeName="opacity" values="0;0.15;0.15;0" dur="4s" repeatCount="indefinite" begin="2s" />
      </circle>

      {/* Europe → Asia */}
      <path id="cds-ea" d="M318,178 C340,170 360,164 380,162" fill="none" stroke="white" strokeWidth="0.6" strokeOpacity="0.12" strokeDasharray="2 7" />
      <circle r="1.5" fill="white" opacity="0.16">
        <animateMotion dur="5s" repeatCount="indefinite" begin="1s"><mpath href="#cds-ea" /></animateMotion>
        <animate attributeName="opacity" values="0;0.18;0.18;0" dur="5s" repeatCount="indefinite" begin="1s" />
      </circle>

      {/* Africa → South America */}
      <path id="cds-as" d="M278,330 C250,338 225,345 205,350" fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.08" strokeDasharray="2 8" />
      <circle r="1.2" fill="white" opacity="0.1">
        <animateMotion dur="6s" repeatCount="indefinite" begin="2.5s"><mpath href="#cds-as" /></animateMotion>
        <animate attributeName="opacity" values="0;0.12;0.12;0" dur="6s" repeatCount="indefinite" begin="2.5s" />
      </circle>

      {/* North America → Europe */}
      <path id="cds-ne" d="M200,198 C230,188 258,180 282,178" fill="none" stroke="white" strokeWidth="0.6" strokeOpacity="0.14" strokeDasharray="3 6" />
      <circle r="1.5" fill="white" opacity="0.18">
        <animateMotion dur="5.5s" repeatCount="indefinite" begin="0.5s"><mpath href="#cds-ne" /></animateMotion>
        <animate attributeName="opacity" values="0;0.2;0.2;0" dur="5.5s" repeatCount="indefinite" begin="0.5s" />
      </circle>
      <circle r="1" fill="white" opacity="0.08">
        <animateMotion dur="5.5s" repeatCount="indefinite" begin="3.5s"><mpath href="#cds-ne" /></animateMotion>
        <animate attributeName="opacity" values="0;0.1;0.1;0" dur="5.5s" repeatCount="indefinite" begin="3.5s" />
      </circle>

      {/* Asia → Australia */}
      <path id="cds-aa" d="M418,235 C422,280 420,330 420,382" fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.08" strokeDasharray="2 9" />
      <circle r="1.2" fill="white" opacity="0.1">
        <animateMotion dur="7s" repeatCount="indefinite" begin="3s"><mpath href="#cds-aa" /></animateMotion>
        <animate attributeName="opacity" values="0;0.12;0.12;0" dur="7s" repeatCount="indefinite" begin="3s" />
      </circle>

      {/* South America → North America */}
      <path id="cds-sn" d="M185,342 C170,310 155,270 148,232" fill="none" stroke="white" strokeWidth="0.4" strokeOpacity="0.07" strokeDasharray="2 10" />
      <circle r="1" fill="white" opacity="0.08">
        <animateMotion dur="6.5s" repeatCount="indefinite" begin="4s"><mpath href="#cds-sn" /></animateMotion>
        <animate attributeName="opacity" values="0;0.1;0.1;0" dur="6.5s" repeatCount="indefinite" begin="4s" />
      </circle>

      {/* Africa → Asia */}
      <path id="cds-al" d="M340,270 C360,250 385,230 405,215" fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.09" strokeDasharray="3 7" />
      <circle r="1.3" fill="white" opacity="0.12">
        <animateMotion dur="6s" repeatCount="indefinite" begin="1.5s"><mpath href="#cds-al" /></animateMotion>
        <animate attributeName="opacity" values="0;0.14;0.14;0" dur="6s" repeatCount="indefinite" begin="1.5s" />
      </circle>

      {/* Europe → Australia */}
      <path id="cds-eau" d="M312,198 C345,260 385,330 420,388" fill="none" stroke="white" strokeWidth="0.4" strokeOpacity="0.06" strokeDasharray="2 11" />
      <circle r="1" fill="white" opacity="0.08">
        <animateMotion dur="8s" repeatCount="indefinite" begin="5s"><mpath href="#cds-eau" /></animateMotion>
        <animate attributeName="opacity" values="0;0.1;0.1;0" dur="8s" repeatCount="indefinite" begin="5s" />
      </circle>

      {/* ── Ambient floating dots ── */}
      {[
        { cx: 70,  cy: 300, dur: '9s',  d: '0s' },
        { cx: 510, cy: 250, dur: '11s', d: '2s' },
        { cx: 250, cy: 520, dur: '10s', d: '1s' },
        { cx: 460, cy: 140, dur: '12s', d: '3s' },
        { cx: 140, cy: 480, dur: '8s',  d: '4s' },
        { cx: 390, cy: 510, dur: '10s', d: '5s' },
        { cx: 45,  cy: 170, dur: '11s', d: '1.5s' },
        { cx: 530, cy: 420, dur: '9s',  d: '3.5s' },
      ].map((p, i) => (
        <circle key={i} cx={p.cx} cy={p.cy} r="1" fill="white" opacity="0">
          <animate attributeName="opacity" values="0;0.08;0.08;0" dur={p.dur} begin={p.d} repeatCount="indefinite" />
          <animate attributeName="cy" values={`${p.cy};${p.cy - 12};${p.cy}`} dur={p.dur} begin={p.d} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  )
}
