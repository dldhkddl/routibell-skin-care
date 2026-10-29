export const monthlySample = {
  start: '2026-09-01',
  end: '2026-09-22',
  budget: 100000,
  records: [
    { date: '2026-09-03', title: '세안제', amount: 18000, rating: 4 },
    { date: '2026-09-10', title: '보습제', amount: 32000, rating: 5 },
    { date: '2026-09-18', title: '자외선 차단제', amount: 22000, rating: null }
  ],
  routine: [
    [true, true], [true, true], [true, true], [false, true],
    [true, true], [null, null], [true, true],
    [true, true], [false, true], [true, true], [null, null],
    [true, true], [null, false], [true, true],
    [true, true], [true, true], [false, true], [true, true],
    [null, null], [true, true], [true, true], [true, true]
  ].map(([morning, evening], index) => ({
    date: `2026-09-${String(index + 1).padStart(2, '0')}`, morning, evening
  })),
  feedback: [
    ['03', 'comfortable'], ['05', 'dry'], ['08', 'comfortable'],
    ['10', 'dry'], ['12', 'comfortable'], ['15', 'dry'],
    ['18', 'comfortable'], ['20', 'comfortable'], ['22', 'comfortable']
  ].map(([day, feeling]) => ({ date: `2026-09-${day}`, feeling })),
  inventory: [
    { title: '세안제', remaining: 35, icon: 'bottle' },
    { title: '보습제', remaining: 60, icon: 'drop' },
    { title: '자외선 차단제', remaining: 15, icon: 'sun' }
  ],
  nextBudget: 100000,
  purchaseReview: 22000
};

export const reviewedObservation = {
  date: '2026-09-22',
  source: 'YouCam Playground',
  concerns: [
    { name: '홍조', code: 'redness', raw: 86.3312 },
    { name: '모공', code: 'pore', raw: 37.8331 },
    { name: '피부결', code: 'texture', raw: 78.5402 }
  ]
};
