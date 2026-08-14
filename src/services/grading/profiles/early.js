export const EARLY_PROFILE = {
  id: 'early',
  name: 'Early Years (PP1–Grade 3)',
  stage: 'EARLY',
  system: 'early',
  status: 'active',
  origin: 'official-cbc',
  note: 'KNEC Early Years rubric: 4 achievement levels (EE/ME/AE/BE). No numeric points are issued for Early Years.',
  bands: [
    { code: 'EE', level: 4, points: null, min: 75, max: 100, label: 'Exceeding Expectations', color: 'ee' },
    { code: 'ME', level: 3, points: null, min: 50, max: 74, label: 'Meeting Expectations', color: 'me' },
    { code: 'AE', level: 2, points: null, min: 25, max: 49, label: 'Approaching Expectations', color: 'ae' },
    { code: 'BE', level: 1, points: null, min: 0, max: 24, label: 'Below Expectations', color: 'be' },
  ],
}
