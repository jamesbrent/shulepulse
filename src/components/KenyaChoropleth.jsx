import { ResponsiveChoropleth } from '@nivo/geo'
import kenyaGeo from '../data/kenya-counties.json'

const COUNTY_DATA = kenyaGeo.features.map((f) => ({
  id: f.properties.id,
  value: Math.random() * 100,
}))

export default function KenyaChoropleth() {
  return (
    <div className="kenya-map-wrap">
      <ResponsiveChoropleth
        data={COUNTY_DATA}
        features={kenyaGeo.features}
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        colors="blues"
        domain={[0, 100]}
        unknownColor="#1e293b"
        label="properties.name"
        valueFormat=",.0f"
        projectionScale={800}
        projectionTranslation={[0.55, 1.4]}
        projectionRotation={[0, 0, 0]}
        enableGraticule={false}
        borderWidth={0.5}
        borderColor="rgba(255,255,255,0.08)"
        defs={[
          {
            id: 'dots',
            type: 'patternDots',
            size: 4,
            padding: 2,
            stagger: true,
            background: 'transparent',
            color: 'rgba(255,255,255,0.06)',
          },
        ]}
        fill={[{ id: 'dots', from: 'color' }]}
        isInteractive={false}
        theme={{
          background: 'transparent',
          text: { fill: 'rgba(255,255,255,0.3)' },
        }}
      />
      <div className="kenya-map-labels">
        {kenyaGeo.features.slice(0, 8).map((f, i) => {
          const coords = f.geometry.coordinates[0]
          const cx = coords.reduce((s, c) => s + c[0], 0) / coords.length
          const cy = coords.reduce((s, c) => s + c[1], 0) / coords.length
          const x = ((cx - 33.5) / 9) * 100
          const y = ((4.5 - cy) / 9) * 100
          if (x < 5 || x > 95 || y < 5 || y > 95) return null
          return (
            <span
              key={f.properties.id}
              className="kenya-map-label"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              {f.properties.name}
            </span>
          )
        })}
      </div>
    </div>
  )
}
