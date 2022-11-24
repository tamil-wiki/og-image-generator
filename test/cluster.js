const { Cluster } = require('puppeteer-cluster');

(async () => {
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: 2,
    puppeteerOptions: {
        args: [
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--disable-setuid-sandbox",
            "--no-sandbox"
        ],
    },
});

  await cluster.task(async ({ page, data: url }) => {
    await page.goto(url);
    const screen = await page.screenshot();
    // Store screenshot, do something else
  });

  cluster.queue('http://www.google.com/');
  cluster.queue('http://www.wikipedia.org/');
  // many more pages

  await cluster.idle();
  await cluster.close();
})();