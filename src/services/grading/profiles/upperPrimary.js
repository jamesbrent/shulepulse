export const UPPER_PRIMARY_PROFILE = {
  id: 'upperPrimary',
  name: 'Upper Primary (Grade 4–6)',
  stage: 'UPPER_PRIMARY',
  system: 'middle',
  status: 'active-interim',
  origin: 'interim-current',
  note: 'INTERIM preset that mirrors the current system output (8-point scale). Official KNEC verification for G4–6 is pending; do not treat these boundaries as official.',
  bands: [
    { code: 'EE1', level: 8, points: 8, min: 90, max: 100, label: 'Exceptional', color: 'ee1' },
    { code: 'EE2', level: 7, points: 7, min: 75, max: 89, label: 'Very Good', color: 'ee2' },
    { code: 'ME1', level: 6, points: 6, min: 58, max: 74, label: 'Good', color: 'me1' },
    { code: 'ME2', level: 5, points: 5, min: 41, max: 57, label: 'Fair', color: 'me2' },
    { code: 'AE1', level: 4, points: 4, min: 31, max: 40, label: 'Needs Improvement', color: 'ae1' },
    { code: 'AE2', level: 3, points: 3, min: 21, max: 30, label: 'Below Average', color: 'ae2' },
    { code: 'BE1', level: 2, points: 2, min: 11, max: 20, label: 'Well Below Avg', color: 'be1' },
    { code: 'BE2', level: 1, points: 1, min: 0, max: 10, label: 'Minimal Competence', color: 'be2' },
  ],
}
