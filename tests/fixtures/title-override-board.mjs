// tests/fixtures/title-override-board.mjs — a local-parser fixture board for
// tests/plugins-local/scan-title-filter-overrides.test.mjs. Emits one title
// the global title_filter matches and one it does not; argv[2] keeps each
// board's URLs distinct. No network involved.
const board = process.argv[2] || 'board';
console.log(JSON.stringify([
  { title: 'Laravel Developer', url: `https://example.com/${board}/1`, company: board, location: '' },
  { title: 'Senior Developer', url: `https://example.com/${board}/2`, company: board, location: '' },
  { title: 'Senior Sales Developer', url: `https://example.com/${board}/3`, company: board, location: '' },
]));
