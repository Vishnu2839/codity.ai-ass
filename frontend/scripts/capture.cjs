const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE_URL = 'http://localhost:5173';
const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR);
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const clickText = async (page, tag, text) => {
  await page.waitForFunction(
    (tag, text) => Array.from(document.querySelectorAll(tag)).some(el => el.textContent.includes(text)),
    { timeout: 5000 },
    tag, text
  ).catch(() => {});
  
  await page.evaluate((tag, text) => {
    const elements = Array.from(document.querySelectorAll(tag));
    const target = elements.find(el => el.textContent.includes(text));
    if (target) {
      target.click();
    }
  }, tag, text);
};

async function run() {
  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: { width: 1440, height: 900 }
  });
  const page = await browser.newPage();
  
  console.log("Capturing Registration Page...");
  await page.goto(`${BASE_URL}/register`, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_registration_page.png') });

  const testEmail = `seed@codity.ai`;

  console.log("Capturing Login Page...");
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_login_page.png') });

  await page.type('input[type="email"]', testEmail);
  await page.type('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await wait(1000);

  console.log("Capturing Dashboard...");
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0' });
  await wait(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_queue_statistics_dashboard.png') });

  console.log("Capturing Projects List...");
  await page.goto(`${BASE_URL}/projects`, { waitUntil: 'networkidle0' });
  await wait(2000); // Wait for projects to load
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_projects_list.png') });

  // Click the first project link
  console.log("Navigating to first project...");
  await clickText(page, 'a', 'Data Pipeline');
  await wait(2000);

  // Click the first queue link
  console.log("Navigating to first queue...");
  await clickText(page, 'a', 'Data Pipeline - Queue 1');
  await wait(2000);

  console.log("Capturing Queue Detail Page...");
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_queue_detail_page.png') });

  console.log("Capturing Job Creation Form (Immediate)...");
  await clickText(page, 'button', '+ New Job');
  await wait(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_job_creation_immediate.png') });

  console.log("Capturing Job Creation Form (Recurring)...");
  await page.select('#job-type', 'recurring');
  await wait(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_job_creation_recurring.png') });
  
  // Close modal
  await page.keyboard.press('Escape');
  await wait(1000);

  console.log("Capturing Jobs List Page...");
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_jobs_list_page.png') });

  const queueUrl = page.url();

  console.log("Capturing Job Detail Page...");
  await page.waitForSelector('table tbody tr:first-child a', { timeout: 5000 });
  await page.click('table tbody tr:first-child a');
  await wait(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_job_detail_page.png') });

  // Go back to the queue page
  console.log("Returning to queue page...");
  await page.goto(queueUrl, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#filter-status', { timeout: 5000 });
  
  console.log("Capturing Failed Jobs...");
  await page.select('#filter-status', 'failed');
  await wait(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_failed_job_retried.png') });

  console.log("Capturing DLQ...");
  await page.select('#filter-status', 'dead_letter');
  await wait(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_dead_letter_queue.png') });

  await browser.close();

  console.log("Capturing npm test output...");
  try {
    const testOut = execSync('npm test', { cwd: path.join(__dirname, '..', '..', 'backend'), encoding: 'utf-8' });
    fs.writeFileSync(path.join(SCREENSHOT_DIR, '12_npm_test_output.txt'), testOut);
  } catch (err) {
    fs.writeFileSync(path.join(SCREENSHOT_DIR, '12_npm_test_output.txt'), err.stdout || err.toString());
  }

  console.log("Done! Screenshots saved to " + SCREENSHOT_DIR);
}

run().catch(console.error);
