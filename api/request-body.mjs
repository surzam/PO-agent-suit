export async function readJson(req,{maxBytes=64*1024,requireJson=true}={}){
  if(requireJson&&!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']||'')))throw Object.assign(new Error('JSON content type is required'),{code:'UNSUPPORTED_MEDIA_TYPE',statusCode:415});
  const declared=Number(req.headers['content-length']||0);
  if(declared>maxBytes)throw Object.assign(new Error('Request body exceeds the allowed size'),{code:'PAYLOAD_TOO_LARGE',statusCode:413});
  let text='',size=0;
  for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>maxBytes)throw Object.assign(new Error('Request body exceeds the allowed size'),{code:'PAYLOAD_TOO_LARGE',statusCode:413});text+=chunk}
  try{return JSON.parse(text||'{}')}catch{throw Object.assign(new Error('Invalid JSON'),{code:'INVALID_JSON',statusCode:400})}
}
