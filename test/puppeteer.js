const puppeteer = require('puppeteer');         // Require Puppeteer module
var HTMLParser = require('node-html-parser');

const url = "https://www.testim.io/";           // Set website you want to screenshot
const Screenshot = async () => {                // Define Screenshot function

  const browser = await puppeteer.launch({
    headless: true,
    args: [
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-setuid-sandbox",
        "--no-sandbox"
    ],
    defaultViewport:{width:1024,height:800},
});    // Launch a "browser"

// load them
const fs = require('fs')
const path = require('path')

// then inside the function
let html = fs
  .readFileSync(path.resolve(__dirname, './template/template.html'))
  .toString()

var root = HTMLParser.parse(html)

root.querySelector('#title').set_content("Modified via Code")

const page = await browser.newPage();        // Open a new page

await page.setContent(root.toString(), {
  waitUntil: 'networkidle2'
});

const screenshot = await page.screenshot({
    path: "/out/screenshot.webp",                   // Save the screenshot in current directory
    type: 'webp',
    quality: 80,
    clip: { x: 0, y: 0, width: 1280, height: 675 }
  });

await page.close();                           // Close the website

await browser.close();                        // Close the browser

}

Screenshot();                                   // Call the Screenshot function