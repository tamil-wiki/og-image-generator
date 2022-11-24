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
const port = 3000;

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
            defaultViewport:{width:1632, height:854},
        },    
    });

    await cluster.task(async ({ page, data }) => {
        const { pageid, title, force } = data;
        try {
            console.log('processing ', data);
            const fileLocation = "/out/%page-id%.webp".replace("%page-id%", pageid);
            if (force || !fs.existsSync(fileLocation)) {
                await page.goto(`http://localhost:3000/view/${pageid}-${title}`, {
                    waitUntil: ['domcontentloaded', 'networkidle0'],
                });
                const screenshot = await page.screenshot({
                    path: fileLocation,                   // Save the screenshot in current directory
                    type: 'webp',
                    quality: 80,
                    clip: { x: 0, y: 0, width: 1632, height: 854 }
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

app.get('/view/:pageid-:title.webp', wrap(async (req, res, next) => {
    console.time('viewOG');
    const title = req.params.title;
    console.log("Requesting image ", req.params.title);
    res.set('Content-Type', 'image/webp')
    const fileLocation = "/out/%page-id%.webp".replace("%page-id%", req.params.pageid);

    const options = {
        dotfiles: 'deny',
        headers: {
          'x-timestamp': Date.now(),
          'x-sent': true
        }
    };
    try {
        if (req.query.force || !fs.existsSync(fileLocation)) {
            console.log("File doesn't exists or forced to create, generate it", fileLocation);
            const browser = await puppeteer.launch({
                headless: true,
                args: [
                    "--disable-gpu",
                    "--disable-dev-shm-usage",
                    "--disable-setuid-sandbox",
                    "--no-sandbox"
                ],
                defaultViewport:{width:1632, height:854},
            });    // Launch a "browser"
            
            const page = await browser.newPage();        // Open a new page
            await page.goto(`http://localhost:3000/view/${req.params.pageid}-${req.params.title}`, {
                waitUntil: ['domcontentloaded', 'networkidle0'],
            }).catch(e => {
                console.error(e);
                throw e;
            }).then((response) => { 
                if (response.status() != 200)  
                    throw new Error("Request to Rendering failed " + response.statusText());
            });
            
            const screenshot = await page.screenshot({
                path: fileLocation,                   // Save the screenshot in current directory
                type: 'webp',
                quality: 80,
                clip: { x: 0, y: 0, width: 1632, height: 854 }
              });
            
            await page.close();                           // Close the website
            await browser.close();                        // Close the browser            
        }
        console.log("Streaming image", fileLocation);
        res.sendFile(fileLocation, options, (err) => {
            if (err) {
                next(err)
            } else {
                console.log('Sent:', fileLocation)
            }
        })
    } catch (err) { 
        console.error(err); 
        res.statusMessage = err;
        res.status(500).send(err);
    }
    console.timeEnd('viewOG');
}));

app.get('/view/:pageid-:title', wrap(async (req, res, next) => {
    try {
        var data = await collectPageData(
        {...requestParams,
            title: req.params.title
        });
        console.log(data);
        res.render('og', data);    
    } catch (err) { 
        console.error(err); 
        res.statusMessage = "Rendering Failed";
        res.status(500).send(err);
    }
}));


app.listen(port, () => console.log(`Tamil Wiki OG app listening on port ${port}!`))