// ----------------------------------------------------------
// Cache the Open Graph Image for 24 hours
// 1. Create a worker service in Cloudflare, 
// 2. copy/paste this code, 
// 3. Map the route - https://<domain>/og/* to this worker
// ----------------------------------------------------------
export default {
  async fetch(request, env) {
    return await handleRequest(request)
  }
}

async function handleRequest(request) {
  const url = new URL(request.url);

  // Only use the path for the cache key, removing query strings
  // and always store using HTTPS, for example, https://www.example.com/file-uri-here
  //const someCustomKey = `https://${url.hostname}${url.pathname}`;

  let response = await fetch(request, {
    cf: {
      // Always cache this fetch regardless of content type
      // for a max of 24 hours before revalidating the resource
      cacheTtl: 24 * 60 * 60,
      cacheEverything: true,
      //Enterprise only feature, see Cache API for other plans
      //cacheKey: someCustomKey,
    },
  });
  // Reconstruct the Response object to make its headers mutable.
  response = new Response(response.body, response);

  // Set cache control headers to cache on browser for 24 hours
  response.headers.set('Cache-Control', 'max-age=86400');
  return response;
}