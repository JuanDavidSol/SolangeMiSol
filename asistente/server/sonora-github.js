'use strict';
/*
 * Sonora: private GitHub repository as a small, optional shared library.
 * All GitHub API calls take place server-side; the browser never receives
 * the GitHub token or a private blob SHA. Only explicitly uploaded files go
 * to GitHub. GitHub is not a dedicated media storage/CDN service.
 */
const crypto = require('crypto');
const path = require('path');
const REPOSITORY = (process.env.SONORA_GITHUB_REPOSITORY || '').trim();
const SECRET = process.env.SONORA_GITHUB_TOKEN || '';
const BRANCH = (process.env.SONORA_GITHUB_BRANCH || 'main').trim();
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const enabled = REPO_PATTERN.test(REPOSITORY) && SECRET.length >= 20 && /^[A-Za-z0-9._-]{1,60}$/.test(BRANCH);
const API = 'https://api.github.com/repos/' + REPOSITORY;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_TRACKS = 100;
const MAX_TOTAL = 850 * 1024 * 1024;
const FILES = Object.freeze({
  '.mp3':'audio/mpeg','.m4a':'audio/mp4','.wav':'audio/wav',
  '.ogg':'audio/ogg','.flac':'audio/flac','.aac':'audio/aac','.opus':'audio/ogg'
});
let checkedPrivateUntil = 0;
let commitQueue = Promise.resolve();
let lastPush = 0;
class GitHubFailure extends Error {
  constructor(status, message) {super(message);this.status=status;}
}
function safeName(name) {
  return String(name||'').split(/[\\/]/).pop()
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g,'').trim().slice(0,145);
}
async function api(method, endpoint, payload) {
  let response;
  try {
    response = await fetch(API + endpoint, {
      method,
      headers:{
        'Accept':'application/vnd.github+json',
        'Authorization':'Bearer ' + SECRET,
        'User-Agent':'Sonora-Private-Library',
        'X-GitHub-Api-Version':'2022-11-28',
        ...(payload ? {'Content-Type':'application/json'} : {})
      },
      body:payload ? JSON.stringify(payload) : undefined,
      signal:AbortSignal.timeout(90000)
    });
  } catch (_) {throw new GitHubFailure(502,'GitHub no respondió. Revisa Internet e inténtalo de nuevo.');}
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new GitHubFailure(502,'GitHub rechazó el token o limitó las peticiones. Revisa los permisos del repositorio privado en Render.');
    if (response.status === 404)
      throw new GitHubFailure(502,'No se encontró el repositorio privado o su rama. Crea el repositorio con un README y revisa SONORA_GITHUB_REPOSITORY.');
    if (response.status === 409 || response.status === 422)
      throw new GitHubFailure(response.status,'GitHub detectó un conflicto de actualización.');
    throw new GitHubFailure(502,'No se pudo guardar o consultar la biblioteca en GitHub (HTTP '+response.status+').');
  }
  try {return await response.json();}
  catch (_) {throw new GitHubFailure(502,'GitHub respondió con datos no válidos.');}
}
async function ensurePrivate() {
  if (Date.now()<checkedPrivateUntil) return;
  const result = await api('GET','');
  if (result.private !== true)
    throw new GitHubFailure(403,'Por seguridad, Sonora requiere un repositorio GitHub PRIVADO, separado de la web pública.');
  checkedPrivateUntil = Date.now()+60000;
}
function parseTrack(entry) {
  if (entry.type!=='blob') return null;
  const match=/^tracks\/([a-f0-9]{24})-([0-9]{13})-(.+)$/.exec(entry.path);
  if (!match || !/^[a-f0-9]{40,64}$/.test(entry.sha||'')) return null;
  let name;
  try {name=decodeURIComponent(match[3]);}catch(_){return null;}
  const ext=path.extname(name).toLowerCase();
  if (!FILES[ext] || !Number.isSafeInteger(entry.size) || entry.size<=0 || entry.size>MAX_BYTES) return null;
  return {id:match[1],name,size:entry.size,mime:FILES[ext],added:Number(match[2]),sha:entry.sha};
}
async function listInternal() {
  await ensurePrivate();
  const tree = await api('GET','/git/trees/'+encodeURIComponent(BRANCH)+'?recursive=1');
  if (tree.truncated) throw new GitHubFailure(507,'El repositorio es demasiado grande para esta biblioteca.');
  return (tree.tree||[]).map(parseTrack).filter(Boolean).sort((a,b)=>a.added-b.added);
}
function publicTrack(track) {
  return {id:track.id,name:track.name,size:track.size,mime:track.mime,added:track.added};
}
function withSerialUploads(work) {
  const job = commitQueue.then(work);
  commitQueue = job.catch(()=>{});
  return job;
}
async function upload(req,res,url,reply) {
  const length=Number(req.headers['content-length']);
  if (!Number.isSafeInteger(length) || length<1 || length>MAX_BYTES)
    return reply(res,413,{error:'El archivo debe tener un tamaño entre 1 byte y 20 MB.'});
  const name=safeName(url.searchParams.get('name'));
  if (!name || !FILES[path.extname(name).toLowerCase()])
    return reply(res,415,{error:'Formato no admitido: utiliza MP3, M4A, WAV, OGG, FLAC, AAC u OPUS.'});
  let buffer;
  try {
    let received=0, chunks=[];
    for await(const chunk of req) {
      received+=chunk.length;
      if(received>MAX_BYTES) return reply(res,413,{error:'La canción supera 20 MB.'});
      chunks.push(chunk);
    }
    if(received!==length) return reply(res,400,{error:'La subida quedó incompleta.'});
    buffer=Buffer.concat(chunks,received);
  } catch (_) {return reply(res,400,{error:'La conexión se interrumpió durante la subida.'});}
  return withSerialUploads(async()=>{
    try {
      const all=await listInternal();
      if(all.some(t=>t.name===name&&t.size===length))
        return reply(res,200,{ok:true,skipped:true,track:publicTrack(all.find(t=>t.name===name&&t.size===length))});
      if(all.length>=MAX_TRACKS) return reply(res,507,{error:'La biblioteca de GitHub ya contiene 100 canciones.'});
      if(all.reduce((sum,t)=>sum+t.size,0)+length>MAX_TOTAL)
        return reply(res,507,{error:'La biblioteca alcanzó el límite recomendado de 850 MB.'});
      // GitHub recomienda no exceder seis actualizaciones de repositorio por minuto.
      const wait=Math.max(0,10500-(Date.now()-lastPush));
      if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
      const id=crypto.randomBytes(12).toString('hex');
      const added=Date.now();
      const filePath='tracks/'+id+'-'+added+'-'+encodeURIComponent(name);
      const blob=await api('POST','/git/blobs',{content:buffer.toString('base64'),encoding:'base64'});
      for(let retry=0;retry<3;retry++){
        const ref=await api('GET','/git/ref/heads/'+encodeURIComponent(BRANCH));
        const previous=ref.object&&ref.object.sha;
        if(!previous)throw new GitHubFailure(502,'No se pudo leer la rama principal de GitHub.');
        const oldCommit=await api('GET','/git/commits/'+previous);
        const baseTree=oldCommit.tree&&oldCommit.tree.sha;
        if(!baseTree)throw new GitHubFailure(502,'No se pudo leer el historial de GitHub.');
        const tree=await api('POST','/git/trees',{base_tree:baseTree,tree:[
          {path:filePath,mode:'100644',type:'blob',sha:blob.sha}
        ]});
        const commit=await api('POST','/git/commits',{
          message:'Sonora: añadir '+name,tree:tree.sha,parents:[previous]
        });
        try {
          await api('PATCH','/git/refs/heads/'+encodeURIComponent(BRANCH),{sha:commit.sha,force:false});
          lastPush=Date.now();
          return reply(res,201,{ok:true,track:{id,name,size:length,mime:FILES[path.extname(name).toLowerCase()],added}});
        } catch(error) {
          if((error.status===409||error.status===422)&&retry<2)continue;
          throw error;
        }
      }
    } catch(error) {
      return reply(res,error.status>=400&&error.status<500&&error.status!==409&&error.status!==422?error.status:502,
        {error:error.message||'No se pudo guardar en GitHub.'});
    }
  });
}
async function download(res,id,reply){
  try {
    const entry=(await listInternal()).find(t=>t.id===id);
    if(!entry)return reply(res,404,{error:'La canción ya no se encuentra en GitHub.'});
    const data=await api('GET','/git/blobs/'+entry.sha);
    if(data.encoding!=='base64'||typeof data.content!=='string')
      throw new GitHubFailure(502,'GitHub no devolvió el audio esperado.');
    const content=Buffer.from(data.content.replace(/\s/g,''),'base64');
    if(content.length!==entry.size)throw new GitHubFailure(502,'El tamaño del audio no coincide.');
    res.writeHead(200,{
      'Content-Type':entry.mime,'Content-Length':content.length,
      'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer'
    });
    res.end(content);
  } catch(error) {
    reply(res,error.status>=400&&error.status<500?error.status:502,{error:error.message||'No se pudo descargar la canción.'});
  }
}
async function handle(req,res,url,reply) {
  if(url.pathname==='/api/sonora/tracks'&&req.method==='GET'){
    try {return reply(res,200,(await listInternal()).map(publicTrack));}
    catch(error){return reply(res,error.status||502,{error:error.message});}
  }
  if(url.pathname==='/api/sonora/tracks'&&req.method==='POST')return upload(req,res,url,reply);
  const match=/^\/api\/sonora\/tracks\/([a-f0-9]{24})\/audio$/.exec(url.pathname);
  if(match&&req.method==='GET')return download(res,match[1],reply);
  return false;
}
module.exports={enabled,MAX_TRACKS,handle};
