const { wikiService } = require('./service.js');
const waterfall = require('async/waterfall');

const wikiPageApiParams = {
  action: "query",
  titles: "Main_Page",
  prop: "extracts|imageinfo|categories|contributors|images|info|pageprops|revisions",
  rvslots: "*",
  rvprop: "content",
  format: "json",
  formatversion: 2,
  explaintext: 1,
  exsectionformat: "plain",
  exintro: 1 
};

const wikiImageApiParams = {
  action: "query",
  titles: "Main_Page",
  iiprop: "timestamp|user|url",
  prop: "imageinfo",
  format: "json",
  formatversion: 2
}

function collectPageData(requestData) {
  return new Promise((resolve, reject) => {

    wikiPageApiParams.titles = requestData.title; //"சுந்தர_ராமசாமி";
    waterfall([
      function(callback) {
        console.log("Requesting API data for ", requestData.title);
        wikiService(wikiPageApiParams)
          .then((data) => callback(null, data))
          .catch((err) => callback(err, requestData))
      },
      function(data, callback) {
        const page = data.query.pages[0];
        // console.log(page);

        if (page.missing) {
          callback("Page is missing " + requestData.title, requestData);
          return;
        }
        const pageData = {
          title: page.title,
          titleEncoded: wikiPageApiParams.titles,
          isTamilArticle: (page.categories ? page.categories.find(category => category.title == "Category:Tamil Content") != undefined : false),
          isEnglishArticle: (page.categories ? page.categories.find(category => category.title == "Category:English Content") != undefined : false),
          isFinalized: (page.categories ? page.categories.find(category => category.title == "Category:Finalised") != undefined : false),
          length: page.length,
          pageid: page.pageid,
          description: page.extract ? page.extract : "",
          content: page.revisions[0].slots.main.content,
          contributors: "" + page.contributors.length,
          lastModifiedOn: new Date(page.touched).toLocaleDateString("ta-IN", { year: 'numeric', month: 'short', day: 'numeric' })
        }
      
        let imageLocs = page.images.reduce((filterdImages, image, index) => {
          let location = pageData.content.indexOf(image.title);
          if ((location >= 0 || image.title.indexOf('Finalised.jpg') == -1)) {
              filterdImages.push({title: image.title, location: location});
          }
          return filterdImages;
        }, []);
          
        if (imageLocs.length > 0) {
          // console.log(imageLocs);
          const sortedImageLocs = imageLocs.sort((a, b) => {
              return a.location - b.location;
          });
      
          // console.log(sortedImageLocs[0]);
      
          pageData.imageTitle = sortedImageLocs[0].title;
          callback(null, pageData);
        } else {
          console.debug("Image not found, defaulting to tamil.wiki logo");
          pageData.imageUrl = "https://pbs.twimg.com/profile_images/1522722512400183299/SkcVay7z_400x400.jpg";
          callback(null, pageData);
          //callback("Images not found for " + pageData.title, pageData);
        }
      },
      function(pageData, callback) {
        if (!pageData.imageUrl) {
          console.log("Requesting Image API data for ", pageData.imageTitle);
          wikiImageApiParams.titles = pageData.imageTitle;
          wikiService(wikiImageApiParams)
          .then((data) => {
            const imagePage = data.query.pages[0];
            pageData.imageUrl = imagePage.imageinfo[0].url;
            callback(null, pageData)
          })
          .catch((err) => console.error(err) /*callback(err, pageData)*/)  
        } else {
          callback(null, pageData)
        }
      },
      function(pageData, callback) {

        console.log("Collecting Pagedata for ", pageData.title);
        var start = 0;
        var description = pageData.description;
        description = description.replace(/(\r\n|\n|\r)/gm, "");
        pageData.snippet = "";
        if (pageData.isTamilArticle) {
          for (var i = 0; i < description.length; i++) {
              if (pageData.isTamilArticle && description.charCodeAt(i) > 127) {
                start = i;
                break;
              } else if (pageData.isEnglishArticle && description.charCodeAt(i) <= 127) {
                start = i;
                break;
              }
          }
          pageData.snippet = description.substring(start);
        }
        callback(null, pageData);
      }]).then(results => {
        console.log("Finished Collecting Pagedata for ", results.title);
        resolve(results)
      }).catch(err => {
        console.error("Error Collecting Pagedata for ", requestData.title, err);
        reject(err)
      });
    });
}

module.exports = {
  collectPageData
};
