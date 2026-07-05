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

  const uniqueId = Date.now();
  const testEmail = `tester${uniqueId}@example.com`;
  await page.type('input[type="text"]', 'Automation Tester');
  await page.type('input[type="email"]', testEmail);
  await page.type('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await wait(1000);

  await clickText(page, 'button', 'Logout').catch(() => {});
  await wait(500);

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

  console.log("Creating Project...");
  await page.goto(`${BASE_URL}/projects`, { waitUntil: 'networkidle0' });
  await clickText(page, 'button', '+ New Project');
  await wait(500);
  await page.type('input[placeholder="e.g. Email Service"]', 'Test Project Alpha');
  await page.type('input[placeholder="Optional description"]', 'Project for screenshot automation');
  await clickText(page, 'button', 'Create Project');
  await wait(1000);

  await clickText(page, 'button', '+ New Project');
  await wait(500);
  await page.type('input[placeholder="e.g. Email Service"]', 'Billing Service');
  await page.type('input[placeholder="Optional description"]', 'Handles all billing');
  await clickText(page, 'button', 'Create Project');
  await wait(1000);

  console.log("Capturing Projects List...");
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_projects_list.png') });

  await clickText(page, 'a', 'Test Project Alpha');
  await wait(1000);

  await clickText(page, 'button', '+ New Queue');
  await wait(500);
  await page.type('input[placeholder="e.g. email-queue"]', 'test-queue-1');
  await page.select('select', 'linear');
  await clickText(page, 'button', 'Create Queue');
  await wait(1000);

  await clickText(page, 'a', 'test-queue-1');
  await wait(1000);

  console.log("Capturing Queue Detail Page...");
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_queue_detail_page.png') });

  console.log("Capturing Job Creation Form (Immediate)...");
  await clickText(page, 'button', '+ New Job');
  await wait(500);
  await page.type('#job-payload', '{"test": true}');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_job_creation_immediate.png') });

  console.log("Capturing Job Creation Form (Recurring)...");
  await page.select('#job-type', 'recurring');
  await wait(500);
  await page.type('#job-cron', '*/1 * * * *');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_job_creation_recurring.png') });
  await clickText(page, 'button', 'Create Job');
  await wait(1000);

  // create a failing job
  await clickText(page, 'button', '+ New Job');
  await wait(500);
  await page.select('#job-type', 'immediate');
  await wait(500);
  await page.evaluate(() => { document.querySelector('#job-payload').value = ''; });
  await page.type('#job-payload', '{"fail": true}');
  await clickText(page, 'button', 'Create Job');
  await wait(1000);

  console.log("Capturing Jobs List Page...");
  await wait(1000); // let the created job appear in the list (or refresh)
  await clickText(page, 'button', '↻ Refresh');
  await wait(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_jobs_list_page.png') });

  // Click the first job's ID link
  await page.waitForSelector('table tbody tr:first-child a', { timeout: 5000 }).catch(() => {});
  await page.click('table tbody tr:first-child a');
  await wait(1000);

  console.log("Capturing Job Detail Page...");
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_job_detail_page.png') });

  console.log("Waiting 5s for worker to process...");
  await wait(5000);

  // Go back to the queue page
  await page.goBack({ waitUntil: 'networkidle0' });
  await page.waitForSelector('#filter-status', { timeout: 5000 }).catch(() => {});
  
  await page.select('#filter-status', 'failed');
  await wait(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_failed_job_retried.png') });

  await page.select('#filter-status', 'dead_letter');
  await wait(1000);
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
