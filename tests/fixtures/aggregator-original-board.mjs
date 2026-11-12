console.log(JSON.stringify(['active', 'expired', 'uncertain'].map((state, i) => ({
  title: `Engineer ${state}`, company: `Employer ${state}`, location: 'Remote',
  url: `https://himalayas.app/jobs/${state}`, originalUrl: `https://job-boards.greenhouse.io/fixture/jobs/${i + 1}`,
}))));
