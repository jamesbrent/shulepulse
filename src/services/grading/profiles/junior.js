export const JUNIOR_PROFILE = {
  id: 'junior',
  name: 'Junior Secondary (Grade 7–9)',
  stage: 'JUNIOR',
  system: 'middle',
  status: 'active',
  origin: 'official-kjsea',
  note: 'KNEC KJSEA 8-point scale for Junior Secondary.',
  bands: [
    { code: 'EE1', level: 8, points: 8, min: 90, max: 100, label: 'Exceptional', color: 'ee1' },
    { code: 'EE2', level: 7, points: 7, min: 80, max: 89, label: 'Very Good', color: 'ee2' },
    { code: 'ME1', level: 6, points: 6, min: 70, max: 79, label: 'Good', color: 'me1' },
    { code: 'ME2', level: 5, points: 5, min: 60, max: 69, label: 'Fair', color: 'me2' },
    { code: 'AE1', level: 4, points: 4, min: 50, max: 59, label: 'Needs Improvement', color: 'ae1' },
    { code: 'AE2', level: 3, points: 3, min: 40, max: 49, label: 'Below Average', color: 'ae2' },
    { code: 'BE1', level: 2, points: 2, min: 30, max: 39, label: 'Well Below Average', color: 'be1' },
    { code: 'BE2', level: 1, points: 1, min: 0, max: 29, label: 'Minimal Competence', color: 'be2' },
  ],
}
