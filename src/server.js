const config = require('./config');
const { createApp } = require('./app');
const loanService = require('./services/loanService');

const app = createApp();

function runChecks() {
  try {
    const { activated, overdue } = loanService.runScheduledChecks();
    if (activated || overdue) console.log(`[scheduler] activated=${activated} overdue=${overdue}`);
  } catch (err) {
    console.error('[scheduler] failed:', err);
  }
}

runChecks();
setInterval(runChecks, config.scheduler.intervalMs).unref();

app.listen(config.port, () => {
  console.log(`LabLend listening on http://localhost:${config.port} (${config.env})`);
});
