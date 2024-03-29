require('dotenv').config();
const path = require('path');
const { collectPageData } = require('./lib/og.js');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const async = require('async');
const { wikiService } = require('./lib/service.js');

const puppeteer = require('puppeteer');         // Require Puppeteer module
const { Cluster } = require('puppeteer-cluster');
var cluster;

const app = express();
const port = process.env.PORT || 3000;
const OG_WIDTH = process.env.OG_WIDTH || 1632;
const OG_HEIGHT = process.env.OG_HEIGHT || 854;
const offlineLocation = process.env.OFFLINE_FOLDER || "/tmp";
const TIMEOUT = process.env.TIMEOUT || 10000; // 10 seconds

const requestParams = {
    title: "",
    imageUrl: "",
    snippet: "",
    contributors: "",
    lastModifiedOn: ""
};

const batchRequestParams = {
    action: 'query',
    list: 'categorymembers',
    cmtitle: 'Category:Finalised',
    cmprop: 'ids|title|type|timestamp',
    cmsort: 'timestamp',
    cmdir: 'descending',
    format: 'json',
    cmlimit: 500,
    formatversion: 2,
//    cmcontinue: "",
//    continue: "",
};

(async () => {
    cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_PAGE,
        maxConcurrency: 1,
        puppeteerOptions: {
            args: [
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--disable-setuid-sandbox",
                "--no-sandbox"
            ],
            defaultViewport:{width:OG_WIDTH, height:OG_HEIGHT},
        },    
    });

    await cluster.task(async ({ page, data }) => {
        const { pageid, title, force } = data;
        try {
            console.log('processing ', data);
            const fileLocation = "/out/%page-id%.webp".replace("%page-id%", pageid);
            if (force || !fs.existsSync(fileLocation)) {
                await page.goto(`http://localhost:${port}/view/${pageid}-${title}`, {
                    waitUntil: ['domcontentloaded', 'networkidle0'],
                    timeout: TIMEOUT
                });
                const screenshot = await page.screenshot({
                    path: fileLocation,                   // Save the screenshot in current directory
                    type: 'webp',
                    quality: 80,
                    clip: { x: 0, y: 0, width: OG_WIDTH, height: OG_HEIGHT }
                });
                console.log("Generated ", title, fileLocation);
            } else {
                console.log("OG already generated", pageid, title);
            }
        } catch(err) {
            console.error(`Error Generating Thumbnail-${pageid},${title}`, err)
        };
    });
})();

app.use(cors());

// Configuring body parser middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')

app.get('/', (req, res) => {
    res.send('Tamil Wiki Open Graph Image Generator is ready!');
});

  
const wrap = fn => (...args) => fn(...args).catch(args[2])

app.get('/submit/:pageid-:title', wrap(async (req, res, next) => {
    cluster.queue({
        pageid: req.params.pageid, 
        title: req.params.title,
        force: req.query.force ? true : false
    });
    res.status(200).send(`Request received for page ${req.params.pageid}-${req.params.title} successfully`);
}));

function submitPagedRequests(batchRequestParams, today) {

    wikiService(batchRequestParams)
    .then((data) => {
        //console.log(data);
        //console.log(data.query.categorymembers.length);
        if (data.continue) {
            batchRequestParams.cmcontinue = data.continue.cmcontinue;
            batchRequestParams.continue = data.continue.continue;
            submitPagedRequests(batchRequestParams, today);
        }
        data.query.categorymembers.forEach((element) => { 
            //console.log(today.toDateString(), pageDate.toDateString());
            if (!today 
                || (today && today == new Date(element.timestamp).toDateString())) {
                console.log(element.title);
                cluster.queue({
                    pageid: element.pageid, 
                    title: element.title,
                    force: true
                });
            }
        })
    });
}

app.get('/submit/category/:category?/:today?', wrap(async (req, res, next) => {
    var requestParams = batchRequestParams;
    var today = null;    
    if (req.params.category) {
        requestParams.cmtitle = req.params.category;
    }
    if (req.params.today) {
        today = new Date().toDateString();
    }
    submitPagedRequests(requestParams, today);
    res.status(200).send('Submitted Requests');
}));

async function renderOpenGraphImage(req, res, offlineFile) {
    
    console.time('renderOpenGraphImage');
    const title = req.params.title;
    console.log("Requesting image ", req.params.title);

    try {
        if (offlineFile) {
            console.log("Creating offline file", offlineFile);
        }
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--disable-setuid-sandbox",
                "--no-sandbox"
            ],
            defaultViewport: {
                width:OG_WIDTH, 
                height:OG_HEIGHT
            },
        });    // Launch a "browser"
        
        const page = await browser.newPage();        // Open the OG Render page
        await page.goto(`http://localhost:${port}/og/view/${req.params.title}`, {
            waitUntil: ['domcontentloaded', 'networkidle0'],
            timeout: TIMEOUT
        }).catch(e => {
            console.error(e);
            throw e;
        }).then((response) => { 
            if (response.status() != 200)  
                throw new Error("Request to Rendering failed " + response.statusText());
        });
        
        const screenshot = await page.screenshot({
            path: offlineFile,                   // Save the screenshot in current directory
            type: 'webp',
            quality: 80,
            clip: { x: 0, y: 0, width: OG_WIDTH, height: OG_HEIGHT }
            });
        
        await page.close();                           // Close the website
        await browser.close();                        // Close the browser            
        res.set('Content-Type', 'image/webp');
        res.status(200).end(screenshot);
    } catch (err) { 
        console.error(err); 
        res.statusMessage = err;
        res.status(500).send(err);
    }
    console.timeEnd('renderOpenGraphImage');
}

app.get('/og/images/:pageid-:title.webp', wrap(async (req, res, next) => {
    const fileLocation = `${offlineLocation}/${req.params.pageid}.webp`;
    //res.status(500).send("NA");
    renderOpenGraphImage(req, res, fileLocation);
}));

app.get('/og/images/:title.webp', wrap(async (req, res, next) => {
    //res.status(500).send("NA");
    renderOpenGraphImage(req, res, null);
}));


async function renderImage(req, res) {
    try {
        var data = await collectPageData(
        {...requestParams,
            title: req.params.title
        });
        //console.log(data);
        // Refer /views/og.ejs for template
        res.render('og', data);    
    } catch (err) { 
        console.error(err); 
        res.statusMessage = "Rendering Failed";
        res.status(500).send(err);
    }
}

app.get('/og/view/:pageid-:title', wrap(async (req, res, next) => {
    renderImage(req, res);
}));

app.get('/og/view/:title', wrap(async (req, res, next) => {
    renderImage(req, res);
}));

app.listen(port, () => console.log(`Tamil Wiki OG app listening on port ${port}!`))